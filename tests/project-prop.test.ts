import { describe, expect, it } from "vitest";
import { confidenceForProp, tabFor } from "../src/lib/sim/project-prop";

describe("tabFor (§1 report tabs)", () => {
  it("classifies favorites, underdogs, and pick'ems", () => {
    expect(tabFor(-150)).toBe("favorite");
    expect(tabFor(-100)).toBe("favorite");
    expect(tabFor(-250)).toBe("favorite");
    expect(tabFor(120)).toBe("underdog");
    expect(tabFor(1)).toBe("underdog");
    expect(tabFor(-60)).toBe("pickem");
    expect(tabFor(-400)).toBe("pickem");
  });
});

describe("confidenceForProp", () => {
  it("gives high confidence for an easy real over (Trey McBride rec over 3.5, mean 8.31)", () => {
    const r = confidenceForProp(
      { playerName: "Trey McBride", playerId: "x", stat: "rec", line: 3.5, side: "over", odds: -900 },
      { mean: 8.31, rawSd: 1.96 },
      50_000,
      1,
    );
    expect(r.confidencePct).toBeGreaterThan(95);
    expect(r.tab).toBe("pickem");
  });

  it("gives low confidence for the same prop on the under side", () => {
    const r = confidenceForProp(
      { playerName: "Trey McBride", playerId: "x", stat: "rec", line: 3.5, side: "under", odds: -900 },
      { mean: 8.31, rawSd: 1.96 },
      50_000,
      1,
    );
    expect(r.confidencePct).toBeLessThan(5);
  });

  it("uses Poisson for a TD prop even when no SD is supplied", () => {
    const r = confidenceForProp(
      { playerName: "Jalen Hurts", playerId: "x", stat: "rush_td", line: 0.5, side: "over", odds: -200 },
      { mean: 0.806, rawSd: null },
      50_000,
      1,
    );
    expect(r.confidencePct).toBeGreaterThan(30);
    expect(r.confidencePct).toBeLessThan(60);
  });
});
