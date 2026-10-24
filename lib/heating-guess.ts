import type { HeatingType } from "@/lib/schema";

/**
 * "Not sure what heating you have?" helper (item 4).
 *
 * Maps three plain-English answers to a heating type with a one-line reason.
 * Pure: no I/O, deterministic in its inputs.
 *
 * Q1 rooms  — what the occupant sees in their rooms.
 * Q2 bills  — which bills / deliveries they get (the strongest fuel signal).
 * Q3 rent   — whether heat is included in rent (drives the rent toggle, not the
 *             fuel type).
 *
 * A white wall unit means a mini-split — the household may ALREADY have a heat
 * pump — so we do not assert a fossil type; `heatingType` is null and
 * `miniSplit` is true so the UI can say so.
 */
export type RoomsAnswer =
  | "radiators"
  | "vents"
  | "baseboard-strips"
  | "white-wall-unit";

export type BillsAnswer = "gas" | "oil-propane" | "electric-only";

export interface HeatingGuess {
  /** The inferred heating type, or null when a mini-split is likely. */
  heatingType: HeatingType | null;
  /** One-line, plain-English reason (e.g. "Radiators + oil deliveries → oil boiler"). */
  reason: string;
  /** True when the answers point to an existing heat pump (mini-split). */
  miniSplit: boolean;
}

const ROOMS_PHRASE: Record<RoomsAnswer, string> = {
  radiators: "Radiators",
  vents: "Floor or wall vents",
  "baseboard-strips": "Thin baseboard strips",
  "white-wall-unit": "A white wall unit",
};

const BILLS_PHRASE: Record<BillsAnswer, string> = {
  gas: "gas bill",
  "oil-propane": "oil deliveries",
  "electric-only": "only electric",
};

/**
 * Infer the heating type from the three answers.
 *
 * Rules:
 * - A white wall unit (Q1) → mini-split: `heatingType = null`, `miniSplit = true`.
 * - Otherwise the BILLS answer decides the fuel:
 *     gas          → "gas"
 *     oil-propane  → "oil"   (the common case; the user can switch to propane)
 *     electric-only→ "electric-resistance"
 *   Thin baseboard strips + electric bills strongly indicate electric
 *   resistance, which falls out of the electric-only branch.
 * The reason always names the rooms + the bills signal.
 */
export function guessHeatingType(
  rooms: RoomsAnswer,
  bills: BillsAnswer,
  _rentIncluded: boolean
): HeatingGuess {
  void _rentIncluded; // rent affects the toggle, not the fuel type.

  if (rooms === "white-wall-unit") {
    return {
      heatingType: null,
      reason: "You may already have a heat pump (mini-split)",
      miniSplit: true,
    };
  }

  let heatingType: HeatingType;
  if (bills === "gas") {
    heatingType = "gas";
  } else if (bills === "oil-propane") {
    heatingType = "oil";
  } else {
    heatingType = "electric-resistance";
  }

  const summary =
    heatingType === "gas"
      ? "gas heat"
      : heatingType === "oil"
        ? "oil boiler"
        : "electric baseboard heat";

  return {
    heatingType,
    reason: `${ROOMS_PHRASE[rooms]} + ${BILLS_PHRASE[bills]} → ${summary}`,
    miniSplit: false,
  };
}
