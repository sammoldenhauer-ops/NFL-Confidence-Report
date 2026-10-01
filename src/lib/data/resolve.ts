import { normalizeName } from "../integrity/names";

const TEAM_ALIASES: Record<string, string> = {
  LAR: "LA",
  STL: "LA",
  JAC: "JAX",
  WSH: "WAS",
  SD: "LAC",
  SDG: "LAC",
  OAK: "LV",
  ARZ: "ARI",
  BLT: "BAL",
  CLV: "CLE",
  HST: "HOU",
  SL: "LA",
  LVR: "LV",
  KAN: "KC",
  NWE: "NE",
  NOR: "NO",
  SFO: "SF",
  TAM: "TB",
  GNB: "GB",
};

export const normalizeTeam = (t: string | null | undefined): string => {
  const u = (t ?? "").trim().toUpperCase();
  return TEAM_ALIASES[u] ?? u;
};

export type PlayerLite = { gsisId: string; displayName: string; team: string | null; position?: string | null };

export type PlayerIndex = Map<string, PlayerLite[]>;

export function buildPlayerIndex(players: readonly PlayerLite[]): PlayerIndex {
  const idx: PlayerIndex = new Map();
  for (const p of players) {
    const k = normalizeName(p.displayName);
    const list = idx.get(k);
    if (list) list.push(p);
    else idx.set(k, [p]);
  }
  return idx;
}

export type Resolution =
  | { status: "resolved"; gsisId: string; via: "unique" | "team" }
  | { status: "ambiguous"; candidates: PlayerLite[] }
  | { status: "missing" };

/**
 * Resolves a display name to a gsis_id. This happens once, at import, so that everything
 * downstream (props, grading) is ID-keyed. A name shared by several players is resolved by team
 * hint only if that leaves exactly one; otherwise it is reported, never guessed.
 */
export function resolvePlayer(index: PlayerIndex, name: string, teamHints: readonly (string | null | undefined)[] = []): Resolution {
  const cands = index.get(normalizeName(name)) ?? [];
  if (cands.length === 0) return { status: "missing" };
  if (cands.length === 1) return { status: "resolved", gsisId: cands[0].gsisId, via: "unique" };
  const hints = new Set(teamHints.filter(Boolean).map((t) => normalizeTeam(t)));
  const byTeam = cands.filter((c) => hints.has(normalizeTeam(c.team)));
  if (byTeam.length === 1) return { status: "resolved", gsisId: byTeam[0].gsisId, via: "team" };
  return { status: "ambiguous", candidates: byTeam.length > 1 ? byTeam : cands };
}

export type GameLite = { gameId: string; week: number; homeTeam: string; awayTeam: string; completed?: boolean };

export type GameResolution =
  | { status: "resolved"; game: GameLite }
  | { status: "ambiguous"; games: GameLite[] }
  | { status: "missing" };

/**
 * Game labels in the source data do not consistently follow home/away order ("DET @ NO" is
 * nflverse's NO @ DET), so the two teams are matched as an unordered pair.
 */
export function resolveGameByLabel(games: readonly GameLite[], label: string): GameResolution {
  const parts = label.split(/\s*@\s*|\s+vs\.?\s+/i).map(normalizeTeam);
  if (parts.length !== 2) return { status: "missing" };
  const [a, b] = parts;
  const hits = games.filter(
    (g) =>
      (normalizeTeam(g.homeTeam) === a && normalizeTeam(g.awayTeam) === b) ||
      (normalizeTeam(g.homeTeam) === b && normalizeTeam(g.awayTeam) === a),
  );
  if (hits.length === 0) return { status: "missing" };
  if (hits.length === 1) return { status: "resolved", game: hits[0] };
  const done = hits.filter((g) => g.completed);
  if (done.length === 1) return { status: "resolved", game: done[0] };
  return { status: "ambiguous", games: hits };
}
