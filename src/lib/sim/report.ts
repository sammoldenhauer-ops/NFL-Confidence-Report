import { and, eq } from "drizzle-orm";
import type { Db } from "../../db";
import { playerProjections } from "../../db/schema";
import { normalizeName } from "../integrity/names";
import type { PastedLine } from "../data/paste";
import { confidenceForProp, tabFor, type ConfidenceResult } from "./project-prop";

export type ReportRow = PastedLine &
  (
    | ({ status: "ok"; playerId: string | null } & ConfidenceResult)
    | { status: "no_projection" }
    | { status: "ambiguous"; candidates: string[] }
  );

/**
 * Resolves each pasted line against that week's player_projections (by normalized name, since
 * the pasted text has no player_id) and runs the simulation. A line with no matching projection
 * is reported as such rather than silently dropped or guessed.
 */
export async function buildReport(db: Db, lines: PastedLine[], season: number, week: number): Promise<ReportRow[]> {
  const rows = await db
    .select()
    .from(playerProjections)
    .where(and(eq(playerProjections.season, season), eq(playerProjections.week, week)));

  const byKey = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${normalizeName(r.playerName)}|${r.statType}`;
    const list = byKey.get(key) ?? [];
    list.push(r);
    byKey.set(key, list);
  }

  return lines.map((line): ReportRow => {
    const key = `${normalizeName(line.playerName)}|${line.stat}`;
    const matches = byKey.get(key) ?? [];
    if (matches.length === 0) return { ...line, status: "no_projection" };
    if (matches.length > 1) {
      const distinct = new Set(matches.map((m) => `${m.playerName} (${m.team ?? "?"})`));
      if (distinct.size > 1) return { ...line, status: "ambiguous", candidates: [...distinct] };
    }
    const proj = matches[0];
    const result = confidenceForProp(
      { playerName: line.playerName, playerId: proj.playerId, stat: line.stat, line: line.line, side: line.side, odds: line.odds },
      { mean: proj.meanStat, rawSd: proj.sdStat },
    );
    return { ...line, status: "ok", playerId: proj.playerId, ...result };
  });
}

export function groupByTab(rows: ReportRow[]) {
  const ok = rows.filter((r): r is ReportRow & { status: "ok" } => r.status === "ok");
  return {
    all: ok,
    favorites: ok.filter((r) => r.tab === "favorite"),
    underdogs: ok.filter((r) => r.tab === "underdog"),
    pickems: ok.filter((r) => r.tab === "pickem"),
    unresolved: rows.filter((r) => r.status !== "ok"),
  };
}

export { tabFor };
