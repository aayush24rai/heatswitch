# Implementation Plan: HeatSwitch

## Overview

This plan implements HeatSwitch incrementally in the exact build order from the design document: scaffold first, then the pure calculation engine with property tests, then the demo-driven results UI, then rebates/assumptions/renter path, then the Buildings tab, and finally the two real AI routes (extraction, then explanation). Each step builds on the previous one and ends by wiring new code into the running app so there is no orphaned code.

The hard product rule is enforced structurally: all arithmetic lives in pure functions in `lib/calc.ts` and `lib/rebates.ts` (property-tested with fast-check), and the LLM is confined to field extraction and prose generation. The scaffold phase creates stub API routes with no AI calls; the real Anthropic calls (`claude-sonnet-5-5`) arrive only in tasks 6 and 7.

Per `.kiro/steering/workflow.md`, every top-level task ends with an explicit **Done** sub-step that runs `npx vitest run` (fixing failures before moving on), appends a `KIRO_LOG.md` entry, and — only when the task changed UI and the dev server is running — captures Playwright screenshots at 1280px and 390px into `docs/kiro/screens/`.

## Tasks

- [x] 1. Scaffold the app, constants, schema, and stub routes
  - [x] 1.1 Scaffold the Next.js App Router + TypeScript + Tailwind + shadcn/ui project
    - Run `npx shadcn@latest init --preset b2BWx6KYq --template next` (base Mist, theme Emerald, chart Emerald) into the current folder using npm (never pnpm); keep existing `README.md`, `.git`, `.kiro`, and `docs`
    - If the CLI requires an empty folder or prompts for a project name, scaffold into a temp folder and move the generated files into the workspace root, preserving the kept files
    - Enable TypeScript strict mode; configure Inter via `next/font`; enforce light mode only (no dark-mode class or theme toggle)
    - Create the directory structure: `lib/`, `app/api/extract/`, `app/api/explain/`, `components/my-home/`, `components/buildings/`, `components/shared/`, `data/berdo-2021/`
    - _Requirements: 12.1, 12.2, 12.3, 12.4_
  - [x] 1.2 Install shadcn/ui components and set up the test toolchain
    - Install only these shadcn/ui components via the shadcn MCP: Card, Button, Slider, Switch, Tabs, Badge, Alert, Tooltip, Skeleton
    - Add Recharts, Zod, and the Anthropic SDK (`@anthropic-ai/sdk`) as dependencies with pinned versions
    - Set up Vitest and fast-check with a test script; confirm `npx vitest run` executes with zero tests passing
    - _Requirements: 12.1, 12.2_
  - [x] 1.3 Implement `lib/constants.ts` with all source-cited constants
    - Add every constant from the design with an adjacent resolvable source-URL comment: `THERM_KWH`, `OIL_GALLON_KWH`, `PROPANE_GALLON_KWH`, `SYSTEM_EFFICIENCY`, `SEASONAL_HEAT_PUMP_RATE_DISCOUNT`, `MASS_SAVE_PER_TON`, `MASS_SAVE_TOTAL_CAP`, `INCOME_LIMITS`, `REBATE_REQUIREMENTS`, `REBATE_DEADLINE_2026`, `REBATE_DEADLINE_NOTE`, `SUMMER_MONTH_INDEXES`
    - _Requirements: 4.5, 4.11, 5.4, 5.10, 5.11, 11.6_
  - [x] 1.4 Implement `lib/schema.ts` with the Zod schemas and shared types
    - Define `ExtractedFieldSchema`, `HeatingTypeSchema`, `ExtractionResultSchema` (with `annualFuelUse`/`fuelUnitPrice` partial), `CONFIDENCE_THRESHOLD = 0.8`, and the `HomeInputs`/`Assumptions`/`Language`/`Utility`/`RebateTier`/`VerdictLabel` TypeScript types
    - _Requirements: 2.1, 2.6, 2.8, 1.7_
  - [x] 1.5 Create `app/page.tsx` two-tab shell and stub API routes
    - Build the single page with a shadcn `Tabs` defaulting to "My home" and hiding "Buildings (landlords & city)" until selected; apply the `max-w-5xl mx-auto px-6 py-10` container, header with "HeatSwitch" + tagline + "Massachusetts" badge, and footer with "Your bill is never stored"
    - Lay out empty card placeholders per the wireframe (upload, verdict, cost chart, your numbers, assumptions, rebates, next step, how-we-calculate) with `rounded-2xl border shadow-sm p-6` and `gap-6`; stack to a single column below 768px
    - Create `app/api/extract/route.ts` and `app/api/explain/route.ts` as stubs that return static placeholder JSON with NO AI calls
    - _Requirements: 12.5, 12.7, 12.8, 12.9, 11.5_
  - [x] 1.6 Done (workflow.md)
    - Run `npx vitest run` and fix any failures before moving on
    - Append a `KIRO_LOG.md` entry (time, task, Kiro feature used, what it did, why it mattered)
    - UI changed: with the dev server running, use the Playwright MCP to open http://localhost:3000 at 1280px and 390px, save screenshots to `docs/kiro/screens/task-1-desktop.png` and `docs/kiro/screens/task-1-mobile.png`, and reference them in the log entry
    - Task is not complete until these steps pass

- [ ] 2. Implement the pure calculation engine with unit and property tests
  - [ ] 2.1 Implement heating-use and energy-content functions in `lib/calc.ts`
    - Implement `annualHeatingUse(history)` (`sum - 12 * min(Jun..Sep)`, rejecting non-12-length or negative histories) and `fuelEnergyContentKWh(type, fuelUse, efficiency)` applying `SYSTEM_EFFICIENCY`
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_
  - [ ] 2.2 Write property tests for heating-use and energy-content
    - **Property 9: Zero fuel, zero cost** — **Validates: Requirement 4.7**
    - **Property 10: Annual heating use is bounded** — **Validates: Requirement 4.4**
  - [ ] 2.3 Implement cost, breakeven, and comparison functions in `lib/calc.ts`
    - Implement `currentHeatingCost`, `heatPumpCost` (flat $/kWh seasonal discount floored above 0, rate-aware), `breakevenCOP`, and `computeComparison` (`annualDeltaDollars = current - heatPump`)
    - _Requirements: 4.1, 4.8, 4.9, 4.10, 4.11, 4.12, 4.13, 4.14_
  - [ ] 2.4 Write property tests for cost and breakeven
    - **Property 2: Breakeven consistency** — **Validates: Requirement 4.10**
    - **Property 3: Seasonal rate never raises heat pump cost** — **Validates: Requirement 4.12**
    - **Property 4: COP monotonicity** — **Validates: Requirement 4.13**
    - **Property 7: Cost linearity** — **Validates: Requirement 4.8**
  - [ ] 2.5 Implement rebate tier and rebate functions in `lib/rebates.ts`
    - Implement `selectRebateTier(householdSize, annualIncome?)` (Standard when income absent or household size invalid; Enhanced/Income Eligible bands from `INCOME_LIMITS`), `computeRebates` (tiered cap, Income Eligible up to full install cost, `netInstallCost >= 0`, payback null when savings <= 0), `isBostonZip`, and `isEquityZip` (informational only; never changes rebate)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 10.4_
  - [ ] 2.6 Write property tests for rebates
    - **Property 5: Rebate bounds** — **Validates: Requirement 5.6**
    - **Property 6: Payback sign** — **Validates: Requirement 5.8**
  - [ ] 2.7 Implement the verdict function in `lib/calc.ts`
    - Implement `decideVerdict(cmp, reb, inputs, now)` selecting exactly one label ("Not worth it yet" when delta <= 0; "Switch now" when delta > 0 and payback <= 5; else "Switch when your system needs replacing"); set `actBeforeDec31` only when a rebate materially shortens payback and `now <= REBATE_DEADLINE_2026`; derive `isRenter`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 5.12, 5.13, 7.2, 7.3_
  - [ ] 2.8 Write property test and boundary unit tests for the verdict
    - **Property 1: No savings is reported honestly** — **Validates: Requirement 6.2**
    - Add boundary unit tests at/just-above/just-below breakeven and the deadline on/off around Dec 31, 2026
    - _Requirements: 6.1, 6.3, 6.4, 5.12, 5.13_
  - [ ] 2.9 Implement building ranking functions in `lib/calc.ts`
    - Implement `opportunityScore(b)`, `opportunityLabel(percentile)` (High/Medium/Low, monotonic), and `rankBuildings(buildings, zip)` (filter by zip, annotate percentile within the multifamily cohort, sort by score descending, permutation of the matching subset)
    - _Requirements: 8.6, 8.7_
  - [ ] 2.10 Write property and unit tests for ranking
    - **Property 8: Ranking is a sorted permutation** — **Validates: Requirement 8.7**
    - Add unit tests for `opportunityLabel` monotonicity and zip filtering
    - _Requirements: 8.6, 8.7_
  - [ ] 2.11 Write persona acceptance-value tests for calc and rebates
    - Assert, with ±2% tolerance and the shared assumptions (COP 2.5, electricity $0.288/kWh, 3 tons, $18,000 install, standard tier, seasonal rate off unless noted):
      - Oil persona: 800 gal × $6.15 → current heating cost $4,920; heat pump cost ≈ $3,068
      - Electric-resistance persona: annual heating 7,600 kWh → current cost ≈ $2,189; heat pump cost ≈ $876
      - Gas persona: 652 therms × $2.42 → current cost ≈ $1,578; heat pump cost ≈ $1,981; breakeven COP ≈ 3.14
      - Gas persona with Eversource seasonal rate ON (effective ≈ $0.215/kWh): heat pump cost ≈ $1,481
    - Also assert tier-selection boundaries and that `isEquityZip` never changes the rebate amount
    - _Requirements: 4.1, 4.9, 5.2, 5.9, 10.4_
  - [ ] 2.12 Done (workflow.md)
    - Run `npx vitest run` and fix any failures before moving on
    - Append a `KIRO_LOG.md` entry (time, task, Kiro feature used — property-based tests, what it did, why it mattered)
    - No UI change: skip Playwright screenshots
    - Task is not complete until these steps pass

- [ ] 3. Build the demo-driven results UI (no AI)
  - [ ] 3.1 Build shared `SourceLink` and `ConfirmField` primitives
    - Implement `components/shared/source-link.tsx` (small grey link/tooltip beneath numbers) and `components/shared/confirm-field.tsx` (immediate best-guess value, amber outline when unconfirmed, evidence text, [Looks right] [Edit] edit-in-place, validation on commit)
    - _Requirements: 11.1, 11.2, 3.1, 3.2, 3.3, 3.11_
  - [ ] 3.2 Build `UploadCard` with the three Try demo buttons and cached ExtractionResults
    - Implement `components/my-home/upload-card.tsx` with drop zone, zip field, "Heat included in my rent" toggle, and Oil/Gas/Baseboard demo buttons; add cached `ExtractionResult` fixtures (value + confidence + evidence per field) routed through `ExtractionResultSchema`; the Gas demo carries exactly one field below `CONFIDENCE_THRESHOLD`
    - _Requirements: 1.6, 1.7, 1.8, 1.9, 1.10, 1.11_
  - [ ] 3.3 Build `VerdictCard` and `CostChartCard`
    - Implement `components/my-home/verdict-card.tsx` (verdict label `text-4xl font-semibold`, big annual number in emerald for savings / amber for extra cost / neutral at zero, never red; "Act before Dec 31" badge; "Estimate" vs "Based on your bill" label; explanation Skeleton placeholder) and `components/my-home/cost-chart-card.tsx` (Recharts two-bar current-vs-heat-pump + breakeven COP readout)
    - _Requirements: 6.1, 6.5, 6.6, 6.7, 6.8, 12.6_
  - [ ] 3.4 Build `YourNumbersCard` with heating-type chip and live recompute
    - Implement `components/my-home/your-numbers-card.tsx` rendering a `ConfirmField` per value with evidence beneath, the heating-type chip ("Looks like gas heat." with Yes/Change), and the "Estimate: N values need a quick check" banner that scrolls to the first amber field
    - _Requirements: 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 2.8_
  - [ ] 3.5 Wire the demo flow into `app/page.tsx`
    - Hold inputs/extraction/confirmation state; map a cached `ExtractionResult` to `HomeInputs`, mark low-confidence fields amber, and call `computeComparison`/`computeRebates`/`decideVerdict`; recompute live on every confirm/edit; flip the verdict label to "Based on your bill" once nothing is amber
    - _Requirements: 3.1, 3.10, 1.11_
  - [ ] 3.6 Done (workflow.md)
    - Run `npx vitest run` and fix any failures before moving on
    - Append a `KIRO_LOG.md` entry (time, task, Kiro feature used, what it did, why it mattered)
    - UI changed: with the dev server running, use the Playwright MCP to open http://localhost:3000 at 1280px and 390px, save screenshots to `docs/kiro/screens/task-3-desktop.png` and `docs/kiro/screens/task-3-mobile.png`, and reference them in the log entry
    - Task is not complete until these steps pass

- [ ] 4. Build assumptions, rebates, renter path, and next step
  - [ ] 4.1 Build `AssumptionsCard`
    - Implement `components/my-home/assumptions-card.tsx` with sliders (heat pump COP, electricity price, fuel price) and the seasonal heat pump rate Switch; changes recompute results live
    - _Requirements: 4.11, 4.12, 4.13_
  - [ ] 4.2 Build `RebatesCard` with the renter/landlord path
    - Implement `components/my-home/rebates-card.tsx` showing tier, rebate amount, net install cost, payback, the four-item requirements checklist, the exact note "2026 rebates require install by Dec 31, 2026.", and the landlord path section (shareable summary + Mass Save landlord/multifamily link) shown while the rent toggle is on
    - _Requirements: 5.7, 5.8, 5.10, 5.11, 7.1, 7.4_
  - [ ] 4.3 Build `NextStepRow` with Boston/equity logic
    - Implement `components/my-home/next-step-row.tsx` presenting the Boston Energy Saver consultation for Boston zips, Mass Save Home Energy Assessment otherwise (and as default for unrecognized MA zips), an equity-zip informational notice visually distinct from any rebate amount, and suppression of location steps when the zip is invalid
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_
  - [ ] 4.4 Build the "How we calculate" collapsible and confirm the footer
    - Implement `components/my-home/how-we-calculate.tsx` (collapsed by default; expands to formulas, assumption values, and sources) and verify the "Your bill is never stored" footer
    - _Requirements: 11.3, 11.5_
  - [ ] 4.5 Wire assumptions, rebates, renter path, and next step into `app/page.tsx`
    - Connect the new cards to shared state so slider/switch/rent-toggle changes recompute `computeRebates` and `decideVerdict` live; toggle the landlord path and `isRenter` with the rent toggle
    - _Requirements: 7.1, 7.2, 7.3, 4.11_
  - [ ] 4.6 Done (workflow.md)
    - Run `npx vitest run` and fix any failures before moving on
    - Append a `KIRO_LOG.md` entry (time, task, Kiro feature used, what it did, why it mattered)
    - UI changed: with the dev server running, use the Playwright MCP to open http://localhost:3000 at 1280px and 390px, save screenshots to `docs/kiro/screens/task-4-desktop.png` and `docs/kiro/screens/task-4-mobile.png`, and reference them in the log entry
    - Task is not complete until these steps pass

- [ ] 5. Build the Buildings tab
  - [ ] 5.1 Convert the BERDO 2021 CSV to JSON and add cleaning
    - Add a small conversion script in `scripts/` (committed to the repo) that reads the source `data/berdo-2021/data.csv` and writes `data/berdo-2021/buildings.json`
    - The script/loader drops rows missing site EUI, keeps only 5-digit zips starting with "02", assigns `id` as the zero-based row index string, flags `siteEUI > 300` as "check data", and leaves `gasShare` null when unknown (never 0)
    - _Requirements: 8.1, 8.3, 8.4, 8.5_
  - [ ] 5.2 Build `ZipPicker` and `BuildingsTable`
    - Implement `components/buildings/zip-picker.tsx` and `components/buildings/buildings-table.tsx` showing type, year built, area, energy use, emissions, electric/gas share, and opportunity label via `rankBuildings`; render the "likely electric resistance, biggest heat pump win" and "convert at boiler replacement" messages; handle the dataset-load error state and the no-match empty-state row
    - _Requirements: 8.2, 8.6, 8.8, 8.9, 8.10, 8.11_
  - [ ] 5.3 Wire the Buildings tab into `app/page.tsx`
    - Mount `BuildingsTable`/`ZipPicker` under the "Buildings (landlords & city)" tab, loading the cleaned dataset client-side and filtering by selected zip
    - _Requirements: 8.1, 8.10, 12.7_
  - [ ]* 5.4 Write unit tests for dataset cleaning
    - Drop rows without site EUI, keep only "02" 5-digit zips, flag EUI > 300, keep `gasShare` null when unknown
    - _Requirements: 8.3, 8.4, 8.5_
  - [ ] 5.5 Done (workflow.md)
    - Run `npx vitest run` and fix any failures before moving on
    - Append a `KIRO_LOG.md` entry (time, task, Kiro feature used, what it did, why it mattered)
    - UI changed: with the dev server running, use the Playwright MCP to open http://localhost:3000 at 1280px and 390px, save screenshots to `docs/kiro/screens/task-5-desktop.png` and `docs/kiro/screens/task-5-mobile.png`, and reference them in the log entry
    - Task is not complete until these steps pass

- [ ] 6. Implement real bill extraction (Anthropic)
  - [ ] 6.1 Implement `app/api/extract/route.ts` with a real Anthropic SDK call
    - Make a real call with model `claude-sonnet-5-5`, reading `ANTHROPIC_API_KEY` only from `process.env` server-side (never printed or committed); prompt for value + confidence + exact evidence per field, omitting fields without evidence; validate the response against `ExtractionResultSchema` before returning; the LLM extracts fields only and computes no number
    - Add `export const maxDuration = 60` to the route; treat >30s as a client-side failure
    - Accept only JPEG/PNG/PDF; the client resizes images to ≤1600px on the longest edge and re-encodes as JPEG so the uploaded payload is ≤4 MB; reject HEIC with a message to export as JPEG
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 1.1, 1.2, 1.3_
  - [ ] 6.2 Wire upload → resize → extract → confirmation with manual-form fallback
    - Implement the client-side image pipeline: resize to ≤1600px longest edge, re-encode as JPEG, enforce the ≤4 MB payload, and reject HEIC with an "export as JPEG" message before POSTing to `/api/extract`
    - `safeParse` the result, map to `HomeInputs`, mark fields below `CONFIDENCE_THRESHOLD` amber; on failure, invalid file, timeout, or all-low-confidence, show the manual form pre-filled with known fields and an "extraction unsuccessful" message; support the oil manual inputs and their range validation
    - Add `export const maxDuration = 60` to `app/api/explain/route.ts` as well
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.7, 2.8, 3.11_
  - [ ] 6.3 Generate three demo bills in `demo-data/`
    - Create `demo-data/` with three sample bills as HTML files — gas, oil receipt, and electric baseboard — each visibly watermarked "SAMPLE – DEMO DATA"
    - Use the persona values from task 2.11 (gas 652 therms × $2.42; oil 800 gal × $6.15; electric-resistance 7,600 kWh annual heating) so the cached demo ExtractionResults and these bills agree
    - _Requirements: 1.7, 1.11_
  - [ ] 6.4 Done (workflow.md)
    - Run `npx vitest run` and fix any failures before moving on
    - Append a `KIRO_LOG.md` entry (time, task, Kiro feature used — MCP/Anthropic SDK, what it did, why it mattered)
    - UI changed: with the dev server running, use the Playwright MCP to open http://localhost:3000 at 1280px and 390px, save screenshots to `docs/kiro/screens/task-6-desktop.png` and `docs/kiro/screens/task-6-mobile.png`, and reference them in the log entry
    - Task is not complete until these steps pass

- [ ] 7. Implement real explanation and language support (Anthropic)
  - [ ] 7.1 Implement `app/api/explain/route.ts` with a real Anthropic SDK call
    - Make a real call with model `claude-sonnet-5-5`, reading `ANTHROPIC_API_KEY` only from `process.env` server-side; accept `{verdict, numbers, language}` with only pre-computed numbers (no raw bill content) and return prose only in the requested language; the LLM computes no number; treat >30s or errors as failure
    - _Requirements: 9.1, 9.2, 9.3, 9.7, 9.8_
  - [ ] 7.2 Wire the language dropdown and explanation rendering into `VerdictCard`/`app/page.tsx`
    - Add the six-language dropdown (English, Spanish, Cape Verdean Creole, Chinese, Haitian Creole, Vietnamese); on language change request a new explanation while keeping computed numbers visible; show a Skeleton while loading; on timeout/error keep numbers on screen and show a default English sentence (<=200 chars); never display numbers produced by the Explanation_Service
    - _Requirements: 9.4, 9.5, 9.6, 9.7, 9.8, 9.9_
  - [ ] 7.3 Done (workflow.md)
    - Run `npx vitest run` and fix any failures before moving on
    - Append a `KIRO_LOG.md` entry (time, task, Kiro feature used — MCP/Anthropic SDK, what it did, why it mattered)
    - UI changed: with the dev server running, use the Playwright MCP to open http://localhost:3000 at 1280px and 390px, save screenshots to `docs/kiro/screens/task-7-desktop.png` and `docs/kiro/screens/task-7-mobile.png`, and reference them in the log entry
    - Task is not complete until these steps pass

## Notes

- All property-based test sub-tasks are required; only 5.4 (dataset cleaning unit tests) is marked optional with `*` and can be skipped for a faster MVP. Optional sub-tasks are still scheduled in the dependency graph.
- Each task references specific requirement sub-clauses for traceability, and the calc/rebates tests reference the design's numbered correctness properties.
- The "Done" sub-step on every top-level task enforces `.kiro/steering/workflow.md`: run `npx vitest run`, append a `KIRO_LOG.md` entry, and capture Playwright screenshots when UI changed.
- AI is introduced only in tasks 6 and 7; tasks 1–5 keep API routes as no-AI stubs so the app is fully usable with demo homes first.
- Never read, print, or edit `.env.local`; never add `.kiro` to `.gitignore`.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4"] },
    { "id": 2, "tasks": ["1.5"] },
    { "id": 3, "tasks": ["2.1", "2.3", "2.5", "2.9"] },
    { "id": 4, "tasks": ["2.2", "2.4", "2.6", "2.7", "2.10", "2.11"] },
    { "id": 5, "tasks": ["2.8", "3.1"] },
    { "id": 6, "tasks": ["3.2", "3.3", "3.4"] },
    { "id": 7, "tasks": ["3.5", "5.1"] },
    { "id": 8, "tasks": ["4.1", "4.2", "4.3", "4.4", "5.2", "5.4"] },
    { "id": 9, "tasks": ["4.5", "5.3"] },
    { "id": 10, "tasks": ["6.1"] },
    { "id": 11, "tasks": ["6.2", "6.3", "7.1"] },
    { "id": 12, "tasks": ["6.4", "7.2"] }
  ]
}
```
