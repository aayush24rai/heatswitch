import { describe, it, expect } from "vitest"

import {
  buildDemoScenario,
  countLowConfidenceFields,
  getDemoExtraction,
  type DemoHome,
} from "@/components/my-home/demo-homes"
import { computeComparison, decideVerdict } from "@/lib/calc"
import { computeRebates } from "@/lib/rebates"
import type { VerdictLabel } from "@/lib/schema"

/**
 * Demo-verdict test (task 3.5).
 *
 * Runs the three "Try a demo home" presets through the SAME pure engine path
 * the page uses — `buildDemoScenario` (the shared inputs/assumptions merge) →
 * `computeComparison` → `computeRebates` → `decideVerdict` — and asserts the
 * three demos land on three DIFFERENT verdicts, so the full range of outcomes
 * is demonstrable (design: demos are designed to differ). This is the page's
 * live-recompute pipeline minus the React layer.
 *
 * A fixed "now" before the Dec 31 2026 rebate deadline is used so the Oil
 * demo's "Act before Dec 31" flag is deterministic.
 */

const NOW = new Date("2026-06-01")

/** Run the page's calc pipeline for a demo and return the resulting verdict. */
function verdictFor(demo: DemoHome) {
  const { inputs, assumptions } = buildDemoScenario(demo)
  const cmp = computeComparison(inputs, assumptions)
  const reb = computeRebates(inputs, assumptions)
  return decideVerdict(cmp, reb, inputs, NOW)
}

describe("demo home verdicts", () => {
  it("Oil → Switch now, acting before Dec 31", () => {
    const verdict = verdictFor("oil")
    expect(verdict.label).toBe<VerdictLabel>("Switch now")
    expect(verdict.actBeforeDec31).toBe(true)
  })

  it("Baseboard → Switch when your system needs replacing", () => {
    const verdict = verdictFor("baseboard")
    expect(verdict.label).toBe<VerdictLabel>(
      "Switch when your system needs replacing"
    )
  })

  it("Gas → Not worth it yet", () => {
    const verdict = verdictFor("gas")
    expect(verdict.label).toBe<VerdictLabel>("Not worth it yet")
  })

  it("the three demos produce three distinct verdict labels", () => {
    const labels = (["oil", "gas", "baseboard"] as DemoHome[]).map(
      (d) => verdictFor(d).label
    )
    expect(new Set(labels).size).toBe(3)
  })

  it("the Gas demo carries exactly one low-confidence (amber) field", () => {
    expect(countLowConfidenceFields(getDemoExtraction("gas"))).toBe(1)
  })
})
