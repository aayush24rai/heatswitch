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
