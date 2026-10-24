import {
  ExtractionResultSchema,
  type ExtractionResult,
  type HomeInputs,
  type Assumptions,
  CONFIDENCE_THRESHOLD,
} from "@/lib/schema"
import {
  SYSTEM_EFFICIENCY,
  SEASONAL_HEAT_PUMP_RATE_DISCOUNT,
} from "@/lib/constants"

/**
 * Cached demo homes for the "Try a demo home" buttons (Requirements 1.7, 1.11).
 *
 * Each demo carries:
 *  - `extraction`: an `ExtractionResult`-shaped object (value + confidence +
 *    exact evidence per field) that passes `ExtractionResultSchema.safeParse`,
 *    so clicking a demo routes through the SAME Zod validation + confirmation
 *    path as a real uploaded bill (Requirement 1.12). No Extraction_Service call.
 *  - `inputs`: the preset `HomeInputs` fields the page merges in (zip, utility,
 *    household size, optional income, rent flag). The numeric heating fields
 *    (`heatingType`/`annualFuelUse`/`fuelUnitPrice`) come from `extraction`.
 *  - `assumptions`: the `Assumptions` overrides needed to reach each demo's
 *    intended verdict (e.g. the Oil demo turns the seasonal heat pump rate on).
 *
 * These exact values were validated against the real calculation engine so the
 * three demos produce three DIFFERENT verdicts. DO NOT change them:
 *  - Oil  → "Switch now" (+ "Act before Dec 31"), Enhanced tier, seasonal rate ON
 *  - Gas  → "Not worth it yet", exactly ONE amber (low-confidence) field
 *  - Baseboard → "Switch when your system needs replacing"
 */

export type DemoHome = "oil" | "gas" | "baseboard"

export interface DemoHomeFixture {
  /** Cached bill extraction, validated by `ExtractionResultSchema`. */
  extraction: ExtractionResult
  /** Preset normalized inputs the page merges into `HomeInputs`. */
  inputs: Partial<HomeInputs>
  /** Assumption overrides needed to reach the intended verdict. */
  assumptions: Partial<Assumptions>
}

/**
 * Shared Assumptions defaults used by every demo. These mirror the engine's
 * defaults so each demo's result is reproducible from the fixture alone.
 * `seasonalRateDiscountPerKWh` defaults to the Eversource flat $/kWh discount
 * because all three demo homes are on Eversource.
 */
const SHARED_ASSUMPTIONS: Partial<Assumptions> = {
  heatPumpCOP: 2.5,
  electricityPrice: 0.288,
  heatPumpTons: 3,
  installCostGross: 18000,
  seasonalRateDiscountPerKWh: SEASONAL_HEAT_PUMP_RATE_DISCOUNT.eversource, // 0.073 $/kWh
  systemEfficiency: SYSTEM_EFFICIENCY,
}

export const DEMO_HOMES: Record<DemoHome, DemoHomeFixture> = {
  // Oil home → "Switch now" + "Act before Dec 31".
  // 800 gal × $6.15, Enhanced tier (income 95k, household 3), seasonal rate ON.
  // delta ≈ +$2,630, Enhanced rebate $16,000, payback ≈ 0.76 yr.
  oil: {
    extraction: {
      heatingType: {
        value: "oil",
        confidence: 0.97,
        evidence: "Fuel type #2 heating oil",
      },
      annualFuelUse: {
        value: 800,
        confidence: 0.95,
        evidence: "Delivered 800 gal",
      },
      fuelUnitPrice: {
        value: 6.15,
        confidence: 0.93,
        evidence: "Price / gal $6.15",
      },
    },
    inputs: {
      householdSize: 3,
      annualIncome: 95000, // → Enhanced tier
      utility: "eversource",
      zip: "02118", // Boston zip
      heatIncludedInRent: false,
    },
    assumptions: {
      ...SHARED_ASSUMPTIONS,
      seasonalHeatPumpRate: true,
    },
  },

  // Gas home → "Not worth it yet", EXACTLY ONE amber field (annualFuelUse < 0.8).
  // 652 therms × $2.42, Standard tier (no income), seasonal rate off.
  // delta ≈ −$403.
  gas: {
    extraction: {
      heatingType: {
        value: "gas",
        confidence: 0.96,
        evidence: "Service type Residential Gas",
      },
      annualFuelUse: {
        value: 652,
        confidence: 0.72, // BELOW CONFIDENCE_THRESHOLD (0.8) — the single amber field
        evidence: "Total therms used (12-month) 652 therms",
      },
      fuelUnitPrice: {
        value: 2.42,
        confidence: 0.91,
        evidence: "Average price per therm $2.42 / therm",
      },
    },
    inputs: {
      householdSize: 3,
      // No annualIncome → Standard tier.
      utility: "eversource",
      zip: "02118",
      heatIncludedInRent: false,
    },
    assumptions: {
      ...SHARED_ASSUMPTIONS,
      seasonalHeatPumpRate: false,
    },
  },

  // Baseboard apartment → "Switch when your system needs replacing".
  // 7,600 kWh annual heating × $0.288, Standard tier, seasonal rate off.
  // delta ≈ +$1,313, payback ≈ 7.65 yr.
  baseboard: {
    extraction: {
      heatingType: {
        value: "electric-resistance",
        confidence: 0.9,
        evidence: "Heating Electric baseboard heat",
      },
      annualFuelUse: {
        value: 7600,
        confidence: 0.88,
        evidence: "Winter heating usage (kWh) 7,600 kWh",
      },
      fuelUnitPrice: {
        value: 0.288,
        confidence: 0.9,
        evidence: "Price per kWh $0.288 / kWh",
      },
    },
    inputs: {
      householdSize: 3,
      // No annualIncome → Standard tier.
      utility: "eversource",
      zip: "02118",
      heatIncludedInRent: false,
    },
    assumptions: {
      ...SHARED_ASSUMPTIONS,
      seasonalHeatPumpRate: false,
    },
  },
}

/**
 * Human-readable labels for the three demo buttons, in display order.
 */
export const DEMO_HOME_LABELS: Record<DemoHome, string> = {
  oil: "Oil home",
  gas: "Gas home",
  baseboard: "Baseboard apartment",
}

/**
 * Returns the validated `ExtractionResult` for a demo home, routing the cached
 * fixture through the SAME Zod validation path a real uploaded bill uses
 * (Requirement 1.12). Throws if a fixture is malformed — the fixtures are
 * authored to always pass, so a throw here is a programming error, not a
 * runtime/user path.
 */
export function getDemoExtraction(demo: DemoHome): ExtractionResult {
  const parsed = ExtractionResultSchema.safeParse(DEMO_HOMES[demo].extraction)
  if (!parsed.success) {
    throw new Error(
      `Demo "${demo}" fixture failed ExtractionResultSchema: ${parsed.error.message}`
    )
  }
  return parsed.data
}

/**
 * Count of fields whose confidence is strictly below CONFIDENCE_THRESHOLD.
 * Exposed so a test (and the page's confirmation path) can assert the Gas demo
 * carries exactly one amber field (Requirement 1.11).
 */
export function countLowConfidenceFields(extraction: ExtractionResult): number {
  const fields = [
    extraction.heatingType,
    extraction.annualFuelUse,
    extraction.fuelUnitPrice,
  ]
  return fields.filter(
    (f) => f !== undefined && f.confidence < CONFIDENCE_THRESHOLD
  ).length
}

// ---------------------------------------------------------------------------
// Shared demo-scenario builder (single source of truth)
// ---------------------------------------------------------------------------

/**
 * Full `Assumptions` defaults the demos build on. These mirror the shared
 * persona assumptions used across the calc/rebate tests (COP 2.5, electricity
 * $0.288/kWh, 3 tons, $18,000 install) with the seasonal rate OFF by default;
 * each demo overrides only what it needs (e.g. the Oil demo turns the rate on).
 */
const DEMO_ASSUMPTION_DEFAULTS: Assumptions = {
  heatPumpCOP: 2.5,
  electricityPrice: 0.288,
  seasonalHeatPumpRate: false,
  seasonalRateDiscountPerKWh: SEASONAL_HEAT_PUMP_RATE_DISCOUNT.eversource, // 0.073 $/kWh
  systemEfficiency: SYSTEM_EFFICIENCY,
  heatPumpTons: 3,
  installCostGross: 18000,
}

/**
 * Build the normalized calculation scenario for a demo home from its cached
 * fixture — the SINGLE source of truth used by both `app/page.tsx` and the
 * demo-verdict test, so the page and the test can never drift apart.
 *
 * The mapping, matching the page's wiring exactly:
 *  - `HomeInputs` = the demo's preset `inputs` (householdSize, annualIncome,
 *    utility, zip, heatIncludedInRent) merged with the heating fields read from
 *    the VALIDATED extraction (`getDemoExtraction`): `heatingType`,
 *    `annualFuelUse`, `fuelUnitPrice`. Routing through `getDemoExtraction`
 *    keeps the demo on the same Zod path a real bill uses (Requirement 1.11).
 *  - `Assumptions` = the full engine defaults with the demo's `assumptions`
 *    overrides layered on top.
 *
 * The returned `HomeInputs` always satisfies the engine preconditions
 * (`annualFuelUse > 0`, `fuelUnitPrice > 0`) because the fixtures are authored
 * with positive values.
 */
export function buildDemoScenario(demo: DemoHome): {
  inputs: HomeInputs
  assumptions: Assumptions
} {
  const fixture = DEMO_HOMES[demo]
  const extraction = getDemoExtraction(demo)

  const inputs: HomeInputs = {
    // Heating fields come from the validated extraction.
    heatingType: extraction.heatingType.value,
    annualFuelUse: extraction.annualFuelUse?.value ?? 0,
    fuelUnitPrice: extraction.fuelUnitPrice?.value ?? 0,
    // The remaining normalized inputs come from the demo's presets.
    zip: fixture.inputs.zip ?? "",
    utility: fixture.inputs.utility ?? "eversource",
    heatIncludedInRent: fixture.inputs.heatIncludedInRent ?? false,
    householdSize: fixture.inputs.householdSize ?? 1,
    ...(fixture.inputs.annualIncome !== undefined
      ? { annualIncome: fixture.inputs.annualIncome }
      : {}),
  }

  const assumptions: Assumptions = {
    ...DEMO_ASSUMPTION_DEFAULTS,
    ...fixture.assumptions,
  }

  return { inputs, assumptions }
}
