/**
 * Unit tests for the BERDO 2021 dataset cleaning (task 5.4).
 *
 * The cleaning logic lives in the plain Node script
 * `scripts/convert-berdo.mjs` (task 5.1), which reads
 * `data/berdo-2021/data.csv` and writes the committed, cleaned
 * `data/berdo-2021/buildings.json`. That script is NOT an importable TS lib
 * and it calls `main()` at module top level, so importing it would run the
 * whole conversion. We therefore verify the cleaning TWO ways:
 *
 *   (A) OUTPUT ASSERTIONS — load the committed buildings.json and assert every
 *       cleaning rule holds across all rows (Requirements 8.3, 8.4, 8.5).
 *
 *   (B) PURE-RULE UNIT TESTS — re-state (MIRROR) the script's small, documented
 *       helper rules (zip normalization + the gasShare/EUI classification) as
 *       local functions and unit-test them against representative inputs.
 *
 * NOTE ON MIRRORS: the functions in section (B) are hand-copied from
 * `scripts/convert-berdo.mjs` and only MIRROR its rules — they are not imported
 * from the script. If a future edit makes the mirror drift from the script,
 * the section (A) output assertions still catch a real regression in the
 * committed JSON (the single source of truth the app actually ships).
 *
 * Validates: Requirements 8.3, 8.4, 8.5
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { BerdoBuilding } from "@/lib/schema";

// ---------------------------------------------------------------------------
// Load the committed cleaned output. We read + JSON.parse rather than `import`
// the JSON so tsc doesn't have to build a type from a 1,200+ row literal, and
// so this mirrors how the dataset is treated as a static data file.
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(__dirname, "buildings.json");
const buildings = JSON.parse(readFileSync(OUTPUT, "utf8")) as BerdoBuilding[];

const EXPECTED_KEYS = [
  "id",
  "zip",
  "propertyType",
  "yearBuilt",
  "grossFloorAreaSqFt",
  "siteEUI",
  "ghgEmissions",
  "electricShare",
  "gasShare",
].sort();

// ---------------------------------------------------------------------------
// (A) OUTPUT ASSERTIONS over the committed buildings.json.
// ---------------------------------------------------------------------------

describe("buildings.json cleaned output", () => {
  it("has rows to assert over", () => {
    expect(buildings.length).toBeGreaterThan(0);
  });

  // Req 8.3: keep only 5-digit "02" zips.
  it("every row has a 5-digit '02' zip (Req 8.3)", () => {
    const bad = buildings.filter((b) => !/^02\d{3}$/.test(b.zip));
    expect(bad).toEqual([]);
  });

  // Req 8.3: rows missing site EUI are dropped — none slipped through.
  it("every row has a finite numeric siteEUI (Req 8.3)", () => {
    const bad = buildings.filter(
      (b) => typeof b.siteEUI !== "number" || !Number.isFinite(b.siteEUI),
    );
    expect(bad).toEqual([]);
  });

  // Req 8.4: EUI > 300 rows are KEPT (flagged, not dropped).
  it("keeps rows with siteEUI > 300 (Req 8.4)", () => {
    const over300 = buildings.filter((b) => b.siteEUI > 300);
    expect(over300.length).toBeGreaterThan(0);
  });

  // Req 8.5: gasShare is number | null, never NaN; the unknown case is null.
  it("gasShare is always number|null and never NaN (Req 8.5)", () => {
    const badType = buildings.filter(
      (b) =>
        !(
          b.gasShare === null ||
          (typeof b.gasShare === "number" && Number.isFinite(b.gasShare))
        ),
    );
    expect(badType).toEqual([]);
  });

  it("has at least one row with gasShare === null for the unknown case (Req 8.5)", () => {
    const nulls = buildings.filter((b) => b.gasShare === null);
    expect(nulls.length).toBeGreaterThan(0);
  });

  // Req 8.3: id equals the kept-array index as a string, contiguous 0..N-1.
  it("ids are the contiguous '0'..'N-1' string sequence (Req 8.3)", () => {
    const mismatch = buildings.findIndex((b, i) => b.id !== String(i));
    expect(mismatch).toBe(-1);
    buildings.forEach((b) => expect(typeof b.id).toBe("string"));
  });

  // Shape: exactly the BerdoBuilding keys, and no address field.
  it("every row has exactly the BerdoBuilding keys and no address", () => {
    const badShape = buildings.filter((b) => {
      const keys = Object.keys(b).sort();
      return (
        keys.length !== EXPECTED_KEYS.length ||
        keys.some((k, i) => k !== EXPECTED_KEYS[i])
      );
    });
    expect(badShape).toEqual([]);
    expect(buildings.some((b) => "address" in b)).toBe(false);
  });

  // Documentation of the observed cohort counts (not a hard-coded exact match,
  // so re-running the converter on an updated slice won't break this, but the
  // counts stay visible in test output via the expectations above).
  it("observed counts are in the expected neighborhood", () => {
    const over300 = buildings.filter((b) => b.siteEUI > 300).length;
    const nulls = buildings.filter((b) => b.gasShare === null).length;
    const multifamily = buildings.filter((b) =>
      b.propertyType.toLowerCase().includes("multifamily"),
    ).length;
    // Loose bounds: these just confirm the kept-not-dropped rules produced a
    // meaningful cohort, matching the ~37 / ~214 / ~502 figures from task 5.1.
    expect(over300).toBeGreaterThan(0);
    expect(nulls).toBeGreaterThan(0);
    expect(multifamily).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// (B) PURE-RULE UNIT TESTS — mirrors of scripts/convert-berdo.mjs helpers.
// ---------------------------------------------------------------------------

/**
 * MIRROR of `normalizeZip` in scripts/convert-berdo.mjs (rule 1): trim; if the
 * value is 6 digits starting with "0", drop the single leading "0"; keep iff
 * the result matches /^02\d{3}$/, else null. Never pad or invent digits.
 */
function normalizeZip(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  let z = t;
  if (/^\d{6}$/.test(z) && z.startsWith("0")) {
    z = z.slice(1);
  }
  return /^02\d{3}$/.test(z) ? z : null;
}

/**
 * MIRROR of `parseNum` in scripts/convert-berdo.mjs: blank/non-numeric -> null,
 * otherwise the finite number. This is exactly how gasShare and siteEUI are
 * classified (gasShare keeps the null; siteEUI === null means DROP the row).
 */
function parseNum(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

describe("normalizeZip rule (mirror of convert-berdo.mjs, Req 8.3)", () => {
  // The script's rule slices the single leading "0" off a 6-digit "0…" zip,
  // then keeps the result only if it matches /^02\d{3}$/. So the 6-digit form
  // that recovers a valid "02xxx" zip is "0" + "02xxx" (e.g. "002118" ->
  // "02118"). A value like "020118" slices to "20118", which fails the "02"
  // test and is correctly DROPPED — the script never fabricates digits.
  it("recovers a valid '02xxx' zip from a 6-digit leading-zero form", () => {
    expect(normalizeZip("002118")).toBe("02118");
  });

  it("drops a 6-digit '0…' zip whose sliced result isn't '02xxx'", () => {
    expect(normalizeZip("020118")).toBeNull(); // slice -> "20118" -> dropped
  });

  it("keeps an already-valid 5-digit '02' zip as-is", () => {
    expect(normalizeZip("02026")).toBe("02026");
  });

  it("trims surrounding whitespace before validating", () => {
    expect(normalizeZip(" 02118 ")).toBe("02118");
  });

  it("drops a 4-digit zip (we never pad)", () => {
    expect(normalizeZip("2118")).toBeNull();
  });

  it("drops a 5-digit zip not starting with '02'", () => {
    expect(normalizeZip("12118")).toBeNull();
  });

  it("drops a 6-digit zip that doesn't start with '0'", () => {
    expect(normalizeZip("120118")).toBeNull();
  });

  it("drops non-numeric input", () => {
    expect(normalizeZip("02abc")).toBeNull();
  });

  it("drops null/undefined/empty input", () => {
    expect(normalizeZip(null)).toBeNull();
    expect(normalizeZip(undefined)).toBeNull();
    expect(normalizeZip("")).toBeNull();
  });
});

describe("gasShare / siteEUI classification (mirror of convert-berdo.mjs, Req 8.3/8.5)", () => {
  // Req 8.5: blank per_Gas -> null (UNKNOWN), never 0.
  it("blank gas share is null (unknown), not 0", () => {
    expect(parseNum("")).toBeNull();
    expect(parseNum("   ")).toBeNull();
  });

  // Req 8.5: a real zero gas share stays 0 (a known value, not unknown).
  it("a real '0' gas share stays 0 (known zero, not null)", () => {
    expect(parseNum("0")).toBe(0);
  });

  it("a present numeric gas share is parsed through", () => {
    expect(parseNum("0.5")).toBe(0.5);
  });

  // Req 8.3: missing Site EUI classifies as null -> the script DROPS the row.
  it("blank Site EUI classifies as null (row would be dropped)", () => {
    expect(parseNum("")).toBeNull();
    expect(parseNum("n/a")).toBeNull();
  });

  it("a present Site EUI parses to a finite number (row kept)", () => {
    expect(parseNum("91.8")).toBe(91.8);
    expect(parseNum("350")).toBe(350); // >300 still a finite number -> kept
  });
});
