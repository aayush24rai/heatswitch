/**
 * Property-based tests for the heating-use and energy-content functions in
 * `lib/calc.ts` (task 2.2).
 *
 * Encoded correctness properties (design.md "Correctness Properties"):
 * - Property 9: Zero fuel, zero cost — Validates: Requirement 4.7
 *     ∀ type, eff > 0: fuelEnergyContentKWh(type, 0, eff) === 0
 * - Property 10: Annual heating use is bounded — Validates: Requirement 4.4
 *     ∀ history length 12, all elements >= 0: 0 <= annualHeatingUse(history) <= sum(history)
 *
 * Supporting postconditions encoded as properties (Requirements 4.3–4.7):
 * - annualHeatingUse returns a finite number (Req 4.4).
 * - annualHeatingUse throws for non-12-length or negative histories (Req 4.3).
 * - fuelEnergyContentKWh returns a finite number >= 0 (Req 4.5/4.7).
 * - fuelEnergyContentKWh is monotonic non-decreasing in fuelUse (Req 4.5).
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { annualHeatingUse, fuelEnergyContentKWh } from "@/lib/calc";
import type { HeatingType } from "@/lib/schema";

// All supported heating types (lib/schema.ts HeatingType).
const HEATING_TYPES: HeatingType[] = [
  "gas",
  "oil",
  "electric-resistance",
  "propane",
];

// Arbitrary for exactly 12 non-negative finite monthly readings.
const twelveNonNegativeReadings = fc.array(
  fc.double({ min: 0, max: 1e6, noNaN: true, noDefaultInfinity: true }),
  { minLength: 12, maxLength: 12 },
);

// Arbitrary over the supported heating types.
const heatingTypeArb = fc.constantFrom(...HEATING_TYPES);

// Arbitrary for a strictly-positive finite efficiency (Req 4.6: efficiency > 0).
const positiveEfficiencyArb = fc.double({
  min: Math.fround(0.01),
  max: 1.5,
  noNaN: true,
  noDefaultInfinity: true,
  minExcluded: false,
});

// Arbitrary for a non-negative finite fuel use.
const nonNegativeFuelUseArb = fc.double({
  min: 0,
  max: 1e6,
  noNaN: true,
  noDefaultInfinity: true,
});

describe("annualHeatingUse", () => {
  // Property 10 — Validates: Requirement 4.4
  it("Property 10: annual heating use is bounded by [0, sum(history)]", () => {
    fc.assert(
      fc.property(twelveNonNegativeReadings, (history) => {
        const total = history.reduce((sum, r) => sum + r, 0);
        const result = annualHeatingUse(history);
        expect(result).toBeGreaterThanOrEqual(0);
        // Allow no slack on the upper bound beyond floating-point equality: the
        // honest result must not exceed the total.
        expect(result).toBeLessThanOrEqual(total);
      }),
    );
  });

  it("returns a finite number for any valid 12-element non-negative history (Req 4.4)", () => {
    fc.assert(
      fc.property(twelveNonNegativeReadings, (history) => {
        const result = annualHeatingUse(history);
        expect(Number.isFinite(result)).toBe(true);
      }),
    );
  });

  it("throws for histories that are not exactly 12 elements (Req 4.3)", () => {
    const wrongLength = fc
      .array(nonNegativeFuelUseArb, { minLength: 0, maxLength: 24 })
      .filter((a) => a.length !== 12);
    fc.assert(
      fc.property(wrongLength, (history) => {
        expect(() => annualHeatingUse(history)).toThrow();
      }),
    );
  });

  it("throws for 12-element histories containing a negative value (Req 4.3)", () => {
    const withNegative = fc
      .tuple(
        twelveNonNegativeReadings,
        fc.integer({ min: 0, max: 11 }),
        fc.double({
          min: Math.fround(-1e6),
          max: Math.fround(-0.0001),
          noNaN: true,
          noDefaultInfinity: true,
        }),
      )
      .map(([history, index, negative]) => {
        const next = history.slice();
        next[index] = negative;
        return next;
      });
    fc.assert(
      fc.property(withNegative, (history) => {
        expect(() => annualHeatingUse(history)).toThrow();
      }),
    );
  });
});

describe("fuelEnergyContentKWh", () => {
  // Property 9 — Validates: Requirement 4.7
  it("Property 9: zero fuel yields zero delivered heat for any type and efficiency > 0", () => {
    fc.assert(
      fc.property(heatingTypeArb, positiveEfficiencyArb, (type, efficiency) => {
        expect(fuelEnergyContentKWh(type, 0, efficiency)).toBe(0);
      }),
    );
  });

  it("returns a finite number >= 0 for any non-negative fuel use (Req 4.5/4.7)", () => {
    fc.assert(
      fc.property(
        heatingTypeArb,
        nonNegativeFuelUseArb,
        positiveEfficiencyArb,
        (type, fuelUse, efficiency) => {
          const result = fuelEnergyContentKWh(type, fuelUse, efficiency);
          expect(Number.isFinite(result)).toBe(true);
          expect(result).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });

  it("is monotonic non-decreasing in fuelUse for fixed type and efficiency (Req 4.5)", () => {
    fc.assert(
      fc.property(
        heatingTypeArb,
        nonNegativeFuelUseArb,
        nonNegativeFuelUseArb,
        positiveEfficiencyArb,
        (type, a, b, efficiency) => {
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          const resultLo = fuelEnergyContentKWh(type, lo, efficiency);
          const resultHi = fuelEnergyContentKWh(type, hi, efficiency);
          expect(resultLo).toBeLessThanOrEqual(resultHi);
        },
      ),
    );
  });
});
