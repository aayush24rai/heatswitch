import type { ExtractionResult } from "@/lib/schema"

/**
 * STUB route handler (task 1.5).
 *
 * Returns a static, ExtractionResult-shaped placeholder. It makes NO Anthropic/AI
 * calls and reads NO environment variables. The real Anthropic extraction call
 * (model claude-sonnet-5-5, reading ANTHROPIC_API_KEY server-side) lands in task 6.
 *
 * POST is intentionally not cached by Next.js.
 */

const PLACEHOLDER_EXTRACTION: ExtractionResult = {
  heatingType: {
    value: "gas",
    confidence: 0.95,
    evidence: "Natural Gas Service",
  },
  annualFuelUse: {
    value: 652,
    confidence: 0.9,
    evidence: "Total therms used: 652",
  },
  fuelUnitPrice: {
    value: 2.42,
    confidence: 0.88,
    evidence: "Price per therm: $2.42",
  },
}

export async function POST() {
  // No AI, no file parsing, no env reads — a fixed placeholder until task 6.
  return Response.json({ stub: true, result: PLACEHOLDER_EXTRACTION })
}
