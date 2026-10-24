/**
 * Property-based tests for the Mass Save rebate + payback math in
 * `lib/rebates.ts` (task 2.6).
 *
 * Encoded correctness properties (design.md "Correctness Properties" +
 * Requirement 5), using the CORRECTED tier banding where, in INCOME_LIMITS,
 * `incomeEligibleMax` is the LOWER bound and `enhancedMax` the HIGHER bound.
 *
 * - Property 5: Rebate bounds — Validates: Requirement 5.6
 *     ∀ inputs, a: 0 <= computeRebates(inputs, a).rebateAmount <= a.installCostGross
 *                  AND netInstallCost >= 0
 * - Property 6: Payback sign — Validates: Requirement 5.8
 *     ∀ inputs, a: if computeComparison(inputs, a).annualDeltaDollars <= 0
 *                    then paybackYears === null
 *                  else paybackYears >= 0
 *
 * Supporting properties encoded here (Requirements 5.1–5.5, 5.7, 5.9):
 * - Tier banding matches the corrected Requirement 5.2:
 *     income <= incomeEligibleMax            -> "income-eligible"
 *     incomeEligibleMax < income <= enhancedMax -> "enhanced"
 *     income > enhancedMax                   -> "standard"
 *     income absent                          -> "standard" (Req 5.1)
 *     invalid household size                 -> "standard" + invalid flag (Req 5.3)
 * - Equity-zip invariance (Req 5.9): rebateAmount does NOT change when the zip
 *   is switched between an equity zip and a non-equity zip.
 * - Per-tier uncapped amount sanity (Req 5.4/5.5), asserted after the
 *   min(…, installCostGross) cap.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  selectRebateTier,
  computeRebates,
  isBostonZip,
  isEquityZip,
} from "@/lib/rebates";
import { computeComparison } from "@/lib/calc";
import {
  INCOME_LIMITS,
  MASS_SAVE_PER_TON,
  MASS_SAVE_TOTAL_CAP,
  ENHANCED_CAP,
  SYSTEM_EFFICIENCY,
} from "@/lib/constants";
import type { HomeInputs, Assumptions, HeatingType, Utility } from "@/lib/schema";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const HEATING_TYPES: HeatingType[] = [
  "gas",
  "oil",
  "electric-resistance",
  "propane",
];
const UTILITIES: Utility[] = ["eversource", "national-grid", "unitil"];

const heatingTypeArb = fc.constantFrom(...HEATING_TYPES);
const utilityArb = fc.constantFrom(...UTILITIES);

// Valid 5-digit zip (does not need to be a real MA zip for rebate math; the
// rebate must be identical regardless of zip).
const zipArb = fc
  .integer({ min: 0, max: 99999 })
  .map((n) => String(n).padStart(5, "0"));

// A valid household size for banding tests: integer 1..8.
const householdSizeArb = fc.integer({ min: 1, max: 8 });

// Positive finite money/energy values used across inputs + assumptions.
const positiveFuelUseArb = fc.double({
  min: 1,
  max: 100000,
  noNaN: true,
  noDefaultInfinity: true,
});
const positiveUnitPriceArb = fc.double({
  min: Math.fround(0.01),
  max: 100,
  noNaN: true,
  noDefaultInfinity: true,
});
// Optional annual income, spanning below/within/above the income bands.
const optionalIncomeArb = fc.option(
  fc.double({ min: 0, max: 300000, noNaN: true, noDefaultInfinity: true }),
  { nil: undefined },
);

// HomeInputs arbitrary with a valid household size (1..8) and optional income.
const homeInputsArb: fc.Arbitrary<HomeInputs> = fc.record({
  heatingType: heatingTypeArb,
  annualFuelUse: positiveFuelUseArb,
  fuelUnitPrice: positiveUnitPriceArb,
  zip: zipArb,
  utility: utilityArb,
  heatIncludedInRent: fc.boolean(),
  householdSize: householdSizeArb,
  annualIncome: optionalIncomeArb,
});

// systemEfficiency record defaulting to the source-cited constants, but allowed
// to vary within a sane positive band so the comparison sign varies too.
const systemEfficiencyArb: fc.Arbitrary<Record<HeatingType, number>> = fc.record({
  gas: fc.double({ min: Math.fround(0.5), max: 1, noNaN: true, noDefaultInfinity: true }),
  oil: fc.double({ min: Math.fround(0.5), max: 1, noNaN: true, noDefaultInfinity: true }),
  "electric-resistance": fc.double({
    min: Math.fround(0.5),
    max: 1,
    noNaN: true,
    noDefaultInfinity: true,
  }),
  propane: fc.double({ min: Math.fround(0.5), max: 1, noNaN: true, noDefaultInfinity: true }),
});

// Assumptions arbitrary. installCostGross >= 0, heatPumpTons > 0, plus the
// fields computeComparison needs (COP, electricity price, seasonal rate).
const assumptionsArb: fc.Arbitrary<Assumptions> = fc.record({
  heatPumpCOP: fc.double({ min: 1, max: 6, noNaN: true, noDefaultInfinity: true }),
  electricityPrice: fc.double({
    min: Math.fround(0.05),
    max: 1,
    noNaN: true,
    noDefaultInfinity: true,
  }),
  seasonalHeatPumpRate: fc.boolean(),
  seasonalRateDiscountPerKWh: fc.double({
    min: 0,
    max: Math.fround(0.1),
    noNaN: true,
    noDefaultInfinity: true,
  }),
  systemEfficiency: systemEfficiencyArb,
  heatPumpTons: fc.double({
    min: Math.fround(0.5),
    max: 5,
    noNaN: true,
    noDefaultInfinity: true,
  }),
  installCostGross: fc.double({
    min: 0,
    max: 60000,
    noNaN: true,
    noDefaultInfinity: true,
  }),
});

// ---------------------------------------------------------------------------
// Property 5: Rebate bounds — Validates: Requirement 5.6
// ---------------------------------------------------------------------------

describe("computeRebates — Property 5: rebate bounds (Req 5.6)", () => {
  it("0 <= rebateAmount <= installCostGross and netInstallCost >= 0", () => {
    fc.assert(
      fc.property(homeInputsArb, assumptionsArb, (inputs, a) => {
        const r = computeRebates(inputs, a);
        const gross = Math.max(0, a.installCostGross);
        expect(r.rebateAmount).toBeGreaterThanOrEqual(0);
        expect(r.rebateAmount).toBeLessThanOrEqual(gross);
        expect(r.netInstallCost).toBeGreaterThanOrEqual(0);
        // netInstallCost is exactly gross - rebate (Req 5.7).
        expect(r.netInstallCost).toBeCloseTo(gross - r.rebateAmount, 6);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6: Payback sign — Validates: Requirement 5.8
// ---------------------------------------------------------------------------

describe("computeRebates — Property 6: payback sign (Req 5.8)", () => {
  it("payback is null when savings <= 0, else >= 0", () => {
    fc.assert(
      fc.property(homeInputsArb, assumptionsArb, (inputs, a) => {
        const r = computeRebates(inputs, a);
        const annualSavings = computeComparison(inputs, a).annualDeltaDollars;
        if (annualSavings <= 0) {
          expect(r.paybackYears).toBeNull();
        } else {
          expect(r.paybackYears).not.toBeNull();
          expect(r.paybackYears as number).toBeGreaterThanOrEqual(0);
        }
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Tier banding — corrected Requirement 5.2 / 5.1 / 5.3
// ---------------------------------------------------------------------------

describe("selectRebateTier — banding (Req 5.1, 5.2, 5.3)", () => {
  it("income absent => standard (Req 5.1)", () => {
    fc.assert(
      fc.property(householdSizeArb, (size) => {
        const r = selectRebateTier(size, undefined);
        expect(r.tier).toBe("standard");
      }),
    );
  });

  it("valid household size + income selects the band matching INCOME_LIMITS (Req 5.2)", () => {
    fc.assert(
      fc.property(householdSizeArb, optionalIncomeArb, (size, income) => {
        const r = selectRebateTier(size, income);
        if (income === undefined) {
          expect(r.tier).toBe("standard");
          return;
        }
        // Sizes 6..8 reuse the size-5 limits.
        const limitKey = size >= 6 && size <= 8 ? 5 : size;
        const limits = INCOME_LIMITS[limitKey];
        if (income <= limits.incomeEligibleMax) {
          expect(r.tier).toBe("income-eligible");
        } else if (income <= limits.enhancedMax) {
          expect(r.tier).toBe("enhanced");
        } else {
          expect(r.tier).toBe("standard");
        }
      }),
    );
  });

  it("invalid household size (non-integer or < 1) => standard + invalid flag (Req 5.3)", () => {
    const invalidSizeArb = fc.oneof(
      fc.integer({ min: -100, max: 0 }),
      fc
        .double({ min: Math.fround(1.01), max: 20, noNaN: true, noDefaultInfinity: true })
        .filter((n) => !Number.isInteger(n)),
    );
    fc.assert(
      fc.property(invalidSizeArb, optionalIncomeArb, (size, income) => {
        const r = selectRebateTier(size, income);
        expect(r.tier).toBe("standard");
        expect(r.invalidHouseholdSize).toBe(true);
      }),
    );
  });

  it("household size 6..8 reuses size-5 limits and flags checkIncomeLimits (Req 5.3)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 6, max: 8 }),
        fc.double({ min: 0, max: 300000, noNaN: true, noDefaultInfinity: true }),
        (size, income) => {
          const r = selectRebateTier(size, income);
          expect(r.checkIncomeLimits).toBe(true);
          // Tier must match the size-5 band.
          const limits = INCOME_LIMITS[5];
          if (income <= limits.incomeEligibleMax) {
            expect(r.tier).toBe("income-eligible");
          } else if (income <= limits.enhancedMax) {
            expect(r.tier).toBe("enhanced");
          } else {
            expect(r.tier).toBe("standard");
          }
        },
      ),
    );
  });

  it("boundary incomes exactly at incomeEligibleMax and enhancedMax (Req 5.2)", () => {
    for (const size of [1, 2, 3, 4, 5]) {
      const limits = INCOME_LIMITS[size];
      // Exactly at incomeEligibleMax => still income-eligible (<=).
      expect(selectRebateTier(size, limits.incomeEligibleMax).tier).toBe(
        "income-eligible",
      );
      // Just above incomeEligibleMax => enhanced.
      expect(selectRebateTier(size, limits.incomeEligibleMax + 1).tier).toBe(
        "enhanced",
      );
      // Exactly at enhancedMax => still enhanced (<=).
      expect(selectRebateTier(size, limits.enhancedMax).tier).toBe("enhanced");
      // Just above enhancedMax => standard.
      expect(selectRebateTier(size, limits.enhancedMax + 1).tier).toBe(
        "standard",
      );
    }
  });
});

// ---------------------------------------------------------------------------
// computeRebates.tier agrees with selectRebateTier
// ---------------------------------------------------------------------------

describe("computeRebates — tier matches selectRebateTier", () => {
  it("result.tier === selectRebateTier(size, income).tier", () => {
    fc.assert(
      fc.property(homeInputsArb, assumptionsArb, (inputs, a) => {
        const r = computeRebates(inputs, a);
        const expected = selectRebateTier(
          inputs.householdSize,
          inputs.annualIncome,
        ).tier;
        expect(r.tier).toBe(expected);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Per-tier uncapped amount sanity (Req 5.4 / 5.5), after the gross cap
// ---------------------------------------------------------------------------

describe("computeRebates — per-tier amount (Req 5.4, 5.5)", () => {
  it("rebateAmount equals the tier's uncapped amount clamped to [0, installCostGross]", () => {
    fc.assert(
      fc.property(homeInputsArb, assumptionsArb, (inputs, a) => {
        const r = computeRebates(inputs, a);
        const gross = Math.max(0, a.installCostGross);

        let uncapped: number;
        if (r.tier === "income-eligible") {
          // Req 5.5: Income Eligible = full install cost.
          uncapped = gross;
        } else if (r.tier === "enhanced") {
          // Req 5.4: Enhanced = min(installCostGross, ENHANCED_CAP).
          uncapped = Math.min(gross, ENHANCED_CAP);
        } else {
          // Req 5.4: Standard = min(2650 * tons, 8500).
          uncapped = Math.min(
            MASS_SAVE_PER_TON * a.heatPumpTons,
            MASS_SAVE_TOTAL_CAP,
          );
        }
        const expected = Math.min(Math.max(uncapped, 0), gross);
        expect(r.rebateAmount).toBeCloseTo(expected, 6);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Equity-zip invariance (Req 5.9): rebate independent of zip equity status
// ---------------------------------------------------------------------------

describe("computeRebates — equity-zip invariance (Req 5.9)", () => {
  // A known equity zip and a known non-equity zip (verified via the helpers).
  const EQUITY_ZIP = "02119"; // Roxbury (equity)
  const NON_EQUITY_ZIP = "02108"; // Beacon Hill (Boston, not equity)

  it("test fixtures classify as expected", () => {
    expect(isEquityZip(EQUITY_ZIP)).toBe(true);
    expect(isEquityZip(NON_EQUITY_ZIP)).toBe(false);
    // Both are Boston zips; only equity status differs.
    expect(isBostonZip(EQUITY_ZIP)).toBe(true);
    expect(isBostonZip(NON_EQUITY_ZIP)).toBe(true);
  });

  it("isEquityZip returns true for all nine equity zips and false for a non-equity Boston zip", () => {
    // The authoritative equity-zip list (lib/rebates.ts).
    const EQUITY_ZIPS = [
      "02134",
      "02135",
      "02121",
      "02122",
      "02124",
      "02125",
      "02119",
      "02120",
      "02128",
    ];
    for (const zip of EQUITY_ZIPS) {
      expect(isEquityZip(zip)).toBe(true);
    }
    // 02116 (Back Bay) is a Boston zip but NOT on the equity list.
    expect(isBostonZip("02116")).toBe(true);
    expect(isEquityZip("02116")).toBe(false);
  });

  it("rebateAmount is identical whether or not the zip is an equity zip", () => {
    fc.assert(
      fc.property(homeInputsArb, assumptionsArb, (inputs, a) => {
        const equityInputs: HomeInputs = { ...inputs, zip: EQUITY_ZIP };
        const nonEquityInputs: HomeInputs = { ...inputs, zip: NON_EQUITY_ZIP };
        const rEquity = computeRebates(equityInputs, a);
        const rNonEquity = computeRebates(nonEquityInputs, a);
        // Sanity: the two zips really do differ in equity status.
        expect(isEquityZip(equityInputs.zip)).toBe(true);
        expect(isEquityZip(nonEquityInputs.zip)).toBe(false);
        // The rebate amount must be unchanged by equity status.
        expect(rEquity.rebateAmount).toBe(rNonEquity.rebateAmount);
        expect(rEquity.tier).toBe(rNonEquity.tier);
        expect(rEquity.netInstallCost).toBe(rNonEquity.netInstallCost);
      }),
    );
  });
});

// Reference to the default source-cited efficiencies so a drift in constants is
// visible in this suite's imports (keeps the test honest about what it relies on).
void SYSTEM_EFFICIENCY;
