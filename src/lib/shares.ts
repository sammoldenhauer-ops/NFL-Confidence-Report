import { SHARE_BLEND } from "./constants";

export type ShareKind = keyof typeof SHARE_BLEND;

export type ShareRow = {
  playerId: string;
  team: string;
  targetPct: number | null;
  rushPct: number | null;
};

/** §3.3: prior/current blend. Missing side falls back to the other; both missing -> null. */
export function blendShare(prior: number | null, current: number | null, kind: ShareKind): number | null {
  if (prior == null && current == null) return null;
  if (prior == null) return current;
  if (current == null) return prior;
  const w = SHARE_BLEND[kind];
  return prior * w.prior + current * w.current;
}

export type ShareOverride = {
  playerId: string;
  team: string;
  targetPct?: number | null;
  rushPct?: number | null;
};

/**
 * §8: overrides layer on top of the baseline and never mutate it. Returns a new list;
 * the input baseline array and its rows are left untouched.
 */
export function applyOverrides(
  baseline: readonly ShareRow[],
  overrides: readonly ShareOverride[],
): ShareRow[] {
  const byPlayer = new Map(overrides.map((o) => [o.playerId, o]));
  const out = baseline.map((r) => {
    const o = byPlayer.get(r.playerId);
    if (!o) return { ...r };
    return {
      ...r,
      targetPct: o.targetPct !== undefined ? o.targetPct : r.targetPct,
      rushPct: o.rushPct !== undefined ? o.rushPct : r.rushPct,
    };
  });
  const seen = new Set(out.map((r) => r.playerId));
  for (const o of overrides) {
    if (!seen.has(o.playerId)) {
      out.push({ playerId: o.playerId, team: o.team, targetPct: o.targetPct ?? null, rushPct: o.rushPct ?? null });
    }
  }
  return out;
}

export type Allocation = { playerId: string; fraction: number };

/**
 * Moves an absent player's share to named replacements. Team totals are conserved
 * exactly (checked), so shares are neither created nor lost.
 */
export function redistributeShare(
  rows: readonly ShareRow[],
  outPlayerId: string,
  allocations: readonly Allocation[],
): ShareRow[] {
  const fracSum = allocations.reduce((s, a) => s + a.fraction, 0);
  if (allocations.length === 0 || Math.abs(fracSum - 1) > 1e-9) {
    throw new Error(`Allocation fractions must sum to 1, got ${fracSum}`);
  }
  const out = rows.find((r) => r.playerId === outPlayerId);
  if (!out) throw new Error(`Player ${outPlayerId} not in share table`);
  const missing = allocations.filter((a) => !rows.some((r) => r.playerId === a.playerId));
  if (missing.length) throw new Error(`Replacement(s) not in share table: ${missing.map((m) => m.playerId).join(", ")}`);
  if (allocations.some((a) => a.playerId === outPlayerId)) throw new Error("A player cannot replace themselves");

  const result = rows.map((r) => ({ ...r }));
  const gone = result.find((r) => r.playerId === outPlayerId)!;
  const t = gone.targetPct ?? 0;
  const ru = gone.rushPct ?? 0;
  for (const a of allocations) {
    const r = result.find((x) => x.playerId === a.playerId)!;
    if (t) r.targetPct = (r.targetPct ?? 0) + t * a.fraction;
    if (ru) r.rushPct = (r.rushPct ?? 0) + ru * a.fraction;
  }
  gone.targetPct = gone.targetPct == null ? null : 0;
  gone.rushPct = gone.rushPct == null ? null : 0;

  assertSharesConserved(rows, result, out.team);
  return result;
}

export function teamTotals(rows: readonly ShareRow[], team: string): { target: number; rush: number } {
  let target = 0;
  let rush = 0;
  for (const r of rows) {
    if (r.team !== team) continue;
    target += r.targetPct ?? 0;
    rush += r.rushPct ?? 0;
  }
  return { target, rush };
}

export function assertSharesConserved(
  before: readonly ShareRow[],
  after: readonly ShareRow[],
  team: string,
  tol = 1e-6,
): void {
  const b = teamTotals(before, team);
  const a = teamTotals(after, team);
  if (Math.abs(b.target - a.target) > tol || Math.abs(b.rush - a.rush) > tol) {
    throw new Error(
      `Share redistribution changed ${team} totals: target ${b.target}->${a.target}, rush ${b.rush}->${a.rush}`,
    );
  }
}

export type BlendedRow = {
  team: string;
  player: string;
  targetPct: number | null;
  rushPct: number | null;
  wk1TargetPct: number | null;
  wk1RushPct: number | null;
  blendedTargetPct: number | null;
  blendedRushPct: number | null;
};

export type BlendFinding = { team: string; player: string; field: "target" | "rush"; stored: number | null; expected: number | null };

/**
 * §5 item 3: a stored blended value must equal the §3.3 blend of the stored prior and
 * current values. A mismatch means something (e.g. an override or an injury zeroing) was
 * written over the permanent baseline instead of the override table.
 */
export function verifyBlendedColumns(rows: readonly BlendedRow[], tol = 0.15): BlendFinding[] {
  const findings: BlendFinding[] = [];
  for (const r of rows) {
    const checks: Array<["target" | "rush", number | null, number | null, number | null, ShareKind]> = [
      ["target", r.targetPct, r.wk1TargetPct, r.blendedTargetPct, "target"],
      ["rush", r.rushPct, r.wk1RushPct, r.blendedRushPct, "rush"],
    ];
    for (const [field, prior, cur, stored, kind] of checks) {
      const expected = blendShare(prior, cur, kind);
      const bad =
        (expected == null) !== (stored == null) ||
        (expected != null && stored != null && Math.abs(expected - stored) > tol);
      if (bad) findings.push({ team: r.team, player: r.player, field, stored, expected });
    }
  }
  return findings;
}
