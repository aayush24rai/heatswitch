---
inclusion: always
---
# Tech rules
- Next.js App Router, TypeScript strict, Tailwind, shadcn/ui, Recharts, Zod, Vitest, fast-check, Anthropic SDK.
- Use npm (not pnpm). Model for AI calls: claude-sonnet-5-5.
- One page (app/page.tsx) with two tabs; no auth, no database.
- The LLM NEVER computes numbers. The LLM only (1) extracts fields from a bill into Zod-validated
  JSON with a confidence and the exact evidence text per field, and (2) writes explanation text
  from numbers passed to it. All math lives in lib/calc.ts and lib/rebates.ts as pure functions.
- Every constant in lib/constants.ts and lib/rebates.ts has a source URL comment.
- API key from process.env.ANTHROPIC_API_KEY. Never hardcode, print or commit it.
- If extraction fails or is low-confidence, fall back to the manual form with known fields pre-filled.
- BERDO data lives in data/berdo-2021/ as a static file, loaded client-side.
- Small changes per task. Do not refactor unrelated files.