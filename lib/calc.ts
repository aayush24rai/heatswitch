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
 * A `BerdoBuilding` annotated by `rankBuildings` with its opportunity `score`,
 * its `percentile` of that score within the multifamily cohort (inclusive
 * `0..100`, Requirement 8.6), and the corresponding `label`.
 */
export type RankedBuilding = BerdoBuilding & {
  score: number;
  percentile: number;
  label: OpportunityLabel;
};

/**
 * Case-insensitive substring match for the multifamily cohort used to compute
 * percentiles. The BERDO property type reads e.g. "Multifamily Housing"; we
 * match any propertyType containing "multifamily".
 */
function isMultifamily(b: BerdoBuilding): boolean {
  return b.propertyType.toLowerCase().includes("multifamily");
}

/**
 * Heat pump opportunity score for a building: higher means the building gains
 * more from switching to a heat pump. The score is a documented, finite linear
 * combination of the signals the design calls out (Requirement 8.6):
 *
 * - `siteEUI` (kBtu/ft²/year): higher energy-use intensity ⟹ more to save.
 * - `ghgEmissions` (metric tons CO2e): higher emissions ⟹ bigger climate win.
 * - electric-resistance heating (`electricShare === 1`): the biggest heat pump
 *   win (a heat pump replaces resistance heat at a COP well above 1), so it
 *   earns a fixed bonus.
 * - `gasShare`: a higher gas fraction signals a fossil system worth converting,
 *   contributing proportionally.
 *
 * Weights are chosen so EUI (the primary driver) dominates, with emissions and
 * fuel-mix signals as secondary nudges; the exact magnitudes matter only for
 * relative ordering, which is all the percentile ranking uses.
 *
 * `gasShare === null` means *unknown*, not zero (Requirement 8.5). An unknown
 * gas share contributes NO gas-share term — it neither adds nor subtracts — so
 * a building with unknown fuel mix is not wrongly pushed down the ranking the
 * way substituting `0` would. A genuine `gasShare === 0` (all-electric /
 * no gas) correctly contributes a zero gas term.
 *
 * Preconditions: `b` is a valid, cleaned `BerdoBuilding` (finite numeric
 * fields; `gasShare` finite in `[0,1]` or `null`).
 * Postconditions: returns a finite number.
 */
export function opportunityScore(b: BerdoBuilding): number {
  // Primary driver: energy-use intensity.
  const euiTerm = b.siteEUI;

  // Secondary: absolute emissions, scaled down so it nudges rather than
  // dominates the EUI term across the dataset's range.
  const emissionsTerm = 0.05 * b.ghgEmissions;

  // Electric-resistance heating is the single biggest heat pump win.
  const electricResistanceBonus = b.electricShare === 1 ? 50 : 0;

  // Higher gas share => more fossil opportunity. `null` (unknown) contributes
  // nothing, so unknown fuel mix never penalizes a building (Requirement 8.5).
  const gasTerm = b.gasShare === null ? 0 : 40 * b.gasShare;

  const score = euiTerm + emissionsTerm + electricResistanceBonus + gasTerm;

  // Enforce the finite postcondition against any NaN/Infinity slipping through.
  return Number.isFinite(score) ? score : 0;
}

/**
 * Map a building's percentile (inclusive `0..100`, Requirement 8.6) of its
 * opportunity score within the multifamily cohort to a plain-English label.
 * This is a RELATIVE ranking, not an absolute score cutoff (design).
 *
 * Cutoffs (monotonic — a higher percentile never yields a lower label):
 * - `>= 67` ⟹ "High" (roughly the top third of the cohort),
 * - `>= 33` ⟹ "Medium" (middle third),
 * - otherwise ⟹ "Low".
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
  if (p >= 67) return "High";
  if (p >= 33) return "Medium";
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
 * Rank BERDO buildings by heat pump opportunity (Requirements 8.6, 8.7).
 *
 * - The percentile cohort is the MULTIFAMILY subset of the FULL `buildings`
 *   list (not the zip-filtered rows): each returned row's `percentile` is its
 *   `opportunityScore` percentile within that cohort (Requirement 8.6).
 * - When `zip` is a valid 5-digit value, the result is filtered to rows whose
 *   `zip === zip`; when `zip` is `null` (or not 5 digits), all rows are kept.
 * - Rows are sorted by `score` DESCENDING; ties break by `id` ascending
 *   (lexicographic) for a stable, deterministic order.
 * - Each returned row is annotated `{ score, percentile, label }`.
 *
 * Property 8 / Requirement 8.7: the result is EXACTLY the zip-matching subset
 * sorted by score descending — no rows invented, none dropped (a permutation of
 * the matching subset). The input array is never mutated: filtering and sorting
 * operate on copies.
 *
 * Preconditions: `buildings` is a valid array of cleaned rows; `zip` is `null`
 * or a 5-digit string.
 * Postconditions: see above; `result.length <= buildings.length`; every
 * `percentile` is in `[0, 100]`.
 *
 * @param buildings - cleaned BERDO rows (not mutated).
 * @param zip - a 5-digit zip to filter to, or `null` for all rows.
 * @returns the matching subset, annotated and sorted by score descending.
 */
export function rankBuildings(
  buildings: BerdoBuilding[],
  zip: string | null,
): RankedBuilding[] {
  // Percentile cohort: multifamily rows from the FULL list (design pseudocode).
  const multifamilyScores = buildings
    .filter(isMultifamily)
    .map((m) => opportunityScore(m));

  // A valid zip filter is applied only for exactly-5-digit values; any other
  // non-null value (and null) keeps all rows.
  const applyZipFilter = zip !== null && /^\d{5}$/.test(zip);

  const annotated: RankedBuilding[] = buildings
    // Filter a COPY — never mutate the input array.
    .filter((b) => !applyZipFilter || b.zip === zip)
    .map((b) => {
      const score = opportunityScore(b);
      const percentile = percentileOf(score, multifamilyScores);
      return {
        ...b,
        score,
        percentile,
        label: opportunityLabel(percentile),
      };
    });

  // Sort the copy by score descending; deterministic tie-break on id ascending.
  annotated.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return annotated;
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
 * True ONLY when every one of these holds:
 * 1. annual savings > 0 (`cmp.annualDeltaDollars > 0`) — otherwise there is no
 *    payback at all and the flag is false;
 * 2. a rebate is actually available (`reb.rebateAmount > 0`);
 * 3. the current date is on or before the 2026 install deadline
 *    (`now <= REBATE_DEADLINE_2026`) — if `now` is after the deadline the flag is
 *    false (Requirement 5.13);
 * 4. the rebate materially shortens payback: it reduces payback years by at
 *    least 1 year versus the payback computed from the GROSS install cost
 *    (Requirement 5.12).
 *
 * To evaluate materiality (point 4) we reconstruct the gross install cost from
 * the rebate result — `installCostGross = reb.netInstallCost + reb.rebateAmount`
 * (because `netInstallCost === installCostGross - rebateAmount`) — and compute
 * the payback that would result with NO rebate:
 *   `payback_noRebate = annualSavings > 0 ? installCostGross / annualSavings : null`
 * where `annualSavings = cmp.annualDeltaDollars`. The net-of-rebate payback is
 * `reb.paybackYears` (already `netInstallCost / annualSavings`). The rebate is
 * material when both paybacks are finite and
 *   `payback_noRebate - reb.paybackYears >= 1`.
 * When savings are <= 0, `payback_noRebate` is null, `reb.paybackYears` is null,
 * and the flag is false.
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
  // Reconstruct the gross install cost from the rebate result:
  //   netInstallCost === installCostGross - rebateAmount
  //   => installCostGross === netInstallCost + rebateAmount
  const installCostGross = reb.netInstallCost + reb.rebateAmount;

  // Payback with NO rebate (null when there are no savings to pay it back).
  const paybackNoRebate = annualSavings > 0 ? installCostGross / annualSavings : null;

  // The rebate materially shortens payback when it cuts payback years by at
  // least 1 versus the gross-cost payback (Requirement 5.12).
  const rebateMaterial =
    paybackNoRebate !== null &&
    reb.paybackYears !== null &&
    paybackNoRebate - reb.paybackYears >= 1;

  const actBeforeDec31 =
    annualSavings > 0 && // no savings => no payback => flag false
    reb.rebateAmount > 0 && // a rebate must actually be available
    now <= REBATE_DEADLINE_2026 && // deadline still ahead (Requirement 5.13)
    rebateMaterial; // rebate reduces payback by >= 1 year (Requirement 5.12)

  // --- isRenter (Requirements 7.2 / 7.3). ---
  // Heat included in rent => the household cannot install themselves; show the
  // landlord path. Toggle off => isRenter false and the path is hidden.
  const isRenter = inputs.heatIncludedInRent;

  return { label, actBeforeDec31, isRenter };
}
