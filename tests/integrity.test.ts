import { describe, expect, it } from "vitest";
import { findNameCollisions, normalizeName } from "../src/lib/integrity/names";
import {
  applyOverrides,
  blendShare,
  redistributeShare,
  verifyBlendedColumns,
  teamTotals,
  type BlendedRow,
  type ShareRow,
} from "../src/lib/shares";
import {
  asGsisId,
  detectInjuryCandidates,
  findTeamMismatches,
  gradeProp,
  indexActuals,
  isGsisId,
  type LoggedProp,
} from "../src/lib/grading";

describe("§5.2 duplicate-name detection (real season examples)", () => {
  it("normalizes apostrophes, periods, suffixes, nicknames", () => {
    expect(normalizeName("Ja'Kobi Lane")).toBe(normalizeName("Jakobi Lane"));
    expect(normalizeName("Chris Godwin")).toBe(normalizeName("Chris Godwin Jr."));
    expect(normalizeName("Kenneth Gainwell")).toBe(normalizeName("Kenny Gainwell"));
    expect(normalizeName("Amon-Ra St. Brown")).not.toBe(normalizeName("A.J. Brown"));
  });

  it("flags same-team collisions, not cross-team ones", () => {
    const c = findNameCollisions([
      { team: "TB", name: "Chris Godwin" },
      { team: "TB", name: "Chris Godwin Jr." },
      { team: "LV", name: "Mike Washington" },
      { team: "LV", name: "Mike Washington Jr." },
      { team: "LA", name: "Konata Mumfield" },
      { team: "LA", name: "Konata Mumpfield" },
      { team: "DET", name: "Amon-Ra St. Brown" },
      { team: "NE", name: "A.J. Brown" },
    ]);
    expect(c.map((x) => x.team).sort()).toEqual(["LA", "LV", "TB"]);
  });
});

describe("§3.3 share blend matches the season's real rows", () => {
  it("Jeremiyah Love: target 9.0/10.5 -> 9.4, rush 60/35.5 -> 51.4", () => {
    expect(blendShare(9.0, 10.5, "target")!).toBeCloseTo(9.45, 2);
    expect(blendShare(60, 35.5, "rush")!).toBeCloseTo(51.425, 3);
  });
  it("falls back when one side is missing", () => {
    expect(blendShare(null, 5.3, "target")).toBe(5.3);
    expect(blendShare(0.5, null, "target")).toBe(0.5);
    expect(blendShare(null, null, "rush")).toBeNull();
  });
});

describe("§5.3 baseline is never overwritten", () => {
  const base: ShareRow[] = [
    { playerId: "a", team: "GB", targetPct: 8, rushPct: 60 },
    { playerId: "b", team: "GB", targetPct: 5, rushPct: 30 },
  ];
  it("applyOverrides returns new rows and leaves the baseline untouched", () => {
    const frozen = JSON.stringify(base);
    const out = applyOverrides(base, [{ playerId: "a", team: "GB", rushPct: 0 }]);
    expect(out.find((r) => r.playerId === "a")!.rushPct).toBe(0);
    expect(out.find((r) => r.playerId === "a")!.targetPct).toBe(8);
    expect(JSON.stringify(base)).toBe(frozen);
  });
  it("verifyBlendedColumns catches a zeroed blended value (Josh Jacobs / Charbonnet pattern)", () => {
    const row: BlendedRow = {
      team: "GB",
      player: "Josh Jacobs",
      targetPct: 8,
      rushPct: 60,
      wk1TargetPct: null,
      wk1RushPct: null,
      blendedTargetPct: 8,
      blendedRushPct: 0,
    };
    const f = verifyBlendedColumns([row]);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ field: "rush", stored: 0, expected: 60 });
  });
  it("accepts a correctly blended row", () => {
    expect(
      verifyBlendedColumns([
        {
          team: "ARI",
          player: "Jeremiyah Love",
          targetPct: 9,
          rushPct: 60,
          wk1TargetPct: 10.5,
          wk1RushPct: 35.5,
          blendedTargetPct: 9.4,
          blendedRushPct: 51.4,
        },
      ]),
    ).toEqual([]);
  });
});

describe("share redistribution conserves team totals", () => {
  const rows: ShareRow[] = [
    { playerId: "out", team: "DET", targetPct: 20, rushPct: 20 },
    { playerId: "r1", team: "DET", targetPct: 10, rushPct: 60 },
    { playerId: "r2", team: "DET", targetPct: 15, rushPct: null },
  ];
  it("moves the share and keeps totals", () => {
    const res = redistributeShare(rows, "out", [
      { playerId: "r1", fraction: 0.75 },
      { playerId: "r2", fraction: 0.25 },
    ]);
    expect(res.find((r) => r.playerId === "out")!.targetPct).toBe(0);
    expect(res.find((r) => r.playerId === "r1")!.targetPct).toBeCloseTo(25);
    expect(teamTotals(res, "DET").target).toBeCloseTo(teamTotals(rows, "DET").target);
    expect(rows[0].targetPct).toBe(20);
  });
  it("rejects bad allocations", () => {
    expect(() => redistributeShare(rows, "out", [{ playerId: "r1", fraction: 0.5 }])).toThrow();
    expect(() => redistributeShare(rows, "out", [{ playerId: "nobody", fraction: 1 }])).toThrow();
  });
});

describe("§5.1 grading joins on gsis_id only", () => {
  it("rejects name strings as ids", () => {
    expect(isGsisId("00-0036322")).toBe(true);
    expect(() => asGsisId("A.Brown")).toThrow();
    expect(() => asGsisId("Amon-Ra St. Brown")).toThrow();
  });

  const stBrown = asGsisId("00-0036963");
  const ajBrown = asGsisId("00-0035676");
  const actuals = indexActuals([
    { playerId: stBrown, gameId: "g1", stats: { rec: 10, rec_yds: 142 }, offenseSnaps: 60 },
    { playerId: ajBrown, gameId: "g1", stats: { rec: 2, rec_yds: 21 }, offenseSnaps: 50 },
  ]);
  const prop = (id: number, p: typeof stBrown, line: number, side: "over" | "under" = "over"): LoggedProp => ({
    id,
    playerId: p,
    gameId: "g1",
    stat: "rec_yds",
    line,
    side,
  });

  it("same-surname players never collide", () => {
    expect(gradeProp(prop(1, stBrown, 100.5), actuals)).toMatchObject({ status: "hit", actual: 142 });
    expect(gradeProp(prop(2, ajBrown, 100.5), actuals)).toMatchObject({ status: "miss", actual: 21 });
  });
  it("push is its own status; under works", () => {
    expect(gradeProp(prop(3, stBrown, 142), actuals).status).toBe("push");
    expect(gradeProp(prop(4, stBrown, 100.5, "under"), actuals).status).toBe("miss");
  });
  it("no box-score row is void, not a miss", () => {
    const other = asGsisId("00-0099999");
    expect(gradeProp(prop(5, other, 10.5), actuals).status).toBe("void");
  });
});

describe("§5.4 injury detection uses snaps, not production", () => {
  const p = asGsisId("00-0011111");
  const base = new Map([[p, 80]]);
  it("flags a real snap drop as a candidate needing human confirmation", () => {
    const c = detectInjuryCandidates([{ playerId: p, gameId: "g", offensePct: 30 }], base);
    expect(c).toHaveLength(1);
    expect(c[0].needsHumanConfirmation).toBe(true);
  });
  it("does not flag a zero-production game with normal snaps", () => {
    expect(detectInjuryCandidates([{ playerId: p, gameId: "g", offensePct: 78 }], base)).toEqual([]);
  });
});

describe("§5.5 team assignment", () => {
  it("flags stale team assignments", () => {
    const m = findTeamMismatches(
      new Map([
        ["x", "DEN"],
        ["y", "KC"],
      ]),
      new Map([
        ["x", "DEN"],
        ["y", "CIN"],
      ]),
    );
    expect(m).toEqual([{ playerId: "y", storedTeam: "KC", observedTeam: "CIN" }]);
  });
});
