// Numeric constants from PROJECT_SPEC.md Sections 3-4. Do not change without new backtest evidence.

export const SD_CORRECTION = 1.3; // §3.2

export const MIN_SIMS = 50_000; // §3.1
export const FINAL_SIMS = 250_000; // §3.1

// §3.3 player share blend: weight on prior baseline vs current-season actual
export const SHARE_BLEND = {
  target: { prior: 0.7, current: 0.3 },
  rush: { prior: 0.65, current: 0.35 },
  touch: { prior: 0.75, current: 0.25 },
} as const;

// §3.3 / §4 team-score window weights, must sum to 100. Order: YTD, L3, H/A, PrevSeason.
export type WindowWeights = readonly [number, number, number, number];
export const DEFAULT_TEAM_WEIGHTS: WindowWeights = [20, 0, 0, 80];

export const MROUND_STEP = 0.5;

// §7 open problem: calibration gap by bucket. Edges are lower-inclusive.
export const CALIBRATION_BUCKETS = [
  { label: "<40%", lo: 0, hi: 40 },
  { label: "40-50%", lo: 40, hi: 50 },
  { label: "50-60%", lo: 50, hi: 60 },
  { label: "60-70%", lo: 60, hi: 70 },
  { label: "70-80%", lo: 70, hi: 80 },
  { label: "80-90%", lo: 80, hi: 90 },
  { label: "90-100%", lo: 90, hi: 100.0001 },
] as const;

// §1 report tabs: Favorites are odds -100..-250, Underdogs are positive odds.
export const FAVORITE_ODDS = { min: -250, max: -100 } as const;

// §5 item 4: candidate injury flag if offense_pct falls below this fraction of baseline.
export const SNAP_DROP_FRACTION = 0.5;
