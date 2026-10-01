import { sql } from "drizzle-orm";
import type { Db } from "../../db";
import { games, ingestRuns, playerGameStats, players, snapCounts } from "../../db/schema";
import { normalizeName } from "../integrity/names";
import { NFLVERSE, fetchCsv, streamCsv } from "./fetch";
import { aggregatePbp } from "./pbp";

const CHUNK = 1000;

async function inChunks<T>(rows: T[], fn: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += CHUNK) await fn(rows.slice(i, i + CHUNK));
}

export type IngestSummary = {
  season: number;
  players: number;
  games: number;
  completedGames: number;
  playerGames: number;
  snapRows: number;
  unmappedSnapRows: number;
};

/** Pulls the latest nflverse releases for a season and upserts them. Idempotent. */
export async function ingestNflverse(db: Db, season: number): Promise<IngestSummary> {
  const playerRows = await fetchCsv(NFLVERSE.players());
  const valid = playerRows.filter(
    (p) => p.gsis_id?.startsWith("00-") && (!p.last_season || Number(p.last_season) >= season - 2),
  );
  await inChunks(valid, (chunk) =>
    db
      .insert(players)
      .values(
        chunk.map((p) => ({
          gsisId: p.gsis_id,
          displayName: p.display_name,
          nameNormalized: normalizeName(p.display_name),
          pfrId: p.pfr_id || null,
          status: p.status || null,
          team: p.latest_team || null,
          position: p.position || null,
        })),
      )
      .onConflictDoUpdate({
        target: players.gsisId,
        set: {
          displayName: sql`excluded.display_name`,
          nameNormalized: sql`excluded.name_normalized`,
          pfrId: sql`excluded.pfr_id`,
          status: sql`excluded.status`,
          team: sql`excluded.team`,
          position: sql`excluded.position`,
          updatedAt: sql`now()`,
        },
      }),
  );

  const agg = await aggregatePbp(streamCsv(NFLVERSE.pbp(season)));
  await inChunks(agg.games, (chunk) =>
    db
      .insert(games)
      .values(chunk)
      .onConflictDoUpdate({
        target: games.gameId,
        set: {
          homeScore: sql`excluded.home_score`,
          awayScore: sql`excluded.away_score`,
          completed: sql`excluded.completed`,
        },
      }),
  );
  await inChunks(agg.playerGames, (chunk) =>
    db
      .insert(playerGameStats)
      .values(chunk)
      .onConflictDoUpdate({
        target: [playerGameStats.playerId, playerGameStats.gameId],
        set: {
          team: sql`excluded.team`,
          passYds: sql`excluded.pass_yds`,
          passTd: sql`excluded.pass_td`,
          rushYds: sql`excluded.rush_yds`,
          rushTd: sql`excluded.rush_td`,
          rec: sql`excluded.rec`,
          recYds: sql`excluded.rec_yds`,
          recTd: sql`excluded.rec_td`,
          targets: sql`excluded.targets`,
        },
      }),
  );

  // Snap counts are keyed by pfr id; map to gsis_id through the players release.
  const pfrToGsis = new Map(valid.filter((p) => p.pfr_id).map((p) => [p.pfr_id, p.gsis_id]));
  const snapRaw = await fetchCsv(NFLVERSE.snapCounts(season));
  const snapRows = [];
  let unmapped = 0;
  for (const s of snapRaw) {
    if (s.game_type && s.game_type !== "REG") continue;
    const gsis = pfrToGsis.get(s.pfr_player_id);
    if (!gsis) {
      unmapped++;
      continue;
    }
    snapRows.push({
      playerId: gsis,
      gameId: s.game_id,
      season: Number(s.season),
      week: Number(s.week),
      team: s.team || null,
      offenseSnaps: s.offense_snaps === "" ? null : Number(s.offense_snaps),
      offensePct: s.offense_pct === "" ? null : Number(s.offense_pct),
    });
  }
  await inChunks(snapRows, (chunk) =>
    db
      .insert(snapCounts)
      .values(chunk)
      .onConflictDoUpdate({
        target: [snapCounts.playerId, snapCounts.gameId],
        set: { offenseSnaps: sql`excluded.offense_snaps`, offensePct: sql`excluded.offense_pct`, team: sql`excluded.team` },
      }),
  );

  const summary: IngestSummary = {
    season,
    players: valid.length,
    games: agg.games.length,
    completedGames: agg.games.filter((g) => g.completed).length,
    playerGames: agg.playerGames.length,
    snapRows: snapRows.length,
    unmappedSnapRows: unmapped,
  };
  await db.insert(ingestRuns).values({ kind: "nflverse", season, ok: true, detail: summary });
  return summary;
}
