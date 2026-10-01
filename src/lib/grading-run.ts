// §5: grades logged props against real box scores, joined on gsis_id only — never name strings.
// Shared by scripts/grade.mts (manual/CI run) and the weekly cron route.
import { eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db";
import { games, gradedProps, playerGameStats, props, snapCounts } from "../db/schema";
import { asGsisId, gradeProp, indexActuals, type GsisId, type LoggedProp, type PlayerGameActuals } from "./grading";
import type { StatType } from "./sim/engine";

export type GradingSummary = { graded: number; hit: number; miss: number; push: number; void: number };

export async function gradePendingProps(db: Db): Promise<GradingSummary> {
  const completedGames = await db.select().from(games).where(eq(games.completed, true));
  const completedIds = completedGames.map((g) => g.gameId);
  if (completedIds.length === 0) return { graded: 0, hit: 0, miss: 0, push: 0, void: 0 };

  const pending = await db
    .select({ prop: props, graded: gradedProps })
    .from(props)
    .leftJoin(gradedProps, eq(gradedProps.propId, props.id))
    .where(inArray(props.gameId, completedIds));

  const toGrade = pending.filter((r) => r.prop.playerId && (!r.graded || r.graded.actualResult === null));
  if (toGrade.length === 0) return { graded: 0, hit: 0, miss: 0, push: 0, void: 0 };

  const gameIds = [...new Set(toGrade.map((r) => r.prop.gameId!))];
  const [statRows, snapRows] = await Promise.all([
    db.select().from(playerGameStats).where(inArray(playerGameStats.gameId, gameIds)),
    db.select().from(snapCounts).where(inArray(snapCounts.gameId, gameIds)),
  ]);

  const snapByKey = new Map(snapRows.map((s) => [`${s.playerId}|${s.gameId}`, s.offenseSnaps ?? 0]));
  const actuals: PlayerGameActuals[] = statRows.map((s) => ({
    playerId: s.playerId as GsisId,
    gameId: s.gameId,
    offenseSnaps: snapByKey.get(`${s.playerId}|${s.gameId}`) ?? 0,
    stats: {
      pass_yds: s.passYds,
      pass_td: s.passTd,
      rush_yds: s.rushYds,
      rush_td: s.rushTd,
      rec: s.rec,
      rec_yds: s.recYds,
      rec_td: s.recTd,
      targets: s.targets,
    },
  }));
  const actualsByKey = indexActuals(actuals);

  const summary: GradingSummary = { graded: 0, hit: 0, miss: 0, push: 0, void: 0 };

  for (const row of toGrade) {
    const p = row.prop;
    const loggedProp: LoggedProp = {
      id: p.id,
      playerId: asGsisId(p.playerId!),
      gameId: p.gameId!,
      stat: p.statType as StatType,
      line: p.line,
      side: p.side as "over" | "under",
    };
    const grade = gradeProp(loggedProp, actualsByKey);
    summary.graded++;
    summary[grade.status]++;

    await db
      .insert(gradedProps)
      .values({
        propId: p.id,
        actualResult: grade.actual,
        hit: grade.status === "hit",
        status: grade.status,
        excludeFromCalibration: grade.status === "void" || grade.status === "push",
        excludeReason:
          grade.status === "void" ? "no box-score row and no snaps (did not play)" : grade.status === "push" ? "push" : null,
      })
      .onConflictDoUpdate({
        target: gradedProps.propId,
        set: {
          actualResult: sql`excluded.actual_result`,
          hit: sql`excluded.hit`,
          status: sql`excluded.status`,
          excludeFromCalibration: sql`excluded.exclude_from_calibration`,
          excludeReason: sql`excluded.exclude_reason`,
          gradedAt: sql`now()`,
        },
      });
  }

  return summary;
}
