/**
 * Property-based and unit tests for the building ranking functions in
 * `lib/calc.ts`: `opportunityScore`, `opportunityLabel`, and `rankBuildings`
 * over the `BerdoBuilding` model (lib/schema.ts).
 *
 * Task 9.3 reworked these from the task-2 placeholders ("fuller tests in 9.3")
 * into full coverage of the task-9 cohort-only, deduped, split ranking. The
 * file has two halves:
 *
 *   (1) ARBITRARY / UNIT invariants — fast-check and example tests over
 *       synthetic inputs (cohort-only output, dedupe, check-data sorts last,
 *       top row is valid, percentile/label range, input not mutated, the
 *       all-electric High override, zip filtering, and opportunityScore /
 *       opportunityLabel).
 *
 *   (2) REAL-DATASET assertions — load the committed
 *       `data/berdo-2021/buildings.json` and assert the required facts over the
 *       real cohort (no non-cohort rows, no duplicate tuples, check-data sorts
 *       last, top row EUI <= 300, and at least one of each label).
 *
 * Validates: Requirements 8.6, 8.7, 8.8.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { opportunityLabel, opportunityScore, rankBuildings } from "@/lib/calc";
import type { BerdoBuilding, OpportunityLabel } from "@/lib/schema";

// ---------------------------------------------------------------------------
// Shared helpers (MIRROR the private rules in lib/calc.ts so tests can state
// the contract without importing non-exported internals).
// ---------------------------------------------------------------------------

/** The cohort predicate used by rankBuildings: trimmed, case-insensitive
 *  propertyType is exactly "multifamily housing" or "condo main". */
const isCohortType = (t: string) => {
  const n = t.trim().toLowerCase();
  return n === "multifamily housing" || n === "condo main";
};

/** The exact-tuple dedupe key used by rankBuildings. */
const tupleKey = (r: {
  propertyType: string;
  yearBuilt: number;
  grossFloorAreaSqFt: number;
  siteEUI: number;
  zip: string;
}) =>
  JSON.stringify([
    r.propertyType,
    r.yearBuilt,
    r.grossFloorAreaSqFt,
    r.siteEUI,
    r.zip,
  ]);

/** EUI above which a row is check-data (mirrors CHECK_DATA_EUI in lib/calc.ts). */
const CHECK_DATA_EUI = 300;

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

// Property types: include the cohort (Multifamily Housing / CONDO MAIN, with a
// case/whitespace variant to exercise the trim+lowercase predicate) and several
// non-cohort types so the cohort is always a strict subset.
const propertyTypeArb = fc.constantFrom(
  "Multifamily Housing",
  " multifamily housing ", // case/whitespace variant — still cohort
  "CONDO MAIN",
  "Mixed Use Property, Multifamily Housing", // NOT cohort (substring only)
  "Office",
  "Retail Store",
  "Hospital",
  "K-12 School",
);

// electricShare in [0,1]; sometimes exactly 1 to exercise the all-electric
// High override branch.
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
  // siteEUI up to 400 so EUI>300 check-data rows are generated regularly.
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
    // but we want a deterministic identity keyed by id).
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

// A COHORT-ONLY arbitrary (every row is "Multifamily Housing") used where a
// test needs to guarantee at least one valid cohort row survives.
const cohortOnlyBuildingArb: fc.Arbitrary<BerdoBuilding> = berdoBuildingArb.map(
  (b) => ({ ...b, propertyType: "Multifamily Housing" }),
);

// ---------------------------------------------------------------------------
// rankBuildings — required structural invariants over arbitrary input.
//   Validates: Requirement 8.7, 8.8.
// ---------------------------------------------------------------------------

describe("rankBuildings — structural invariants (arbitrary input)", () => {
  // REQUIRED #1: NO NON-COHORT ROWS in the output.
  it("output contains only cohort rows — non-cohort property types never appear", () => {
    fc.assert(
      fc.property(
        buildingsArb.chain((buildings) =>
          fc.tuple(fc.constant(buildings), zipChoiceArb(buildings)),
        ),
        ([buildings, zip]) => {
          const result = rankBuildings(buildings, zip);
          for (const r of result) {
            expect(isCohortType(r.propertyType)).toBe(true);
          }
        },
      ),
    );
  });

  // REQUIRED #2 (part A): NO DUPLICATE ROWS over arbitrary input.
  it("output never contains two rows with the same (type, year, area, EUI, zip) tuple", () => {
    fc.assert(
      fc.property(
        buildingsArb.chain((buildings) =>
          fc.tuple(fc.constant(buildings), zipChoiceArb(buildings)),
        ),
        ([buildings, zip]) => {
          const result = rankBuildings(buildings, zip);
          const keys = result.map(tupleKey);
          expect(new Set(keys).size).toBe(keys.length);
        },
      ),
    );
  });

  // REQUIRED #2 (part B): a deliberate exact duplicate is dropped (first kept).
  it("drops an exact-tuple duplicate, keeping the first occurrence", () => {
    const first: BerdoBuilding = {
      id: "first",
      zip: "02118",
      propertyType: "Multifamily Housing",
      yearBuilt: 1950,
      grossFloorAreaSqFt: 10000,
      siteEUI: 100,
      ghgEmissions: 100,
      electricShare: 0.2,
      gasShare: 0.8,
    };
    // Identical on every tuple field; only id differs so we can tell them apart.
    const dup: BerdoBuilding = { ...first, id: "second" };
    const result = rankBuildings([first, dup], null);
    expect(result.map((r) => r.id)).toEqual(["first"]);
    // And the tuple appears exactly once.
    expect(result.filter((r) => tupleKey(r) === tupleKey(first)).length).toBe(1);
  });

  // REQUIRED #3: CHECK-DATA ROWS ALWAYS SORT LAST — once a check-data row
  // appears, no valid row appears after it (all valid precede all check-data).
  it("places every valid row before every check-data row", () => {
    fc.assert(
      fc.property(
        // Guarantee a mix of EUI>300 and EUI<=300 cohort rows by mapping into a
        // cohort-only list and splitting siteEUI around the 300 boundary.
        fc
          .array(cohortOnlyBuildingArb, { minLength: 1, maxLength: 30 })
          .map((list) =>
            list.map((b, i) => ({
              ...b,
              id: `${i}`,
              // alternate deliberately across the check-data boundary.
              siteEUI: i % 2 === 0 ? 100 + (i % 150) : 310 + (i % 50),
            })),
          ),
        (buildings) => {
          const result = rankBuildings(buildings, null);
          let sawCheckData = false;
          for (const r of result) {
            if (r.checkData) {
              sawCheckData = true;
              expect(r.siteEUI).toBeGreaterThan(CHECK_DATA_EUI);
            } else {
              // A valid row after a check-data row would violate the contract.
              expect(sawCheckData).toBe(false);
              expect(r.siteEUI).toBeLessThanOrEqual(CHECK_DATA_EUI);
            }
          }
        },
      ),
    );
  });

  // REQUIRED #4: the TOP ROW has EUI <= 300 whenever at least one valid row
  // exists (a check-data row is never first unless every cohort row is
  // check-data).
  it("ranks a valid row (EUI <= 300) first whenever any valid cohort row exists", () => {
    fc.assert(
      fc.property(
        // At least one guaranteed valid cohort row (EUI <= 300) plus arbitrary
        // extras (which may be check-data or non-cohort).
        fc.tuple(
          cohortOnlyBuildingArb.map((b) => ({
            ...b,
            id: "guaranteed-valid",
            siteEUI: 120, // well within the valid band
          })),
          buildingsArb,
        ),
        ([guaranteed, rest]) => {
          const buildings = [guaranteed, ...rest];
          const result = rankBuildings(buildings, null);
          // There is at least one valid cohort row, so the output is non-empty
          // and its first row must be valid.
          expect(result.length).toBeGreaterThan(0);
          expect(result[0].checkData).toBe(false);
          expect(result[0].siteEUI).toBeLessThanOrEqual(CHECK_DATA_EUI);
        },
      ),
    );
  });

  // Supporting: input is never mutated (deep-equal before/after).
  it("does not mutate the input array", () => {
    fc.assert(
      fc.property(
        buildingsArb.chain((buildings) =>
          fc.tuple(fc.constant(buildings), zipChoiceArb(buildings)),
        ),
        ([buildings, zip]) => {
          const before = JSON.parse(JSON.stringify(buildings));
          rankBuildings(buildings, zip);
          expect(buildings).toEqual(before);
        },
      ),
    );
  });

  // Supporting: percentile/label are null exactly for check-data rows; valid
  // rows get a number in [0, 100] and a non-null label consistent with its
  // band (unless the all-electric override forced "High").
  it("assigns null percentile/label to exactly the check-data rows and a valid band to the rest", () => {
    fc.assert(
      fc.property(
        buildingsArb.chain((buildings) =>
          fc.tuple(fc.constant(buildings), zipChoiceArb(buildings)),
        ),
        ([buildings, zip]) => {
          const result = rankBuildings(buildings, zip);
          for (const r of result) {
            expect(Number.isFinite(r.score)).toBe(true);
            if (r.checkData) {
              expect(r.siteEUI).toBeGreaterThan(CHECK_DATA_EUI);
              expect(r.percentile).toBeNull();
              expect(r.label).toBeNull();
            } else {
              expect(r.siteEUI).toBeLessThanOrEqual(CHECK_DATA_EUI);
              expect(r.percentile).not.toBeNull();
              const p = r.percentile as number;
              expect(p).toBeGreaterThanOrEqual(0);
              expect(p).toBeLessThanOrEqual(100);
              if (r.electricResistanceWin) {
                expect(r.label).toBe<OpportunityLabel>("High");
              } else {
                expect(r.label).toBe(opportunityLabel(p));
              }
            }
          }
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// rankBuildings — all-electric High override.
//   Validates: Requirement 8.8 (electric-resistance win).
// ---------------------------------------------------------------------------

describe("rankBuildings — all-electric High override", () => {
  // A deterministic valid cohort. The valid siteEUIs are
  // [200, 70, 60, 50, 80, 55]; sorted [50,55,60,70,80,200], n=6 =>
  // pos = (6-1)*0.75 = 3.75 => interpolate between 70 and 80 => threshold 77.5.
  // So an all-electric row with EUI 80 (>= 77.5) IS forced High, while an
  // all-electric row with EUI 55 (< 77.5) is NOT.
  const mk = (
    id: string,
    siteEUI: number,
    electricShare: number,
    gasShare: number | null,
  ): BerdoBuilding => ({
    id,
    zip: "02118",
    propertyType: "Multifamily Housing",
    yearBuilt: 1950,
    grossFloorAreaSqFt: 10000,
    siteEUI,
    ghgEmissions: 100,
    electricShare,
    gasShare,
  });

  const fixture: BerdoBuilding[] = [
    mk("f1", 200, 0, 1), // highest fossil score (percentile 100, High)
    mk("f2", 70, 0, 1),
    mk("f3", 60, 0, 1),
    mk("f4", 50, 0, 1), // low-percentile valid fossil row
    mk("ae-win", 80, 1, 0), // all-electric, EUI 80 >= 77.5 => forced High
    mk("ae-low", 55, 1, 0), // all-electric, EUI 55 < 77.5 => NOT forced High
  ];

  it("forces a qualifying all-electric row to High, flags it, and sorts it with the High group", () => {
    const result = rankBuildings(fixture, null);
    const byId = new Map(result.map((r) => [r.id, r]));

    const aeWin = byId.get("ae-win")!;
    expect(aeWin.electricResistanceWin).toBe(true);
    expect(aeWin.label).toBe<OpportunityLabel>("High");
    // Its fossil score is 0, yet it must sort ABOVE a lower-percentile valid
    // fossil row (f4, percentile 50) — proof it rode up with the High group.
    const posWin = result.findIndex((r) => r.id === "ae-win");
    const posF4 = result.findIndex((r) => r.id === "f4");
    expect(posWin).toBeLessThan(posF4);
    // In this fixture it is the single biggest win and sorts at the very top.
    expect(result[0].id).toBe("ae-win");
  });

  it("does NOT force a below-threshold all-electric row to High", () => {
    const result = rankBuildings(fixture, null);
    const aeLow = result.find((r) => r.id === "ae-low")!;
    expect(aeLow.electricResistanceWin).toBe(false);
    // score 0 => bottom percentile => Low band (not overridden).
    expect(aeLow.label).toBe<OpportunityLabel>("Low");
  });
});

// ---------------------------------------------------------------------------
// opportunityScore — fossil-intensity contract.
//   Validates: Requirement 8.6.
// ---------------------------------------------------------------------------

describe("opportunityScore", () => {
  it("is finite, non-negative, and equals siteEUI × clamp(gasShare ?? 1−electricShare, 0, 1)", () => {
    fc.assert(
      fc.property(berdoBuildingArb, (b) => {
        const s = opportunityScore(b);
        expect(Number.isFinite(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(0);
        const rawFossil = b.gasShare ?? 1 - b.electricShare;
        const fossilFraction = Math.min(1, Math.max(0, rawFossil));
        expect(s).toBeCloseTo(b.siteEUI * fossilFraction, 9);
      }),
    );
  });

  it("scores an all-electric building at 0 (gasShare 0 or null)", () => {
    const base: BerdoBuilding = {
      id: "x",
      zip: "02118",
      propertyType: "Multifamily Housing",
      yearBuilt: 1920,
      grossFloorAreaSqFt: 10000,
      siteEUI: 100,
      ghgEmissions: 200,
      electricShare: 1,
      gasShare: 0,
    };
    expect(opportunityScore(base)).toBe(0);
    expect(opportunityScore({ ...base, gasShare: null })).toBe(0);
  });

  it("uses a present gasShare directly as the fossil fraction", () => {
    const b: BerdoBuilding = {
      id: "x",
      zip: "02118",
      propertyType: "Multifamily Housing",
      yearBuilt: 1920,
      grossFloorAreaSqFt: 10000,
      siteEUI: 100,
      ghgEmissions: 200,
      electricShare: 0.9, // deliberately inconsistent with gasShare to prove
      gasShare: 0.5, // gasShare wins when present
    };
    expect(opportunityScore(b)).toBeCloseTo(50, 10);
  });

  it("falls back to (1 − electricShare) when gasShare is null", () => {
    const b: BerdoBuilding = {
      id: "x",
      zip: "02118",
      propertyType: "Multifamily Housing",
      yearBuilt: 1920,
      grossFloorAreaSqFt: 10000,
      siteEUI: 100,
      ghgEmissions: 200,
      electricShare: 0.25, // => fallback fossil fraction = 0.75
      gasShare: null,
    };
    expect(opportunityScore(b)).toBeCloseTo(75, 10);
  });
});

// ---------------------------------------------------------------------------
// opportunityLabel — bands, monotonicity, clamping.
//   Validates: Requirement 8.6, 8.8.
// ---------------------------------------------------------------------------

// Ordering Low < Medium < High for the monotonicity check.
const LABEL_RANK: Record<OpportunityLabel, number> = {
  Low: 0,
  Medium: 1,
  High: 2,
};

describe("opportunityLabel", () => {
  it("never yields a lower label for a higher percentile (monotonic)", () => {
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

  it("uses the 40/75 bands: High >= 75, Medium 40–<75, Low < 40", () => {
    expect(opportunityLabel(0)).toBe("Low");
    expect(opportunityLabel(39.99)).toBe("Low");
    expect(opportunityLabel(40)).toBe("Medium");
    expect(opportunityLabel(74.99)).toBe("Medium");
    expect(opportunityLabel(75)).toBe("High");
    expect(opportunityLabel(100)).toBe("High");
  });

  it("clamps out-of-range percentiles so the function stays total and monotonic", () => {
    expect(opportunityLabel(-10)).toBe("Low");
    expect(opportunityLabel(1000)).toBe("High");
  });
});

// ---------------------------------------------------------------------------
// rankBuildings — zip filtering unit tests.
//   Validates: Requirement 8.7.
// ---------------------------------------------------------------------------

describe("rankBuildings — zip filtering", () => {
  const mk = (id: string, zip: string): BerdoBuilding => ({
    id,
    zip,
    propertyType: "Multifamily Housing",
    yearBuilt: 1950,
    grossFloorAreaSqFt: 10000 + Number(id), // keep tuples distinct
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

  it("returns the whole cohort when zip is null", () => {
    const result = rankBuildings(list, null);
    expect(result.map((r) => r.id).sort()).toEqual(["1", "2", "3", "4"]);
  });

  it("returns an empty array when no cohort row matches the zip", () => {
    const result = rankBuildings(list, "02215");
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (2) REAL-DATASET assertions over the committed buildings.json.
//     Validates: Requirement 8.6, 8.7, 8.8.
//
// We read + JSON.parse rather than `import` the JSON so tsc doesn't build a
// type from the 1,200+ row literal, mirroring buildings.cleaning.test.ts and
// how the dataset is treated as a static data file.
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const realBuildings = JSON.parse(
  readFileSync(
    resolve(__dirname, "../data/berdo-2021/buildings.json"),
    "utf8",
  ),
) as BerdoBuilding[];

describe("rankBuildings — real BERDO 2021 dataset", () => {
  const ranked = rankBuildings(realBuildings, null);
  const validRows = ranked.filter((r) => !r.checkData);
  const checkRows = ranked.filter((r) => r.checkData);

  it("loads a non-trivial cohort to assert over", () => {
    // Sanity: the real cohort is large (observed 431 valid + 1 check-data).
    expect(ranked.length).toBeGreaterThan(100);
    expect(validRows.length).toBeGreaterThan(100);
  });

  // REQUIRED #1: NO NON-COHORT ROWS.
  it("output contains only cohort rows (Multifamily Housing / CONDO MAIN)", () => {
    for (const r of ranked) {
      expect(isCohortType(r.propertyType)).toBe(true);
    }
  });

  // REQUIRED #2: NO DUPLICATE ROWS.
  it("has no duplicate (type, year, area, EUI, zip) tuple", () => {
    const keys = ranked.map(tupleKey);
    expect(keys.length - new Set(keys).size).toBe(0);
  });

  // REQUIRED #3: CHECK-DATA ROWS ALWAYS SORT LAST.
  it("places all valid rows before all check-data rows", () => {
    let sawCheckData = false;
    for (const r of ranked) {
      if (r.checkData) {
        sawCheckData = true;
        expect(r.siteEUI).toBeGreaterThan(CHECK_DATA_EUI);
        expect(r.percentile).toBeNull();
        expect(r.label).toBeNull();
      } else {
        expect(sawCheckData).toBe(false);
      }
    }
    // The real dataset has at least one check-data row to make this meaningful.
    expect(checkRows.length).toBeGreaterThan(0);
  });

  // REQUIRED #4: TOP ROW HAS EUI <= 300.
  it("ranks a valid row (EUI <= 300) first", () => {
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0].checkData).toBe(false);
    expect(ranked[0].siteEUI).toBeLessThanOrEqual(CHECK_DATA_EUI);
  });

  // REQUIRED #5: AT LEAST ONE OF EACH LABEL among the valid rows.
  it("spreads at least one High, one Medium, and one Low across the valid cohort", () => {
    const labels = new Set(validRows.map((r) => r.label));
    expect(labels.has("High")).toBe(true);
    expect(labels.has("Medium")).toBe(true);
    expect(labels.has("Low")).toBe(true);
  });
});
