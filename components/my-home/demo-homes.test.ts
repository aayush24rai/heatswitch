import { describe, it, expect } from "vitest"
import { ExtractionResultSchema, CONFIDENCE_THRESHOLD } from "@/lib/schema"
import {
  DEMO_HOMES,
  getDemoExtraction,
  countLowConfidenceFields,
  type DemoHome,
} from "@/components/my-home/demo-homes"

const ALL_DEMOS: DemoHome[] = ["oil", "gas", "baseboard"]

describe("demo-homes fixtures", () => {
  it("every demo extraction passes ExtractionResultSchema (Req 1.7, 1.12)", () => {
    for (const demo of ALL_DEMOS) {
      const parsed = ExtractionResultSchema.safeParse(DEMO_HOMES[demo].extraction)
      expect(parsed.success, `demo "${demo}" must parse`).toBe(true)
    }
  })

  it("getDemoExtraction returns the validated result for each demo", () => {
    for (const demo of ALL_DEMOS) {
      expect(() => getDemoExtraction(demo)).not.toThrow()
    }
  })

  it("the Gas demo carries exactly ONE field below the threshold (Req 1.11)", () => {
    expect(countLowConfidenceFields(DEMO_HOMES.gas.extraction)).toBe(1)
    // And it is specifically annualFuelUse that is amber.
    expect(DEMO_HOMES.gas.extraction.annualFuelUse?.confidence).toBeLessThan(
      CONFIDENCE_THRESHOLD
    )
    expect(
      DEMO_HOMES.gas.extraction.heatingType.confidence
    ).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD)
    expect(
      DEMO_HOMES.gas.extraction.fuelUnitPrice?.confidence
    ).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD)
  })

  it("the Oil and Baseboard demos have no amber fields", () => {
    expect(countLowConfidenceFields(DEMO_HOMES.oil.extraction)).toBe(0)
    expect(countLowConfidenceFields(DEMO_HOMES.baseboard.extraction)).toBe(0)
  })

  it("Oil demo presets Enhanced tier (income present) and seasonal rate ON", () => {
    expect(DEMO_HOMES.oil.inputs.annualIncome).toBe(95000)
    expect(DEMO_HOMES.oil.assumptions.seasonalHeatPumpRate).toBe(true)
  })

  it("Gas and Baseboard presets have no income (Standard tier) and seasonal rate off", () => {
    expect(DEMO_HOMES.gas.inputs.annualIncome).toBeUndefined()
    expect(DEMO_HOMES.baseboard.inputs.annualIncome).toBeUndefined()
    expect(DEMO_HOMES.gas.assumptions.seasonalHeatPumpRate).toBe(false)
    expect(DEMO_HOMES.baseboard.assumptions.seasonalHeatPumpRate).toBe(false)
  })
})
