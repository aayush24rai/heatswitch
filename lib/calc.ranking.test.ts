/**
 * Property-based and unit tests for the building ranking functions in
 * `lib/calc.ts` (task 2.10): `opportunityScore`, `opportunityLabel`, and
 * `rankBuildings` over the `BerdoBuilding` model (lib/schema.ts).
 *
 * Encoded correctness properties (design.md "Correctness Properties"):
 * - Property 8: Ranking is a sorted permutation — Validates: Requirement 8.7
 *     For all building lists and any zip (null or 5-digit, including a zip
 *     drawn from the list so filtering is exercised), rankBuildings(buildings,
 *     zip) returns EXACTLY the zip-matching subset — no rows invented, none
 *     dropped (a permutation of the matching subset) — sorted by score
 *     DESCENDING. The input array is never mutated and every returned
 *     percentile is in [0, 100].
 *
 * Supporting unit tests (Requirement 8.6):
 * - opportunityLabel monotonicity: a higher percentile never yields a lower
 *   label under the ordering Low < Medium < High; plus the exact cutoffs.
 * - Zip filtering: filter to a single zip, null keeps all rows, a zip with no
 *   matches returns [].
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  opportunityLabel,
  opportunityScore,
  rankBuildings,
} from "@/lib/calc";
import type { BerdoBuilding, OpportunityLabel } from "@/lib/schema";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

// A finite non-negative number for the numeric building fields.
const finiteNonNeg = (max: number) =>
  fc.double({ min: 0, max, noNaN: true, noDefaultInfinity: true });

// 5-digit "02xxx" zips (Boston-style) plus a couple of other 5-digit zips so
// filtering has multiple candidate buckets to partition the list by.
const zipArb = fc.constantFrom(
  "02118",
  "02119",
  "02120",
  "02130",
  "02215",
  "01230",
  "10001",
);

// Property types: include the multifamily cohort (which drives the percentile
// cohort) and several non-multifamily types so the cohort is a strict subset.
const propertyTypeArb = fc.constantFrom(
  "Multifamily Housing",
  "Mixed Use Property, Multifamily Housing",
  "Office",
  "Retail Store",
  "Hospital",
  "K-12 School",
);

// electricShare in [0,1]; sometimes exactly 1 to exercise the electric-
// resistance bonus branch in opportunityScore.
const electricShareArb = fc.oneof(
  fc.constant(1),
  fc.constant(0),
  fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
);

// gasShare is a fraction in [0,1] OR null (unknown, NOT zero — Req 8.5).
const gasShareArb = fc.oneof(
  fc.constant<null>(null),
  fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
);

const berdoBuildingArb: fc.Arbitrary<BerdoBuilding> = fc.record({
  id: fc.uuid(),
  zip: zipArb,
  propertyType: propertyTypeArb,
  yearBuilt: fc.integer({ min: 1800, max: 2024 }),
  grossFloorAreaSqFt: finiteNonNeg(2_000_000),
  siteEUI: finiteNonNeg(400),
  ghgEmissions: finiteNonNeg(5000),
  electricShare: electricShareArb,
  gasShare: gasShareArb,
});

// A list of buildings with unique ids so multiset identity is unambiguous.
const buildingsArb: fc.Arbitrary<BerdoBuilding[]> = fc
  .array(berdoBuildingArb, { minLength: 0, maxLength: 30 })
  .map((list) =>
    // Ensure unique ids regardless of uuid collisions (astronomically rare,
    // but we want a deterministic multiset check keyed by id).
    list.map((b, i) => ({ ...b, id: `${i}:${b.id}` })),
  );

// A zip chosen either as null, a value drawn from the list (to force the
// filter to match real rows), or an arbitrary 5-digit zip (possibly matching
// nothing).
const zipChoiceArb = (
  buildings: BerdoBuilding[],
): fc.Arbitrary<string | null> => {
  const fromList =
    buildings.length > 0
      ? fc.constantFrom(...buildings.map((b) => b.zip))
      : fc.constant(null);
  return fc.oneof(fc.constant<string | null>(null), fromList, zipArb);
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The subset of input ids that the zip filter should keep. A 5-digit zip
 *  keeps only exact matches; null (or any non-5-digit value) keeps all. */
function expectedMatchingIds(
  buildings: BerdoBuilding[],
  zip: string | null,
): string[] {
  const applyFilter = zip !== null && /^\d{5}$/.test(zip);
  return buildings
    .filter((b) => !applyFilter || b.zip === zip)
    .map((b) => b.id);
}

/** Multiset equality for id lists (order-independent). */
function sameMultiset(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const count = new Map<string, number>();
  for (const id of a) count.set(id, (count.get(id) ?? 0) + 1);
  for (const id of b) {
    const n = count.get(id);
    if (n === undefined || n === 0) return false;
    count.set(id, n - 1);
  }
  return [...count.values()].every((n) => n === 0);
}

// ---------------------------------------------------------------------------
// Property 8: Ranking is a sorted permutation — Validates: Requirement 8.7
// ---------------------------------------------------------------------------

describe("rankBuildings — Property 8 (sorted permutation)", () => {
  it("returns exactly the zip-matching subset, sorted by score descending, without mutating input or inventing rows", () => {
    fc.assert(
      fc.property(
        buildingsArb.chain((buildings) =>
          fc.tuple(fc.constant(buildings), zipChoiceArb(buildings)),
        ),
        ([buildings, zip]) => {
          // Deep copy before the call to prove the input is never mutated (c).
          const before = JSON.parse(JSON.stringify(buildings));

          const result = rankBuildings(buildings, zip);

          // (a) The multiset of returned ids equals the multiset of input ids
          // whose zip matches (or all ids when zip is null/non-5-digit) — no
          // rows invented, none dropped (permutation of the matching subset).
          const expectedIds = expectedMatchingIds(buildings, zip);
          const resultIds = result.map((r) => r.id);
          expect(resultIds.length).toBe(expectedIds.length);
          expect(sameMultiset(resultIds, expectedIds)).toBe(true);

          // (b) Scores are non-increasing down the list (sorted descending).
          for (let i = 1; i < result.length; i += 1) {
            expect(result[i - 1].score).toBeGreaterThanOrEqual(
              result[i].score,
            );
          }

          // (c) The input array is NOT mutated (deep-equal to the copy).
          expect(buildings).toEqual(before);

          // (d) Every returned percentile is in [0, 100].
          for (const r of result) {
            expect(r.percentile).toBeGreaterThanOrEqual(0);
            expect(r.percentile).toBeLessThanOrEqual(100);
          }
        },
      ),
    );
  });

  it("annotates each returned row with a finite score and a label consistent with its percentile", () => {
    fc.assert(
      fc.property(
        buildingsArb.chain((buildings) =>
          fc.tuple(fc.constant(buildings), zipChoiceArb(buildings)),
        ),
        ([buildings, zip]) => {
          const result = rankBuildings(buildings, zip);
          for (const r of result) {
            expect(Number.isFinite(r.score)).toBe(true);
            expect(r.label).toBe(opportunityLabel(r.percentile));
          }
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// opportunityScore — finiteness (supports Property 8 preconditions, Req 8.6)
// ---------------------------------------------------------------------------

describe("opportunityScore", () => {
  it("returns a finite number for any valid building (including null gasShare)", () => {
    fc.assert(
      fc.property(berdoBuildingArb, (b) => {
        expect(Number.isFinite(opportunityScore(b))).toBe(true);
      }),
    );
  });

  it("treats null gasShare as unknown (no gas term), not as zero", () => {
    const base: BerdoBuilding = {
      id: "x",
      zip: "02118",
      propertyType: "Multifamily Housing",
      yearBuilt: 1920,
      grossFloorAreaSqFt: 10000,
      siteEUI: 100,
      ghgEmissions: 200,
      electricShare: 0,
      gasShare: null,
    };
    // null and 0 both contribute no gas term, so their scores match; a positive
    // gas share must score strictly higher.
    const withZero: BerdoBuilding = { ...base, gasShare: 0 };
    const withHalf: BerdoBuilding = { ...base, gasShare: 0.5 };
    expect(opportunityScore(base)).toBe(opportunityScore(withZero));
    expect(opportunityScore(withHalf)).toBeGreaterThan(opportunityScore(base));
  });
});

// ---------------------------------------------------------------------------
// opportunityLabel — monotonicity and cutoffs — Validates: Requirement 8.6
// ---------------------------------------------------------------------------

// Ordering Low < Medium < High for the monotonicity check.
const LABEL_RANK: Record<OpportunityLabel, number> = {
  Low: 0,
  Medium: 1,
  High: 2,
};

describe("opportunityLabel — monotonicity (Req 8.6)", () => {
  it("never yields a lower label for a higher percentile (p1 <= p2 => rank(p1) <= rank(p2))", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
        (a, b) => {
          const p1 = Math.min(a, b);
          const p2 = Math.max(a, b);
          expect(LABEL_RANK[opportunityLabel(p1)]).toBeLessThanOrEqual(
            LABEL_RANK[opportunityLabel(p2)],
          );
        },
      ),
    );
  });

  it("uses the documented cutoffs (0->Low, 33->Medium, 67->High, 100->High)", () => {
    expect(opportunityLabel(0)).toBe("Low");
    expect(opportunityLabel(32.99)).toBe("Low");
    expect(opportunityLabel(33)).toBe("Medium");
    expect(opportunityLabel(66.99)).toBe("Medium");
    expect(opportunityLabel(67)).toBe("High");
    expect(opportunityLabel(100)).toBe("High");
  });

  it("clamps out-of-range percentiles so the function stays total and monotonic", () => {
    expect(opportunityLabel(-10)).toBe("Low");
    expect(opportunityLabel(1000)).toBe("High");
  });
});

// ---------------------------------------------------------------------------
// rankBuildings — zip filtering unit tests — Validates: Requirement 8.7
// ---------------------------------------------------------------------------

describe("rankBuildings — zip filtering", () => {
  const mk = (id: string, zip: string): BerdoBuilding => ({
    id,
    zip,
    propertyType: "Multifamily Housing",
    yearBuilt: 1950,
    grossFloorAreaSqFt: 10000,
    siteEUI: 100 + Number(id), // distinct scores so ordering is deterministic
    ghgEmissions: 100,
    electricShare: 0,
    gasShare: null,
  });

  const list: BerdoBuilding[] = [
    mk("1", "02118"),
    mk("2", "02119"),
    mk("3", "02118"),
    mk("4", "02130"),
  ];

  it("returns only rows matching the requested zip", () => {
    const result = rankBuildings(list, "02118");
    expect(result.map((r) => r.id).sort()).toEqual(["1", "3"]);
    expect(result.every((r) => r.zip === "02118")).toBe(true);
  });

  it("returns all rows when zip is null", () => {
    const result = rankBuildings(list, null);
    expect(result.map((r) => r.id).sort()).toEqual(["1", "2", "3", "4"]);
  });

  it("returns an empty array when the zip matches nothing", () => {
    const result = rankBuildings(list, "02215");
    expect(result).toEqual([]);
  });

  it("sorts the matching subset by score descending", () => {
    const result = rankBuildings(list, null);
    // siteEUI drives the score here; higher id => higher siteEUI => higher score.
    expect(result.map((r) => r.id)).toEqual(["4", "3", "2", "1"]);
  });
});
