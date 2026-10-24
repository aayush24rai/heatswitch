/**
 * Source-cited constants for HeatSwitch.
 *
 * Every constant in this file carries an adjacent, resolvable source-URL comment
 * (per tech rules and Requirement 11.6). All math that consumes these constants
 * lives in lib/calc.ts and lib/rebates.ts as pure functions; the LLM never
 * computes a number.
 *
 * HeatingType and Utility are defined in lib/schema.ts (per the finalized design),
 * imported type-only so this module contributes no runtime dependency.
 */

import type { HeatingType, Utility } from "@/lib/schema";

// Fuel energy content (kWh-equivalent per native unit).
// Source: https://www.eia.gov/energyexplained/units-and-calculators/
export const THERM_KWH = 29.3; // 1 therm ≈ 29.3 kWh
// Source: https://www.eia.gov/energyexplained/units-and-calculators/
export const OIL_GALLON_KWH = 40.6; // 1 gallon No.2 fuel oil ≈ 40.6 kWh
// Source: https://www.eia.gov/energyexplained/units-and-calculators/
export const PROPANE_GALLON_KWH = 27.0; // 1 gallon propane ≈ 27 kWh

// Per-heating-type system efficiency (typical AFUE / efficiency factor).
// Source: https://www.energy.gov/energysaver/furnaces-and-boilers
export const SYSTEM_EFFICIENCY: Record<HeatingType, number> = {
  gas: 0.9,
  oil: 0.82,
  "electric-resistance": 1.0,
  propane: 0.85,
};

// Seasonal heat pump electric rate: FLAT $/kWh discount by utility (NOT a fraction).
// Source: https://www.mass.gov/info-details/residential-electric-seasonal-heat-pump-rates
export const SEASONAL_HEAT_PUMP_RATE_DISCOUNT: Record<Utility, number> = {
  eversource: 0.073, // $/kWh
  "national-grid": 0.042, // $/kWh
  unitil: 0.065, // $/kWh
};

// Mass Save whole-home heat pump rebate (tiered).
// Source: https://www.masssave.com/
export const MASS_SAVE_PER_TON = 2650; // $ per ton (Standard tier)
// Source: https://www.masssave.com/
export const MASS_SAVE_TOTAL_CAP = 8500; // $ cap on the Standard per-ton amount

// Enhanced tier rebate cap: Enhanced = min(installCostGross, 16000).
// Source: https://www.masssave.com/
export const ENHANCED_CAP = 16000; // $ cap on the Enhanced-tier rebate

// Mass Save income limits by household size (select the rebate tier).
// Reading (Requirement 5.2): annualIncome at/below incomeEligibleMax => Income
// Eligible tier; within the (incomeEligibleMax, enhancedMax] band => Enhanced tier;
// above enhancedMax => Standard tier.
// Household sizes 6–8 reuse the size-5 limits and set a "check masssave.com/income"
// flag; that flag logic lives in lib/rebates.ts — this table holds sizes 1–5 only.
// Source: https://www.masssave.com/income
export const INCOME_LIMITS: Record<
  number,
  { incomeEligibleMax: number; enhancedMax: number }
> = {
  1: { incomeEligibleMax: 51777, enhancedMax: 69036 },
  2: { incomeEligibleMax: 67709, enhancedMax: 90279 },
  3: { incomeEligibleMax: 83641, enhancedMax: 111522 },
  4: { incomeEligibleMax: 99573, enhancedMax: 132764 },
  5: { incomeEligibleMax: 115504, enhancedMax: 154006 },
};

// Rebate eligibility checklist.
// Source: https://www.masssave.com/
export const REBATE_REQUIREMENTS: string[] = [
  "Mass Save home energy assessment completed",
  "Weatherization completed (or scheduled)",
  "Installed by a Mass Save network installer",
  "Equipment uses R-32 or R-454B refrigerant",
];

// 2026 rebates require install by Dec 31, 2026.
// Source: https://www.masssave.com/
export const REBATE_DEADLINE_2026 = new Date("2026-12-31T23:59:59");
// Source: https://www.masssave.com/
export const REBATE_DEADLINE_NOTE =
  "2026 rebates require install by Dec 31, 2026.";

// Summer (non-heating) months used to estimate baseload in annualHeatingUse: Jun–Sep.
// 0-based month indexes. Source: https://www.eia.gov/energyexplained/units-and-calculators/
export const SUMMER_MONTH_INDEXES = [5, 6, 7, 8]; // 0-based Jun,Jul,Aug,Sep
