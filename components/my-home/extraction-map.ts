/**
 * Map a validated bill `ExtractionResult` (from `/api/extract`) to the
 * normalized `HomeInputs` + `Assumptions` the pure engine consumes, plus the
 * per-field `confirmed` map (task 6.2).
 *
 * This is the REAL-BILL counterpart to `buildDemoScenario` in demo-homes.ts: it
 * keeps the page's wiring in one place so the demo path and the upload path map
 * fields the same way. It computes NO heating number — it only copies extracted
 * values into inputs and decides, per field, whether it starts confirmed
 * (confidence ≥ CONFIDENCE_THRESHOLD) or amber (below it, or missing).
 *
 * Missing fields (the extractor omits a field it had no evidence for) are
 * pre-filled with a safe per-heating-type default and marked UNCONFIRMED so the
 * manual form surfaces them amber for a quick check — this is the
 * extraction-fallback the page uses when a field is absent or all fields are
 * low-confidence.
 */

import {
  SEASONAL_HEAT_PUMP_RATE_DISCOUNT,
  SYSTEM_EFFICIENCY,
} from "@/lib/constants"
import {
  CONFIDENCE_THRESHOLD,
  type Assumptions,
  type ExtractionResult,
  type HeatingType,
  type HomeInputs,
  type Utility,
} from "@/lib/schema"

export type ConfirmedMap = { annualFuelUse: boolean; fuelUnitPrice: boolean }

/**
 * The engine assumption defaults a real upload starts from — the SAME shared
 * persona assumptions the demos use (COP 2.5, electricity $0.288/kWh, 3 tons,
 * $18,000 install, seasonal rate OFF). Exported so the page can seed state.
 * `seasonalRateDiscountPerKWh` defaults to the chosen utility's flat discount.
 */
export function defaultAssumptions(utility: Utility): Assumptions {
  return {
    heatPumpCOP: 2.5,
    electricityPrice: 0.288,
    seasonalHeatPumpRate: false,
    seasonalRateDiscountPerKWh: SEASONAL_HEAT_PUMP_RATE_DISCOUNT[utility],
    systemEfficiency: SYSTEM_EFFICIENCY,
    heatPumpTons: 3,
    installCostGross: 18000,
  }
}

/**
 * A reasonable default fuel use / unit price per heating type, used ONLY to
 * pre-fill a field the extractor could not find. These are placeholders the
 * user confirms or edits — they are always marked unconfirmed (amber).
 */
const FALLBACK_BY_TYPE: Record<
  HeatingType,
  { annualFuelUse: number; fuelUnitPrice: number }
> = {
  gas: { annualFuelUse: 650, fuelUnitPrice: 2.4 },
  oil: { annualFuelUse: 800, fuelUnitPrice: 6.0 },
  propane: { annualFuelUse: 900, fuelUnitPrice: 4.0 },
  "electric-resistance": { annualFuelUse: 7000, fuelUnitPrice: 0.288 },
}

export interface MappedScenario {
  inputs: HomeInputs
  assumptions: Assumptions
  confirmed: ConfirmedMap
  /** True when NO extracted field cleared the confidence threshold — the page
   *  treats this like a failed extraction and surfaces the manual-form message. */
  allLowConfidence: boolean
}

/**
 * Build the calculation scenario + confirmed map from a validated extraction and
 * the current intake state (zip, utility, rent flag, household size).
 *
 * - `heatingType` comes from the (required) extracted field.
 * - `annualFuelUse` / `fuelUnitPrice`: use the extracted value when present,
 *   else the per-type fallback. A field starts CONFIRMED iff it was present AND
 *   its confidence ≥ CONFIDENCE_THRESHOLD; otherwise it starts amber.
 * - `allLowConfidence` is true when neither numeric field cleared the
 *   threshold (missing or low-confidence) — the signal the page uses to show
 *   the "extraction unsuccessful" message while keeping the pre-filled fields.
 */
export function mapExtractionToScenario(
  extraction: ExtractionResult,
  intake: {
    zip: string
    utility: Utility
    heatIncludedInRent: boolean
    householdSize: number
  },
): MappedScenario {
  const heatingType = extraction.heatingType.value
  const fallback = FALLBACK_BY_TYPE[heatingType]

  const fuelUse = extraction.annualFuelUse
  const price = extraction.fuelUnitPrice

  const annualFuelUse =
    fuelUse && fuelUse.value > 0 ? fuelUse.value : fallback.annualFuelUse
  const fuelUnitPrice =
    price && price.value > 0 ? price.value : fallback.fuelUnitPrice

  const fuelUseConfirmed =
    fuelUse !== undefined && fuelUse.confidence >= CONFIDENCE_THRESHOLD
  const priceConfirmed =
    price !== undefined && price.confidence >= CONFIDENCE_THRESHOLD

  const inputs: HomeInputs = {
    heatingType,
    annualFuelUse,
    fuelUnitPrice,
    zip: intake.zip,
    utility: intake.utility,
    heatIncludedInRent: intake.heatIncludedInRent,
    householdSize: intake.householdSize,
  }

  return {
    inputs,
    assumptions: defaultAssumptions(intake.utility),
    confirmed: {
      annualFuelUse: fuelUseConfirmed,
      fuelUnitPrice: priceConfirmed,
    },
    allLowConfidence: !fuelUseConfirmed && !priceConfirmed,
  }
}
