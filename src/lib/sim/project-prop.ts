import { FAVORITE_ODDS, FINAL_SIMS } from "../constants";
import { distributionFor, lineProbabilities, mulberry32, simulate, type StatType } from "./engine";

export type ProjectionSource = { mean: number; rawSd: number | null };

export type PropInput = {
  playerName: string;
  playerId: string | null;
  stat: StatType;
  line: number;
  side: "over" | "under";
  odds: number;
};

export type ConfidenceResult = {
  confidencePct: number;
  pushPct: number;
  ourMean: number;
  tab: "favorite" | "underdog" | "pickem";
};

/** Confidence = our simulated probability the stated side hits, as a 0-100 percentage. */
export function confidenceForProp(
  prop: PropInput,
  projection: ProjectionSource,
  simCount = FINAL_SIMS,
  seed = 1,
): ConfidenceResult {
  const dist = distributionFor(prop.stat, projection.mean, projection.rawSd);
  const samples = simulate(dist, simCount, mulberry32(seed));
  const { pOver, pUnder, pPush } = lineProbabilities(samples, prop.line);
  const p = prop.side === "over" ? pOver : pUnder;
  return {
    confidencePct: Math.round(p * 1000) / 10,
    pushPct: Math.round(pPush * 1000) / 10,
    ourMean: projection.mean,
    tab: tabFor(prop.odds),
  };
}

/** §1: Favorites are -100..-250, Underdogs are positive odds, everything else is its own tab. */
export function tabFor(odds: number): "favorite" | "underdog" | "pickem" {
  if (odds >= FAVORITE_ODDS.min && odds <= FAVORITE_ODDS.max) return "favorite";
  if (odds > 0) return "underdog";
  return "pickem";
}
