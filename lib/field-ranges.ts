import type { HeatingType } from "@/lib/schema";

/**
 * Per-heating-type accepted ranges for the two editable extracted numbers
 * (`annualFuelUse` and `fuelUnitPrice`).
 *
 * These are pure lookup data with NO I/O. They are threaded through to the
 * `ConfirmField` primitive, which already enforces min/max on commit, retains
 * the prior valid value on an out-of-range edit, and shows an inline message
 * naming the accepted range.
 *
 * Oil (and propane, same unit class — gallons / $-per-gallon):
 *   - annualFuelUse accepts 1–5000 gallons (Req 1.5).
 *   - fuelUnitPrice accepts $0.01–99.99 per gallon (Req 1.5).
 * An out-of-range oil value is rejected, the prior valid value retained, and the
 * accepted range shown — enforced by ConfirmField using these bounds (Req 1.6).
 */
export interface FieldRange {
  min: number;
  max: number;
}

type RangeKey = "annualFuelUse" | "fuelUnitPrice";

const RANGES: Record<HeatingType, Record<RangeKey, FieldRange>> = {
  // Oil: gallons 1–5000, price $0.01–99.99 per gallon (Req 1.5 / 1.6).
  oil: {
    annualFuelUse: { min: 1, max: 5000 },
    fuelUnitPrice: { min: 0.01, max: 99.99 },
  },
  // Propane: same gallons/price unit class as oil.
  propane: {
    annualFuelUse: { min: 1, max: 5000 },
    fuelUnitPrice: { min: 0.01, max: 99.99 },
  },
  // Gas: therms and $/therm.
  gas: {
    annualFuelUse: { min: 1, max: 10000 },
    fuelUnitPrice: { min: 0.01, max: 99.99 },
  },
  // Electric resistance: kWh and $/kWh.
  "electric-resistance": {
    annualFuelUse: { min: 1, max: 100000 },
    fuelUnitPrice: { min: 0.01, max: 9.99 },
  },
};

/** Accepted range for an editable field given the current heating type. */
export function fieldRange(
  heatingType: HeatingType,
  key: RangeKey
): FieldRange {
  return RANGES[heatingType][key];
}

/**
 * When the user switches heating type via the "Change" picker, the previously
 * entered usage and price are in the OLD fuel's units (therms, gallons, kWh),
 * so they are meaningless for the new fuel. This helper clears both to 0 — the
 * sentinel the page treats as "not entered yet" (`computeComparison` is skipped
 * while either is <= 0) — so the app never reinterprets old numbers in the new
 * unit. Only `heatingType` carries over the change; everything else is retained.
 *
 * Pure: returns a new object, mutates nothing.
 */
export function resetInputsForHeatingType<
  T extends { heatingType: HeatingType; annualFuelUse: number; fuelUnitPrice: number }
>(inputs: T, nextType: HeatingType): T {
  return { ...inputs, heatingType: nextType, annualFuelUse: 0, fuelUnitPrice: 0 };
}
