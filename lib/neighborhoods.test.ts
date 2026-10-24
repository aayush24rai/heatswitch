import { describe, it, expect } from "vitest";
import { neighborhoodFor, zipLabel } from "@/lib/neighborhoods";

describe("neighborhoods", () => {
  it("maps a known zip to its neighborhood", () => {
    expect(neighborhoodFor("02125")).toBe("Dorchester");
    expect(neighborhoodFor("02134")).toBe("Allston");
  });

  it("returns null for an unknown zip", () => {
    expect(neighborhoodFor("09999")).toBeNull();
  });

  it("zipLabel shows '02125 · Dorchester' for known, just the zip for unknown", () => {
    expect(zipLabel("02125")).toBe("02125 · Dorchester");
    expect(zipLabel("09999")).toBe("09999");
  });
});
