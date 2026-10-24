/**
 * Property and boundary unit tests for `decideVerdict(cmp, reb, inputs, now)`
 * in `lib/calc.ts` (task 2.8).
 *
 * Encoded correctness property (design.md "Correctness Properties"):
 * - Property 1: No savings is reported honestly — Validates: Requirement 6.2
 *     ∀ valid cmp/reb: cmp.annualDeltaDollars <= 0 ⟹ label === "Not worth it yet"
 *
 * Boundary + deadline + renter unit tests:
 * - Req 6.1: exactly one of the three labels is always returned.
 * - Req 6.3 / 6.4: behaviour at, just above, and just below breakeven.
 * - Req 5.12 / 5.13: the "act before Dec 31" flag on/off around the 2026
 *   install deadline, and false when there is no payback / no rebate / the
 *   rebate does not materially shorten payback.
 * - Req 7.2 / 7.3: isRenter === inputs.heatIncludedInRent.
 *
 * Realistic cmp/reb pairs are built from HomeInputs + Assumptions via
 * `computeComparison` / `computeRebates`, so the two results respect the
 * invariants the real app relies on (e.g. payback is null exactly when
 * savings <= 0). This exercises both the non-positive-delta region (honesty)
 * and the positive-delta region (switch now / switch later).
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  computeComparison,
  decideVerdict,
} from "@/lib/calc";
import { computeRebates } from "@/lib/rebates";
import { REBATE_DEADLINE_2026, SYSTEM_EFFICIENCY } from "@/lib/constants";
import type {
  Assumptions,
  CostComparison,
  HeatingType,
  HomeInputs,
  Utility,
  VerdictLabel,
} from "@/lib/schema";
import type { RebateResult } from "@/lib/rebates";

const VERDICT_LABELS: VerdictLabel[] = [
  "Switch now",
  "Switch when your system needs replacing",
  "Not worth it yet",
];

const HEATING_TYPES: HeatingType[] = [
  "gas",
  "oil",
  "electric-resistance",
  "propane",
];

const UTILITIES: Utility[] = ["eversource", "national-grid", "unitil"];

// ---------------------------------------------------------------------------
// Shared helpers for constructing realistic inputs/assumptions.
// ---------------------------------------------------------------------------

/**
 * A baseline gas home used by the boundary/deadline unit tests. Individual
 * tests override the fields they care about. The native fuel unit is therms.
 */
function baseGasInputs(overrides: Partial<HomeInputs> = {}): HomeInputs {
  return {
    heatingType: "gas",
    annualFuelUse: 652, // therms
    fuelUnitPrice: 2.42, // $/therm
    zip: "02130",
    utility: "eversource",
    heatIncludedInRent: false,
    householdSize: 3,
    ...overrides,
  };
}

/**
 * Baseline assumptions. `heatPumpCOP` and `installCostGross` are the primary
 * knobs the boundary tests tune to place `annualDeltaDollars` and payback
 * exactly where a branch of `decideVerdict` is being probed.
 */
function baseAssumptions(overrides: Partial<Assumptions> = {}): Assumptions {
  return {
    heatPumpCOP: 2.5,
    electricityPrice: 0.288, // $/kWh
    seasonalHeatPumpRate: false,
    seasonalRateDiscountPerKWh: 0.073,
    systemEfficiency: { ...SYSTEM_EFFICIENCY },
    heatPumpTons: 3,
    installCostGross: 18000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Property 1: No savings is reported honestly — Validates: Requirement 6.2
// ---------------------------------------------------------------------------

/**
 * Arbitrary over realistic HomeInputs. Fuel use and unit price are kept in
 * sane positive ranges so `currentHeatingCost` / `heatPumpCost` stay finite and
 * well-defined. `annualIncome` is optional (undefined => Standard tier).
 */
const homeInputsArb: fc.Arbitrary<HomeInputs> = fc.record({
  heatingType: fc.constantFrom(...HEATING_TYPES),
  annualFuelUse: fc.double({
    min: 1,
    max: 10000,
    noNaN: true,
    noDefaultInfinity: true,
  }),
  fuelUnitPrice: fc.double({
    min: Math.fround(0.01),
    max: 99.99,
    noNaN: true,
    noDefaultInfinity: true,
  }),
  zip: fc.constantFrom("02130", "02119", "01060", "02215"),
  utility: fc.constantFrom(...UTILITIES),
  heatIncludedInRent: fc.boolean(),
  householdSize: fc.integer({ min: 1, max: 9 }),
  annualIncome: fc.option(
    fc.double({ min: 0, max: 300000, noNaN: true, noDefaultInfinity: true }),
    { nil: undefined },
  ),
});

/**
 * Arbitrary over realistic Assumptions. The COP range spans well below and
 * well above typical breakeven so the generated comparisons cover BOTH the
 * non-positive-delta region (the honesty property) and the positive-delta
 * region. A low minimum COP (1.0) deliberately produces costly heat pumps so
 * `annualDeltaDollars <= 0` is reached often.
 */
const assumptionsArb: fc.Arbitrary<Assumptions> = fc.record({
  heatPumpCOP: fc.double({
    min: 1,
    max: 6,
    noNaN: true,
    noDefaultInfinity: true,
  }),
  electricityPrice: fc.double({
    min: Math.fround(0.05),
    max: 0.6,
    noNaN: true,
    noDefaultInfinity: true,
  }),
  seasonalHeatPumpRate: fc.boolean(),
  seasonalRateDiscountPerKWh: fc.double({
    min: 0,
    max: 0.1,
    noNaN: true,
    noDefaultInfinity: true,
  }),
  systemEfficiency: fc.constant({ ...SYSTEM_EFFICIENCY }),
  heatPumpTons: fc.double({
    min: 0.5,
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

describe("decideVerdict — Property 1: honesty (Requirement 6.2)", () => {
  // Property 1 — Validates: Requirement 6.2
  it('returns "Not worth it yet" whenever annualDeltaDollars <= 0', () => {
    fc.assert(
      fc.property(
        homeInputsArb,
        assumptionsArb,
        fc.date({
          min: new Date("2024-01-01T00:00:00"),
          max: new Date("2028-12-31T23:59:59"),
        }),
        (inputs, a, now) => {
          const cmp = computeComparison(inputs, a);
          // Only assert over the region the property is about: no savings.
          fc.pre(cmp.annualDeltaDollars <= 0);
          const reb = computeRebates(inputs, a);
          const verdict = decideVerdict(cmp, reb, inputs, now);
          expect(verdict.label).toBe("Not worth it yet");
        },
      ),
    );
  });

  // Supporting: Req 6.1 — exactly one of the three labels is always returned,
  // across the full generated space (savings and no-savings alike).
  it("always returns exactly one of the three verdict labels (Req 6.1)", () => {
    fc.assert(
      fc.property(
        homeInputsArb,
        assumptionsArb,
        fc.date({
          min: new Date("2024-01-01T00:00:00"),
          max: new Date("2028-12-31T23:59:59"),
        }),
        (inputs, a, now) => {
          const cmp = computeComparison(inputs, a);
          const reb = computeRebates(inputs, a);
          const verdict = decideVerdict(cmp, reb, inputs, now);
          expect(VERDICT_LABELS).toContain(verdict.label);
        },
      ),
    );
  });

  // Supporting: isRenter mirrors the rent toggle across the whole space
  // (Req 7.2 / 7.3).
  it("sets isRenter === inputs.heatIncludedInRent for all inputs (Req 7.2/7.3)", () => {
    fc.assert(
      fc.property(
        homeInputsArb,
        assumptionsArb,
        fc.date({
          min: new Date("2024-01-01T00:00:00"),
          max: new Date("2028-12-31T23:59:59"),
        }),
        (inputs, a, now) => {
          const cmp = computeComparison(inputs, a);
          const reb = computeRebates(inputs, a);
          const verdict = decideVerdict(cmp, reb, inputs, now);
          expect(verdict.isRenter).toBe(inputs.heatIncludedInRent);
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Boundary unit tests around breakeven (Requirements 6.1, 6.3, 6.4).
//
// These construct cmp/reb directly so delta and payback sit at precise,
// hand-chosen boundary values. `reb` keeps the invariant that payback is null
// exactly when savings <= 0.
// ---------------------------------------------------------------------------

function makeCmp(annualDeltaDollars: number): CostComparison {
  // The other fields are not read by decideVerdict; keep them consistent.
  const current = 2000;
  return {
    currentAnnualCost: current,
    heatPumpAnnualCost: current - annualDeltaDollars,
    annualDeltaDollars,
    breakevenCOP: 2.5,
  };
}

function makeReb(overrides: Partial<RebateResult> = {}): RebateResult {
  return {
    tier: "standard",
    rebateAmount: 0,
    netInstallCost: 18000,
    paybackYears: null,
    requirements: [],
    ...overrides,
  };
}

describe("decideVerdict — breakeven boundaries (Req 6.1, 6.3, 6.4)", () => {
  const now = new Date("2026-06-01T00:00:00"); // before the deadline
  const inputs = baseGasInputs();

  it('exactly at breakeven (delta === 0) => "Not worth it yet" (Req 6.2)', () => {
    const cmp = makeCmp(0);
    // Savings 0 => payback is null (rebate result honours the invariant).
    const reb = makeReb({ paybackYears: null });
    expect(decideVerdict(cmp, reb, inputs, now).label).toBe("Not worth it yet");
  });

  it('just below breakeven (delta = -0.01) => "Not worth it yet" (Req 6.2)', () => {
    const cmp = makeCmp(-0.01);
    const reb = makeReb({ paybackYears: null });
    expect(decideVerdict(cmp, reb, inputs, now).label).toBe("Not worth it yet");
  });

  it('just above breakeven with payback <= 5 => "Switch now" (Req 6.3)', () => {
    // delta slightly positive; net cost chosen so payback <= 5 years.
    const cmp = makeCmp(0.01);
    // payback = netInstallCost / savings. Pick payback exactly 5 (the boundary).
    const reb = makeReb({
      rebateAmount: 2000,
      netInstallCost: 0.05, // 0.05 / 0.01 = 5 years
      paybackYears: 5,
    });
    expect(decideVerdict(cmp, reb, inputs, now).label).toBe("Switch now");
  });

  it('just above breakeven with payback just over 5 => "Switch when your system needs replacing" (Req 6.4)', () => {
    const cmp = makeCmp(0.01);
    const reb = makeReb({
      rebateAmount: 2000,
      netInstallCost: 0.0501,
      paybackYears: 5.01, // just over the 5-year threshold
    });
    expect(decideVerdict(cmp, reb, inputs, now).label).toBe(
      "Switch when your system needs replacing",
    );
  });

  it('positive savings but payback null => "Switch when your system needs replacing" (Req 6.4)', () => {
    const cmp = makeCmp(500);
    const reb = makeReb({ paybackYears: null });
    expect(decideVerdict(cmp, reb, inputs, now).label).toBe(
      "Switch when your system needs replacing",
    );
  });

  it('comfortable savings with short payback => "Switch now" (Req 6.3)', () => {
    const cmp = makeCmp(1200);
    const reb = makeReb({
      rebateAmount: 8500,
      netInstallCost: 2400,
      paybackYears: 2, // 2400 / 1200
    });
    expect(decideVerdict(cmp, reb, inputs, now).label).toBe("Switch now");
  });
});

// ---------------------------------------------------------------------------
// Deadline flag tests around Dec 31, 2026 (Requirements 5.12, 5.13).
// ---------------------------------------------------------------------------

describe("decideVerdict — actBeforeDec31 deadline flag (Req 5.12, 5.13)", () => {
  const inputs = baseGasInputs();

  // A rebate that materially shortens payback: gross install 18000, rebate
  // 8500 => net 9500. savings = 1200/yr.
  //   payback_noRebate = 18000 / 1200 = 15 years
  //   payback_net      =  9500 / 1200 ≈ 7.92 years
  //   difference ≈ 7.08 years (>= 1) => material.
  const savings = 1200;
  const materialReb = (): RebateResult =>
    makeReb({
      rebateAmount: 8500,
      netInstallCost: 9500,
      paybackYears: 9500 / savings,
    });

  it("true when savings > 0, rebate material, and now <= deadline (Req 5.12)", () => {
    const cmp = makeCmp(savings);
    const now = new Date("2026-06-01T00:00:00"); // before Dec 31, 2026
    expect(now <= REBATE_DEADLINE_2026).toBe(true);
    const verdict = decideVerdict(cmp, materialReb(), inputs, now);
    expect(verdict.actBeforeDec31).toBe(true);
  });

  it("false when now is after the deadline, all else equal (Req 5.13)", () => {
    const cmp = makeCmp(savings);
    const now = new Date("2027-01-01T00:00:00"); // after Dec 31, 2026
    expect(now > REBATE_DEADLINE_2026).toBe(true);
    const verdict = decideVerdict(cmp, materialReb(), inputs, now);
    expect(verdict.actBeforeDec31).toBe(false);
  });

  it("true right at the deadline boundary (now === REBATE_DEADLINE_2026)", () => {
    const cmp = makeCmp(savings);
    const now = new Date(REBATE_DEADLINE_2026.getTime());
    const verdict = decideVerdict(cmp, materialReb(), inputs, now);
    expect(verdict.actBeforeDec31).toBe(true);
  });

  it("false when there are no savings (payback null), even before the deadline", () => {
    const cmp = makeCmp(0); // no savings
    const now = new Date("2026-06-01T00:00:00");
    // Savings <= 0 => payback null; rebate present but nothing to pay back.
    const reb = makeReb({
      rebateAmount: 8500,
      netInstallCost: 9500,
      paybackYears: null,
    });
    const verdict = decideVerdict(cmp, reb, inputs, now);
    expect(verdict.actBeforeDec31).toBe(false);
  });

  it("false when rebateAmount === 0, even with savings before the deadline", () => {
    const cmp = makeCmp(savings);
    const now = new Date("2026-06-01T00:00:00");
    // No rebate: net === gross, payback unchanged, nothing to incentivize.
    const reb = makeReb({
      rebateAmount: 0,
      netInstallCost: 18000,
      paybackYears: 18000 / savings,
    });
    const verdict = decideVerdict(cmp, reb, inputs, now);
    expect(verdict.actBeforeDec31).toBe(false);
  });

  it("false when the rebate does not shorten payback by >= 1 year (Req 5.12)", () => {
    const cmp = makeCmp(savings);
    const now = new Date("2026-06-01T00:00:00");
    // Tiny rebate: gross 18000, rebate 600 => net 17400.
    //   payback_noRebate = 18000 / 1200 = 15 years
    //   payback_net      = 17400 / 1200 = 14.5 years
    //   difference = 0.5 year (< 1) => NOT material.
    const reb = makeReb({
      rebateAmount: 600,
      netInstallCost: 17400,
      paybackYears: 17400 / savings,
    });
    const verdict = decideVerdict(cmp, reb, inputs, now);
    expect(verdict.actBeforeDec31).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isRenter unit cases (Requirements 7.2, 7.3).
// ---------------------------------------------------------------------------

describe("decideVerdict — isRenter (Req 7.2, 7.3)", () => {
  const now = new Date("2026-06-01T00:00:00");

  it("isRenter is true when heat is included in rent", () => {
    const inputs = baseGasInputs({ heatIncludedInRent: true });
    const cmp = computeComparison(inputs, baseAssumptions());
    const reb = computeRebates(inputs, baseAssumptions());
    expect(decideVerdict(cmp, reb, inputs, now).isRenter).toBe(true);
  });

  it("isRenter is false when heat is not included in rent", () => {
    const inputs = baseGasInputs({ heatIncludedInRent: false });
    const cmp = computeComparison(inputs, baseAssumptions());
    const reb = computeRebates(inputs, baseAssumptions());
    expect(decideVerdict(cmp, reb, inputs, now).isRenter).toBe(false);
  });
});
