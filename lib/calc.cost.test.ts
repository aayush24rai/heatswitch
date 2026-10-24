/**
 * Property-based tests for the cost / breakeven / comparison math in
 * `lib/calc.ts` (task 2.4).
 *
 * Encodes the design's numbered Correctness Properties:
 *  - Property 2 (Breakeven consistency)             — Validates: Requirement 4.10
 *  - Property 3 (Seasonal rate never raises cost)   — Validates: Requirement 4.12
 *  - Property 4 (COP monotonicity)                  — Validates: Requirement 4.13
 *  - Property 7 (Cost linearity)                    — Validates: Requirement 4.8
 *
 * All four functions under test are pure, so these are universally-quantified
 * statements over valid `HomeInputs` + `Assumptions`. The arbitraries below
 * stay inside the realistic domain each function documents (fuel use/price > 0,
 * COP >= 1, electricity price > 0, discount >= 0, efficiencies > 0) so no
 * generated case trips a precondition throw or overflows to a non-finite value.
 * Where a domain constraint is applied it narrows the input space to exactly
 * where the spec's claim applies — it never relaxes the asserted relation.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  breakevenCOP,
  computeComparison,
  currentHeatingCost,
  heatPumpCost,
} from "./calc";
import {
  OIL_GALLON_KWH,
  PROPANE_GALLON_KWH,
  THERM_KWH,
} from "./constants";
import type { Assumptions, HeatingType, HomeInputs } from "./schema";

// kWh-equivalent energy content per native fuel unit, mirroring the private
// FUEL_ENERGY_CONTENT_KWH map in calc.ts. Used only to compute the *raw*
// (unclamped) breakeven COP so Property 2 can be asserted strictly inside the
// clamp range — it is test-side bookkeeping, not a re-implementation of the SUT.
const FUEL_ENERGY_CONTENT_KWH: Record<HeatingType, number> = {
  gas: THERM_KWH,
  oil: OIL_GALLON_KWH,
  propane: PROPANE_GALLON_KWH,
  "electric-resistance": 1,
};

const HEATING_TYPES: HeatingType[] = [
  "gas",
  "oil",
  "propane",
  "electric-resistance",
];

const heatingTypeArb: fc.Arbitrary<HeatingType> =
  fc.constantFrom(...HEATING_TYPES);

// A valid 5-digit zip (Massachusetts "02" prefix, matching the app's domain).
const zipArb: fc.Arbitrary<string> = fc
  .integer({ min: 0, max: 999 })
  .map((n) => `02${String(n).padStart(3, "0")}`);

const utilityArb = fc.constantFrom(
  "eversource" as const,
  "national-grid" as const,
  "unitil" as const,
);

/**
 * Realistic per-type system efficiency map (every entry > 0). Ranges mirror the
 * AFUE / efficiency-factor values the app uses; electric resistance is 1.0 but
 * we still sample > 0 for all four types so `a.systemEfficiency[type]` is always
 * a valid positive number regardless of which heatingType an input carries.
 */
const systemEfficiencyArb: fc.Arbitrary<Record<HeatingType, number>> = fc
  .record({
    gas: fc.double({ min: 0.5, max: 0.99, noNaN: true }),
    oil: fc.double({ min: 0.5, max: 0.95, noNaN: true }),
    propane: fc.double({ min: 0.5, max: 0.95, noNaN: true }),
    "electric-resistance": fc.double({ min: 0.9, max: 1.0, noNaN: true }),
  });

/**
 * Realistic HomeInputs. annualFuelUse and fuelUnitPrice are strictly > 0 (the
 * currentHeatingCost / heatPumpCost preconditions), and kept in sensible ranges
 * so products stay finite and far from overflow.
 */
const homeInputsArb: fc.Arbitrary<HomeInputs> = fc.record({
  heatingType: heatingTypeArb,
  annualFuelUse: fc.double({ min: 1, max: 20000, noNaN: true }),
  fuelUnitPrice: fc.double({ min: 0.05, max: 10, noNaN: true }),
  zip: zipArb,
  utility: utilityArb,
  heatIncludedInRent: fc.boolean(),
  householdSize: fc.integer({ min: 1, max: 8 }),
});

/**
 * Realistic Assumptions. COP >= 1, electricityPrice > 0,
 * seasonalRateDiscountPerKWh >= 0, every efficiency > 0, tons > 0,
 * installCostGross >= 0 — matching the documented validation rules.
 */
const assumptionsArb: fc.Arbitrary<Assumptions> = fc.record({
  heatPumpCOP: fc.double({ min: 1, max: 6, noNaN: true }),
  electricityPrice: fc.double({ min: 0.05, max: 0.6, noNaN: true }),
  seasonalHeatPumpRate: fc.boolean(),
  seasonalRateDiscountPerKWh: fc.double({ min: 0, max: 0.1, noNaN: true }),
  systemEfficiency: systemEfficiencyArb,
  heatPumpTons: fc.double({ min: 0.5, max: 6, noNaN: true }),
  installCostGross: fc.double({ min: 0, max: 40000, noNaN: true }),
});

/**
 * The effective $/kWh price the SUT uses, recomputed test-side only to derive
 * the *raw* breakeven for Property 2's domain gate. Mirrors
 * effectiveElectricityPrice in calc.ts.
 */
function effectivePrice(a: Assumptions): number {
  if (!a.seasonalHeatPumpRate) return a.electricityPrice;
  return Math.max(0, a.electricityPrice - a.seasonalRateDiscountPerKWh);
}

/** Raw (unclamped) breakeven COP, mirroring breakevenCOP before its clamp. */
function rawBreakevenCOP(inputs: HomeInputs, a: Assumptions): number {
  const efficiency = a.systemEfficiency[inputs.heatingType];
  const deliveredHeatKWh =
    inputs.annualFuelUse * FUEL_ENERGY_CONTENT_KWH[inputs.heatingType] * efficiency;
  const current = inputs.annualFuelUse * inputs.fuelUnitPrice;
  return (deliveredHeatKWh * effectivePrice(a)) / current;
}

describe("lib/calc.ts cost & breakeven — property tests", () => {
  // -------------------------------------------------------------------------
  // Property 2: Breakeven consistency — Validates: Requirement 4.10
  //
  //   a.heatPumpCOP > breakevenCOP(inputs, a) ⟺ computeComparison(...).delta > 0
  //
  // breakevenCOP clamps its result to [0.01, 10.0]. The iff is exact only where
  // the *raw* (unclamped) breakeven equals the returned value — i.e. strictly
  // inside the clamp interval. We therefore gate the arbitrary (via fc.pre) to
  // cases whose raw breakeven is interior to (0.01, 10.0), AND draw heatPumpCOP
  // from that same interior band so a strict comparison is always meaningful.
  //
  // This is a DOMAIN RESTRICTION, not a weakening: the clamped boundary cases
  // are the only ones where the spec's exact iff cannot hold (the returned
  // breakeven is a clamp artifact, not the true boundary), so they fall outside
  // where the claim applies. Inside the band the full iff is asserted, both
  // directions, with no tolerance.
  //
  // heatPumpCOP is still drawn >= 1 — that is a hard precondition of
  // heatPumpCost/computeComparison (they throw below 1), so valid inputs never
  // go below it. The gated interior breakeven lies anywhere in (0.01, 10.0), so
  // a COP in [1, 10) lands above it (savings) or below it (no savings) across
  // the runs, exercising both directions of the iff without feeding an invalid
  // COP to the SUT.
  // -------------------------------------------------------------------------
  it("Property 2 (Req 4.10): COP above breakeven ⟺ positive savings (interior band)", () => {
    const interiorAssumptionsArb = fc.record({
      // COP >= 1 (a real precondition) and < 10 (the clamp ceiling) so the
      // comparison to a gated interior breakeven is always a meaningful test.
      heatPumpCOP: fc.double({ min: 1, max: 9.99, noNaN: true }),
      electricityPrice: fc.double({ min: 0.05, max: 0.6, noNaN: true }),
      seasonalHeatPumpRate: fc.boolean(),
      seasonalRateDiscountPerKWh: fc.double({ min: 0, max: 0.1, noNaN: true }),
      systemEfficiency: systemEfficiencyArb,
      heatPumpTons: fc.double({ min: 0.5, max: 6, noNaN: true }),
      installCostGross: fc.double({ min: 0, max: 40000, noNaN: true }),
    });

    fc.assert(
      fc.property(homeInputsArb, interiorAssumptionsArb, (inputs, a) => {
        const raw = rawBreakevenCOP(inputs, a);
        // Gate to cases where the clamp is inactive: raw breakeven interior to
        // (0.01, 10.0). Only here does breakevenCOP() return the true boundary.
        fc.pre(raw > 0.01 && raw < 10.0);

        const breakeven = breakevenCOP(inputs, a);
        const delta = computeComparison(inputs, a).annualDeltaDollars;

        const copAboveBreakeven = a.heatPumpCOP > breakeven;
        const positiveSavings = delta > 0;

        // Full iff, both directions, no tolerance.
        expect(copAboveBreakeven).toBe(positiveSavings);
      }),
      { numRuns: 1000 },
    );
  });

  // -------------------------------------------------------------------------
  // Property 3: Seasonal rate never raises heat pump cost — Validates: Req 4.12
  //
  //   heatPumpCost(inputs, {...a, seasonalHeatPumpRate:true})
  //     <= heatPumpCost(inputs, {...a, seasonalHeatPumpRate:false})
  //
  // The arbitrary already draws seasonalRateDiscountPerKWh >= 0; we hold every
  // other field equal and only flip the seasonal-rate boolean, so turning the
  // rate on can only lower (or hold) the effective price and thus the cost.
  // -------------------------------------------------------------------------
  it("Property 3 (Req 4.12): turning the seasonal rate on never raises cost", () => {
    fc.assert(
      fc.property(homeInputsArb, assumptionsArb, (inputs, a) => {
        const withRateOn: Assumptions = { ...a, seasonalHeatPumpRate: true };
        const withRateOff: Assumptions = { ...a, seasonalHeatPumpRate: false };

        const costOn = heatPumpCost(inputs, withRateOn);
        const costOff = heatPumpCost(inputs, withRateOff);

        expect(costOn).toBeLessThanOrEqual(costOff);
      }),
      { numRuns: 1000 },
    );
  });

  // -------------------------------------------------------------------------
  // Property 4: COP monotonicity — Validates: Requirement 4.13
  //
  //   a1.heatPumpCOP < a2.heatPumpCOP (else equal)
  //     ⟹ heatPumpCost(inputs, a1) > heatPumpCost(inputs, a2)   (strict)
  //
  // We draw two COPs >= 1 and assign the smaller to a1, the larger to a2,
  // holding everything else identical. Cost = deliveredHeat/COP * price, and
  // deliveredHeat * price > 0 for all valid inputs (fuelUse >= 1,
  // efficiency > 0), so a larger COP yields a strictly smaller cost in the
  // reals.
  //
  // Two caveats on the DOMAIN, neither of which weakens the strict assertion:
  //  1. Effective price must be > 0, else both costs are 0 and equal — the
  //     exact boundary the strict spec claim excludes. Rate off => price > 0;
  //     with it on we gate price > 0 (discount strictly below the base price).
  //  2. The two COPs must be far enough apart that the monotonic decrease is
  //     observable in IEEE-754. COPs separated by a single ULP can divide to
  //     bit-identical doubles (deliveredHeat/COP rounds to the same value), so
  //     the real-valued strict order has no observable footing there. We draw
  //     the high COP as the low COP times a factor strictly > 1 (>= 1.0001), a
  //     generator constraint that excludes only those indistinguishable pairs —
  //     the assertion itself stays a strict `>` with no tolerance.
  // -------------------------------------------------------------------------
  it("Property 4 (Req 4.13): heat pump cost strictly decreases as COP rises", () => {
    const twoCopsArb = fc
      .tuple(
        fc.double({ min: 1, max: 6, noNaN: true }),
        // Multiplicative gap strictly above 1 so copHigh is meaningfully, not
        // just ULP-wise, larger than copLow.
        fc.double({ min: 1.0001, max: 6, noNaN: true }),
      )
      .map(([copLow, factor]) => [copLow, copLow * factor] as [number, number]);

    fc.assert(
      fc.property(
        homeInputsArb,
        assumptionsArb,
        twoCopsArb,
        (inputs, base, [copLow, copHigh]) => {
          // Keep the effective price strictly positive so the comparison is a
          // strict inequality (see rationale above). Not a weakening: a zero
          // price is the exact boundary the strict spec claim does not cover.
          const price = effectivePrice(base);
          fc.pre(price > 0);

          const a1: Assumptions = { ...base, heatPumpCOP: copLow };
          const a2: Assumptions = { ...base, heatPumpCOP: copHigh };

          expect(heatPumpCost(inputs, a1)).toBeGreaterThan(
            heatPumpCost(inputs, a2),
          );
        },
      ),
      { numRuns: 1000 },
    );
  });

  // -------------------------------------------------------------------------
  // Property 7: Cost linearity — Validates: Requirement 4.8
  //
  //   currentHeatingCost({...inputs, annualFuelUse: k*u})
  //     ≈ k * currentHeatingCost({...inputs, annualFuelUse: u}),  k > 0
  //
  // currentHeatingCost is exactly annualFuelUse * fuelUnitPrice, so this
  // equality is mathematically exact; the only gap is IEEE-754 rounding in the
  // two multiplications. We assert with a small RELATIVE epsilon (1e-9), which
  // is the inherent floating-point tolerance for a mathematically-exact
  // equality — NOT a relaxation of the property.
  // -------------------------------------------------------------------------
  it("Property 7 (Req 4.8): current heating cost scales linearly with fuel use", () => {
    fc.assert(
      fc.property(
        homeInputsArb,
        fc.double({ min: 1e-3, max: 1000, noNaN: true }),
        (inputs, k) => {
          const base = currentHeatingCost(inputs);
          const scaled = currentHeatingCost({
            ...inputs,
            annualFuelUse: k * inputs.annualFuelUse,
          });

          const expected = k * base;
          const relEps = 1e-9;
          // Relative tolerance; falls back to an absolute floor near zero.
          const tolerance = Math.max(
            Math.abs(expected) * relEps,
            Number.EPSILON,
          );
          expect(Math.abs(scaled - expected)).toBeLessThanOrEqual(tolerance);
        },
      ),
      { numRuns: 1000 },
    );
  });
});
