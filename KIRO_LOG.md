# Kiro Log

| Time (UTC) | Task | Kiro feature | What it did | Why it mattered |
|---|---|---|---|---|
| 2026-01-01 | Create HeatSwitch design.md spec | Spec (design-first workflow) + Steering | Authored `.kiro/specs/heatswitch/design.md` with High-Level (architecture, sequence diagrams, components, data models) and Low-Level (TypeScript interfaces, function signatures with pre/postconditions, pseudocode, 10 fast-check correctness properties) design, plus the scaffold→calc→UI→rebates→buildings→extraction→explanation build order. | Locks in the "LLM never computes a number" rule and the honest-verdict logic before any code is written, so tasks follow one verified blueprint. |

## Revise heatswitch design.md (design-first spec)
- When: design phase (no code changed; spec-only)
- Kiro feature used: Spec (design-first workflow)
- What: Applied 7 corrections to .kiro/specs/heatswitch/design.md — seasonal
  heat pump rate as a flat $/kWh discount per utility; Mass Save whole-home
  rebate tiers (Standard/Enhanced/Income Eligible) with income limits and the
  Dec 31, 2026 deadline (removed the equity-zip bonus, kept it as a notice only);
  annualHeatingUse baseload helper; per-heating-type systemEfficiency; cleaned
  BERDO model (no address, id = index, nullable gasShare, cleaning rules,
  percentile ranking); cached demo homes with evidence + one amber field; and
  real Anthropic (claude-sonnet-5-5) extract/explain routes in tasks 6 and 7.
  Validated format (no errors; only expected "Validates: Requirements" warnings
  since requirements.md does not exist yet in design-first).
- Why it mattered: locks the math and data model to real MA/Mass Save rules before
  requirements are derived, keeping the "LLM never computes numbers" rule intact.

## Derive heatswitch requirements.md from design (design-first spec)
- When: requirements phase (no code changed; spec-only, vitest skipped per workflow)
- Kiro feature used: Spec (design-first workflow)
- What: Authored .kiro/specs/heatswitch/requirements.md by deriving 12 EARS
  requirements from the authoritative design.md plus product/tech/design steering.
  Covered intake (upload/oil/demo, zip, rent toggle, gas demo one amber field),
  real Anthropic extraction with Zod validation + amber + manual fallback, inline
  confirmation UX, pure cost math (annualHeatingUse bounds, per-type efficiency,
  breakeven COP, seasonal flat $/kWh discount by utility), Mass Save tiered rebates
  + payback + Dec 31 flag, single-label honest verdict, renter/landlord path,
  Buildings tab (BERDO cleaning, percentile ranking, opportunity messaging),
  six-language explanations from code numbers with graceful fallback, Boston/equity
  next steps (equity never changes rebate), sourcing/privacy, and shadcn/Mist+Emerald
  visual constraints. Added testable "FOR ALL" criteria so the design's 10 correctness
  properties can satisfy their "Validates: Requirements X.Y" references. Format validated
  (no issues).
- Why it mattered: gives every design decision a traceable, testable requirement so the
  correctness properties map cleanly to acceptance criteria before tasks are generated.

## Task 1.1 — Scaffold Next.js App Router + TypeScript + Tailwind + shadcn/ui
- When: 2026-10-24 16:23 UTC
- Task: 1.1 Scaffold the Next.js App Router + TypeScript + Tailwind + shadcn/ui project
- Kiro feature used: Spec (design-first workflow) + CLI scaffold + shadcn
- What: Ran `npx shadcn@latest init --preset b2BWx6KYq --template next --name heatswitch --yes`
  in a temp folder (workspace was non-empty) with npm, then rsync'd the generated files into the
  workspace root while excluding `.git`, `.gitignore`, and `README.md` so existing files were
  preserved (`data/`, `docs/`, `.kiro/`, `KIRO_LOG.md`, `.env.example`, `.env.local`, `.gitignore`).
  Confirmed TypeScript strict mode (`strict: true`) and Inter via `next/font`. Enforced light mode
  only: removed the next-themes `ThemeProvider` + dark-mode hotkey, deleted `components/theme-provider.tsx`,
  uninstalled `next-themes`, and stripped the `.dark` block and `@custom-variant dark` from
  `app/globals.css`. Merged `.gitignore` (union of scaffold + existing) keeping `.env*.local` so
  `.env.local` stays ignored while `.env.example` stays tracked, and kept `.kiro` out of `.gitignore`.
  Created the directory structure: `lib/`, `app/api/extract/`, `app/api/explain/`,
  `components/my-home/`, `components/buildings/`, `components/shared/`, `data/berdo-2021/`.
  `npx tsc --noEmit` passes. `npx vitest run` not run yet — the test toolchain is set up in task 1.2.
- Why it mattered: establishes the Mist+Emerald, light-only, strict-TypeScript foundation every later
  task builds on, without clobbering the spec, data, or secrets already in the repo.

## Task 1.4 — Implement lib/schema.ts (Zod schemas + shared types)
- When: 2026-10-24 16:27 UTC
- Task: 1.4 Implement `lib/schema.ts` with the Zod schemas and shared types
- Kiro feature used: Spec (design-first workflow)
- What: Created `lib/schema.ts` matching design.md's Data Models exactly. Defined the shared
  enumerations as TypeScript type aliases — `HeatingType` ("gas" | "oil" | "electric-resistance" |
  "propane"), `Utility` ("eversource" | "national-grid" | "unitil"), `Language` (en/es/cv/zh/ht/vi),
  `RebateTier` ("standard" | "enhanced" | "income-eligible"), and `VerdictLabel` (Switch now / Switch
  when your system needs replacing / Not worth it yet) — plus the `HomeInputs` and `Assumptions`
  interfaces with their validation-rule doc comments. Added the Zod schemas: `ExtractedFieldSchema`
  ({ value, confidence 0..1, evidence min 1 }), `HeatingTypeSchema` (z.enum), and `ExtractionResultSchema`
  with `annualFuelUse`/`fuelUnitPrice` made `.partial(...)` (heatingType required), and exported the
  inferred `ExtractedField`/`ExtractionResult` types and `CONFIDENCE_THRESHOLD = 0.8`. `HeatingType` and
  `Utility` are exported type aliases so `lib/constants.ts` (task 1.3, parallel) can import them.
  `npx tsc --noEmit` passes (exit 0). `npx vitest run` not run — vitest not yet installed (task 1.2 is
  setting up the test toolchain in parallel); verified with the typecheck instead. No UI change, so no
  Playwright screenshots.
- Why it mattered: gives the whole app one typed, Zod-validated contract for bill extraction and inputs,
  so demo and real-AI data flow through the same schema and the pure calc/rebates functions share one set
  of types.

## Task 1.3 — Implement lib/constants.ts (source-cited constants)
- When: 2026-10-24 12:28 EDT
- Task: 1.3 Implement `lib/constants.ts` with all source-cited constants
- Kiro feature used: Spec (design-first workflow)
- What: Created `lib/constants.ts` with every constant from design.md's "Model:
  Source-cited constants" section, each carrying an adjacent resolvable source-URL
  comment (Requirement 11.6): fuel energy content (THERM_KWH 29.3, OIL_GALLON_KWH 40.6,
  PROPANE_GALLON_KWH 27.0 — EIA), SYSTEM_EFFICIENCY per heating type (gas 0.90, oil 0.82,
  electric-resistance 1.0, propane 0.85 — energy.gov), SEASONAL_HEAT_PUMP_RATE_DISCOUNT as
  flat $/kWh by utility (eversource 0.073, national-grid 0.042, unitil 0.065 — mass.gov),
  MASS_SAVE_PER_TON 2650 and MASS_SAVE_TOTAL_CAP 8500, ENHANCED_CAP 16000, INCOME_LIMITS for
  household sizes 1–5 as { incomeEligibleMax, enhancedMax } using the CORRECTED Requirement 5.2
  values (IE maxes 51777/67709/83641/99573/115504, Enhanced maxes 69036/90279/111522/132764/154006),
  REBATE_REQUIREMENTS (4-item checklist), REBATE_DEADLINE_2026 (Dec 31 2026) + REBATE_DEADLINE_NOTE,
  and SUMMER_MONTH_INDEXES [5,6,7,8]. Imported HeatingType and Utility type-only from "@/lib/schema"
  (task 1.4 landed and exports them). Noted that INCOME_LIMITS holds sizes 1–5 only; the sizes 6–8
  reuse + "check masssave.com/income" flag logic lives in lib/rebates.ts. `npx tsc --noEmit` passes
  (exit 0, no diagnostics). `npx vitest run` not run — vitest is not yet installed (task 1.2 sets up
  the test toolchain in parallel); verified with the typecheck instead. No UI change, so no Playwright
  screenshots.
- Why it mattered: gives calc.ts and rebates.ts one authoritative, source-traceable set of constants so
  all math stays in pure functions and every displayed number can link back to its source.

## Task 1.2 — Install shadcn/ui components + set up test toolchain
- When: 2026-10-24 12:29 EDT
- Task: 1.2 Install shadcn/ui components and set up the test toolchain
- Kiro feature used: shadcn (CLI fallback) + CLI + property-based test setup (Vitest + fast-check)
- What: Added the 8 remaining shadcn/ui components via `npx shadcn@latest add card slider
  switch tabs badge alert tooltip skeleton --yes` (Button already existed from task 1.1), landing
  them in `components/ui/` — so all nine required primitives (Card, Button, Slider, Switch, Tabs,
  Badge, Alert, Tooltip, Skeleton) are present. The shadcn MCP power is not installed in this
  workspace, so I used the sanctioned CLI fallback with npm. Added the three runtime deps at exact
  pinned versions with `npm install --save-exact recharts@3.10.1 zod@4.6.7 @anthropic-ai/sdk@1.3.0`,
  and the test toolchain at exact pins with `npm install --save-dev --save-exact vitest@5.0.5
  fast-check@4.10.2`. Vitest 5 requires `@types/node` ^22 || >=24 but the scaffold pinned ^20; since
  the runtime is Node 24.22.1 I aligned `@types/node` to ^24 to satisfy the peer dep (typecheck still
  passes, exit 0). Added a `"test": "vitest run"` script and a minimal `vitest.config.ts` (node env,
  globals, include `**/*.{test,spec}.{ts,tsx}`, `passWithNoTests: true` since no test files exist until
  later tasks). Confirmed `npx vitest run` exits 0 reporting "No test files found" and smoke-tested a
  temp spec that imports fast-check + zod (1 passed, then removed). No UI change, so no Playwright
  screenshots (task-1 screenshots happen at 1.6).
- Why it mattered: stands up the property-based test harness (Vitest + fast-check) the pure calc/rebates
  functions depend on in task 2, and pins Recharts/Zod/Anthropic so the charts, validation, and AI routes
  build on reproducible versions.

## Task 1.5 — app/page.tsx two-tab shell + stub API routes
- When: 2026-10-24 16:32 UTC
- Task: 1.5 Create `app/page.tsx` two-tab shell and stub API routes
- Kiro feature used: Spec (design-first workflow) + shadcn
- What: Rebuilt `app/page.tsx` as the HeatSwitch shell using only already-installed
  shadcn/ui primitives (Card, Badge, Tabs). Wrapped everything in the
  `max-w-5xl mx-auto px-6 py-10` container. Header shows the "HeatSwitch" title,
  the "Know before you switch" tagline, and a shadcn Badge reading "Massachusetts";
  footer reads "Your bill is never stored." A base-ui `Tabs` defaults to "My home"
  with a second "Buildings (landlords & city)" tab whose panel stays hidden until
  selected (base-ui Tabs handles this — `defaultValue="my-home"`, `value` on each
  trigger/panel). Laid out the wireframe as empty titled placeholder Cards
  (`rounded-2xl border shadow-sm p-6`, `gap-6` between cards): My home = full-width
  Upload card, a `grid md:grid-cols-5` row that stacks to one column below 768px
  with the left 60% column (`md:col-span-3`: Verdict + Cost comparison) and right 40%
  column (`md:col-span-2`: Your numbers + Assumptions + Rebates), then a Next step row
  and a How-we-calculate card; Buildings = a single placeholder card for the ranked
  BERDO table. Each placeholder notes which later task fills it in. Created stub route
  handlers `app/api/extract/route.ts` (returns a static ExtractionResult-shaped
  placeholder) and `app/api/explain/route.ts` (returns a placeholder string) — both
  `POST`, no Anthropic/AI calls, no env reads, with comments noting the real calls land
  in tasks 6/7; removed the now-redundant `.gitkeep` files from both api dirs. Read the
  bundled Next 16 Route Handlers doc first per AGENTS.md. Verified: `npx tsc --noEmit`
  clean (exit 0), `npx vitest run` passes with zero test files (exit 0), and
  `npx next build` compiles the `/` page (static) plus `/api/extract` and `/api/explain`
  (dynamic handlers) with no errors. No Playwright screenshots in this sub-task — they
  happen at the 1.6 Done step.
- Why it mattered: gives the app a real, compiling two-tab layout and no-AI stub endpoints
  so every later UI and AI task has a stable shell to wire into, keeping demo-first usability
  and the "AI only in tasks 6/7" boundary intact.

## Task 1 — Scaffold + shell: Done (workflow.md closeout)
- When: 2026-10-24 16:35 UTC
- Task: Task 1 — scaffold + shell (closeout of sub-tasks 1.1–1.6)
- Kiro feature used: Spec (design-first workflow) + CLI scaffold + shadcn + Playwright MCP + property-based test setup (Vitest + fast-check)
- What: Ran the workflow.md Done steps for Task 1. (1) `npx vitest run` passed (exit 0,
  "No test files found" — expected; the fast-check/Vitest harness is set up but the first
  tests land in Task 2). (2) UI changed in Task 1 (the two-tab page shell now exists), so
  started the Next 16.4.2 dev server (`npm run dev`, Turbopack, Ready on http://localhost:3000),
  confirmed it was serving, then used the Playwright MCP to open the app and capture full-page
  responsive screenshots at 1280px (desktop) and 390px (mobile), saving them to
  `docs/kiro/screens/task-1-desktop.png` and `docs/kiro/screens/task-1-mobile.png`. Verified
  both visually: header "HeatSwitch" + "Know before you switch" tagline + "Massachusetts" badge,
  the two tabs with "My home" active and "Buildings (landlords & city)" present, the placeholder
  cards (Upload, Verdict, Cost comparison, Your numbers, Assumptions, Rebates, Next step, How we
  calculate), and the "Your bill is never stored." footer. Responsive difference confirmed: the
  1280px desktop shot shows the My-home two-column 60/40 grid (Verdict + Cost comparison left,
  Your numbers + Assumptions + Rebates right), while the 390px mobile shot collapses everything
  into a single stacked column. Closed the browser, shut down the dev server, and removed the
  transient `.playwright-mcp/` log directory. This closeout summarizes Task 1 across 1.1–1.5:
  1.1 scaffolded Next.js App Router + TS strict + Tailwind + shadcn (Mist base, Emerald theme,
  light-only, Inter via next/font); 1.2 installed the 9 shadcn primitives and pinned
  Recharts/Zod/Anthropic SDK plus the Vitest + fast-check test toolchain; 1.3 implemented
  `lib/constants.ts` with source-cited constants; 1.4 implemented `lib/schema.ts` (Zod schemas +
  shared types); 1.5 built the `app/page.tsx` two-tab shell and the no-AI stub `/api/extract`
  and `/api/explain` routes. Did not touch `.env.local`; did not add `.kiro` to `.gitignore`.
- Screenshots: docs/kiro/screens/task-1-desktop.png (1280px), docs/kiro/screens/task-1-mobile.png (390px)
- Why it mattered: verifies the compiling two-tab shell renders correctly and responsively on real
  viewports before any calc/UI/AI work, giving every later task a confirmed, demo-first foundation.
- 2026-10-24 12:40 EDT — Task 2.1: Implement heating-use and energy-content functions in lib/calc.ts — Kiro feature: spec. Created lib/calc.ts fresh with two pure functions: `annualHeatingUse(history)` (sum − 12·min(summer months), rejecting non-12-length/non-finite/negative histories, clamped to [0, sum]) and `fuelEnergyContentKWh(type, fuelUse, efficiency)` (per-fuel kWh content × efficiency, rejecting unsupported type / fuelUse<0 / efficiency≤0). `npx tsc --noEmit` and `npx vitest run` both pass. Why it mattered: these are the first entries in the Calculation_Engine that keep all math in pure, testable code so the LLM never computes a number (product/tech rules, Requirements 4.2–4.7).

## Task 2.5 — Implement rebate tier + rebate functions in lib/rebates.ts
- When: 2026-10-24 16:41 UTC
- Task: 2.5 Implement rebate tier and rebate functions in `lib/rebates.ts`
- Kiro feature used: Spec (design-first workflow)
- What: Created `lib/rebates.ts` as a pure module (no I/O, no network) with four exports plus
  two result types. `selectRebateTier(householdSize, annualIncome?)` returns a small
  `RebateTierResult { tier, invalidHouseholdSize?, checkIncomeLimits? }`: income absent/undefined
  => "standard" (Req 5.1); household size absent or not an integer >= 1 => "standard" with
  `invalidHouseholdSize` flagged (Req 5.3); sizes 6–8 reuse the size-5 `INCOME_LIMITS` row and set
  `checkIncomeLimits` ("check masssave.com/income"); with valid size + income it uses the CORRECTED
  Req 5.2 banding where `incomeEligibleMax` is the LOWER bound — income <= incomeEligibleMax =>
  "income-eligible", else income <= enhancedMax => "enhanced", else "standard" (the earlier
  design prose/pseudocode had these inverted; the requirement + lib/constants.ts are authoritative).
  `computeRebates(inputs, a)` picks the tier, computes the uncapped rebate per tier (Standard =
  min(MASS_SAVE_PER_TON·tons, MASS_SAVE_TOTAL_CAP); Enhanced = min(installCostGross, ENHANCED_CAP=16000);
  Income Eligible = full installCostGross, Req 5.4/5.5), clamps `rebateAmount` to [0, installCostGross]
  (Req 5.6), sets `netInstallCost = installCostGross − rebateAmount >= 0` (Req 5.7), and pulls annual
  savings from `computeComparison` (lib/calc.ts) to set `paybackYears` null when savings <= 0 else
  netInstallCost/savings >= 0 (Req 5.8). The equity-zip status is never consulted in the rebate math
  (Req 5.9/10.4). `isBostonZip(zip)` and `isEquityZip(zip)` use documented, source-cited zip sets
  (USPS/City of Boston; MA environmental-justice list); `isEquityZip` is informational only and is not
  called by `computeRebates`. Defined/exported `RebateResult` (with optional `invalidHouseholdSize?`/
  `checkIncomeLimits?`) here since it is a computed-result shape, not a Zod input schema. `npx vitest run`
  passes (no test files yet — tests land in 2.6/2.11). `npx tsc --noEmit` surfaces exactly one error:
  `@/lib/calc` has no exported `computeComparison` — an EXPECTED cross-task dependency since task 2.3
  (which creates `computeComparison` in lib/calc.ts) runs sequentially after this one in wave 3; the
  import is in place so it resolves once 2.3 lands. No math was reimplemented here. No UI change, so no
  Playwright screenshots. Did not read/print/edit `.env.local`.
- Why it mattered: puts all Mass Save rebate/payback math in a pure, source-traceable module with the
  corrected income banding, so the rebate picture is honest and testable and the equity-zip never alters
  a dollar amount (LLM-never-computes rule, Requirements 5.1–5.9/10.4).

## Task 2.3 — Implement cost, breakeven, and comparison functions in lib/calc.ts
- When: 2026-10-24 16:43 UTC
- Task: 2.3 Implement cost, breakeven, and comparison functions in `lib/calc.ts`
- Kiro feature used: Spec (design-first workflow)
- What: Appended four pure functions (plus one private helper) to the existing
  `lib/calc.ts`, reusing the task-2.1 `fuelEnergyContentKWh` for all delivered-heat
  conversions (not duplicated). `currentHeatingCost(inputs)` returns
  `annualFuelUse * fuelUnitPrice`, rejecting non-finite / non-positive factors, so it
  scales linearly (Req 4.1 / 4.8, Property 7). A private `effectiveElectricityPrice(a)`
  is the SOLE source of the effective $/kWh price: rate off => `electricityPrice`; rate
  on => `Math.max(0, electricityPrice - seasonalRateDiscountPerKWh)` — a flat $/kWh
  discount floored at a minimum of 0 (Req 4.11). `heatPumpCost(inputs, a)` computes
  `deliveredHeatKWh = fuelEnergyContentKWh(type, annualFuelUse, systemEfficiency[type])`,
  then `(deliveredHeatKWh / heatPumpCOP) * effectiveElectricityPrice(a)` — strictly
  decreasing in COP and rate-on <= rate-off (Req 4.12 / 4.13, Properties 3 & 4); asserts
  `heatPumpCOP >= 1`. `breakevenCOP(inputs, a)` solves the equality to
  `(deliveredHeatKWh * effectiveElectricityPrice(a)) / currentHeatingCost(inputs)` and
  clamps to the inclusive range 0.01..10.0 (Req 4.9); it uses the SAME
  `effectiveElectricityPrice(a)` and the SAME delivered-heat path as `heatPumpCost`, so
  `heatPumpCOP > breakevenCOP ⟺ annualDeltaDollars > 0` holds exactly (Req 4.10, Property 2).
  `computeComparison(inputs, a)` returns the `CostComparison` with
  `annualDeltaDollars = currentAnnualCost - heatPumpAnnualCost` (Req 4.14). Added and
  exported the `CostComparison` interface in `lib/schema.ts` (computed-result shape) and
  imported it type-only into calc.ts. No internal rounding (display is a caller concern).
  `npx tsc --noEmit` now passes with ZERO errors — this resolves the previously-expected
  task-2.5 cross-task error, since `lib/rebates.ts` imports `computeComparison` from
  `@/lib/calc` (confirmed at rebates.ts lines 18 and 176). `npx vitest run` passes (no test
  files yet — tests land in 2.4 / 2.11). No UI change, so no Playwright screenshots. Did not
  read/print/edit `.env.local`.
- Why it mattered: completes the honest cost core of the Calculation_Engine — current vs
  heat-pump cost and the breakeven boundary all in pure, source-traceable code sharing one
  effective-price path — so the verdict is honest and consistent, and unblocks lib/rebates.ts.

## Task 2.9 — Implement building ranking functions in lib/calc.ts
- When: 2026-10-24 16:46 UTC
- Task: 2.9 Implement building ranking functions in `lib/calc.ts`
- Kiro feature used: Spec (design-first workflow)
- What: Appended the BERDO building-ranking functions to the existing `lib/calc.ts`,
  preserving everything from tasks 2.1/2.3. Added the shared data model to `lib/schema.ts`
  (the data-model home): the `BerdoBuilding` interface per design (id, zip, propertyType,
  yearBuilt, grossFloorAreaSqFt, siteEUI, ghgEmissions, electricShare, `gasShare: number | null`
  where null = unknown, NOT zero) and the `OpportunityLabel = "High" | "Medium" | "Low"` type;
  both are imported type-only into calc.ts. The ranked-row result type `RankedBuilding`
  (`BerdoBuilding & { score, percentile, label }`) is exported from calc.ts. Implemented three
  pure functions plus two private helpers: `opportunityScore(b)` is a documented finite linear
  combination — `siteEUI` (primary) + `0.05·ghgEmissions` + a `+50` electric-resistance bonus when
  `electricShare === 1` + `40·gasShare` — where `gasShare === null` contributes NO gas term (so an
  unknown fuel mix is never pushed down the ranking the way substituting 0 would), while a genuine
  `gasShare === 0` correctly contributes a zero term; result is finite-guarded. `opportunityLabel(percentile)`
  maps an inclusive 0..100 percentile monotonically to High (>=67) / Medium (>=33) / Low, clamping
  out-of-range inputs so it is total and monotonic. `rankBuildings(buildings, zip)` computes each
  row's percentile of `opportunityScore` within the MULTIFAMILY cohort of the FULL list (private
  `percentileOf` = 100·count(cohort <= score)/cohort.length, monotonic, bounded 0..100, empty cohort => 100;
  private `isMultifamily` = case-insensitive "multifamily" substring on propertyType), filters to a
  valid 5-digit zip (null or non-5-digit keeps all rows), annotates `{ score, percentile, label }`, and
  sorts a COPY by score descending with a deterministic `id`-ascending tie-break — never mutating the
  input. This guarantees Property 8 / Req 8.7: the result is exactly the zip-matching subset sorted by
  score descending, no rows added or dropped. Note: percentile uses the inclusive 0..100 range from the
  authoritative Requirement 8.6 (the design pseudocode's [0,1] was superseded). `npx tsc --noEmit` passes
  with ZERO errors; `npx vitest run` passes (no test files yet — ranking tests land in task 2.10). No UI
  change, so no Playwright screenshots. Did not read/print/edit `.env.local`.
- Why it mattered: completes the Buildings_View ranking logic in pure, source-traceable code — honest,
  deterministic opportunity scoring and a provable sorted-permutation ranking — so the Buildings tab
  (task 5) can load BERDO data and rank it without any math leaking out of the Calculation_Engine.

## Task 2.7 — Implement decideVerdict in lib/calc.ts (heatswitch spec)
- When: 2026-10-24 16:48 UTC (implementation; vitest run — no test files yet; tsc --noEmit clean)
- Kiro feature used: Spec (design-first workflow, task execution)
- What: Added the `Verdict` type to lib/schema.ts (alongside CostComparison) and
  appended the pure `decideVerdict(cmp, reb, inputs, now)` to lib/calc.ts.
  Label (Req 6.1–6.4): delta <= 0 → "Not worth it yet"; else payback != null &&
  <= 5 → "Switch now"; else → "Switch when your system needs replacing".
  actBeforeDec31 (Req 5.12/5.13): true only when savings > 0, rebateAmount > 0,
  now <= REBATE_DEADLINE_2026, and the rebate shortens payback by >= 1 year vs
  the gross-cost payback (installCostGross reconstructed as netInstallCost +
  rebateAmount). isRenter (Req 7.2/7.3) from inputs.heatIncludedInRent.
- Why it mattered: the headline honest answer — it refuses to say "switch" when a
  heat pump does not save money, and only flags the deadline when the rebate
  genuinely moves the payback, keeping the verdict trustworthy.

## Task 2.2 — Property tests for heating-use and energy-content
- When: 2026-10-24 16:50 UTC
- Task: 2.2 Write property tests for heating-use and energy-content
- Kiro feature used: Property-based test (Vitest + fast-check)
- What: Added `lib/calc.heating-use.test.ts` encoding the two design correctness
  properties for the task-2.1 functions in `lib/calc.ts`, plus supporting
  postconditions. Property 10 (Validates: Requirement 4.4): FOR ALL 12-element
  histories of non-negative finite readings, `0 <= annualHeatingUse(history) <=
  sum(history)` — arbitrary is `fc.array(fc.double({min:0,max:1e6,noNaN,
  noDefaultInfinity}), {minLength:12,maxLength:12})`. Property 9 (Validates:
  Requirement 4.7): FOR ALL supported HeatingType and efficiency > 0,
  `fuelEnergyContentKWh(type, 0, efficiency) === 0` — arbitraries
  `fc.constantFrom(...HEATING_TYPES)` and a positive finite efficiency. Also
  encoded: annualHeatingUse returns a finite number (Req 4.4); it throws for
  non-12-length histories and for 12-element histories with a negative element
  (Req 4.3); fuelEnergyContentKWh returns a finite number >= 0 (Req 4.5/4.7) and
  is monotonic non-decreasing in fuelUse for fixed type+efficiency (Req 4.5).
  One infra fix was required: vitest did not resolve the tsconfig `@/*` path
  alias, so I added a `resolve.alias` mapping `@` -> project root in
  `vitest.config.ts` (mirrors `tsconfig` paths) so tests import `@/lib/calc`
  the same way the app does. `npx vitest run` => 7 passed (1 file); `npx tsc
  --noEmit` clean (exit 0). No property was weakened; no implementation changed.
  No UI change, so no Playwright screenshots. Did not read/print/edit `.env.local`.
- Why it mattered: locks the two universally-quantified guarantees the honest cost
  math depends on — heating use can never go negative or exceed the bill total, and
  zero fuel always means zero delivered heat — so any future regression in the
  Calculation_Engine fails fast with a minimal shrunk counterexample.

## Task 2.10 — Property and unit tests for building ranking
- When: 2026-10-24 12:51 EDT
- Task: 2.10 Write property and unit tests for ranking (calc.ts)
- Kiro feature used: Property-based test (fast-check + Vitest)
- What: Added `lib/calc.ranking.test.ts` covering `opportunityScore`,
  `opportunityLabel`, and `rankBuildings`. Encoded Property 8 (Req 8.7):
  for all building lists and any zip (null, a zip drawn from the list, or an
  arbitrary 5-digit zip), `rankBuildings` returns exactly the zip-matching
  subset as a permutation (multiset of returned ids equals the matching input
  ids), sorted by score descending, without mutating the input (deep-copy
  compare) and with every percentile in [0,100]. Added `opportunityLabel`
  monotonicity (Low<Medium<High for p1<=p2) with the 0/33/67/100 cutoffs, and
  zip-filtering unit tests (single-zip filter, null returns all, no-match
  returns []). `npx vitest run` passes (33 tests, 4 files); `npx tsc --noEmit`
  clean.
- Why it mattered: The Buildings tab's ranking is the one place rows can be
  silently dropped, duplicated, or mis-ordered; the permutation + sorted +
  no-mutation property locks in that the ranking is trustworthy and the
  label stays monotonic, matching the honesty principle.

## Task 2.6 — Write property tests for rebates
- When: 2026-10-24 12:51 EDT
- Kiro feature used: Property-based test (fast-check + Vitest)
- What: Added `lib/rebates.test.ts` with fast-check property tests for
  `lib/rebates.ts`. Encoded Property 5 (rebate bounds, Req 5.6:
  `0 <= rebateAmount <= installCostGross` and `netInstallCost >= 0`) and
  Property 6 (payback sign, Req 5.8: null when annual savings <= 0, else >= 0),
  plus supporting properties: corrected tier banding (Req 5.1/5.2/5.3 —
  income-eligible/enhanced/standard bands, income-absent and invalid-household
  fallbacks, size 6..8 reuse of size-5 limits with the check flag, and exact
  boundary incomes at `incomeEligibleMax`/`enhancedMax`), `computeRebates.tier`
  agreement with `selectRebateTier`, per-tier uncapped amount after the gross cap
  (Req 5.4/5.5), and equity-zip invariance (Req 5.9 — rebate unchanged between an
  equity and non-equity zip). Arbitraries: realistic `HomeInputs`
  (householdSize 1..8, optional income spanning the bands, valid 5-digit zip) and
  `Assumptions` (installCostGross >= 0, heatPumpTons > 0, plus the COP/price/rate
  fields `computeComparison` needs). All 11 tests pass; `npx tsc --noEmit` clean.
- Why it mattered: locks the Mass Save rebate/payback invariants across the whole
  input space so the honest financial picture (never negative, never over gross,
  payback only when it actually pays back, and equity status never touching the
  rebate) cannot silently regress.
- Note: the full `npx vitest run` shows one unrelated failure in
  `lib/calc.cost.test.ts` (task 2.4's "Property 2" generator yields
  `heatPumpCOP: 0.02`, violating the `>= 1` precondition `heatPumpCost` enforces).
  That file is outside task 2.6's scope and was left untouched.

## Task 2.8 — Property test + boundary unit tests for the verdict
- When: 2026-10-24 16:51 UTC
- Task: 2.8 Write property test and boundary unit tests for the verdict
- Kiro feature used: Property-based test (Vitest + fast-check)
- What: Added `lib/calc.verdict.test.ts` (uniquely named to avoid colliding with the
  2.2/2.4/2.6/2.10/2.11 test files) covering `decideVerdict(cmp, reb, inputs, now)` in
  `lib/calc.ts`. Property 1 — No savings is reported honestly (Validates: Requirement 6.2):
  FOR ALL realistic HomeInputs + Assumptions, building `cmp`/`reb` via `computeComparison` /
  `computeRebates` and constraining with `fc.pre(cmp.annualDeltaDollars <= 0)`, the label is
  ALWAYS "Not worth it yet". The COP arbitrary spans 1..6 so the non-positive-delta region is
  reached often. Two supporting properties over the full generated space: exactly one of the
  three labels is always returned (Req 6.1) and `isRenter === inputs.heatIncludedInRent`
  (Req 7.2/7.3). Boundary unit tests around breakeven (Req 6.1/6.3/6.4): delta === 0 and delta
  = −0.01 → "Not worth it yet"; delta = +0.01 with payback 5 → "Switch now"; delta = +0.01 with
  payback 5.01 or payback null → "Switch when your system needs replacing"; comfortable-savings
  short-payback → "Switch now". Deadline tests (Req 5.12/5.13) using REBATE_DEADLINE_2026: a
  material rebate (gross 18000, rebate 8500, net 9500, savings 1200/yr; payback 15y→7.92y) gives
  actBeforeDec31 true at now=2026-06-01 and at exactly the deadline boundary, false at
  now=2027-01-01; and false when there are no savings (payback null), when rebateAmount===0, or
  when the rebate shortens payback by < 1 year (600 rebate → 15y→14.5y). isRenter unit cases both
  ways. `npx vitest run` => 50 passed (5 files; 17 new in this file); `npx tsc --noEmit` clean
  (exit 0). No property was weakened and no implementation was changed — Property 1 held as written.
  No UI change, so no Playwright screenshots. Did not read/print/edit `.env.local`.
- Why it mattered: pins the honesty guarantee at the heart of HeatSwitch — the verdict can never
  recommend switching when a heat pump does not save money — and nails the exact breakeven and
  Dec-31-deadline boundaries so any future regression in decideVerdict fails fast with a minimal
  shrunk counterexample.

## Task 2.4 — Property tests for cost and breakeven
- When: 2026-10-24 12:51 EDT
- Task: 2.4 Write property tests for cost and breakeven (lib/calc.ts)
- Kiro feature used: Property-based test (Vitest + fast-check)
- What: Added `lib/calc.cost.test.ts` encoding four design correctness properties over
  realistic `HomeInputs` + `Assumptions` arbitraries (heatingType from the 4 types,
  annualFuelUse/fuelUnitPrice > 0, valid 02-prefix zip/utility/householdSize; heatPumpCOP >= 1,
  electricityPrice > 0, seasonalRateDiscountPerKWh >= 0, per-type efficiencies > 0, tons > 0,
  installCostGross >= 0), 1000 runs each. Property 2 (Validates: Req 4.10) breakeven consistency:
  `heatPumpCOP > breakevenCOP ⟺ computeComparison(...).annualDeltaDollars > 0`, asserted as a full
  two-directional iff with no tolerance — gated with `fc.pre` to cases whose RAW (unclamped)
  breakeven is interior to (0.01, 10.0), since breakevenCOP clamps to that range and the exact iff
  only holds where the returned value is the true boundary, not a clamp artifact (a domain
  restriction to where the claim applies, not a weakening; COP still drawn >= 1 per the SUT
  precondition). Property 3 (Req 4.12) seasonal rate never raises cost:
  `heatPumpCost({...a, seasonalHeatPumpRate:true}) <= heatPumpCost({...a, seasonalHeatPumpRate:false})`
  holding all else equal. Property 4 (Req 4.13) COP monotonicity: strict `heatPumpCost(a1) >
  heatPumpCost(a2)` for copLow < copHigh else equal — gated to effective price > 0 (zero price is the
  boundary the strict claim excludes) and the two COPs drawn with a multiplicative gap (copHigh =
  copLow × factor, factor in [1.0001, 6]) so the decrease is observable in IEEE-754 rather than
  ULP-adjacent pairs that divide to bit-identical doubles. Property 7 (Req 4.8) cost linearity:
  `currentHeatingCost({...inputs, annualFuelUse: k·u}) ≈ k·currentHeatingCost(...)` with a relative
  epsilon of 1e-9 (the inherent FP tolerance for a mathematically-exact equality, not a relaxation).
  No property was weakened and no implementation changed; the two early failures were test-harness
  issues (an invalid sub-1 COP fed to the SUT, and a strict-vs-ULP float boundary), fixed by
  constraining the generators. `npx vitest run` => 50 passed (5 files); `npx tsc --noEmit` clean (exit 0).
  No UI change, so no Playwright screenshots. Did not read/print/edit `.env.local`.
- Why it mattered: locks the four universally-quantified guarantees the honest cost core depends on —
  the breakeven boundary is sign-consistent with savings, the seasonal rate can only help, a better COP
  always costs less, and cost scales linearly with use — so any regression in the Calculation_Engine
  fails fast with a minimal shrunk counterexample.

## Task 2.11 — Persona acceptance-value tests for calc and rebates
- When: 2026-10-24 12:54 EDT
- Task: 2.11 Write persona acceptance-value tests for calc and rebates
- Kiro feature used: Property-based test harness / persona acceptance tests (Vitest + fast-check toolchain)
- What: Added `lib/calc.persona.test.ts` (8 tests) asserting the product's concrete
  acceptance values against the REAL pure functions (`currentHeatingCost`, `heatPumpCost`,
  `breakevenCOP`, `computeComparison` in lib/calc.ts; `selectRebateTier`, `computeRebates`,
  `isEquityZip` in lib/rebates.ts), end to end, with the shared assumptions (COP 2.5,
  electricity $0.288/kWh, 3 tons, $18,000 install, standard tier, seasonal rate OFF unless
  noted) and the source-cited SYSTEM_EFFICIENCY (gas 0.90, oil 0.82, electric 1.0) + energy
  content (THERM_KWH 29.3, OIL_GALLON_KWH 40.6, electric 1). Each dollar/COP value is checked
  with a ±2% RELATIVE tolerance via a helper that also reports the signed margin. Results —
  every value well inside ±2%: Oil current $4,920 (exact, 0.00%) and heat pump $3,068.19 vs
  3,068 (+0.01%); Electric current $2,188.80 vs 2,189 (−0.01%) and heat pump $875.52 vs 876
  (−0.05%); Gas current $1,577.84 vs 1,578 (−0.01%), heat pump $1,980.66 vs 1,981 (−0.02%),
  breakeven COP 3.138 vs 3.14 (−0.06%); Gas with Eversource seasonal rate ON (effective
  $0.215/kWh) heat pump $1,478.62 vs 1,481 (−0.16%, and <= the rate-OFF cost). Also asserted
  tier-selection boundaries for sizes 1–5 (income <= incomeEligibleMax → income-eligible;
  (incomeEligibleMax, enhancedMax] → enhanced; > enhancedMax → standard) and equity invariance
  (computeRebates returns the same rebateAmount/tier/netInstallCost for equity zip 02119 vs
  non-equity 02108, while isEquityZip distinguishes them). Did NOT change any expected value or
  widen the tolerance — the acceptance numbers already matched the engine. `npx vitest run`
  passes (58 tests across 6 files, exit 0); the new file passes alone (8/8); `npx tsc --noEmit`
  clean (exit 0). No UI change, so no Playwright screenshots. Did not read/print/edit `.env.local`.
- Why it mattered: pins the exact dollar/COP answers the demo personas commit to against the real
  engine, so any future drift in a constant or formula (THERM_KWH, OIL_GALLON_KWH, SYSTEM_EFFICIENCY,
  the seasonal discount) fails fast — complementing the universal property tests with concrete,
  human-checkable acceptance values and confirming equity status never moves a rebate dollar.

## Task 2 — Pure calculation engine + property tests: Done (workflow.md closeout)
- When: 2026-10-24 16:55 UTC
- Task: Task 2: pure calculation engine + property tests (closeout of sub-tasks 2.1–2.11)
- Kiro feature used: Property-based testing (Vitest + fast-check) + Spec (design-first workflow)
- What: Ran the workflow.md Done steps for Task 2. (1) `npx vitest run` passed (exit 0):
  6 test files, 58 tests, all passing — `lib/calc.heating-use.test.ts` (7),
  `lib/calc.cost.test.ts` (4), `lib/calc.verdict.test.ts` (17), `lib/calc.ranking.test.ts` (11),
  `lib/rebates.test.ts` (11), `lib/calc.persona.test.ts` (8). `npx tsc --noEmit` is clean
  (exit 0, no diagnostics). No test was weakened and no persona expected value was changed —
  everything passed as-is, so no lib/*.ts source or test file was touched in this closeout.
  (2) Task 2 changed NO UI — it is pure `lib/` code (calc.ts, rebates.ts) plus six test files,
  with no page/component render changes — so per workflow.md step 3 the dev server was NOT started
  and NO Playwright screenshots were captured. This is the correct skip, not an omission.
  Summary of what 2.1–2.11 delivered: `lib/calc.ts` — annualHeatingUse, fuelEnergyContentKWh,
  currentHeatingCost, heatPumpCost (with the shared effective-electricity-price path),
  breakevenCOP, computeComparison, decideVerdict, and the BERDO ranking trio
  opportunityScore / opportunityLabel / rankBuildings; `lib/rebates.ts` — selectRebateTier,
  computeRebates, isBostonZip, isEquityZip. The design's 10 correctness properties are encoded
  as fast-check tests (heating-use bounds + zero-fuel-zero-heat, breakeven ⟺ delta sign,
  heat-pump cost monotonic in COP, rate-on ≤ rate-off, rebate bounds, payback sign,
  ranking permutation + sorted + no-mutation, current-cost linear scaling), alongside the
  persona acceptance values that pin the engine's real-world outputs. Did not read/print/edit
  `.env.local`; did not add `.kiro` to `.gitignore`.
- Screenshots: none — Task 2 changed no UI (correctly skipped per workflow.md step 3).
- Why it mattered: all math now lives in tested, pure functions so the LLM never computes a number,
  and the persona acceptance values confirm the engine matches real-world heat-pump economics within
  ±2% — the honest-verdict core is locked in before any UI wires into it.

## Task 3.1 — Shared SourceLink + ConfirmField primitives
- When: 2026-10-24 17:02 UTC
- Task: Task 3.1: build the shared `SourceLink` and `ConfirmField` UI primitives (Requirements 11.1, 11.2, 3.1, 3.2, 3.3, 3.11)
- Kiro feature used: Spec (design-first workflow) + shadcn/ui
- What: Added two self-contained client components under `components/shared/`.
  (1) `source-link.tsx` — `SourceLink({ label, href? })`: a small `text-xs`
  muted-foreground source reference rendered beneath a number (Req 11.1). With an
  `href` it renders a focusable anchor that opens the source in a new tab; without
  one it wraps the label in the shadcn `Tooltip` (trigger defaults to a focusable
  `<button>`) so the source reveals on hover/focus. (2) `confirm-field.tsx` —
  `ConfirmField({ value, unit, evidence?, confirmed, onConfirm, onEdit, label?, min?, max? })`:
  shows the best-guess value immediately (Req 3.1); when `confirmed === false` it
  draws the one intentional accent the spec allows — an amber outline
  (`border-amber-500 ring-amber-500/40`) — renders the exact bill `evidence` as a
  monospace quoted "chip" (`font-mono text-xs` in a rounded `bg-muted` pill, Req 3.2/11.2),
  and shows shadcn `[Looks right]`/`[Edit]` Buttons. "Looks right" calls `onConfirm`;
  "Edit" switches to an inline `<input>` in place (no modal/new tab, Req 3.3) that
  commits on blur or Enter (Escape cancels). Commit validates a finite number within
  the optional `[min,max]`; invalid input stays in edit mode, restores the prior value,
  and shows an inline `role="alert"` error with `aria-invalid`/`aria-describedby`
  (Req 3.11). When confirmed, the amber outline and actions drop away. Everything uses
  only already-installed shadcn primitives (Button, Tooltip) and Tailwind utilities —
  no custom CSS, no new color system, default shadcn typography kept for the later
  visual pass. Verification: `npx tsc --noEmit` clean (exit 0); `npx vitest run` 58/58
  passing across 6 files (no new tests added this sub-task, per the task note). Did not
  consume these in any card or wire into `app/page.tsx` (tasks 3.2–3.5). Did not
  read/print/edit `.env.local`; did not touch `.gitignore`.
- Screenshots: none — task-3 Playwright screenshots happen at the 3.6 Done step, not this leaf.
- Why it mattered: these two primitives encode the product's trust rules at the component
  level — every number can carry its source (11.1) and every extracted value can show the
  exact bill text it came from with an amber "needs a check" state (3.2/11.2) and friction-free
  in-place confirmation (3.3/3.11) — so the results cards built next inherit honesty-by-default.

## 2026-10-24 13:05 EDT — Task 3.3 Build VerdictCard and CostChartCard

- **Kiro feature:** Spec task execution + shadcn/ui primitives + Recharts.
- **What it did:** Added `components/my-home/verdict-card.tsx` (results-state hero: verdict label `text-4xl font-semibold`, big annual figure `text-6xl tabular-nums` colored emerald for savings / amber for extra cost / neutral at zero — never red, "Act before Dec 31" badge, "Estimate" vs "Based on your bill" status line, six-language native `<select>` dropdown, and a Skeleton placeholder while explanation is null) and `components/my-home/cost-chart-card.tsx` (Recharts two-bar current-vs-heat-pump comparison with tabular-nums dollar labels and a breakeven COP readout + SourceLink).
- **Why it mattered:** Gives the "My home" tab its honest headline answer and the cost comparison visual — the core of a <2-minute demo — using only installed shadcn primitives and the emerald theme, keeping the LLM out of all math.
- **Verification:** `npx tsc --noEmit` clean; `npx vitest run` green (58 tests). No UI wired into page yet (task 3.5), so no screenshots this sub-task.

## Task 3.4 — Build YourNumbersCard with heating-type chip and live recompute
- When: 2026-01-01 (implementation; UI-only component, not yet wired into page.tsx)
- Kiro feature used: Spec (task execution) + shadcn/ui
- What: Added `components/my-home/your-numbers-card.tsx` (`YourNumbersCard`),
  exporting `type FieldKey = "annualFuelUse" | "fuelUnitPrice"` and
  `interface EditableField { key; label; value; unit; evidence?; confirmed }`.
  It composes one `ConfirmField` (from task 3.1) per editable number — passing
  value/unit/evidence/confirmed and wiring onConfirm→onFieldConfirm(key),
  onEdit→onFieldEdit(key,value), min=0 — so the amber outline, monospace
  evidence chip and inline [Looks right]/[Edit] validation all come from the
  shared primitive. Added the heating-type chip "Looks like {gas|oil|electric
  baseboard|propane} heat." with [Yes] (acknowledges) and [Change] (cycles
  HeatingType in place via onHeatingTypeChange). Added the shadcn Alert banner
  "Estimate: N values need a quick check" (N = count of unconfirmed fields),
  rendered only while N>=1, clickable/Enter-Space to scrollIntoView the first
  amber field via a ref. Verdict label flip stays in VerdictCard; recompute is
  the page's job via the callbacks. tsc --noEmit clean; vitest 58/58 pass.
- Why it mattered: gives the My home tab its editable, honest "confirm the
  numbers" surface — the one place a user corrects low-confidence extracted
  values — while keeping all math out of the component per the product rule.

Commit and push now: feat(my-home): add YourNumbersCard with heating-type chip, confirm fields, and estimate banner

## Task 3.2 — Build UploadCard + cached demo ExtractionResults (no AI)
- When: 2026-10-24 17:06 UTC
- Task: 3.2 Build `UploadCard` with the three Try demo buttons and cached ExtractionResults
- Kiro feature used: Spec (design-first workflow) + shadcn
- What: Added two files under `components/my-home/`. (1) `demo-homes.ts` — the cached
  demo fixtures module. Exports the `DemoHome = "oil" | "gas" | "baseboard"` type, a
  `DEMO_HOMES: Record<DemoHome, { extraction, inputs, assumptions }>` map, `DEMO_HOME_LABELS`,
  and two helpers (`getDemoExtraction` which routes a fixture through
  `ExtractionResultSchema.safeParse` per Req 1.12, and `countLowConfidenceFields`). Each
  demo's `extraction` is an `ExtractionResult`-shaped object (value + confidence + exact
  evidence per field) that passes the Zod schema, plus the preset `Partial<HomeInputs>`
  (zip/utility/householdSize/optional income/rent flag) and `Partial<Assumptions>` overrides
  the page merges to reach the intended verdict. Used the exact engine-validated values from
  the task spec unchanged: Oil = 800 gal × $6.15, income 95000 (Enhanced tier), seasonal rate
  ON → "Switch now" + Act-before-Dec-31; Gas = 652 therms × $2.42, no income (Standard), rate
  off, with `annualFuelUse` confidence 0.72 as the SINGLE amber field (< CONFIDENCE_THRESHOLD
  0.8) while heatingType 0.96 and fuelUnitPrice 0.91 stay confirmed (Req 1.11) → "Not worth it
  yet"; Baseboard = 7,600 kWh × $0.288, no income, rate off → "Switch when your system needs
  replacing". Shared assumption defaults (COP 2.5, electricity $0.288/kWh, 3 tons, $18,000
  install, Eversource seasonal discount 0.073 from SEASONAL_HEAT_PUMP_RATE_DISCOUNT,
  SYSTEM_EFFICIENCY) live in one const reused by all three. (2) `upload-card.tsx` — the
  `UploadCard` client component using only installed shadcn primitives (Card, Button, Switch):
  a keyboard-accessible drag/drop + click file picker (JPEG/PNG/PDF) that captures the File and
  raises it via `onBillSelected` (real extraction is task 6), a 5-digit numeric-only zip input
  with inline `^\d{5}$` error, the "Heat included in my rent" Switch (`onRentToggle`), and three
  LARGE `size="lg" h-auto` demo buttons ("Oil home" / "Gas home" / "Baseboard apartment") that
  call `onTryDemo(demo)`. Props match the design exactly: `{ zip, heatIncludedInRent, onZipChange,
  onRentToggle, onBillSelected, onTryDemo }`. Did NOT wire into `app/page.tsx` (task 3.5). Also
  added `components/my-home/demo-homes.test.ts` (6 tests) asserting every fixture parses, the Gas
  demo has exactly one amber field (specifically annualFuelUse), Oil/Baseboard have zero amber
  fields, and the Oil Enhanced-tier + seasonal-rate-on / Standard-tier presets hold. Verified:
  `npx vitest run` → 64 passed (58 prior + 6 new); `npx tsc --noEmit` reports only ONE error, in
  `components/my-home/cost-chart-card.tsx` (task 3.3, a parallel sub-task — a Recharts
  `LabelFormatter` type issue) which I did not touch; my two files type-check clean (confirmed via
  diagnostics). No screenshots this sub-task (task-3 screenshots are at 3.6). Did not read/print/edit
  `.env.local`.
- Why it mattered: gives the demo-first flow its data and its intake UI — three cached bills that
  route through the SAME Zod + confirmation path as a real upload and deterministically produce
  three different honest verdicts, with the Gas demo exercising the single-amber-field confirmation
  UX the design relies on, all without any AI call.

## 2026-10-24 13:10 EDT — Task 3.5: Wire the demo flow into app/page.tsx

- **Kiro feature:** Spec (task-driven implementation) + unit test.
- **What:** Rewrote `app/page.tsx` to hold intake/extraction/confirmation state and
  switch between an empty hero state (headline + subhead + UploadCard) and a results
  state (full-width VerdictCard hero, then CostChartCard, YourNumbersCard, and the
  task-4 placeholder cards). A demo click routes its cached fixture through a shared
  `buildDemoScenario(demo)` helper (added to `components/my-home/demo-homes.ts`) that
  maps the Zod-validated extraction + preset inputs → `HomeInputs` and layers the
  demo's assumption overrides onto the engine defaults → `Assumptions`. Low-confidence
  fields start amber; confirm/edit/heating-type changes recompute
  `computeComparison`/`computeRebates`/`decideVerdict` live via a memo, and the verdict
  label flips "Estimate" → "Based on your bill" once nothing is amber. Added
  `components/my-home/demo-verdicts.test.ts` asserting the three demos produce three
  distinct verdicts (Oil → "Switch now" + actBeforeDec31; Baseboard → "Switch when your
  system needs replacing"; Gas → "Not worth it yet") through the same engine the page
  uses, with a fixed now before Dec 31 2026.
- **Why it mattered:** This is the first screen a judge sees. One shared
  `buildDemoScenario` helper keeps the page and the test on a single source of truth, so
  the demo-verdict test proves the live UI pipeline produces the full range of honest
  outcomes — including the case where a heat pump isn't worth it yet.
- Verification: `npx tsc --noEmit` clean; `npx vitest run` 69/69 (64 existing + 5 new);
  `npx next build` compiles. Screenshots are captured in task 3.6, not this leaf.

## Task 3 — Demo-driven results UI (no AI): Done (workflow.md closeout)
- When: 2026-10-24 17:14 UTC
- Task: Task 3 — demo-driven results UI (closeout of sub-tasks 3.1–3.6)
- Kiro feature used: Spec (design-first workflow) + shadcn/ui + Playwright MCP (+ the demo-verdict unit test, Vitest)
- What: Ran the workflow.md Done steps for Task 3. (1) `npx vitest run` passed — 69 tests
  across 8 files (lib calc/rebates/persona/ranking/verdict + `components/my-home/demo-homes.test.ts`
  and `components/my-home/demo-verdicts.test.ts`), and `npx tsc --noEmit` was clean (exit 0). No
  source or test files were modified in this closeout. (2) Task 3 CHANGED the My-home UI (it now has
  a real empty state and a results state), so with the Next dev server serving http://localhost:3000
  I used the Playwright MCP to capture responsive full-page screenshots of BOTH states at 1280px
  (desktop) and 390px (mobile). EMPTY STATE (fresh load): verified the hero headline "Should your
  Boston home switch to a heat pump?", the subhead, and the UploadCard with the three large demo
  buttons ("Oil home", "Gas home", "Baseboard apartment"), with NO Verdict/Cost/Your-numbers result
  cards shown. RESULTS STATE (clicked "Oil home"): verified the VerdictCard renders full-width at the
  top with the label "Switch now" at large size, the "Based on your bill" + "Act before Dec 31"
  badges, and the big "$2,630 saved per year" figure below it; beneath it the Cost chart card (current
  $4,920 vs heat pump $2,290, breakeven COP 1.16) and the Your-numbers card with the monospace evidence
  chips ("Delivered: 800 gal", "Price/gal: $6.15") and the "Looks like oil heat." chip. Also exercised
  the amber confirmation flow with the "Gas home" demo: the verdict honestly reads "Not worth it yet"
  (+$403 more per year) with an "Estimate" label, the "Estimate: 1 value needs a quick check" banner
  sits above the Your-numbers card, and exactly ONE field (Annual heating use, 652 therms) shows the
  amber [Looks right] [Edit] confirm controls while the high-confidence fuel price does not. Responsive
  difference confirmed: at 1280px the results view places the VerdictCard full-width on top and the
  Cost chart + Your-numbers cards in a two-column grid below; at 390px everything collapses into a
  single stacked column. Closed the browser and removed the transient `.playwright-mcp/` directory.
  Left the pre-existing dev server (which was already running before this closeout) untouched.
  This closeout summarizes Task 3 across 3.1–3.5: 3.1 built the shared `SourceLink` and `ConfirmField`
  primitives (grey source links/tooltips under numbers; immediate best-guess value with amber outline,
  evidence text, and edit-in-place); 3.2 built the `UploadCard` with the three Try-demo buttons and the
  cached `ExtractionResult` fixtures routed through `ExtractionResultSchema` (the Gas demo carries exactly
  one below-threshold field); 3.3 built the `VerdictCard` (label at `text-4xl`, emerald savings / amber
  extra-cost big number never red, Act-before-Dec-31 badge, Estimate vs Based-on-your-bill) and the
  `CostChartCard` (Recharts two-bar current-vs-heat-pump + breakeven COP readout); 3.4 built the
  `YourNumbersCard` (a ConfirmField per value with evidence beneath, the heating-type chip, and the
  "Estimate: N values need a quick check" banner that scrolls to the first amber field); 3.5 wired the
  demo flow into `app/page.tsx` (maps a cached ExtractionResult to HomeInputs, marks low-confidence
  fields amber, calls computeComparison/computeRebates/decideVerdict, recomputes live on every
  confirm/edit, and flips the label to "Based on your bill" once nothing is amber) along with the
  three-distinct-verdicts demo unit test. Kept DEFAULT shadcn styling (no visual redesign). Did not
  read/print/edit `.env.local`; did not add `.kiro` to `.gitignore`.
- Screenshots:
  - docs/kiro/screens/task-3-empty-desktop.png (1280px) — empty state: hero + UploadCard with 3 demo buttons, no result cards
  - docs/kiro/screens/task-3-empty-mobile.png (390px) — empty state, single stacked column
  - docs/kiro/screens/task-3-results-desktop.png (1280px) — Oil-home results: full-width Verdict "Switch now" + $2,630/yr, Cost chart + Your numbers in a two-column grid below
  - docs/kiro/screens/task-3-results-mobile.png (390px) — Oil-home results, single stacked column
  - docs/kiro/screens/task-3-amber-desktop.png (1280px, optional) — Gas-home amber flow: "Not worth it yet" / "Estimate", the "1 value needs a quick check" banner, one amber confirm field
  - docs/kiro/screens/task-3-desktop.png (1280px) — alias copy of task-3-results-desktop.png (standard task-3 name)
  - docs/kiro/screens/task-3-mobile.png (390px) — alias copy of task-3-results-mobile.png (standard task-3 name)
- Why it mattered: the app is now demo-usable end to end — a visitor can click a demo home and get the
  honest verdict hero, the current-vs-heat-pump cost picture, and the inline amber confirmation flow —
  all before any AI is wired in, with every number coming from the pure calculation engine.
