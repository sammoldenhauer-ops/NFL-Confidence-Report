import { SNAP_DROP_FRACTION } from "./constants";
import type { StatType } from "./sim/engine";

// §5 item 1: grading joins on gsis_id only. The branded type makes it a compile error to pass a
// name string, and asGsisId rejects anything that isn't shaped like an nflverse gsis_id.
export type GsisId = string & { readonly __brand: "GsisId" };

const GSIS_RE = /^00-\d{7}$/;

export function isGsisId(s: string): s is GsisId {
  return GSIS_RE.test(s);
}

export function asGsisId(s: string): GsisId {
  if (!isGsisId(s)) throw new Error(`Not a gsis_id (name-string join is forbidden, §5.1): "${s}"`);
  return s;
}

export type Side = "over" | "under";

export type LoggedProp = {
  id: number;
  playerId: GsisId;
  gameId: string;
  stat: StatType;
  line: number;
  side: Side;
};

export type PlayerGameActuals = {
  playerId: GsisId;
  gameId: string;
  stats: Partial<Record<StatType, number>>;
  /** Offense snaps; 0/undefined with no stats means the player did not play. */
  offenseSnaps?: number;
};

export type GradeStatus = "hit" | "miss" | "push" | "void";

export type Grade = { propId: number; status: GradeStatus; actual: number | null };

const key = (p: GsisId, g: string) => `${p}|${g}`;

export function indexActuals(actuals: readonly PlayerGameActuals[]): Map<string, PlayerGameActuals> {
  const m = new Map<string, PlayerGameActuals>();
  for (const a of actuals) m.set(key(a.playerId, a.gameId), a);
  return m;
}

/**
 * Push (actual === line) is its own status, not a miss. A player with no box-score row and
 * no snaps is 'void' (book would refund), never silently a miss.
 */
export function gradeProp(prop: LoggedProp, actuals: Map<string, PlayerGameActuals>): Grade {
  const row = actuals.get(key(prop.playerId, prop.gameId));
  if (!row) return { propId: prop.id, status: "void", actual: null };
  const stat = row.stats[prop.stat];
  const actual = stat ?? 0;
  if (stat === undefined && !(row.offenseSnaps && row.offenseSnaps > 0)) {
    return { propId: prop.id, status: "void", actual: null };
  }
  if (actual === prop.line) return { propId: prop.id, status: "push", actual };
  const over = actual > prop.line;
  const hit = prop.side === "over" ? over : !over;
  return { propId: prop.id, status: hit ? "hit" : "miss", actual };
}

export type SnapRow = { playerId: GsisId; gameId: string; offensePct: number };

export type InjuryCandidate = {
  playerId: GsisId;
  gameId: string;
  offensePct: number;
  baselinePct: number;
  needsHumanConfirmation: true;
};

/**
 * §5 item 4: snap share, not production, is the only injury signal. Zero production with
 * normal snaps is never flagged. Flagged rows are candidates for a human, never auto-excluded.
 */
export function detectInjuryCandidates(
  snaps: readonly SnapRow[],
  baselineOffensePct: ReadonlyMap<string, number>,
  fraction = SNAP_DROP_FRACTION,
): InjuryCandidate[] {
  const out: InjuryCandidate[] = [];
  for (const s of snaps) {
    const base = baselineOffensePct.get(s.playerId);
    if (base === undefined || base <= 0) continue;
    if (s.offensePct < base * fraction) {
      out.push({
        playerId: s.playerId,
        gameId: s.gameId,
        offensePct: s.offensePct,
        baselinePct: base,
        needsHumanConfirmation: true,
      });
    }
  }
  return out;
}

export type TeamMismatch = { playerId: string; storedTeam: string; observedTeam: string };

/** §5 item 5: compare stored team assignment to the team observed in current-week data. */
export function findTeamMismatches(
  stored: ReadonlyMap<string, string>,
  observed: ReadonlyMap<string, string>,
): TeamMismatch[] {
  const out: TeamMismatch[] = [];
  for (const [playerId, obs] of observed) {
    const st = stored.get(playerId);
    if (st !== undefined && st !== obs) out.push({ playerId, storedTeam: st, observedTeam: obs });
  }
  return out;
}
