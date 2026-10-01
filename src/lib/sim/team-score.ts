import { DEFAULT_TEAM_WEIGHTS, MROUND_STEP, type WindowWeights } from "../constants";

/** Windows in weight order: YTD, last 3, home/away split, previous regular season. */
export type Windows = readonly [number, number, number, number];

export type TeamInputs = {
  /** A-D: team's own points/game per window (D excludes playoff weeks 19+). */
  own: Windows;
  /** E-H: league-average points scored per window. */
  leagueScored: Windows;
  /** I-L: opponent's points allowed per window. */
  oppAllowed: Windows;
  /** M-P: league-average points allowed per window, kept distinct from E-H. */
  leagueAllowed: Windows;
};

export function validateWeights(w: WindowWeights): void {
  const sum = w[0] + w[1] + w[2] + w[3];
  if (w.some((x) => x < 0) || Math.abs(sum - 100) > 1e-9) {
    throw new Error(`Window weights must be non-negative and sum to 100, got ${w.join("/")} (=${sum})`);
  }
}

function sumproduct(values: Windows, w: WindowWeights): number {
  return (values[0] * w[0] + values[1] * w[1] + values[2] * w[2] + values[3] * w[3]) / 100;
}

export function mround(x: number, step = MROUND_STEP): number {
  return Math.round(x / step) * step;
}

export type TeamScoreDetail = {
  Q: number;
  R: number;
  S: number;
  T: number;
  V: number;
  W: number;
  X: number;
  Y: number;
  Z: number;
  final: number;
};

/** §4 exactly: T = Q*(Q/R), Y = V*(V/W), Z = (T+Y)/2, final = MROUND(Z * injury, 0.5). */
export function projectTeamScore(
  t: TeamInputs,
  weights: WindowWeights = DEFAULT_TEAM_WEIGHTS,
  injuryMultiplier = 1.0,
): TeamScoreDetail {
  validateWeights(weights);
  const Q = sumproduct(t.own, weights);
  const R = sumproduct(t.leagueScored, weights);
  const V = sumproduct(t.oppAllowed, weights);
  const W = sumproduct(t.leagueAllowed, weights);
  if (R <= 0 || W <= 0) throw new Error("League averages must be positive");
  const S = Q / R;
  const T = Q * S;
  const X = V / W;
  const Y = V * X;
  const Z = (T + Y) / 2;
  return { Q, R, S, T, V, W, X, Y, Z, final: mround(Z * injuryMultiplier) };
}

export type GameProjection = {
  home: TeamScoreDetail;
  away: TeamScoreDetail;
  /** Home-team spread in betting convention: negative = home favored. Derived, never supplied. */
  homeSpread: number;
  favorite: "home" | "away" | "pick";
};

export function projectGame(
  home: TeamInputs,
  away: TeamInputs,
  weights: WindowWeights = DEFAULT_TEAM_WEIGHTS,
  injury: { home?: number; away?: number } = {},
): GameProjection {
  const h = projectTeamScore(home, weights, injury.home ?? 1);
  const a = projectTeamScore(away, weights, injury.away ?? 1);
  const homeSpread = a.final - h.final;
  const g: GameProjection = {
    home: h,
    away: a,
    homeSpread,
    favorite: homeSpread < 0 ? "home" : homeSpread > 0 ? "away" : "pick",
  };
  assertSpreadConsistent(g);
  return g;
}

/** §4 sanity check: the higher projected score must be the favorite (negative spread). */
export function assertSpreadConsistent(g: GameProjection): void {
  const diff = g.home.final - g.away.final;
  const spread = g.homeSpread;
  if (diff > 0 && !(spread < 0)) throw new Error(`Spread ${spread} contradicts home ${g.home.final} > away ${g.away.final}`);
  if (diff < 0 && !(spread > 0)) throw new Error(`Spread ${spread} contradicts home ${g.home.final} < away ${g.away.final}`);
  if (diff === 0 && spread !== 0) throw new Error(`Spread ${spread} should be 0 for equal scores`);
}
