import { z } from "zod";

/**
 * Shared types and Zod schemas for HeatSwitch.
 *
 * This module is the single source of truth for the normalized input types
 * (`HomeInputs`, `Assumptions`), the enumerations shared across the app
 * (`HeatingType`, `Utility`, `Language`, `RebateTier`, `VerdictLabel`), and the
 * Zod schemas that validate bill-extraction output before any of it is trusted.
 *
 * `lib/constants.ts` imports `HeatingType` and `Utility` from here.
 */

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export type HeatingType = "gas" | "oil" | "electric-resistance" | "propane";

export type Language =
  | "en" // English
  | "es" // Spanish
  | "cv" // Cape Verdean Creole
  | "zh" // Chinese
  | "ht" // Haitian Creole
  | "vi"; // Vietnamese

export type Utility = "eversource" | "national-grid" | "unitil";

export type RebateTier = "standard" | "enhanced" | "income-eligible";

export type VerdictLabel =
  | "Switch now"
  | "Switch when your system needs replacing"
  | "Not worth it yet";

// ---------------------------------------------------------------------------
// Normalized inputs
// ---------------------------------------------------------------------------

/**
 * The normalized inputs that drive all calculations, regardless of source
 * (uploaded bill, oil form, or demo home).
 *
 * Validation rules (enforced by callers / the UI):
 * - `annualFuelUse > 0`, `fuelUnitPrice > 0`.
 * - `zip` matches `/^\d{5}$/`.
 * - `heatingType` is one of the `HeatingType` values; `utility` one of `Utility`.
 * - `householdSize >= 1` (integer); `annualIncome`, when present, is `>= 0`.
 */
export interface HomeInputs {
  heatingType: HeatingType;
  /** Annual heating energy use expressed in the fuel's native unit:
   *  therms (gas), gallons (oil/propane), or kWh (electric). */
  annualFuelUse: number;
  /** $/therm, $/gallon, or $/kWh. */
  fuelUnitPrice: number;
  zip: string;
  /** Drives the seasonal heat pump rate discount ($/kWh). */
  utility: Utility;
  heatIncludedInRent: boolean;
  /** Used to pick the Mass Save rebate tier. */
  householdSize: number;
  /** Optional; when absent, default to the Standard tier. */
  annualIncome?: number;
}

/**
 * User-adjustable knobs with defaults from `lib/constants.ts`.
 *
 * Validation rules:
 * - `heatPumpCOP >= 1`, `electricityPrice > 0`.
 * - `seasonalRateDiscountPerKWh >= 0`; the effective price is floored at `> 0`.
 * - every `systemEfficiency[type] > 0`.
 * - `heatPumpTons > 0` (default `3`).
 */
export interface Assumptions {
  /** Seasonal coefficient of performance, default from constants. */
  heatPumpCOP: number;
  /** $/kWh. */
  electricityPrice: number;
  /** MA seasonal heat pump electric rate on/off. */
  seasonalHeatPumpRate: boolean;
  /** Flat $/kWh discount subtracted from the electricity price when the rate is
   *  on. Default comes from the home's utility (SEASONAL_HEAT_PUMP_RATE_DISCOUNT). */
  seasonalRateDiscountPerKWh: number;
  /** Per-heating-type system efficiency (AFUE / efficiency factor), applied in
   *  fuelEnergyContentKWh. Defaults from SYSTEM_EFFICIENCY. */
  systemEfficiency: Record<HeatingType, number>;
  /** Installed heat pump capacity in tons, default 3. */
  heatPumpTons: number;
  /** $ before rebates. */
  installCostGross: number;
}

// ---------------------------------------------------------------------------
// Computed results
// ---------------------------------------------------------------------------

/**
 * The output of `computeComparison` in lib/calc.ts: current heating cost vs
 * heat-pump cost, their signed difference, and the breakeven COP.
 *
 * - `annualDeltaDollars === currentAnnualCost - heatPumpAnnualCost` (positive = savings).
 * - `breakevenCOP` is sign-consistent with `annualDeltaDollars`: when the
 *   assumed COP exceeds it, the heat pump is cheaper (delta > 0), and vice versa.
 */
export interface CostComparison {
  /** $/yr with the current heating system. */
  currentAnnualCost: number;
  /** $/yr with a heat pump (rate-aware). */
  heatPumpAnnualCost: number;
  /** currentAnnualCost - heatPumpAnnualCost (positive = savings). */
  annualDeltaDollars: number;
  /** COP at which heat pump annual cost equals current heating annual cost. */
  breakevenCOP: number;
}

/**
 * The output of `decideVerdict` in lib/calc.ts: the single headline answer.
 *
 * - `label` is exactly one `VerdictLabel` (Requirement 6.1).
 * - `actBeforeDec31` is the Mass Save 2026 rebate-deadline flag — true only when
 *   a rebate materially shortens payback and the deadline is still ahead
 *   (Requirements 5.12 / 5.13).
 * - `isRenter` drives the landlord path (Requirements 7.2 / 7.3), derived from
 *   `HomeInputs.heatIncludedInRent`.
 */
export interface Verdict {
  label: VerdictLabel;
  actBeforeDec31: boolean;
  isRenter: boolean;
}

// ---------------------------------------------------------------------------
// Buildings (BERDO 2021) data model
// ---------------------------------------------------------------------------

/**
 * A cleaned row from the City of Boston BERDO 2021 dataset, used by the
 * Buildings tab to rank multifamily buildings by heat pump opportunity.
 *
 * The cleaning step (Buildings_View, Requirement 8.3–8.5) drops rows missing
 * Site EUI, keeps only 5-digit "02" zips, and assigns `id` the zero-based
 * source row index as a string (the dataset has no stable id). `gasShare` is
 * `null` when the source has no gas fraction for the row — null means
 * *unknown*, NOT zero (Requirement 8.5).
 */
export interface BerdoBuilding {
  /** Zero-based source row index as a string (the dataset has no stable id). */
  id: string;
  zip: string;
  /** e.g. "Multifamily Housing". */
  propertyType: string;
  yearBuilt: number;
  grossFloorAreaSqFt: number;
  /** Energy use intensity (kBtu/ft²/year). */
  siteEUI: number;
  /** GHG emissions (metric tons CO2e). */
  ghgEmissions: number;
  /** 0..1 fraction of energy from electricity. */
  electricShare: number;
  /** 0..1 fraction from gas; `null` = unknown (NOT zero). */
  gasShare: number | null;
}

/** Plain-English heat pump opportunity label shown with each building. */
export type OpportunityLabel = "High" | "Medium" | "Low";

// ---------------------------------------------------------------------------
// Extraction output (Zod)
// ---------------------------------------------------------------------------

/** Every extracted field carries a value, a confidence, and the exact evidence
 *  text from the bill supporting this value. */
export const ExtractedFieldSchema = z.object({
  value: z.number(),
  confidence: z.number().min(0).max(1),
  evidence: z.string().min(1),
});
export type ExtractedField = z.infer<typeof ExtractedFieldSchema>;

export const HeatingTypeSchema = z.enum([
  "gas",
  "oil",
  "electric-resistance",
  "propane",
]);

export const ExtractionResultSchema = z
  .object({
    heatingType: z.object({
      value: HeatingTypeSchema,
      confidence: z.number().min(0).max(1),
      evidence: z.string().min(1),
    }),
    annualFuelUse: ExtractedFieldSchema,
    fuelUnitPrice: ExtractedFieldSchema,
    // A field absent => the extractor could not find it; the UI pre-fills the
    // manual form for that value.
  })
  .partial({ annualFuelUse: true, fuelUnitPrice: true });
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

/** A field whose confidence is below this is shown amber for confirmation. */
export const CONFIDENCE_THRESHOLD = 0.8;
