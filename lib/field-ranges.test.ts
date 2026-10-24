import { describe, it, expect } from "vitest";
import { fieldRange } from "@/lib/field-ranges";

describe("fieldRange", () => {
  // Oil ranges (Req 1.5 / 1.6).
  it("oil annualFuelUse accepts 1–5000 gallons", () => {
    expect(fieldRange("oil", "annualFuelUse")).toEqual({ min: 1, max: 5000 });
  });

  it("oil fuelUnitPrice accepts $0.01–99.99 per gallon", () => {
    expect(fieldRange("oil", "fuelUnitPrice")).toEqual({
      min: 0.01,
      max: 99.99,
    });
  });

  // Propane shares the oil gallons/price unit class.
  it("propane annualFuelUse matches oil gallons range", () => {
    expect(fieldRange("propane", "annualFuelUse")).toEqual({
      min: 1,
      max: 5000,
    });
  });

  it("propane fuelUnitPrice matches oil price range", () => {
    expect(fieldRange("propane", "fuelUnitPrice")).toEqual({
      min: 0.01,
      max: 99.99,
    });
  });

  // Gas: therms and $/therm.
  it("gas annualFuelUse accepts 1–10000 therms", () => {
    expect(fieldRange("gas", "annualFuelUse")).toEqual({ min: 1, max: 10000 });
  });

  it("gas fuelUnitPrice accepts $0.01–99.99 per therm", () => {
    expect(fieldRange("gas", "fuelUnitPrice")).toEqual({
      min: 0.01,
      max: 99.99,
    });
  });

  // Electric resistance: kWh and $/kWh.
  it("electric-resistance annualFuelUse accepts 1–100000 kWh", () => {
    expect(fieldRange("electric-resistance", "annualFuelUse")).toEqual({
      min: 1,
      max: 100000,
    });
  });

  it("electric-resistance fuelUnitPrice accepts $0.01–9.99 per kWh", () => {
    expect(fieldRange("electric-resistance", "fuelUnitPrice")).toEqual({
      min: 0.01,
      max: 9.99,
    });
  });
});
