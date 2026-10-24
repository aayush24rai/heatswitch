/**
 * Client-side explanation fetch (task 7.2).
 *
 * POSTs the verdict + already-computed numbers + selected language to
 * `/api/explain` and returns the prose explanation, or a typed failure the
 * caller falls back on. Only pre-computed numbers are sent — NEVER raw bill
 * content (Requirement 9.1). A hard 30s AbortController timeout mirrors
 * bill-upload.ts, so a slow or hanging call is treated as a failure and the UI
 * falls back to the default English sentence (Requirements 9.7 / 9.8).
 *
 * This module introduces NO number of its own; it only forwards the numbers the
 * engine computed and relays back the model's prose.
 */

import type { Language, Verdict } from "@/lib/schema"

/** The number set sent to the explanation service. Each value is the EXACT
 *  on-screen formatted display string (e.g. "$1,981", "3.14", "9 months") the
 *  UI shows — not a raw number. The values are still computed in code from the
 *  Calculation_Engine (lib/calc.ts / lib/rebates.ts); only their formatting is
 *  fixed here so the model reproduces the same text the user sees. */
export interface ExplainNumbers {
  annualDeltaDollars: string
  currentAnnualCost: string
  heatPumpAnnualCost: string
  breakevenCOP: string
  rebateAmount: string
  netInstallCost: string
  paybackYears: string
}

export interface ExplainRequestPayload {
  verdict: Verdict
  numbers: ExplainNumbers
  language: Language
}

export type ExplainOutcome =
  | { ok: true; explanation: string }
  | { ok: false; reason: "timeout" | "failed" }

/** Client-side request timeout — >30s counts as a failure (Req 9.7). */
const REQUEST_TIMEOUT_MS = 30_000

/**
 * Request an explanation for the given verdict + numbers + language. Returns the
 * prose on success, or a typed failure (`timeout` / `failed`). A caller-supplied
 * `AbortSignal` can be combined with the internal timeout so a stale request can
 * be cancelled when the language changes again.
 */
export async function requestExplanation(
  payload: ExplainRequestPayload,
  externalSignal?: AbortSignal,
): Promise<ExplainOutcome> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  // If the caller aborts (e.g. language changed again), abort this request too.
  const onExternalAbort = () => controller.abort()
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort()
    else externalSignal.addEventListener("abort", onExternalAbort)
  }

  let response: Response
  try {
    response = await fetch("/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    externalSignal?.removeEventListener("abort", onExternalAbort)
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, reason: "timeout" }
    }
    return { ok: false, reason: "failed" }
  }
  clearTimeout(timer)
  externalSignal?.removeEventListener("abort", onExternalAbort)

  if (!response.ok) return { ok: false, reason: "failed" }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    return { ok: false, reason: "failed" }
  }

  const explanation = (body as { explanation?: unknown })?.explanation
  if (typeof explanation !== "string" || explanation.trim() === "") {
    return { ok: false, reason: "failed" }
  }

  return { ok: true, explanation: explanation.trim() }
}
