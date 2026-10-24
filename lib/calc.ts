/**
 * Pure heating / heat-pump cost math for HeatSwitch.
 *
 * This module is part of the Calculation_Engine. It performs NO I/O and makes
 * NO network calls: every function here is a pure, deterministic function of
 * its inputs, so it can be property-tested with fast-check and keeps all
 * arithmetic out of the LLM (the LLM never computes a number).
 *
 * It imports only source-cited constants from `lib/constants.ts` and shared
 * types from `lib/schema.ts`.
 *
 * Requirements covered by this file: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8,
 * 4.9, 4.10, 4.11, 4.12, 4.13, 4.14, 8.6, 8.7, and the verdict requirements
 * 6.1, 6.2, 6.3, 6.4, 5.12, 5.13, 7.2, 7.3 (decideVerdict).
 */

import {
  OIL_GALLON_KWH,
  PROPANE_GALLON_KWH,
  REBATE_DEADLINE_2026,
  SUMMER_MONTH_INDEXES,
  THERM_KWH,
} from "@/lib/constants";
import type {
  Assumptions,
  BerdoBuilding,
  CostComparison,
  HeatingType,
  HomeInputs,
  OpportunityLabel,
  Verdict,
} from "@/lib/schema";
import type { RebateResult } from "@/lib/rebates";

/**
 * Derive heating-only annual use from 12 monthly bill readings by subtracting
 * baseload (non-heating) usage. The summer months Jun–Sep
 * (SUMMER_MONTH_INDEXES) are assumed to carry no heating load, so the minimum
 * of those months approximates monthly baseload. Used for both gas and
 * electric histories.
 *
 * Formula: `sum(history) - 12 * min(history over Jun..Sep)`.
 *
 * Preconditions (Requirement 4.3): `history.length === 12`; every element is a
 * finite number `>= 0`. Violations throw a clear Error (callers retain the
 * previously computed value).
 *
 * Postconditions (Requirement 4.4 / Property 10): returns a finite number with
 * `0 <= result <= sum(history)`.
 *
 * @param history - exactly 12 monthly readings, index 0 = Jan … index 11 = Dec.
 * @returns heating-only annual use in the same native unit as `history`.
 */
export function annualHeatingUse(history: number[]): number {
  if (!Array.isArray(history) || history.length !== 12) {
    throw new Error(
      `annualHeatingUse requires exactly 12 monthly readings, received ${
        Array.isArray(history) ? history.length : typeof history
      }.`,
    );
  }

  for (let i = 0; i < history.length; i += 1) {
    const reading = history[i];
    if (typeof reading !== "number" || !Number.isFinite(reading)) {
      throw new Error(
        `annualHeatingUse requires finite numeric readings; element ${i} is ${String(
          reading,
        )}.`,
      );
    }
    if (reading < 0) {
      throw new Error(
        `annualHeatingUse requires every reading to be >= 0; element ${i} is ${reading}.`,
      );
    }
  }

  const total = history.reduce((sum, reading) => sum + reading, 0);

  // Baseload estimate: the lowest usage across the summer (non-heating) months.
  const summerBaseload = Math.min(
    ...SUMMER_MONTH_INDEXES.map((monthIndex) => history[monthIndex]),
  );

  const heatingUse = total - 12 * summerBaseload;

  // Enforce the postcondition against floating-point drift: the subtracted
  // baseload term is non-negative and never exceeds the total, so the honest
  // result is clamped to [0, total].
  if (heatingUse < 0) return 0;
  if (heatingUse > total) return total;
  return heatingUse;
}

/**
 * kWh-equivalent energy content per native fuel unit (source-cited constants
 * in lib/constants.ts). Electric resistance is already measured in kWh, so its
 * content is 1 kWh per input kWh.
 */
const FUEL_ENERGY_CONTENT_KWH: Record<HeatingType, number> = {
  gas: THERM_KWH, // per therm
  oil: OIL_GALLON_KWH, // per gallon No.2 fuel oil
  propane: PROPANE_GALLON_KWH, // per gallon propane
  "electric-resistance": 1, // per kWh (already electric)
};

/**
 * Convert fuel use in native units to *delivered* heat energy in
 * kWh-equivalent, then apply the per-heating-type system efficiency:
 * `deliveredHeat = fuelEnergyContent × efficiency`.
 *
 * Preconditions (Requirement 4.6): `fuelUse >= 0` and finite; `efficiency > 0`;
 * `type` is a supported HeatingType. Violations throw a clear Error (callers
 * retain the previously computed value).
 *
 * Postconditions (Requirement 4.5 / 4.7 / Property 9): returns a finite number
 * `>= 0`; monotonic non-decreasing in `fuelUse`; `fuelUse === 0 ⟹ result === 0`.
 *
 * @param type - heating fuel type.
 * @param fuelUse - annual fuel use in the fuel's native unit (therms, gallons, kWh).
 * @param efficiency - system efficiency (AFUE / efficiency factor), e.g. SYSTEM_EFFICIENCY[type].
 * @returns delivered heat energy in kWh-equivalent.
 */
export function fuelEnergyContentKWh(
  type: HeatingType,
  fuelUse: number,
  efficiency: number,
): number {
  const energyContentPerUnit = FUEL_ENERGY_CONTENT_KWH[type];
  if (energyContentPerUnit === undefined) {
    throw new Error(
      `fuelEnergyContentKWh received an unsupported heating type: ${String(type)}.`,
    );
  }
  if (typeof fuelUse !== "number" || !Number.isFinite(fuelUse) || fuelUse < 0) {
    throw new Error(
      `fuelEnergyContentKWh requires a finite fuelUse >= 0; received ${String(fuelUse)}.`,
    );
  }
  if (
    typeof efficiency !== "number" ||
    !Number.isFinite(efficiency) ||
    efficiency <= 0
  ) {
    throw new Error(
      `fuelEnergyContentKWh requires a finite efficiency > 0; received ${String(
        efficiency,
      )}.`,
    );
  }

  return fuelUse * energyContentPerUnit * efficiency;
}

/**
 * Annual cost of the home's *current* heating, in native dollars:
 * `annualFuelUse * fuelUnitPrice` (Requirement 4.1).
 *
 * Preconditions (Requirement 4.1): `inputs.annualFuelUse > 0` and
 * `inputs.fuelUnitPrice > 0`, both finite. Violations throw a clear Error
 * (callers retain the previously computed value).
 *
 * Postconditions: returns a finite number `> 0` that scales linearly with
 * either factor (Property 7 / Requirement 4.8). No rounding is applied here;
 * rounding for display is a caller concern (Requirement 4.1).
 *
 * @param inputs - normalized home inputs.
 * @returns current annual heating cost in dollars.
 */
export function currentHeatingCost(inputs: HomeInputs): number {
  const { annualFuelUse, fuelUnitPrice } = inputs;
  if (
    typeof annualFuelUse !== "number" ||
    !Number.isFinite(annualFuelUse) ||
    annualFuelUse <= 0
  ) {
    throw new Error(
      `currentHeatingCost requires a finite annualFuelUse > 0; received ${String(
        annualFuelUse,
      )}.`,
    );
  }
  if (
    typeof fuelUnitPrice !== "number" ||
    !Number.isFinite(fuelUnitPrice) ||
    fuelUnitPrice <= 0
  ) {
    throw new Error(
      `currentHeatingCost requires a finite fuelUnitPrice > 0; received ${String(
        fuelUnitPrice,
      )}.`,
    );
  }

  return annualFuelUse * fuelUnitPrice;
}

/**
 * The effective $/kWh electricity price after any Massachusetts seasonal heat
 * pump rate discount. When the seasonal rate is on, a FLAT $/kWh discount
 * (NOT a fraction, defaulted by utility) is subtracted from the electricity
 * price and the result is floored at a minimum of 0 (Requirement 4.11). When
 * the rate is off, the electricity price is returned unchanged.
 *
 * This single helper is the SOLE source of the effective price, so
 * `heatPumpCost` and `breakevenCOP` share exactly the same price — which is
 * what makes the breakeven boundary consistent (Property 2 / Requirement 4.10).
 *
 * Preconditions: `a.electricityPrice > 0` (finite),
 * `a.seasonalRateDiscountPerKWh >= 0` (finite). Violations throw a clear Error.
 *
 * @param a - assumptions providing the price, discount, and rate on/off flag.
 * @returns the effective $/kWh price (`>= 0`).
 */
function effectiveElectricityPrice(a: Assumptions): number {
  const { electricityPrice, seasonalRateDiscountPerKWh, seasonalHeatPumpRate } =
    a;
  if (
    typeof electricityPrice !== "number" ||
    !Number.isFinite(electricityPrice) ||
    electricityPrice <= 0
  ) {
    throw new Error(
      `effectiveElectricityPrice requires a finite electricityPrice > 0; received ${String(
        electricityPrice,
      )}.`,
    );
  }
  if (
    typeof seasonalRateDiscountPerKWh !== "number" ||
    !Number.isFinite(seasonalRateDiscountPerKWh) ||
    seasonalRateDiscountPerKWh < 0
  ) {
    throw new Error(
      `effectiveElectricityPrice requires a finite seasonalRateDiscountPerKWh >= 0; received ${String(
        seasonalRateDiscountPerKWh,
      )}.`,
    );
  }

  if (!seasonalHeatPumpRate) return electricityPrice;

  // Flat $/kWh discount, floored at a minimum of 0 (Requirement 4.11).
  return Math.max(0, electricityPrice - seasonalRateDiscountPerKWh);
}

/**
 * Annual cost to heat the same home with a heat pump, in dollars. The home's
 * delivered-heat need (in kWh-equivalent, with system efficiency applied) is
 * divided by the seasonal COP to get the electricity the heat pump draws, then
 * multiplied by the effective electricity price:
 *
 *   `heatPumpCost = (deliveredHeatKWh / heatPumpCOP) * effectiveElectricityPrice`
 *
 * where `deliveredHeatKWh = fuelEnergyContentKWh(type, annualFuelUse, systemEfficiency[type])`.
 *
 * Preconditions (Requirement 4.13): `a.heatPumpCOP >= 1`,
 * `a.electricityPrice > 0`, `a.seasonalRateDiscountPerKWh >= 0`. Violations
 * throw a clear Error (callers retain the previously computed value).
 *
 * Postconditions: returns a finite number `>= 0`; strictly decreasing in
 * `heatPumpCOP` (Property 4 / Requirement 4.13); the seasonal-rate-on cost is
 * `<=` the rate-off cost (Property 3 / Requirement 4.12), because the effective
 * price can only fall. No internal rounding.
 *
 * @param inputs - normalized home inputs (heating type, fuel use).
 * @param a - assumptions (COP, electricity price, discount, efficiencies).
 * @returns annual heat pump cost in dollars.
 */
export function heatPumpCost(inputs: HomeInputs, a: Assumptions): number {
  const { heatPumpCOP } = a;
  if (
    typeof heatPumpCOP !== "number" ||
    !Number.isFinite(heatPumpCOP) ||
    heatPumpCOP < 1
  ) {
    throw new Error(
      `heatPumpCost requires a finite heatPumpCOP >= 1; received ${String(
        heatPumpCOP,
      )}.`,
    );
  }

  const efficiency = a.systemEfficiency[inputs.heatingType];
  // Delivered heat the home needs, in kWh-equivalent, with efficiency applied.
  const deliveredHeatKWh = fuelEnergyContentKWh(
    inputs.heatingType,
    inputs.annualFuelUse,
    efficiency,
  );

  // Electricity the heat pump draws to deliver that heat.
  const electricityKWh = deliveredHeatKWh / heatPumpCOP;

  const effectivePrice = effectiveElectricityPrice(a);

  return electricityKWh * effectivePrice;
}

/**
 * The coefficient of performance at which heat pump annual cost equals current
 * heating annual cost — the honesty boundary between "a heat pump saves money"
 * and "it does not" (Requirement 4.9 / 4.10). Solving
 * `deliveredHeatKWh / COP * effectivePrice = currentHeatingCost` for COP gives:
 *
 *   `breakevenCOP = (deliveredHeatKWh * effectivePrice) / currentHeatingCost`
 *
 * The same `effectiveElectricityPrice(a)` used by `heatPumpCost` is used here,
 * so `a.heatPumpCOP > breakevenCOP ⟺ annualDeltaDollars > 0` holds exactly
 * (Property 2 / Requirement 4.10).
 *
 * Preconditions: same as `heatPumpCost`, plus `currentHeatingCost(inputs) > 0`.
 * Violations throw a clear Error.
 *
 * Postconditions: returns a finite number clamped to the inclusive range
 * `0.01 .. 10.0` (Requirement 4.9).
 *
 * @param inputs - normalized home inputs.
 * @param a - assumptions (electricity price, discount, efficiencies).
 * @returns the breakeven COP, clamped to [0.01, 10.0].
 */
export function breakevenCOP(inputs: HomeInputs, a: Assumptions): number {
  const current = currentHeatingCost(inputs);

  const efficiency = a.systemEfficiency[inputs.heatingType];
  const deliveredHeatKWh = fuelEnergyContentKWh(
    inputs.heatingType,
    inputs.annualFuelUse,
    efficiency,
  );

  const effectivePrice = effectiveElectricityPrice(a);

  const cop = (deliveredHeatKWh * effectivePrice) / current;

  // Clamp to the inclusive display/consistency range (Requirement 4.9).
  if (cop < 0.01) return 0.01;
  if (cop > 10.0) return 10.0;
  return cop;
}

/**
 * Bundle the current-vs-heat-pump comparison into a single `CostComparison`
 * (Requirement 4.14). All member figures come from the pure functions above,
 * so the comparison is a deterministic function of its inputs.
 *
 * - `currentAnnualCost = currentHeatingCost(inputs)`
 * - `heatPumpAnnualCost = heatPumpCost(inputs, a)`
 * - `annualDeltaDollars = currentAnnualCost - heatPumpAnnualCost` (positive = savings)
 * - `breakevenCOP = breakevenCOP(inputs, a)`
 *
 * Postconditions (Requirement 4.14): every field is finite; `annualDeltaDollars`
 * equals the exact difference; and `breakevenCOP` is sign-consistent with
 * `annualDeltaDollars` because it is derived from the same effective price and
 * delivered-heat path (Property 2).
 *
 * @param inputs - normalized home inputs.
 * @param a - assumptions.
 * @returns the computed CostComparison.
 */
export function computeComparison(
  inputs: HomeInputs,
  a: Assumptions,
): CostComparison {
  const currentAnnualCost = currentHeatingCost(inputs);
  const heatPumpAnnualCost = heatPumpCost(inputs, a);
  const annualDeltaDollars = currentAnnualCost - heatPumpAnnualCost;
  const breakeven = breakevenCOP(inputs, a);

  return {
    currentAnnualCost,
    heatPumpAnnualCost,
    annualDeltaDollars,
    breakevenCOP: breakeven,
  };
}

// ---------------------------------------------------------------------------
// Building ranking (BERDO 2021) — Requirements 8.6, 8.7
// ---------------------------------------------------------------------------

/**
 * A `BerdoBuilding` annotated by `rankBuildings` with its opportunity `score`
 * (fossil intensity — see `opportunityScore`), its `percentile` of that score
 * within the VALID multifamily cohort, and the corresponding `label`.
 *
 * Representation of the "no label" case (Requirement 8.8): a **check-data** row
 * (`siteEUI > 300`, an implausible intensity that signals a data problem) stays
 * visible in the output but is NOT ranked — it gets `percentile: null` and
 * `label: null`, which the Buildings table renders as "—". So:
 *   - `percentile: number | null` — null only for check-data rows.
 *   - `label: OpportunityLabel | null` — null only for check-data rows.
 *   - `checkData: boolean` — true iff this is a check-data row (EUI > 300).
 *   - `electricResistanceWin: boolean` — true iff the all-electric High override
 *     fired (see `rankBuildings`): a likely electric-resistance building that is
 *     the biggest heat pump win. The table surfaces a message for these rows.
 */
export type RankedBuilding = BerdoBuilding & {
  score: number;
  percentile: number | null;
  label: OpportunityLabel | null;
  checkData: boolean;
  electricResistanceWin: boolean;
};

/** Site EUI above which a row is treated as implausible "check-data" (kBtu/ft²
 *  /year). Such rows stay visible but are excluded from ranking. */
const CHECK_DATA_EUI = 300;

/**
 * The cohort predicate (Requirement 8.8): a building belongs to the heat-pump
 * opportunity cohort iff its `propertyType`, trimmed and compared
 * case-insensitively, is EXACTLY "Multifamily Housing" or "CONDO MAIN".
 *
 * This replaces the old substring `includes("multifamily")` test: mixed-use and
 * other property types are now excluded from the output, the summary, AND the
 * percentile computation. In the cleaned `buildings.json` only
 * "Multifamily Housing" rows survive (CONDO MAIN rows had blank Site EUI and
 * were dropped by cleaning), but accepting both keeps the predicate honest to
 * the source dataset.
 */
function isCohort(b: BerdoBuilding): boolean {
  const type = b.propertyType.trim().toLowerCase();
  return type === "multifamily housing" || type === "condo main";
}

/** True iff `b` is a check-data row (implausible EUI). Check-data rows stay in
 *  the output but always sort last and receive no percentile/label. */
function isCheckData(b: BerdoBuilding): boolean {
  return b.siteEUI > CHECK_DATA_EUI;
}

/**
 * Heat pump opportunity score for a building = **fossil heating intensity**:
 *
 *   `fossilFraction = clamp(b.gasShare ?? (1 − b.electricShare), 0, 1)`
 *   `score          = b.siteEUI × fossilFraction`
 *
 * Rationale (Requirement 8.6): the biggest heat pump opportunity is a building
 * that both uses a lot of energy per square foot (`siteEUI`) AND burns fossil
 * fuel for most of it. A large but already-electric building has little to gain
 * from a heat pump, so the score is intensity × fossil fraction, NOT size.
 *
 * Fossil fraction handling:
 * - When `gasShare` is a number it is used directly as the fossil fraction.
 * - When `gasShare` is `null` (*unknown*, NOT zero — Requirement 8.5) we fall
 *   back to `(1 − electricShare)` as the fossil estimate.
 * - The fraction is clamped to `[0, 1]` so the score stays well-defined even if
 *   upstream shares are slightly out of range.
 *
 * Consequence: an all-electric building (`electricShare === 1` with
 * `gasShare === 0` or `null`) has a fossil fraction of 0 and therefore a
 * `score` of 0 — it is not a fossil-conversion opportunity by this score. (The
 * all-electric High override in `rankBuildings` handles the separate case of a
 * high-use electric-resistance building, which IS a big heat pump win.)
 *
 * Preconditions: `b` is a valid, cleaned `BerdoBuilding` (finite numeric
 * fields; `gasShare` finite in `[0,1]` or `null`).
 * Postconditions: returns a finite, non-negative number.
 */
export function opportunityScore(b: BerdoBuilding): number {
  const rawFossil = b.gasShare ?? 1 - b.electricShare;
  const fossilFraction = Math.min(1, Math.max(0, rawFossil));
  const score = b.siteEUI * fossilFraction;

  // Enforce the finite postcondition against any NaN/Infinity slipping through.
  return Number.isFinite(score) ? score : 0;
}

/**
 * True iff a building's reported electric + gas shares are internally
 * inconsistent — i.e. they sum to meaningfully more than 100%. A `null`
 * `gasShare` means the gas fraction is *unknown* (Requirement 8.5), so there is
 * nothing to check and the result is `false`. The 1.05 ceiling allows for small
 * rounding slack in the source data; the comparison is STRICTLY greater, so an
 * exact 1.05 sum is NOT flagged.
 *
 * Pure and presentational-only: the Buildings table surfaces a small amber
 * "shares don't add up" badge for flagged rows, but the row stays ranked and
 * visible. This changes no score, percentile, or label.
 */
export function sharesInconsistent(
  b: Pick<BerdoBuilding, "electricShare" | "gasShare">,
): boolean {
  if (b.gasShare === null) return false;
  return b.electricShare + b.gasShare > 1.05;
}

/**
 * Map a building's percentile (inclusive `0..100`, Requirement 8.6) of its
 * opportunity score within the VALID multifamily cohort to a plain-English
 * label. This is a RELATIVE ranking, not an absolute score cutoff (design).
 *
 * New bands (Requirement 8.8 — replacing the old 67/33 cutoffs; monotonic — a
 * higher percentile never yields a lower label):
 * - `>= 75` ⟹ "High",
 * - `>= 40` (and `< 75`) ⟹ "Medium",
 * - otherwise (`< 40`) ⟹ "Low".
 *
 * Preconditions: `percentile` is in `[0, 100]`; out-of-range values are clamped
 * so the function is total and monotonic over all finite inputs.
 * Postconditions: returns exactly one `OpportunityLabel`; monotonic in
 * `percentile` (Requirement 8.6).
 */
export function opportunityLabel(percentile: number): OpportunityLabel {
  const p = Number.isFinite(percentile)
    ? Math.min(100, Math.max(0, percentile))
    : 0;
  if (p >= 75) return "High";
  if (p >= 40) return "Medium";
  return "Low";
}

/**
 * Percentile (inclusive `0..100`) of `score` within `cohortScores` using the
 * "percent of cohort scoring at or below this value" definition:
 *
 *   `percentile = 100 * count(c in cohort where c <= score) / cohort.length`.
 *
 * This keeps percentile monotonic non-decreasing in `score` (a higher score is
 * never assigned a lower percentile) and bounded to `[0, 100]`. When the cohort
 * is empty there is nothing to rank against, so every building gets `100` (it
 * is trivially at the top of an empty cohort) — a deterministic, finite choice.
 */
function percentileOf(score: number, cohortScores: number[]): number {
  if (cohortScores.length === 0) return 100;
  let atOrBelow = 0;
  for (const c of cohortScores) {
    if (c <= score) atOrBelow += 1;
  }
  const pct = (100 * atOrBelow) / cohortScores.length;
  // Guard the inclusive 0..100 range against floating-point drift.
  if (pct < 0) return 0;
  if (pct > 100) return 100;
  return pct;
}

/**
 * Rank BERDO buildings by heat pump opportunity (Requirements 8.6, 8.7, 8.8).
 *
 * This is a COHORT-ONLY, deduped, fossil-intensity ranking with explicit
 * valid/check-data handling. Step by step:
 *
 * 1. COHORT FILTER (Requirement 8.8): keep only rows where `isCohort(b)` holds
 *    ("Multifamily Housing" or "CONDO MAIN", case-insensitive, trimmed). Every
 *    other property type is excluded from the output, the summary, AND the
 *    percentile computation.
 * 2. DEDUPE: drop rows that are EXACT duplicates on the tuple
 *    `(propertyType, yearBuilt, grossFloorAreaSqFt, siteEUI, zip)`, keeping the
 *    FIRST occurrence (stable).
 * 3. VALID vs CHECK-DATA: a row with `siteEUI > 300` is "check-data" — it stays
 *    visible but gets `percentile: null`, `label: null`, `checkData: true`, and
 *    always sorts AFTER all valid rows. VALID rows have `siteEUI <= 300`.
 * 4. PERCENTILE among VALID cohort rows only: each valid row's `percentile` is
 *    the percent of VALID cohort scores at or below its `opportunityScore`,
 *    computed over the VALID rows of the FULL deduped cohort (NOT the
 *    zip-filtered subset), so labels spread out regardless of the zip filter.
 *    Labels come from `opportunityLabel` (High >= 75, Medium 40–75, Low < 40).
 * 5. ALL-ELECTRIC HIGH OVERRIDE: a valid row with `electricShare === 1` AND
 *    `siteEUI >= the 75th-percentile siteEUI of the valid cohort` is forced to
 *    `label: "High"` and flagged `electricResistanceWin: true` — a likely
 *    electric-resistance building that is the biggest heat pump win even though
 *    its fossil score is 0. These rows sort WITH the High group.
 * 6. ZIP FILTER: when `zip` is a valid 5-digit value, the annotated rows are
 *    filtered to `zip === zip`; otherwise all annotated rows are kept. The
 *    percentiles were already computed over the full cohort, so filtering only
 *    selects which annotated rows to return.
 * 7. SORT: valid rows first (so the High group is on top), ordered by a sort
 *    key descending — the override rows rank with the High group — with a
 *    deterministic `id` tie-break; then ALL check-data rows last, ordered among
 *    themselves by `siteEUI` then `id`. The TOP row therefore always has
 *    `siteEUI <= 300` unless there are zero valid rows.
 *
 * The input array is never mutated: filtering, deduping, and sorting operate on
 * copies. All outputs are finite and deterministic.
 *
 * Preconditions: `buildings` is a valid array of cleaned rows; `zip` is `null`
 * or a 5-digit string.
 * Postconditions: the result contains only cohort rows (no other property
 * types), no exact-tuple duplicates; valid rows precede all check-data rows;
 * every valid row's `percentile` is in `[0, 100]`; check-data rows have
 * `percentile === null` and `label === null`.
 *
 * @param buildings - cleaned BERDO rows (not mutated).
 * @param zip - a 5-digit zip to filter to, or `null` for all rows.
 * @returns the cohort subset, annotated and ordered as described above.
 */
export function rankBuildings(
  buildings: BerdoBuilding[],
  zip: string | null,
): RankedBuilding[] {
  // 1. Cohort-only, on a copy — never mutate the input array.
  const cohort = buildings.filter(isCohort);

  // 2. Dedupe on the exact tuple, keeping the first occurrence (stable).
  const seen = new Set<string>();
  const deduped: BerdoBuilding[] = [];
  for (const b of cohort) {
    const key = JSON.stringify([
      b.propertyType,
      b.yearBuilt,
      b.grossFloorAreaSqFt,
      b.siteEUI,
      b.zip,
    ]);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(b);
  }

  // 3. Valid (EUI <= 300) rows of the full deduped cohort drive percentiles.
  const validCohort = deduped.filter((b) => !isCheckData(b));
  const validCohortScores = validCohort.map((b) => opportunityScore(b));

  // 5a. The 75th-percentile siteEUI of the valid cohort, used by the
  //     all-electric High override. With no valid rows there is no threshold,
  //     so the override cannot fire (represented as +Infinity).
  const electricHighEUIThreshold =
    validCohort.length === 0
      ? Number.POSITIVE_INFINITY
      : quantile(
          validCohort.map((b) => b.siteEUI),
          0.75,
        );

  // 4 + 5. Annotate every deduped cohort row.
  const annotated: RankedBuilding[] = deduped.map((b) => {
    const score = opportunityScore(b);
    const checkData = isCheckData(b);

    if (checkData) {
      // No ranking for check-data rows: null percentile and label.
      return {
        ...b,
        score,
        percentile: null,
        label: null,
        checkData: true,
        electricResistanceWin: false,
      };
    }

    const percentile = percentileOf(score, validCohortScores);
    let label = opportunityLabel(percentile);

    // 5. All-electric High override: a high-use, likely electric-resistance
    //    building is the biggest heat pump win even at fossil score 0.
    const electricResistanceWin =
      b.electricShare === 1 && b.siteEUI >= electricHighEUIThreshold;
    if (electricResistanceWin) label = "High";

    return {
      ...b,
      score,
      percentile,
      label,
      checkData: false,
      electricResistanceWin,
    };
  });

  // 6. Zip filter: valid 5-digit values filter to exact matches; null / other
  //    values keep all annotated rows.
  const applyZipFilter = zip !== null && /^\d{5}$/.test(zip);
  const filtered = applyZipFilter
    ? annotated.filter((b) => b.zip === zip)
    : annotated;

  // 7. Sort: valid rows first (High group on top), then all check-data rows.
  const result = [...filtered];
  result.sort((a, b) => {
    // Valid rows always precede check-data rows.
    if (a.checkData !== b.checkData) return a.checkData ? 1 : -1;

    if (a.checkData && b.checkData) {
      // Check-data rows ordered deterministically by siteEUI then id.
      if (a.siteEUI !== b.siteEUI) return a.siteEUI - b.siteEUI;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    }

    // Valid rows: order the High group (including forced-High all-electric
    // rows) on top, then by sort key descending, with an id tie-break.
    const ka = validSortKey(a);
    const kb = validSortKey(b);
    if (ka !== kb) return kb - ka;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return result;
}

/**
 * The descending sort key for a VALID annotated row. Forced-High all-electric
 * rows have a fossil score of 0, so sorting on score alone would bury them at
 * the bottom; instead we rank them WITH the High group by lifting their key
 * above every non-override percentile (which is bounded by 100). Concretely:
 * - a forced-High all-electric row keys to `100 + percentile` (so it sits among
 *   the High rows, ordered by its own percentile),
 * - every other valid row keys to its `percentile`.
 * Percentile is non-null for valid rows (guaranteed by `rankBuildings`).
 */
function validSortKey(r: RankedBuilding): number {
  const p = r.percentile ?? 0;
  return r.electricResistanceWin ? 100 + p : p;
}

/**
 * The `q`-quantile (`0 <= q <= 1`) of `values` using linear interpolation
 * between the two nearest ranks on the sorted ascending values. Used to find
 * the 75th-percentile siteEUI threshold for the all-electric High override.
 * Returns a finite number; assumes `values.length >= 1` (callers guard empty).
 */
function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sorted[lower];
  const weight = pos - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

// ---------------------------------------------------------------------------
// Verdict (Requirements 6.1–6.4, 5.12, 5.13, 7.2, 7.3)
// ---------------------------------------------------------------------------

/**
 * Select the single headline verdict for a home, plus the rebate-deadline flag
 * and the renter flag. Pure and deterministic in its four inputs; it reads only
 * already-computed numbers (`cmp`, `reb`), the home inputs, and the current
 * date — it computes no cost itself.
 *
 * ## Label (exactly one — Requirements 6.1–6.4)
 * Branches in priority order so exactly one label is returned:
 * - `cmp.annualDeltaDollars <= 0` ⟹ "Not worth it yet" (Requirement 6.2 —
 *   honesty: a heat pump that does not save money is never recommended).
 * - else `reb.paybackYears !== null && reb.paybackYears <= 5` ⟹ "Switch now"
 *   (Requirement 6.3 — positive savings that pay back within five years).
 * - else (delta > 0 and payback is null or > 5) ⟹ "Switch when your system needs
 *   replacing" (Requirement 6.4).
 *
 * ## actBeforeDec31 (Requirements 5.12 / 5.13)
 * True IFF every one of these holds:
 * 1. a rebate is actually available (`reb.rebateAmount > 0`);
 * 2. the payback WITH the rebate is defined and within 15 years
 *    (`reb.paybackYears !== null && reb.paybackYears <= 15`). Because
 *    `reb.paybackYears` is null exactly when annual savings are <= 0, a
 *    non-null payback already implies positive savings — so there is no need to
 *    test the delta separately;
 * 3. the current date is on or before the 2026 install deadline
 *    (`now <= REBATE_DEADLINE_2026`) — if `now` is after the deadline the flag
 *    is false (Requirement 5.13).
 *
 * This is a simple "a worthwhile rebate is on the table and the clock is still
 * running" flag: a rebate exists, the heat pump pays back in a reasonable time,
 * and the deadline has not passed. There is no longer any "materially shortens
 * payback" comparison against the gross-cost payback.
 *
 * ## isRenter (Requirements 7.2 / 7.3)
 * Derived from `inputs.heatIncludedInRent`: when heat is included in rent the
 * household cannot practically install a heat pump themselves, so `isRenter` is
 * true and the UI shows the landlord path; when the toggle is off `isRenter` is
 * false and the landlord path is hidden.
 *
 * Preconditions: `cmp`, `reb` are outputs of `computeComparison` /
 * `computeRebates`; `now` is a valid Date.
 * Postconditions: returns exactly one `VerdictLabel`; `actBeforeDec31` and
 * `isRenter` are booleans as specified above.
 *
 * @param cmp - the cost comparison (supplies `annualDeltaDollars`).
 * @param reb - the rebate result (supplies `rebateAmount`, `netInstallCost`, `paybackYears`).
 * @param inputs - normalized home inputs (supplies `heatIncludedInRent`).
 * @param now - the current date, compared against REBATE_DEADLINE_2026.
 * @returns the computed Verdict.
 */
export function decideVerdict(
  cmp: CostComparison,
  reb: RebateResult,
  inputs: HomeInputs,
  now: Date,
): Verdict {
  const annualSavings = cmp.annualDeltaDollars;

  // --- Label (Requirements 6.1–6.4): exactly one, priority-ordered. ---
  let label: Verdict["label"];
  if (annualSavings <= 0) {
    // Requirement 6.2 — honesty: no savings, never recommend switching.
    label = "Not worth it yet";
  } else if (reb.paybackYears !== null && reb.paybackYears <= 5) {
    // Requirement 6.3 — positive savings paying back within five years.
    label = "Switch now";
  } else {
    // Requirement 6.4 — savings but payback is null or beyond five years.
    label = "Switch when your system needs replacing";
  }

  // --- actBeforeDec31 (Requirements 5.12 / 5.13). ---
  // True IFF a rebate is available, the payback WITH the rebate is defined and
  // within 15 years, and the 2026 install deadline has not passed. A non-null
  // payback already implies positive savings (payback is null when savings <= 0).
  const actBeforeDec31 =
    reb.rebateAmount > 0 && // a rebate must actually be available
    reb.paybackYears !== null && // defined payback => positive savings
    reb.paybackYears <= 15 && // pays back within 15 years
    now <= REBATE_DEADLINE_2026; // deadline still ahead (Requirement 5.13)

  // --- isRenter (Requirements 7.2 / 7.3). ---
  // Heat included in rent => the household cannot install themselves; show the
  // landlord path. Toggle off => isRenter false and the path is hidden.
  const isRenter = inputs.heatIncludedInRent;

  return { label, actBeforeDec31, isRenter };
}

// ---------------------------------------------------------------------------
// Buildings-view presentation helpers (plain-English labels; NOT ranking)
// ---------------------------------------------------------------------------

/**
 * Plain-English "what to do" guidance for a ranked building, derived ENTIRELY
 * from the ranking flags (no new ranking math). Presentation only.
 *
 *  - all-electric High override    → "Biggest win: likely electric heat"
 *  - mostly gas (gasShare >= 0.8)  → "Plan a heat pump at the next boiler replacement"
 *  - otherwise High / Medium       → "Good candidate"
 *  - Low (or null label)           → "Lower priority"
 */
export function buildingAdvice(b: RankedBuilding): string {
  if (b.electricResistanceWin) return "Biggest win: likely electric heat";
  if (b.gasShare !== null && b.gasShare >= 0.8) {
    return "Plan a heat pump at the next boiler replacement";
  }
  if (b.label === "High" || b.label === "Medium") return "Good candidate";
  return "Lower priority";
}

/**
 * Plain-English heating-fuel summary for a building, from its shares:
 *  - electricShare === 1          → "All-electric"
 *  - gasShare >= 0.8              → "Mostly gas (NN%)"
 *  - gasShare === null (unknown)  → "Unknown"
 *  - otherwise                    → "Mixed"
 */
export function heatingFuelLabel(b: {
  electricShare: number;
  gasShare: number | null;
}): string {
  if (b.electricShare === 1) return "All-electric";
  if (b.gasShare !== null && b.gasShare >= 0.8) {
    return `Mostly gas (${Math.round(b.gasShare * 100)}%)`;
  }
  if (b.gasShare === null) return "Unknown";
  return "Mixed";
}
