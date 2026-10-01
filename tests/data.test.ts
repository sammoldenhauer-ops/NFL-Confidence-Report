import { describe, expect, it } from "vitest";
import { classifyHeaders, expandProjections, parseBaseline, parseGraded, parseOverrides } from "../src/lib/data/parse";
import { buildPlayerIndex, normalizeTeam, resolveGameByLabel, resolvePlayer, type GameLite } from "../src/lib/data/resolve";

describe("classifyHeaders detects schema by column names, not filename", () => {
  it("identifies the mislabeled starter files correctly", () => {
    expect(classifyHeaders(["player", "stat", "line", "odds", "confidence_pct", "actual", "hit"])).toBe("graded_props");
    expect(classifyHeaders(["bucket", "n", "hit_rate", "avg_confidence", "gap"])).toBe("calibration_summary");
    expect(
      classifyHeaders(["team", "player", "position", "target_share_pct", "rush_share_pct", "blended_target_share_pct"]),
    ).toBe("share_baseline");
    expect(classifyHeaders(["team", "player", "this_game_target_share_pct", "this_game_rush_share_pct"])).toBe(
      "share_overrides",
    );
    expect(classifyHeaders(["player", "position", "week", "opponent", "mean_pass_att", "mean_pass_yds"])).toBe("proj_qb");
    expect(classifyHeaders(["player", "position", "week", "opponent", "mean_carries", "mean_rush_yds"])).toBe("proj_rb");
    expect(classifyHeaders(["player", "position", "week", "opponent", "mean_targets", "mean_rec"])).toBe("proj_wrte");
  });
});

describe("parseGraded", () => {
  const rows = [
    {
      player: "Mason Taylor",
      stat: "Receptions",
      line: "0.5",
      side: "Over",
      odds: "-1800",
      dollar_win: "0.06",
      our_mean: "2.1",
      confidence_pct: "97.7",
      source: "",
      game: "NYJ @ TEN",
      actual: "2.0",
      hit: "True",
      exclude_from_calibration: "False",
    },
    {
      player: "Rashee Rice",
      stat: "rec",
      line: "2.5",
      side: "",
      odds: "-1100",
      dollar_win: "0.09",
      our_mean: "5.3",
      confidence_pct: "91.8",
      source: "",
      game: "DEN @ KC",
      actual: "2.0",
      hit: "False",
      exclude_from_calibration: "False",
    },
  ];
  it("normalizes stats and infers blank side as Over", () => {
    const { rows: out, findings } = parseGraded(rows);
    expect(out).toHaveLength(2);
    expect(out[1].side).toBe("over");
    expect(out[1].sideImputed).toBe(true);
    expect(findings.some((f) => f.check === "graded_blank_side")).toBe(true);
  });
  it("flags a push as its own thing, not silently a miss", () => {
    const push = parseGraded([{ ...rows[0], line: "2.0", actual: "2.0" }]);
    expect(push.rows[0].isPush).toBe(true);
    expect(push.findings.some((f) => f.check === "graded_pushes_counted_as_miss")).toBe(true);
  });
});

describe("parseBaseline / parseOverrides", () => {
  it("parses real starter rows and finds the known collisions", () => {
    const { rows, findings } = parseBaseline([
      { team: "BAL", player: "Jakobi Lane", position: "WR", target_share_pct: "8" },
      { team: "", player: "AJ Dillon", target_share_pct: "", rush_share_pct: "5" },
    ]);
    expect(rows[1].team).toBe("");
    expect(findings.some((f) => f.check === "share_row_no_team")).toBe(true);
  });
  it("parses this-week overrides", () => {
    const rows = parseOverrides([{ team: "DEN", player: "Jonah Coleman", this_game_target_share_pct: "7.0", this_game_rush_share_pct: "30.0" }]);
    expect(rows[0]).toMatchObject({ team: "DEN", targetPct: 7, rushPct: 30 });
  });
});

describe("expandProjections", () => {
  it("skips BYE rows and emits one row per stat present", () => {
    const rows = expandProjections("proj_wrte", [
      { player: "Jonnu Smith", position: "TE", week: "1", opponent: "", mean_targets: "3.0", sd_targets: "1.8", mean_rec: "2.0", sd_rec: "1.4", mean_rec_yds: "50.0", sd_rec_yds: "30.0", mean_td: "0.2", sd_td: "0.45" },
      { player: "Christian Watson", position: "WR", week: "11", opponent: "BYE" },
    ]);
    expect(rows).toHaveLength(4);
    expect(rows.find((r) => r.stat === "targets")).toMatchObject({ mean: 3, sd: 1.8 });
  });
});

describe("resolvePlayer: name collisions never cross-wire real players", () => {
  const idx = buildPlayerIndex([
    { gsisId: "00-amonra", displayName: "Amon-Ra St. Brown", team: "DET" },
    { gsisId: "00-ajbrown", displayName: "A.J. Brown", team: "PHI" },
    { gsisId: "00-tracyA", displayName: "Tyrone Tracy Jr.", team: "NYG" },
  ]);
  it("resolves unique names directly", () => {
    expect(resolvePlayer(idx, "A.J. Brown")).toEqual({ status: "resolved", gsisId: "00-ajbrown", via: "unique" });
  });
  it("never collides St. Brown with A.Brown-style abbreviations", () => {
    expect(resolvePlayer(idx, "Amon-Ra St. Brown")).toMatchObject({ gsisId: "00-amonra" });
  });
  it("reports missing players instead of guessing", () => {
    expect(resolvePlayer(idx, "Nobody Here")).toEqual({ status: "missing" });
  });
  it("uses a team hint only when it narrows to exactly one", () => {
    const dup = buildPlayerIndex([
      { gsisId: "a", displayName: "Chris Johnson", team: "GB" },
      { gsisId: "b", displayName: "Chris Johnson", team: "KC" },
    ]);
    expect(resolvePlayer(dup, "Chris Johnson", ["GB"])).toEqual({ status: "resolved", gsisId: "a", via: "team" });
    expect(resolvePlayer(dup, "Chris Johnson", []).status).toBe("ambiguous");
  });
});

describe("resolveGameByLabel handles unordered team pairs and aliases", () => {
  const games: GameLite[] = [
    { gameId: "2026_01_NO_DET", week: 1, homeTeam: "DET", awayTeam: "NO", completed: true },
    { gameId: "2026_02_DET_BUF", week: 2, homeTeam: "BUF", awayTeam: "DET", completed: true },
  ];
  it("matches 'DET @ NO' to the NO-home game despite reversed label order", () => {
    expect(resolveGameByLabel(games, "DET @ NO")).toMatchObject({ status: "resolved", game: { gameId: "2026_01_NO_DET" } });
  });
  it("normalizes legacy team codes", () => {
    expect(normalizeTeam("JAC")).toBe("JAX");
    expect(normalizeTeam("WSH")).toBe("WAS");
  });
  it("reports missing instead of guessing a game", () => {
    expect(resolveGameByLabel(games, "SF @ SEA").status).toBe("missing");
  });
});
