/**
 * Client-side bill pipeline (task 6.2): prepare an uploaded file for
 * `/api/extract` and POST it with a hard client-side timeout.
 *
 * Images are resized to ≤ 1600px on the longest edge and re-encoded as JPEG so
 * the payload stays small; PDFs pass through unchanged. HEIC/HEIF is rejected
 * before any network call with an "export as JPEG" message. The final payload
 * is capped at 4 MB (mirrors the route's own cap). The POST is aborted after
 * 30s so a slow extraction is treated as a client-side failure.
 *
 * This module computes NO heating number — it only reshapes bytes and talks to
 * the route. The route (task 6.1) does the extraction; the page (task 6.2) maps
 * the validated result to inputs or falls back to the manual form.
 */

import {
  ExtractionResultSchema,
  type ExtractionResult,
} from "@/lib/schema"

/** Longest-edge target for re-encoded images. */
const MAX_EDGE = 1600
/** Hard payload cap, mirrored by the route. */
const MAX_BYTES = 4 * 1024 * 1024
/** Client-side request timeout — >30s counts as a failure (Req 2.7). */
const REQUEST_TIMEOUT_MS = 30_000

const PDF_TYPE = "application/pdf"
const IMAGE_TYPES = new Set(["image/jpeg", "image/png"])
const HEIC_TYPES = new Set(["image/heic", "image/heif"])

/** A typed result the page can switch on without reading HTTP details. */
export type PrepareOutcome =
  | { ok: true; result: ExtractionResult }
  | { ok: false; reason: "heic" | "unsupported" | "too-large" | "timeout" | "failed" }

/** True iff the browser can run the canvas resize path (SSR-safe guard). */
function canUseCanvas(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined" &&
    typeof createImageBitmap === "function"
  )
}

/**
 * Resize an image File to ≤ MAX_EDGE on its longest edge and re-encode as JPEG.
 * Returns the original File if the canvas path is unavailable (the route still
 * enforces its own cap). Never throws for the caller — resize failure falls back
 * to the original bytes.
 */
async function resizeImageToJpeg(file: File): Promise<Blob> {
  if (!canUseCanvas()) return file
  try {
    const bitmap = await createImageBitmap(file)
    const longest = Math.max(bitmap.width, bitmap.height)
    const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85),
    )
    return blob ?? file
  } catch {
    return file
  }
}

/**
 * Prepare and send a bill to `/api/extract`, returning a validated
 * `ExtractionResult` or a typed failure reason. HEIC is rejected before any
 * network call; oversized payloads and >30s responses are failures too.
 */
export async function extractFromFile(file: File): Promise<PrepareOutcome> {
  const type = (file.type || "").toLowerCase()

  if (HEIC_TYPES.has(type)) return { ok: false, reason: "heic" }

  const isImage = IMAGE_TYPES.has(type)
  const isPdf = type === PDF_TYPE
  if (!isImage && !isPdf) return { ok: false, reason: "unsupported" }

  // Images are resized/re-encoded to JPEG; PDFs pass through unchanged.
  let payload: Blob = file
  let filename = file.name || "bill"
  let contentType = type
  if (isImage) {
    payload = await resizeImageToJpeg(file)
    contentType = "image/jpeg"
    filename = "bill.jpg"
  }

  if (payload.size > MAX_BYTES) return { ok: false, reason: "too-large" }

  const form = new FormData()
  form.append("file", new File([payload], filename, { type: contentType }))

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch("/api/extract", {
      method: "POST",
      body: form,
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    // AbortError (timeout) vs any other network error.
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, reason: "timeout" }
    }
    return { ok: false, reason: "failed" }
  }
  clearTimeout(timer)

  if (!response.ok) return { ok: false, reason: "failed" }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    return { ok: false, reason: "failed" }
  }

  const resultField = (body as { result?: unknown })?.result
  const parsed = ExtractionResultSchema.safeParse(resultField)
  if (!parsed.success) return { ok: false, reason: "failed" }

  return { ok: true, result: parsed.data }
}
