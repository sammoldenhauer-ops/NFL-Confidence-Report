"use server";

import { getDb } from "../../db";
import { games, props } from "../../db/schema";
import { parsePastedLines } from "../../lib/data/paste";
import { resolveGameByLabel, type GameLite } from "../../lib/data/resolve";
import { buildReport, groupByTab } from "../../lib/sim/report";

export type GenerateReportState = {
  groups: ReturnType<typeof groupByTab> | null;
  parseErrors: { raw: string; reason: string }[];
  season: number;
  week: number;
  logged: number | null;
};

export async function generateReport(
  prev: GenerateReportState,
  formData: FormData,
): Promise<GenerateReportState> {
  const text = String(formData.get("lines") ?? "");
  const season = Number(formData.get("season") ?? process.env.SEASON ?? new Date().getFullYear());
  const week = Number(formData.get("week") ?? process.env.WEEK ?? 1);
  const shouldLog = formData.get("log") === "on";

  const { lines, errors } = parsePastedLines(text);
  if (lines.length === 0) {
    return { groups: null, parseErrors: errors, season, week, logged: null };
  }

  const db = getDb();
  const rows = await buildReport(db, lines, season, week);
  const groups = groupByTab(rows);

  let logged: number | null = null;
  if (shouldLog) {
    const gameRows = (await db.select().from(games)) as GameLite[];
    const okRows = groups.all;
    if (okRows.length > 0) {
      await db.insert(props).values(
        okRows.map((r) => {
          const gameId = r.gameLabel ? resolveGameByLabel(gameRows, r.gameLabel) : null;
          return {
            playerName: r.playerName,
            playerId: r.playerId,
            statType: r.stat,
            line: r.line,
            odds: r.odds,
            side: r.side,
            confidencePct: r.confidencePct,
            pushPct: r.pushPct,
            ourMean: r.ourMean,
            gameLabel: r.gameLabel,
            gameId: gameId && gameId.status === "resolved" ? gameId.game.gameId : null,
            week,
            season,
            source: "paste-report",
          };
        }),
      );
      logged = okRows.length;
    }
  }

  return { groups, parseErrors: errors, season, week, logged };
}
