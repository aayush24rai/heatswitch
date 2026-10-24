import Anthropic from "@anthropic-ai/sdk"

import type { Language, VerdictLabel } from "@/lib/schema"

/**
 * Real explanation route (task 7.1).
 *
 * Contract:
 *   POST application/json
 *     { verdict, numbers, language }
 *   where
 *     - `verdict`  is the headline verdict (label + flags) from decideVerdict;
 *     - `numbers`  is the ALREADY-COMPUTED figure set (annual delta, current
 *                  cost, heat pump cost, rebate, net cost, payback, etc.) — NO
 *                  raw bill content is ever sent (Requirement 9.1);
 *     - `language` is one of en/es/cv/zh/ht/vi (Requirement 9.4).
 *
 *   200 → { explanation: string }   prose only, IN the requested language,
 *                                    explaining the verdict using ONLY the
 *                                    numbers provided (Requirements 9.2, 9.3).
 *   4xx → { error: string }         (bad / missing body)
 *   500 → { error: string }         (missing key, model error)
 *
 * The LLM writes PROSE ONLY and computes NO number: it may restate the numbers
 * it was handed but must never introduce any other numeric value (Req 9.3 / 9.9).
 * `ANTHROPIC_API_KEY` is read ONLY from `process.env` server-side; it is never
 * logged, printed, or returned. The client enforces its own 30s timeout and
 * falls back to a default sentence on any failure (Requirements 9.7 / 9.8).
 */

// The real explanation call may take a few seconds; allow up to 60s.
export const maxDuration = 60

/** Pinned model for all AI calls (per tech steering). Do NOT swap this. */
const MODEL = "claude-sonnet-5-5"

/** The six supported languages, named for the model's benefit. */
const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  es: "Spanish",
  cv: "Cape Verdean Creole (Kriolu)",
  zh: "Chinese (Simplified)",
  ht: "Haitian Creole",
  vi: "Vietnamese",
}

const SUPPORTED_LANGUAGES = Object.keys(LANGUAGE_NAMES) as Language[]

const VERDICT_LABELS: VerdictLabel[] = [
  "Switch now",
  "Switch when your system needs replacing",
  "Not worth it yet",
]

/** The request body shape (validated at runtime below). */
interface ExplainRequest {
  verdict: { label: VerdictLabel; actBeforeDec31?: boolean; isRenter?: boolean }
  /** Pre-computed numbers. Only these may appear in the explanation. */
  numbers: Record<string, unknown>
  language: Language
}

/** A small JSON error helper that never leaks secrets. */
function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status })
}

/**
 * Build the system prompt. It pins the output language, forbids introducing any
 * numeric value that was not provided, caps the length, and sets an honest tone.
 */
function buildSystemPrompt(language: Language): string {
  const name = LANGUAGE_NAMES[language]
  return `You write a short, plain explanation of a home heating recommendation for a Boston household. You are a translator and explainer, NOT a calculator.

Write ENTIRELY in ${name}. Do not include any other language.

You are given a verdict and a set of already-computed numbers. Rules:
- You MAY restate the numbers you were given (e.g. the annual savings, payback, rebate, net cost).
- You MUST NOT introduce, compute, invent, round differently, or infer ANY numeric value that is not present in the numbers you were given. If a number is not provided, do not state one.
- Explain WHY the verdict makes sense in everyday terms.
- Be honest: if the heat pump costs more to run, say so plainly — do not oversell.
- Keep it to at most about 500 characters. No markdown, no headings, no bullet lists — just one or two short sentences of prose.
- Output only the explanation text, nothing else.`
}

/**
 * Build the user message: the verdict and the numbers, as compact JSON. No raw
 * bill content is ever included (Requirement 9.1).
 */
function buildUserPrompt(body: ExplainRequest): string {
  const payload = {
    verdict: body.verdict,
    numbers: body.numbers,
  }
  return `Here is the verdict and the computed numbers (the ONLY numbers you may use):

${JSON.stringify(payload, null, 2)}

Write the explanation now, in the required language, using only these numbers.`
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // Clean 500 — never crash, never echo the (absent) key.
    return errorResponse(
      "Explanations are not configured on the server right now.",
      500,
    )
  }

  // --- Parse and validate the JSON body. ---
  let body: ExplainRequest
  try {
    body = (await request.json()) as ExplainRequest
  } catch {
    return errorResponse("Could not read the request body.", 400)
  }

  if (
    !body ||
    typeof body !== "object" ||
    !body.verdict ||
    typeof body.verdict !== "object" ||
    !VERDICT_LABELS.includes(body.verdict.label) ||
    !body.numbers ||
    typeof body.numbers !== "object" ||
    !SUPPORTED_LANGUAGES.includes(body.language)
  ) {
    return errorResponse("Invalid explanation request.", 400)
  }

  // --- Call Anthropic. Model errors (incl. model-not-found) bubble to a 500. ---
  const client = new Anthropic({ apiKey })

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: buildSystemPrompt(body.language),
      messages: [{ role: "user", content: buildUserPrompt(body) }],
    })

    const explanation = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim()

    if (!explanation) {
      return errorResponse("The explanation service returned nothing.", 500)
    }

    return Response.json({ explanation })
  } catch (err) {
    // Surface a model-not-found / invalid-model error clearly (do NOT swap the
    // model). Other API errors become a generic failure the client falls back on.
    const status = err instanceof Anthropic.APIError ? (err.status ?? 0) : 0
    const msg = err instanceof Error ? err.message : "Unknown error"
    if (
      status === 404 ||
      (/model/i.test(msg) &&
        /(not.?found|invalid|does not exist|unknown)/i.test(msg))
    ) {
      return errorResponse(`Model error: ${msg}`, 500)
    }
    return errorResponse("The explanation service is unavailable right now.", 500)
  }
}
