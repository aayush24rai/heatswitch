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
