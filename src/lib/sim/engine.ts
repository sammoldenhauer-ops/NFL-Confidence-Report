import { MIN_SIMS, SD_CORRECTION } from "../constants";

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalPair(rng: Rng): [number, number] {
  let u = 0;
  while (u === 0) u = rng();
  const v = rng();
  const r = Math.sqrt(-2 * Math.log(u));
  return [r * Math.cos(2 * Math.PI * v), r * Math.sin(2 * Math.PI * v)];
}

function poissonSample(mean: number, rng: Rng): number {
  if (mean <= 0) return 0;
  if (mean > 50) {
    const [z] = normalPair(rng);
    return Math.max(0, Math.round(mean + Math.sqrt(mean) * z));
  }
  const limit = Math.exp(-mean);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > limit);
  return k - 1;
}

export type Distribution =
  | { kind: "normal"; mean: number; rawSd: number }
  | { kind: "poisson"; mean: number };

/**
 * Only entry point for drawing samples. Normal draws take the RAW model SD and the 1.30x
 * correction (§3.2) is applied here and nowhere else, so callers cannot skip or double it.
 */
export function simulate(dist: Distribution, n: number, rng: Rng): Float64Array {
  if (!Number.isInteger(n) || n < MIN_SIMS) {
    throw new Error(`simulate: n must be an integer >= ${MIN_SIMS} (spec §3.1), got ${n}`);
  }
  const out = new Float64Array(n);
  if (dist.kind === "poisson") {
    for (let i = 0; i < n; i++) out[i] = poissonSample(dist.mean, rng);
    return out;
  }
  const sd = dist.rawSd * SD_CORRECTION;
  for (let i = 0; i < n; i += 2) {
    const [z1, z2] = normalPair(rng);
    out[i] = Math.max(0, dist.mean + sd * z1);
    if (i + 1 < n) out[i + 1] = Math.max(0, dist.mean + sd * z2);
  }
  return out;
}

export type LineProbabilities = {
  pOver: number;
  pUnder: number;
  pPush: number;
};

/** Pushes (x === line) are reported separately and count for neither side. */
export function lineProbabilities(samples: Float64Array, line: number): LineProbabilities {
  let over = 0;
  let under = 0;
  let push = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    if (x > line) over++;
    else if (x < line) under++;
    else push++;
  }
  const n = samples.length;
  return { pOver: over / n, pUnder: under / n, pPush: push / n };
}

export type StatType =
  | "pass_yds"
  | "pass_td"
  | "rush_yds"
  | "rec_yds"
  | "rec"
  | "rush_td"
  | "rec_td"
  | "pass_att"
  | "completions"
  | "targets";

export const TD_STATS: ReadonlySet<StatType> = new Set(["pass_td", "rush_td", "rec_td"]);

/** §3.4: any TD-count prop is Poisson; everything else is normal (§3.5). */
export function distributionFor(
  stat: StatType,
  mean: number,
  rawSd: number | null,
): Distribution {
  if (TD_STATS.has(stat)) return { kind: "poisson", mean };
  if (rawSd === null || !(rawSd >= 0)) {
    throw new Error(`distributionFor: ${stat} needs a raw SD`);
  }
  return { kind: "normal", mean, rawSd };
}
