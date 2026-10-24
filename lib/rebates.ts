/**
 * Pure Mass Save rebate + payback math for HeatSwitch.
 *
 * This module performs NO I/O and makes NO network calls. Every number produced
 * here comes from source-cited constants in lib/constants.ts and the pure cost
 * functions in lib/calc.ts. The LLM never computes any of these numbers.
 *
 * Tier-selection banding (Requirement 5.2, corrected): in INCOME_LIMITS,
 * `incomeEligibleMax` is the LOWER bound and `enhancedMax` is the HIGHER bound.
 *   income <= incomeEligibleMax            -> "income-eligible"
 *   incomeEligibleMax < income <= enhancedMax -> "enhanced"
 *   income > enhancedMax                   -> "standard"
 * (The earlier design prose/pseudocode had these inverted; the requirement and
 *  lib/constants.ts are authoritative, so this module follows them.)
 */

import type { HomeInputs, Assumptions, RebateTier } from "@/lib/schema";
import { computeComparison } from "@/lib/calc";
import {
  INCOME_LIMITS,
  MASS_SAVE_PER_TON,
  MASS_SAVE_TOTAL_CAP,
  ENHANCED_CAP,
  REBATE_REQUIREMENTS,
} from "@/lib/constants";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/**
 * The outcome of rebate tier selection.
 *
 * `tier` is always one of the three RebateTier values. The two optional flags
 * surface conditions the UI must communicate (Requirement 5.3) without changing
 * the rebate math:
 * - `invalidHouseholdSize`: household size was absent or not an integer >= 1;
 *   the tier falls back to "standard".
 * - `checkIncomeLimits`: household size is 6..8 (inclusive); the size-5 income
 *   limits were reused and the UI should show a "check masssave.com/income" note.
 */
export interface RebateTierResult {
  tier: RebateTier;
  invalidHouseholdSize?: boolean;
  checkIncomeLimits?: boolean;
}

/**
 * The computed Mass Save rebate, net cost, and payback.
 *
 * (Defined here rather than in lib/schema.ts: it is a computed-result shape, not
 * an input/validation schema.) The optional `invalidHouseholdSize` and
 * `checkIncomeLimits` flags are propagated from tier selection so the UI can
 * surface them; they never affect `rebateAmount`.
 */
export interface RebateResult {
  tier: RebateTier;
  /** Mass Save whole-home rebate (tiered). `0 <= rebateAmount <= installCostGross`. */
  rebateAmount: number;
  /** `installCostGross - rebateAmount`, always `>= 0`. */
  netInstallCost: number;
  /** `null` when annual savings <= 0 (never pays back); otherwise `>= 0`. */
  paybackYears: number | null;
  /** Eligibility checklist items (REBATE_REQUIREMENTS). */
  requirements: string[];
  invalidHouseholdSize?: boolean;
  checkIncomeLimits?: boolean;
}

// ---------------------------------------------------------------------------
// Tier selection
// ---------------------------------------------------------------------------

/**
 * Select the Mass Save whole-home rebate tier from household size and income.
 *
 * Requirement 5.1: income absent/undefined => "standard".
 * Requirement 5.3: household size absent or not an integer >= 1 => "standard"
 *   with `invalidHouseholdSize` flagged; household size 6..8 reuses the size-5
 *   limits and sets `checkIncomeLimits`.
 * Requirement 5.2 (corrected banding): income <= incomeEligibleMax =>
 *   "income-eligible"; else income <= enhancedMax => "enhanced"; else "standard".
 *
 * Preconditions: `annualIncome`, when present, is `>= 0`.
 * Postconditions: returns exactly one tier plus the optional flags above.
 */
export function selectRebateTier(
  householdSize: number,
  annualIncome?: number,
): RebateTierResult {
  const validHousehold =
    typeof householdSize === "number" &&
    Number.isInteger(householdSize) &&
    householdSize >= 1;

  if (!validHousehold) {
    // Requirement 5.3: invalid household size -> Standard tier, flag it.
    return { tier: "standard", invalidHouseholdSize: true };
  }

  // Requirement 5.1: no income given -> Standard tier (no banding applied).
  if (annualIncome === undefined || annualIncome === null) {
    return { tier: "standard" };
  }

  // Household sizes 6..8 reuse the size-5 limits and flag "check income limits".
  const checkIncomeLimits = householdSize >= 6 && householdSize <= 8;
  const limitKey = checkIncomeLimits ? 5 : householdSize;
  const limits = INCOME_LIMITS[limitKey];

  // Sizes above 8 (or any size without a defined limit row) fall back to
  // Standard; there is no published band to apply.
  if (!limits) {
    return { tier: "standard" };
  }

  let tier: RebateTier;
  if (annualIncome <= limits.incomeEligibleMax) {
    tier = "income-eligible";
  } else if (annualIncome <= limits.enhancedMax) {
    tier = "enhanced";
  } else {
    tier = "standard";
  }

  return checkIncomeLimits ? { tier, checkIncomeLimits: true } : { tier };
}

// ---------------------------------------------------------------------------
// Rebate amount + payback
// ---------------------------------------------------------------------------

/**
 * Compute the Mass Save rebate, net install cost, and payback.
 *
 * Uncapped rebate by tier (Requirement 5.4, corrected):
 *   Standard       = min(MASS_SAVE_PER_TON * heatPumpTons, MASS_SAVE_TOTAL_CAP)
 *   Enhanced       = min(installCostGross, ENHANCED_CAP)
 *   Income Eligible= installCostGross (full cost; Requirement 5.5)
 *
 * Then (Requirements 5.6, 5.7, 5.8):
 *   rebateAmount  = clamp(uncapped, 0, installCostGross)
 *   netInstallCost= installCostGross - rebateAmount  (>= 0)
 *   paybackYears  = null when annual savings <= 0, else netInstallCost / savings
 *
 * The rebate amount NEVER depends on equity-zip status (Requirements 5.9, 10.4):
 * `isEquityZip` is not consulted here.
 *
 * Preconditions: `a.installCostGross >= 0`, `a.heatPumpTons > 0`.
 */
export function computeRebates(inputs: HomeInputs, a: Assumptions): RebateResult {
  const tierResult = selectRebateTier(inputs.householdSize, inputs.annualIncome);
  const { tier, invalidHouseholdSize, checkIncomeLimits } = tierResult;

  const installCostGross = Math.max(0, a.installCostGross);

  let uncapped: number;
  if (tier === "income-eligible") {
    // Requirement 5.5: Income Eligible can cover the full install cost.
    uncapped = installCostGross;
  } else if (tier === "enhanced") {
    // Requirement 5.4 (corrected): Enhanced = min(installCostGross, ENHANCED_CAP).
    uncapped = Math.min(installCostGross, ENHANCED_CAP);
  } else {
    // Standard: per-ton whole-home amount, capped at the total cap.
    uncapped = Math.min(MASS_SAVE_PER_TON * a.heatPumpTons, MASS_SAVE_TOTAL_CAP);
  }

  // Requirement 5.6: 0 <= rebateAmount <= installCostGross.
  const rebateAmount = Math.min(Math.max(uncapped, 0), installCostGross);
  // Requirement 5.7: netInstallCost >= 0.
  const netInstallCost = installCostGross - rebateAmount;

  // Annual savings come from the pure cost comparison (lib/calc.ts). The LLM
  // computes none of this.
  const comparison = computeComparison(inputs, a);
  const annualSavings = comparison.annualDeltaDollars;

  // Requirement 5.8: payback null when savings <= 0, else >= 0.
  const paybackYears =
    annualSavings <= 0 ? null : netInstallCost / annualSavings;

  const result: RebateResult = {
    tier,
    rebateAmount,
    netInstallCost,
    paybackYears,
    requirements: REBATE_REQUIREMENTS,
  };
  if (invalidHouseholdSize) result.invalidHouseholdSize = true;
  if (checkIncomeLimits) result.checkIncomeLimits = true;
  return result;
}

// ---------------------------------------------------------------------------
// Zip helpers (informational only — never change the rebate)
// ---------------------------------------------------------------------------

/**
 * Boston zip codes served by the Boston Energy Saver program.
 * Boston proper uses 5-digit zips in the 021xx–022xx range.
 * Source: https://www.usps.com/ (ZIP Code lookup, City of Boston)
 * Source: https://www.boston.gov/departments/environment
 */
const BOSTON_ZIPS: ReadonlySet<string> = new Set([
  "02108", "02109", "02110", "02111", "02113", "02114", "02115", "02116",
  "02118", "02119", "02120", "02121", "02122", "02124", "02125", "02126",
  "02127", "02128", "02129", "02130", "02131", "02132", "02133", "02134",
  "02135", "02136", "02151", "02152", "02163", "02199", "02210", "02215",
  "02467",
]);

/**
 * Equity-focus zips flagged for an INFORMATIONAL enhanced-incentive notice only.
 * These are environmental-justice / equity neighborhoods in Boston.
 * This status NEVER changes any rebate amount (Requirements 5.9, 10.4);
 * `computeRebates` does not call this function.
 * Source: https://www.mass.gov/info-details/environmental-justice-populations-in-massachusetts
 */
const EQUITY_ZIPS: ReadonlySet<string> = new Set([
  "02134", // Allston
  "02135", // Brighton
  "02121", // Dorchester (Grove Hall)
  "02122", // Dorchester (Fields Corner)
  "02124", // Dorchester
  "02125", // Dorchester (Uphams Corner)
  "02119", // Roxbury
  "02120", // Mission Hill
  "02128", // East Boston
]);

const ZIP_PATTERN = /^\d{5}$/;

/**
 * True when `zip` is a known Boston_Zip served by Boston Energy Saver.
 * Non-5-digit input returns false.
 */
export function isBostonZip(zip: string): boolean {
  if (!ZIP_PATTERN.test(zip)) return false;
  return BOSTON_ZIPS.has(zip);
}

/**
 * True when `zip` is an Equity_Zip. INFORMATIONAL ONLY: this must never be used
 * to change a rebate amount (Requirements 5.9, 10.4). Non-5-digit input returns
 * false.
 */
export function isEquityZip(zip: string): boolean {
  if (!ZIP_PATTERN.test(zip)) return false;
  return EQUITY_ZIPS.has(zip);
}
