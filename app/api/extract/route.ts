import Anthropic from "@anthropic-ai/sdk"

import { ExtractionResultSchema } from "@/lib/schema"

/**
 * Real bill-extraction route (task 6.1).
 *
 * Contract:
 *   POST multipart/form-data with a single `file` field — a JPEG, PNG, or PDF
 *   bill (≤ 4 MB; the client resizes/re-encodes images before posting).
 *
 *   200 → { result: ExtractionResult }   (validated by ExtractionResultSchema)
 *   4xx → { error: string }              (bad/missing/oversized/HEIC file)
 *   500 → { error: string }              (missing key, model error, or an
 *                                          unparseable / schema-invalid response)
 *
 * The LLM EXTRACTS FIELDS ONLY and computes no number: for each field it returns
 * a value, a confidence (0..1), and the exact evidence text copied from the
 * bill, OMITTING any field it has no evidence for. The response JSON is parsed
 * and validated against `ExtractionResultSchema` before it is returned; any
 * parse/validation failure is surfaced as a 500 the client treats as
 * "extraction unsuccessful" and falls back to the manual form.
 *
 * `ANTHROPIC_API_KEY` is read ONLY from `process.env` server-side; it is never
 * logged, printed, or returned.
 */

// The route may take a few seconds for a real vision call; allow up to 60s.
// The client enforces a stricter >30s client-side timeout (task 6.2).
export const maxDuration = 60

/** Pinned model for all AI calls (per tech steering). Do NOT swap this. */
const MODEL = "claude-sonnet-5-5"

/** Hard cap on the uploaded payload, mirrored on the client (task 6.2). */
const MAX_BYTES = 4 * 1024 * 1024 // 4 MB

/** Image media types we send as an image block. */
const IMAGE_TYPES = new Set(["image/jpeg", "image/png"])
/** Document media type we send as a document block. */
const PDF_TYPE = "application/pdf"
/** HEIC/HEIF variants we explicitly reject with an export hint. */
const HEIC_TYPES = new Set(["image/heic", "image/heif"])

/**
 * The extraction instructions. The model must return STRICT JSON only (no
 * prose, no code fences). Every field is value + confidence + exact evidence,
 * and any field without evidence is OMITTED. It must never compute or infer a
 * number that is not printed on the bill.
 */
const SYSTEM_PROMPT = `You read a single utility bill or fuel-delivery receipt and extract a few fields. You extract ONLY what is printed on the document. You NEVER compute, sum, average, convert, or infer a number that is not literally shown. If a field is not clearly present, OMIT it entirely.

Return STRICT JSON ONLY — no prose, no markdown, no code fences — matching exactly this shape:

{
  "heatingType": { "value": "gas" | "oil" | "electric-resistance" | "propane", "confidence": number, "evidence": string },
  "annualFuelUse": { "value": number, "confidence": number, "evidence": string },
  "fuelUnitPrice": { "value": number, "confidence": number, "evidence": string }
}

Rules:
- "heatingType" is REQUIRED. Choose the fuel the document is for: natural gas = "gas" (value in therms); heating oil = "oil" (gallons); propane = "propane" (gallons); electricity used for resistance/baseboard heat = "electric-resistance" (kWh).
- "annualFuelUse" is the annual heating quantity in the fuel's native unit (therms / gallons / kWh). Use it ONLY if an annual (or clearly total) figure is printed. OMIT the whole field otherwise — do not add months yourself.
- "fuelUnitPrice" is the unit price: $/therm, $/gallon, or $/kWh, exactly as printed. OMIT if no unit price is shown.
- "confidence" is your 0..1 certainty for that single field.
- "evidence" MUST be the complete line copied verbatim from the document — a verbatim substring of the document — INCLUDING the field's printed label and units, not just the bare number (for example "Total therms used (12-month) 652 therms" or "Delivered 800 gal"). Never invent evidence.
- Output the JSON object and nothing else.`

const USER_PROMPT =
  "Extract the heating fields from this bill as strict JSON per the system instructions. Copy evidence verbatim. Omit any field you cannot find."

/** A small JSON error helper that never leaks secrets. */
function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status })
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // Clean 500 — never crash, never echo the (absent) key.
    return errorResponse(
      "Extraction is not configured on the server right now.",
      500,
    )
  }

  // --- Parse the multipart body and pull the single `file` field. ---
  let file: File | null = null
  try {
    const form = await request.formData()
    const f = form.get("file")
    if (f instanceof File) file = f
  } catch {
    return errorResponse("Could not read the uploaded file.", 400)
  }

  if (!file) {
    return errorResponse("No file was uploaded.", 400)
  }

  const mediaType = (file.type || "").toLowerCase()

  if (HEIC_TYPES.has(mediaType)) {
    return errorResponse("Export as JPEG and try again.", 400)
  }

  const isImage = IMAGE_TYPES.has(mediaType)
  const isPdf = mediaType === PDF_TYPE
  if (!isImage && !isPdf) {
    return errorResponse("Upload a JPEG, PNG, or PDF bill.", 400)
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes.byteLength === 0) {
    return errorResponse("The uploaded file is empty.", 400)
  }
  if (bytes.byteLength > MAX_BYTES) {
    return errorResponse("That file is too large. Keep it under 4 MB.", 400)
  }

  const base64 = Buffer.from(bytes).toString("base64")

  // --- Build the document/image content block for the model. ---
  const fileBlock: Anthropic.ContentBlockParam = isPdf
    ? {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: base64,
        },
      }
    : {
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType as "image/jpeg" | "image/png",
          data: base64,
        },
      }

  // --- Call Anthropic. Model errors (incl. model-not-found) bubble to a 500. ---
  const client = new Anthropic({ apiKey })

  let rawText: string
  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [fileBlock, { type: "text", text: USER_PROMPT }],
        },
      ],
    })

    // Concatenate the text blocks of the reply.
    rawText = message.content
      .filter(
        (b): b is Anthropic.TextBlock => b.type === "text",
      )
      .map((b) => b.text)
      .join("")
      .trim()
  } catch (err) {
    // Surface a model-not-found / invalid-model error clearly (do NOT swap the
    // model). Other API errors become a generic failure the client falls back on.
    const status =
      err instanceof Anthropic.APIError ? (err.status ?? 0) : 0
    const msg = err instanceof Error ? err.message : "Unknown error"
    if (
      status === 404 ||
      (/model/i.test(msg) &&
        /(not.?found|invalid|does not exist|unknown)/i.test(msg))
    ) {
      return errorResponse(`Model error: ${msg}`, 500)
    }
    return errorResponse("The extraction service is unavailable right now.", 500)
  }

  // --- Parse the model's JSON (tolerate an accidental code fence). ---
  let parsedJson: unknown
  try {
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim()
    parsedJson = JSON.parse(cleaned)
  } catch {
    return errorResponse("Could not read the bill. Enter your numbers below.", 500)
  }

  // --- Validate against the Zod schema before trusting anything. ---
  const result = ExtractionResultSchema.safeParse(parsedJson)
  if (!result.success) {
    return errorResponse("Could not read the bill. Enter your numbers below.", 500)
  }

  return Response.json({ result: result.data })
}
