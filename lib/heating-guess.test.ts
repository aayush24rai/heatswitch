import { describe, it, expect } from "vitest";
import { guessHeatingType } from "@/lib/heating-guess";

describe("guessHeatingType", () => {
  it("radiators + oil/propane deliveries → oil boiler with a reason", () => {
    const g = guessHeatingType("radiators", "oil-propane", false);
    expect(g.heatingType).toBe("oil");
    expect(g.miniSplit).toBe(false);
    expect(g.reason).toBe("Radiators + oil deliveries → oil boiler");
  });

  it("gas bill → gas", () => {
    expect(guessHeatingType("vents", "gas", false).heatingType).toBe("gas");
  });

  it("thin baseboard strips + only electric → electric-resistance", () => {
    const g = guessHeatingType("baseboard-strips", "electric-only", false);
    expect(g.heatingType).toBe("electric-resistance");
  });

  it("a white wall unit → mini-split (no fossil type asserted)", () => {
    const g = guessHeatingType("white-wall-unit", "electric-only", false);
    expect(g.heatingType).toBeNull();
    expect(g.miniSplit).toBe(true);
    expect(g.reason).toBe("You may already have a heat pump (mini-split)");
  });

  it("rent-included does not change the inferred fuel type", () => {
    const a = guessHeatingType("radiators", "gas", true);
    const b = guessHeatingType("radiators", "gas", false);
    expect(a.heatingType).toBe(b.heatingType);
  });
});
