/**
 * STUB route handler (task 1.5).
 *
 * Returns a static placeholder explanation string. It makes NO Anthropic/AI
 * calls and reads NO environment variables. The real Anthropic explanation call
 * (model claude-sonnet-5-5, reading ANTHROPIC_API_KEY server-side) lands in task 7.
 * The LLM only writes prose from numbers the code computes; it never computes a number.
 *
 * POST is intentionally not cached by Next.js.
 */

// The real explanation call (task 7) may take a few seconds; allow up to 60s.
// Added in task 6.2 alongside the extract route's maxDuration.
export const maxDuration = 60

const PLACEHOLDER_EXPLANATION =
  "Explanation placeholder. The real explanation is generated from your computed numbers in a later step."

export async function POST() {
  // No AI, no number computation, no env reads — a fixed placeholder until task 7.
  return Response.json({ stub: true, explanation: PLACEHOLDER_EXPLANATION })
}
