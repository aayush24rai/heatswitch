/**
 * Persona acceptance-value tests for the pure calculation + rebate engine
 * (task 2.11).
 *
 * Unlike the property tests (calc.cost.test.ts, rebates.test.ts), these assert
 * the CONCRETE dollar/COP acceptance values the product spec commits to for its
 * three demo personas, exercising the REAL functions in lib/calc.ts and
 * lib/rebates.ts end to end. The numbers here are the acceptance spec: they are
 * never adjusted to match the code, and the ±2% relative tolerance is never
 * widened. If any persona diverges, that is a real discrepancy to report, not a
 * test to loosen.
 *
 * Shared assumptions for the cost personas (per task 2.11):
 *   heatPumpCOP = 2.5, electricityPrice = $0.288/kWh, heatPumpTons = 3,
 *   installCostGross = $18,000, standard tier, seasonalHeatPumpRate = false
 *   (except the gas rate-ON case: Eversource, discount $0.073/kWh so the
 *   effective price ≈ $0.215/kWh).
 *
 * System efficiencies are the project's source-cited SYSTEM_EFFICIENCY
 * (gas 0.90, oil 0.82, electric-resistance 1.0). Energy content comes from the
 * source-cited constants (THERM_KWH 29.3, OIL_GALLON_KWH 40.6, electric kWh 1).
 *
 * Validates: Requirements 4.1 (current cost), 4.9 (breakeven COP), 5.2 (tier
 * banding), 5.9 / 10.4 (equity status never changes the rebate amount).
 */

import { describe, expect, it } from "vitest";

import {
  breakevenCOP,
  computeComparison,
  currentHeatingCost,
  heatPumpCost,
} from "@/lib/calc";
import { computeRebates, isEquityZip, selectRebateTier } from "@/lib/rebates";
import {
  ENHANCED_CAP,
  INCOME_LIMITS,
  MASS_SAVE_PER_TON,
  MASS_SAVE_TOTAL_CAP,
  SEASONAL_HEAT_PUMP_RATE_DISCOUNT,
  SYSTEM_EFFICIENCY,
} from "@/lib/constants";
import type { Assumptions, HomeInputs } from "@/lib/schema";

// ---------------------------------------------------------------------------
// Shared assumptions (task 2.11)
// ---------------------------------------------------------------------------

const HEAT_PUMP_COP = 2.5;
const ELECTRICITY_PRICE = 0.288; // $/kWh
const HEAT_PUMP_TONS = 3;
const INSTALL_COST_GROSS = 18000;

/** The shared assumptions with the seasonal heat pump rate OFF. */
const baseAssumptions: Assumptions = {
  heatPumpCOP: HEAT_PUMP_COP,
  electricityPrice: ELECTRICITY_PRICE,
  seasonalHeatPumpRate: false,
  // Discount is only consulted when the seasonal rate is on; held at the
  // Eversource value so the rate-ON persona below can simply flip the flag.
  seasonalRateDiscountPerKWh: SEASONAL_HEAT_PUMP_RATE_DISCOUNT.eversource, // 0.073
  systemEfficiency: SYSTEM_EFFICIENCY,
  heatPumpTons: HEAT_PUMP_TONS,
  installCostGross: INSTALL_COST_GROSS,
};

/**
 * Assert `actual` is within ±`relTolerance` (relative) of `expected`, i.e.
 * |actual - expected| <= relTolerance * |expected|. Default 2% per task 2.11.
 * The message surfaces the actual value and the margin so a pass still shows
 * how much headroom it had.
 */
function expectWithinRelative(
  actual: number,
  expected: number,
  relTolerance = 0.02,
): void {
  const allowed = relTolerance * Math.abs(expected);
  const diff = Math.abs(actual - expected);
  const marginPct = ((actual - expected) / expected) * 100;
  expect(
    diff,
    `actual=${actual.toFixed(4)} expected=${expected} ` +
      `margin=${marginPct.toFixed(3)}% (tolerance ±${(relTolerance * 100).toFixed(0)}%)`,
  ).toBeLessThanOrEqual(allowed);
}

// ---------------------------------------------------------------------------
// Persona inputs
// ---------------------------------------------------------------------------

/** Oil persona: 800 gallons at $6.15/gal. */
const oilPersona: HomeInputs = {
  heatingType: "oil",
  annualFuelUse: 800,
  fuelUnitPrice: 6.15,
  zip: "02118",
  utility: "eversource",
  heatIncludedInRent: false,
  householdSize: 3,
};

/**
 * Electric-resistance persona: 7,600 kWh of annual heating. The acceptance
 * current cost ≈ $2,189 implies the current electricity price equals the
 * heat-pump electricity price ($0.288/kWh): 7,600 × 0.288 ≈ 2,188.8.
 */
const electricPersona: HomeInputs = {
  heatingType: "electric-resistance",
  annualFuelUse: 7600,
  fuelUnitPrice: ELECTRICITY_PRICE, // 0.288 $/kWh — same price as the heat pump draws
  zip: "02118",
  utility: "eversource",
  heatIncludedInRent: false,
  householdSize: 3,
};

/** Gas persona: 652 therms at $2.42/therm. */
const gasPersona: HomeInputs = {
  heatingType: "gas",
  annualFuelUse: 652,
  fuelUnitPrice: 2.42,
  zip: "02118",
  utility: "eversource",
  heatIncludedInRent: false,
  householdSize: 3,
};

// ---------------------------------------------------------------------------
// Persona acceptance values (Requirements 4.1, 4.9)
// ---------------------------------------------------------------------------

describe("persona acceptance values — calc (Req 4.1, 4.9)", () => {
  it("Oil persona: current $4,920 exact; heat pump cost ≈ $3,068", () => {
    const current = currentHeatingCost(oilPersona);
    // Current oil cost is exact: 800 × 6.15 = 4920.
    expect(current).toBe(4920);

    const hp = heatPumpCost(oilPersona, baseAssumptions);
    // delivered = 800 × 40.6 × 0.82 = 26,633.6 kWh;
    // hp = 26,633.6 / 2.5 × 0.288 = 3,068.19…
    expectWithinRelative(hp, 3068);

    // computeComparison must agree with the individual functions.
    const cmp = computeComparison(oilPersona, baseAssumptions);
    expect(cmp.currentAnnualCost).toBe(current);
    expect(cmp.heatPumpAnnualCost).toBe(hp);
  });

  it("Electric-resistance persona: current ≈ $2,189; heat pump cost ≈ $876", () => {
    const current = currentHeatingCost(electricPersona);
    // 7,600 × 0.288 = 2,188.8
    expectWithinRelative(current, 2189);

    const hp = heatPumpCost(electricPersona, baseAssumptions);
    // delivered = 7,600 × 1 × 1.0 = 7,600 kWh;
    // hp = 7,600 / 2.5 × 0.288 = 875.52
    expectWithinRelative(hp, 876);
  });

  it("Gas persona: current ≈ $1,578; heat pump cost ≈ $1,981; breakeven COP ≈ 3.14", () => {
    const current = currentHeatingCost(gasPersona);
    // 652 × 2.42 = 1,577.84
    expectWithinRelative(current, 1578);

    const hp = heatPumpCost(gasPersona, baseAssumptions);
    // delivered = 652 × 29.3 × 0.90 = 17,193.24 kWh;
    // hp = 17,193.24 / 2.5 × 0.288 = 1,980.66
    expectWithinRelative(hp, 1981);

    const be = breakevenCOP(gasPersona, baseAssumptions);
    // breakeven = 17,193.24 × 0.288 / 1,577.84 = 3.1382…
    expectWithinRelative(be, 3.14);
  });

  it("Gas persona with Eversource seasonal rate ON: heat pump cost ≈ $1,481", () => {
    const seasonalOn: Assumptions = {
      ...baseAssumptions,
      seasonalHeatPumpRate: true,
      // Eversource discount 0.073 => effective price 0.288 - 0.073 = 0.215.
      seasonalRateDiscountPerKWh: SEASONAL_HEAT_PUMP_RATE_DISCOUNT.eversource,
    };
    const hp = heatPumpCost(gasPersona, seasonalOn);
    // delivered = 17,193.24 kWh; hp = 17,193.24 / 2.5 × 0.215 = 1,478.62
    expectWithinRelative(hp, 1481);

    // Turning the seasonal rate on must not raise the cost vs rate OFF.
    const hpOff = heatPumpCost(gasPersona, baseAssumptions);
    expect(hp).toBeLessThanOrEqual(hpOff);
  });
});

// ---------------------------------------------------------------------------
// Tier-selection boundaries (corrected Requirement 5.2)
// ---------------------------------------------------------------------------

describe("tier-selection boundaries (Req 5.2)", () => {
  it("income at/below incomeEligibleMax → income-eligible; band → enhanced; above enhancedMax → standard", () => {
    for (const size of [1, 2, 3, 4, 5]) {
      const { incomeEligibleMax, enhancedMax } = INCOME_LIMITS[size];

      // At/below incomeEligibleMax => income-eligible.
      expect(selectRebateTier(size, incomeEligibleMax - 1).tier).toBe(
        "income-eligible",
      );
      expect(selectRebateTier(size, incomeEligibleMax).tier).toBe(
        "income-eligible",
      );

      // Within (incomeEligibleMax, enhancedMax] => enhanced.
      expect(selectRebateTier(size, incomeEligibleMax + 1).tier).toBe(
        "enhanced",
      );
      expect(selectRebateTier(size, enhancedMax).tier).toBe("enhanced");

      // Above enhancedMax => standard.
      expect(selectRebateTier(size, enhancedMax + 1).tier).toBe("standard");
    }
  });

  it("household size 3 with income 0 → income-eligible; very high income → standard", () => {
    expect(selectRebateTier(3, 0).tier).toBe("income-eligible");
    expect(selectRebateTier(3, 10_000_000).tier).toBe("standard");
  });
});

// ---------------------------------------------------------------------------
// Equity invariance (Requirements 5.9 / 10.4)
// ---------------------------------------------------------------------------

describe("equity-zip invariance (Req 5.9, 10.4)", () => {
  const EQUITY_ZIP = "02119"; // Roxbury — equity zip
  const NON_EQUITY_ZIP = "02108"; // Beacon Hill — Boston, not equity

  it("isEquityZip distinguishes the two fixture zips", () => {
    expect(isEquityZip(EQUITY_ZIP)).toBe(true);
    expect(isEquityZip(NON_EQUITY_ZIP)).toBe(false);
  });

  it("computeRebates gives the same rebateAmount for an equity vs non-equity zip", () => {
    // Gas persona drives real savings so the rebate/payback path is exercised.
    const equityInputs: HomeInputs = { ...gasPersona, zip: EQUITY_ZIP };
    const nonEquityInputs: HomeInputs = { ...gasPersona, zip: NON_EQUITY_ZIP };

    const rEquity = computeRebates(equityInputs, baseAssumptions);
    const rNonEquity = computeRebates(nonEquityInputs, baseAssumptions);

    expect(rEquity.rebateAmount).toBe(rNonEquity.rebateAmount);
    expect(rEquity.tier).toBe(rNonEquity.tier);
    expect(rEquity.netInstallCost).toBe(rNonEquity.netInstallCost);
  });
});

// Keep the rebate-cap constants referenced so a drift in them is visible in
// this suite's imports (the standard-tier rebate used by the personas is
// min(2650 × 3, 8500) = 7,950, which stays below the $18,000 install cost).
void ENHANCED_CAP;
void MASS_SAVE_PER_TON;
void MASS_SAVE_TOTAL_CAP;
