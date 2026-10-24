// scripts/convert-berdo.mjs
//
// Converts the City of Boston BERDO 2021 slice (data/berdo-2021/data.csv) into a
// cleaned static JSON file (data/berdo-2021/buildings.json) that the Buildings
// tab loads client-side.
//
// Plain Node ESM, no dependencies. Run with:  node scripts/convert-berdo.mjs
// (It is deliberately a .mjs so it is NOT part of the app's tsconfig `include`
//  globs and never needs a dev dependency like tsx.)
//
// Output rows match the BerdoBuilding type in lib/schema.ts exactly:
//   { id, zip, propertyType, yearBuilt, grossFloorAreaSqFt, siteEUI,
//     ghgEmissions, electricShare, gasShare }
//
// --------------------------------------------------------------------------
// Cleaning rules (Requirements 8.3, 8.4, 8.5):
//
// 1. ZIP NORMALIZATION + FILTER (8.3):
//      - Trim whitespace from the raw Zip value.
//      - If it is 6 digits and starts with "0", drop the single leading "0"
//        to recover a 5-digit zip (e.g. "020118" -> "02118"). This fixes the
//        dataset's extra-leading-zero rows without fabricating digits.
//      - If it is already 5 digits, keep it as-is.
//      - KEEP the row ONLY if the normalized zip matches /^02\d{3}$/.
//        Anything else (wrong length, not starting with "02", non-numeric) is
//        DROPPED. We never pad or invent digits.
//
// 2. DROP rows whose Site_EUI_kBtuft2 is blank / non-numeric (8.3).
//
// 3. gasShare (8.5): per_Gas blank/empty  -> null (UNKNOWN, never 0).
//                    per_Gas present+numeric -> the number.
//
// 4. id (8.3): the zero-based index of the row IN THE KEPT output array, as a
//    string ("0","1","2",...). Using the kept-array index keeps ids contiguous
//    and stable in the emitted JSON (and matches the BerdoBuilding doc comment).
//
// 5. "check data" flag for siteEUI > 300 (8.4): BerdoBuilding has NO flag field,
//    so we DO NOT persist a flag. The rule is "keep the row and flag it", so
//    EUI>300 rows ARE KEPT in buildings.json; the ">300 = check data" flagging
//    is a DISPLAY concern handled by the Buildings table (task 5.2) reading
//    siteEUI. Only missing-EUI rows are dropped.
//
// 6. Other numerics are coerced safely:
//      - yearBuilt, grossFloorAreaSqFt, ghgEmissions, electricShare: parsed as
//        numbers; blank/non-numeric becomes 0 (a conservative default that does
//        not misrepresent a real reading). electricShare blank -> 0 is an
//        accepted default. gasShare is the ONLY field that uses null for
//        unknown (rule 3).
// --------------------------------------------------------------------------

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data", "berdo-2021");
const INPUT = resolve(DATA_DIR, "data.csv");
const OUTPUT = resolve(DATA_DIR, "buildings.json");

/**
 * Minimal CSV line parser. Handles optional double-quoted fields (and escaped
 * "" inside them) so a stray quoted comma can't shift columns. The BERDO slice
 * is simple comma-separated text with empty trailing fields (blank per_Gas).
 */
function parseCsvLine(line) {
  const out = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      out.push(field);
      field = "";
    } else {
      field += c;
    }
  }
  out.push(field);
  return out;
}

/** Parse a numeric cell; blank/non-numeric -> null. */
function parseNum(raw) {
  if (raw == null) return null;
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Normalize a raw zip per rule 1; returns a 5-digit "02xxx" zip or null. */
function normalizeZip(raw) {
  const t = (raw ?? "").trim();
  let z = t;
  if (/^\d{6}$/.test(z) && z.startsWith("0")) {
    z = z.slice(1); // "020118" -> "02118"
  }
  return /^02\d{3}$/.test(z) ? z : null;
}

function main() {
  const text = readFileSync(INPUT, "utf8");
  // Split on newlines, tolerate CRLF, drop a trailing empty line.
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const header = parseCsvLine(lines[0]);

  const col = (name) => header.indexOf(name);
  const iPropertyType = col("Property_Type");
  const iZip = col("Zip");
  const iYearBuilt = col("Year_Built");
  const iGrossArea = col("Gross_Area_sf");
  const iSiteEUI = col("Site_EUI_kBtuft2");
  const iGhg = col("GHG_Emissions_MTCO2e");
  const iElectric = col("per_Electricity");
  const iGas = col("per_Gas");

  for (const [n, idx] of Object.entries({
    Property_Type: iPropertyType,
    Zip: iZip,
    Year_Built: iYearBuilt,
    Gross_Area_sf: iGrossArea,
    Site_EUI_kBtuft2: iSiteEUI,
    GHG_Emissions_MTCO2e: iGhg,
    per_Electricity: iElectric,
    per_Gas: iGas,
  })) {
    if (idx === -1) throw new Error(`Missing expected column: ${n}`);
  }

  const dataRows = lines.slice(1);
  const stats = {
    totalRead: dataRows.length,
    droppedMissingEUI: 0,
    droppedBadZip: 0,
    kept: 0,
    keptMultifamily: 0,
    keptEUIover300: 0,
    keptGasShareNull: 0,
  };

  const buildings = [];

  for (const line of dataRows) {
    const cells = parseCsvLine(line);

    // Rule 1: zip normalization + filter.
    const zip = normalizeZip(cells[iZip]);
    if (zip === null) {
      stats.droppedBadZip++;
      continue;
    }

    // Rule 2: drop missing/non-numeric Site EUI.
    const siteEUI = parseNum(cells[iSiteEUI]);
    if (siteEUI === null) {
      stats.droppedMissingEUI++;
      continue;
    }

    // Rule 6: safe numeric coercion (blank/non-numeric -> 0).
    const yearBuilt = parseNum(cells[iYearBuilt]) ?? 0;
    const grossFloorAreaSqFt = parseNum(cells[iGrossArea]) ?? 0;
    const ghgEmissions = parseNum(cells[iGhg]) ?? 0;
    const electricShare = parseNum(cells[iElectric]) ?? 0;

    // Rule 3: gasShare null when unknown (never 0).
    const gasShare = parseNum(cells[iGas]); // null when blank/non-numeric

    const propertyType = (cells[iPropertyType] ?? "").trim();

    const building = {
      id: String(stats.kept), // Rule 4: kept-array index as a string.
      zip,
      propertyType,
      yearBuilt,
      grossFloorAreaSqFt,
      siteEUI,
      ghgEmissions,
      electricShare,
      gasShare,
    };

    buildings.push(building);

    // Stats.
    stats.kept++;
    if (propertyType.toLowerCase().includes("multifamily"))
      stats.keptMultifamily++;
    if (siteEUI > 300) stats.keptEUIover300++;
    if (gasShare === null) stats.keptGasShareNull++;
  }

  writeFileSync(OUTPUT, JSON.stringify(buildings), "utf8");

  const bytes = Buffer.byteLength(JSON.stringify(buildings), "utf8");
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        output: OUTPUT,
        sizeBytes: bytes,
        ...stats,
      },
      null,
      2,
    ),
  );
}

main();
