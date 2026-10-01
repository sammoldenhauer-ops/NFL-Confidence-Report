import { describe, expect, it } from "vitest";
import { assertSpreadConsistent, mround, projectGame, projectTeamScore, validateWeights } from "../src/lib/sim/team-score";
import type { TeamInputs } from "../src/lib/sim/team-score";

const league = [22, 22, 22, 22] as const;
const mk = (own: number, oppAllowed: number): TeamInputs => ({
  own: [own, own, own, own],
  leagueScored: league,
  oppAllowed: [oppAllowed, oppAllowed, oppAllowed, oppAllowed],
  leagueAllowed: league,
});

describe("team score (§4)", () => {
  it("league-average team vs league-average defense projects the league average", () => {
    expect(projectTeamScore(mk(22, 22)).Z).toBeCloseTo(22, 10);
  });

  it("follows the spec formula", () => {
    const d = projectTeamScore(mk(27, 20));
    expect(d.T).toBeCloseTo(27 * (27 / 22), 10);
    expect(d.Y).toBeCloseTo(20 * (20 / 22), 10);
    expect(d.Z).toBeCloseTo((d.T + d.Y) / 2, 10);
    expect(d.final).toBe(mround(d.Z));
  });

  it("rounds to nearest 0.5", () => {
    expect(mround(24.24)).toBe(24);
    expect(mround(24.26)).toBe(24.5);
    expect(mround(24.74)).toBe(24.5);
    expect(mround(24.76)).toBe(25);
  });

  it("uses 20/0/0/80 by default and mixes windows accordingly", () => {
    const t: TeamInputs = { own: [30, 0, 0, 20], leagueScored: league, oppAllowed: league, leagueAllowed: league };
    expect(projectTeamScore(t).Q).toBeCloseTo(0.2 * 30 + 0.8 * 20, 10);
  });

  it("rejects weights that do not sum to 100", () => {
    expect(() => validateWeights([20, 0, 0, 70])).toThrow();
    expect(() => validateWeights([-10, 0, 10, 100])).toThrow();
  });

  it("derives a spread whose sign matches the projected scores", () => {
    const g = projectGame(mk(28, 18), mk(19, 24));
    expect(g.home.final).toBeGreaterThan(g.away.final);
    expect(g.homeSpread).toBeLessThan(0);
    expect(g.favorite).toBe("home");
    const g2 = projectGame(mk(19, 24), mk(28, 18));
    expect(g2.homeSpread).toBeGreaterThan(0);
    expect(g2.favorite).toBe("away");
  });

  it("assertSpreadConsistent catches a hard-coded wrong sign", () => {
    const g = projectGame(mk(28, 18), mk(19, 24));
    expect(() => assertSpreadConsistent({ ...g, homeSpread: 3 })).toThrow();
  });
});
