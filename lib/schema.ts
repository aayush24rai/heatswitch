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
