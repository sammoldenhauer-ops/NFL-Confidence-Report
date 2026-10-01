import { describe, expect, it } from "vitest";
import { SD_CORRECTION, MIN_SIMS } from "../src/lib/constants";
import { distributionFor, lineProbabilities, mulberry32, simulate } from "../src/lib/sim/engine";

function sd(a: Float64Array) {
  const m = a.reduce((s, x) => s + x, 0) / a.length;
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length);
}

describe("simulation engine", () => {
  it("applies the 1.30x SD correction exactly once to normal draws", () => {
    const s = simulate({ kind: "normal", mean: 1000, rawSd: 10 }, 200_000, mulberry32(1));
    expect(sd(s)).toBeGreaterThan(10 * SD_CORRECTION * 0.98);
    expect(sd(s)).toBeLessThan(10 * SD_CORRECTION * 1.02);
  });

  it("refuses fewer than 50,000 sims", () => {
    expect(() => simulate({ kind: "normal", mean: 5, rawSd: 1 }, 49_999, mulberry32(1))).toThrow();
  });

  it("clips normal draws at 0", () => {
    const s = simulate({ kind: "normal", mean: 0, rawSd: 5 }, MIN_SIMS, mulberry32(2));
    expect(s.reduce((a, x) => Math.min(a, x), Infinity)).toBe(0);
  });

  it("uses Poisson for TD props: variance ~ mean, integer support", () => {
    const d = distributionFor("pass_td", 1.4, null);
    expect(d.kind).toBe("poisson");
    const s = simulate(d, 200_000, mulberry32(3));
    const m = s.reduce((a, x) => a + x, 0) / s.length;
    expect(m).toBeGreaterThan(1.38);
    expect(m).toBeLessThan(1.42);
    expect(sd(s) ** 2).toBeGreaterThan(1.3);
    expect(sd(s) ** 2).toBeLessThan(1.5);
    expect(s.every((x) => Number.isInteger(x))).toBe(true);
  });

  it("uses normal for yardage and requires an SD", () => {
    expect(distributionFor("rec_yds", 60, 30).kind).toBe("normal");
    expect(() => distributionFor("rec_yds", 60, null)).toThrow();
  });

  it("matches the analytic Poisson tail and reports pushes separately", () => {
    const s = simulate({ kind: "poisson", mean: 2.042 }, 300_000, mulberry32(4));
    const over1p5 = lineProbabilities(s, 1.5);
    expect(over1p5.pOver).toBeGreaterThan(0.595);
    expect(over1p5.pOver).toBeLessThan(0.615);
    const at2 = lineProbabilities(s, 2.0);
    expect(at2.pPush).toBeGreaterThan(0.25);
    expect(at2.pOver + at2.pUnder + at2.pPush).toBeCloseTo(1, 10);
  });

  it("is deterministic for a seed", () => {
    const a = simulate({ kind: "normal", mean: 50, rawSd: 10 }, MIN_SIMS, mulberry32(9));
    const b = simulate({ kind: "normal", mean: 50, rawSd: 10 }, MIN_SIMS, mulberry32(9));
    expect(a[123]).toBe(b[123]);
  });
});
