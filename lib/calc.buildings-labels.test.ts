import { describe, it, expect } from "vitest";
import { buildingAdvice, heatingFuelLabel, type RankedBuilding } from "@/lib/calc";

function row(over: Partial<RankedBuilding>): RankedBuilding {
  return {
    id: "0",
    zip: "02125",
    propertyType: "Multifamily Housing",
    yearBuilt: 1920,
    grossFloorAreaSqFt: 24700,
    siteEUI: 80,
    ghgEmissions: 100,
    electricShare: 0.5,
    gasShare: 0.5,
    score: 40,
    percentile: 50,
    label: "Medium",
    checkData: false,
    electricResistanceWin: false,
    ...over,
  };
}

describe("buildingAdvice", () => {
  it("all-electric override → biggest win", () => {
    expect(buildingAdvice(row({ electricResistanceWin: true }))).toBe(
      "Biggest win: likely electric heat"
    );
  });
  it("mostly gas → plan a heat pump at boiler replacement", () => {
    expect(buildingAdvice(row({ gasShare: 0.9 }))).toBe(
      "Plan a heat pump at the next boiler replacement"
    );
  });
  it("High/Medium (not mostly gas) → good candidate", () => {
    expect(buildingAdvice(row({ label: "High", gasShare: 0.4 }))).toBe(
      "Good candidate"
    );
  });
  it("Low → lower priority", () => {
    expect(buildingAdvice(row({ label: "Low", gasShare: 0.4 }))).toBe(
      "Lower priority"
    );
  });
});

describe("heatingFuelLabel", () => {
  it("all-electric", () => {
    expect(heatingFuelLabel({ electricShare: 1, gasShare: 0 })).toBe("All-electric");
  });
  it("mostly gas with percent", () => {
    expect(heatingFuelLabel({ electricShare: 0.1, gasShare: 0.9 })).toBe("Mostly gas (90%)");
  });
  it("unknown gas share", () => {
    expect(heatingFuelLabel({ electricShare: 0.3, gasShare: null })).toBe("Unknown");
  });
  it("mixed", () => {
    expect(heatingFuelLabel({ electricShare: 0.5, gasShare: 0.5 })).toBe("Mixed");
  });
});
