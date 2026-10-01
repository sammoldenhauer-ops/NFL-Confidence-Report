// Loads everything in data/ into the DB. Schema is detected by header (§9: filenames lie),
// names are resolved to gsis_id once here, and every integrity finding (§5) is written to
// data_quality_findings instead of being silently dropped.
import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../src/db";
import { dataQualityFindings, players, props, shareBaseline, shareOverrides, playerProjections } from "../src/db/schema";
import {
  classifyHeaders,
  expandProjections,
  parseBaseline,
  parseGraded,
  parseOverrides,
  readCsv,
  type Finding,
} from "../src/lib/data/parse";
import { buildPlayerIndex, resolvePlayer, type PlayerLite } from "../src/lib/data/resolve";
import { gradedProps, games as gamesTable } from "../src/db/schema";
import { resolveGameByLabel, type GameLite } from "../src/lib/data/resolve";

const DATA_DIR = process.argv[2] ?? "data";
const SEASON = Number(process.env.SEASON ?? new Date().getFullYear());
const db = getDb();
const allFindings: Finding[] = [];

async function flushFindings() {
  if (!allFindings.length) return;
  await db.insert(dataQualityFindings).values(
    allFindings.map((f) => ({ check: f.check, severity: f.severity, subject: f.subject ?? null, detail: f.detail ?? null })),
  );
  console.log(`${allFindings.length} findings written to data_quality_findings`);
}

async function main() {
  const files = readdirSync(DATA_DIR).filter((f) => f.endsWith(".csv"));
  if (!files.length) {
    console.error(`No .csv files in ${DATA_DIR}. Point this script at the data/ folder from Section 9.`);
    process.exit(1);
  }

  const playerRows = await db.select().from(players);
  const index = buildPlayerIndex(playerRows as PlayerLite[]);
  // A weekly-wide file resolves the same player up to 18 times; report each unresolved name once.
  const warnedUnresolved = new Set<string>();
  const resolve = (name: string, teamHints: (string | null | undefined)[] = []) => {
    const r = resolvePlayer(index, name, teamHints);
    if (r.status !== "resolved") {
      const dedupeKey = `${r.status}|${name}|${teamHints.join(",")}`;
      if (!warnedUnresolved.has(dedupeKey)) {
        warnedUnresolved.add(dedupeKey);
        allFindings.push({
          check: r.status === "missing" ? "player_not_found" : "player_ambiguous",
          severity: "warn",
          subject: name,
          detail: r.status === "ambiguous" ? r.candidates.map((c) => ({ id: c.gsisId, team: c.team })) : undefined,
        });
      }
      return null;
    }
    return r.gsisId;
  };

  const byKind = new Map<string, { file: string; headers: string[]; rows: ReturnType<typeof readCsv>["rows"] }[]>();
  for (const file of files) {
    const text = readFileSync(join(DATA_DIR, file), "utf8");
    const { headers, rows } = readCsv(text);
    const kind = classifyHeaders(headers);
    if (!kind) {
      allFindings.push({ check: "unclassified_file", severity: "warn", subject: file, detail: headers });
      console.warn(`! ${file}: could not classify by header, skipping`);
      continue;
    }
    console.log(`${file} -> ${kind} (${rows.length} rows)`);
    const list = byKind.get(kind) ?? [];
    list.push({ file, headers, rows });
    byKind.set(kind, list);
  }

  // Share baseline: current-season permanent blended baseline.
  for (const { file, rows } of byKind.get("share_baseline") ?? []) {
    const { rows: parsed, findings } = parseBaseline(rows);
    allFindings.push(...findings.map((f) => ({ ...f, subject: f.subject ?? file })));
    for (const r of parsed) {
      const playerId = resolve(r.player, [r.team]);
      await db
        .insert(shareBaseline)
        .values({
          season: SEASON,
          team: r.team || null,
          playerName: r.player,
          playerId,
          position: r.position,
          targetSharePct: r.targetPct,
          rushSharePct: r.rushPct,
          wk1TargetSharePct: r.wk1TargetPct,
          blendedTargetSharePct: r.blendedTargetPct,
          wk1RushSharePct: r.wk1RushPct,
          blendedRushSharePct: r.blendedRushPct,
          sourceFile: file,
        })
        .onConflictDoUpdate({
          target: [shareBaseline.season, shareBaseline.team, shareBaseline.playerName],
          set: {
            playerId: sql`excluded.player_id`,
            position: sql`excluded.position`,
            targetSharePct: sql`excluded.target_share_pct`,
            rushSharePct: sql`excluded.rush_share_pct`,
            wk1TargetSharePct: sql`excluded.wk1_target_share_pct`,
            blendedTargetSharePct: sql`excluded.blended_target_share_pct`,
            wk1RushSharePct: sql`excluded.wk1_rush_share_pct`,
            blendedRushSharePct: sql`excluded.blended_rush_share_pct`,
          },
        });
    }
  }

  // This-week temporary overrides: never touch share_baseline (§5.3, §8).
  for (const { file, rows } of byKind.get("share_overrides") ?? []) {
    const parsed = parseOverrides(rows);
    const week = Number(process.env.WEEK ?? 1);
    for (const r of parsed) {
      const playerId = resolve(r.player, [r.team]);
      await db.insert(shareOverrides).values({
        playerName: r.player,
        playerId,
        team: r.team,
        week,
        season: SEASON,
        targetSharePct: r.targetPct,
        rushSharePct: r.rushPct,
        reason: `imported from ${file}`,
      });
    }
  }

  // Wide per-team projection files -> long rows, resolved to player ids.
  for (const kind of ["proj_qb", "proj_rb", "proj_wrte"] as const) {
    for (const { file, rows } of byKind.get(kind) ?? []) {
      const long = expandProjections(kind, rows);
      for (const r of long) {
        const playerId = resolve(r.playerName, [r.team]);
        await db
          .insert(playerProjections)
          .values({
            playerName: r.playerName,
            playerId,
            team: r.team,
            opponent: r.opponent,
            week: r.week,
            season: SEASON,
            statType: r.stat,
            meanStat: r.mean,
            sdStat: r.sd,
            source: file,
          })
          .onConflictDoUpdate({
            target: [
              playerProjections.season,
              playerProjections.week,
              playerProjections.playerName,
              playerProjections.statType,
              playerProjections.source,
            ],
            set: { meanStat: sql`excluded.mean_stat`, sdStat: sql`excluded.sd_stat`, playerId: sql`excluded.player_id` },
          });
      }
    }
  }

  // Graded calibration history: resolve player + game, then write props + graded_props together
  // so a confidence row never exists without its grade (and vice versa).
  const gameRows = (await db.select().from(gamesTable)) as GameLite[];
  for (const { file, rows } of byKind.get("graded_props") ?? []) {
    const { rows: parsed, findings } = parseGraded(rows);
    allFindings.push(...findings.map((f) => ({ ...f, subject: f.subject ?? file })));
    let gameNotFound = 0;
    for (const r of parsed) {
      const playerId = resolve(r.playerName);
      const gameRes = resolveGameByLabel(gameRows, r.gameLabel);
      const gameId = gameRes.status === "resolved" ? gameRes.game.gameId : null;
      if (gameRes.status !== "resolved") gameNotFound++;
      const values = {
        playerName: r.playerName,
        playerId,
        statType: r.statType,
        line: r.line,
        odds: r.odds,
        side: r.side,
        dollarWin: r.dollarWin,
        ourMean: r.ourMean,
        confidencePct: r.confidencePct,
        gameLabel: r.gameLabel,
        gameId,
        week: 0,
        season: SEASON,
        source: r.source,
        sourceFile: file,
      };
      let [inserted] = await db.insert(props).values(values).onConflictDoNothing().returning({ id: props.id });
      if (!inserted) {
        // Already imported from this exact file in a prior run — reuse the existing row.
        [inserted] = await db
          .select({ id: props.id })
          .from(props)
          .where(
            and(
              eq(props.season, values.season),
              eq(props.week, values.week),
              eq(props.playerName, values.playerName),
              eq(props.statType, values.statType),
              eq(props.line, values.line),
              eq(props.side, values.side),
              values.gameLabel ? eq(props.gameLabel, values.gameLabel) : isNull(props.gameLabel),
              eq(props.sourceFile, values.sourceFile),
            ),
          )
          .limit(1);
      }
      const status = r.isPush ? "push" : r.hitOriginal ? "hit" : "miss";
      await db
        .insert(gradedProps)
        .values({
          propId: inserted.id,
          actualResult: r.actual,
          hit: status === "hit",
          status,
          excludeFromCalibration: r.excludeFromCalibration || r.isPush,
          excludeReason: r.isPush ? "push: excluded from strict calibration view" : null,
        })
        .onConflictDoUpdate({
          target: gradedProps.propId,
          set: {
            actualResult: sql`excluded.actual_result`,
            hit: sql`excluded.hit`,
            status: sql`excluded.status`,
            excludeFromCalibration: sql`excluded.exclude_from_calibration`,
            excludeReason: sql`excluded.exclude_reason`,
          },
        });
    }
    if (gameNotFound)
      allFindings.push({ check: "graded_game_not_found", severity: "warn", subject: file, detail: `${gameNotFound} rows` });
  }

  await flushFindings();
  console.log("import complete");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
