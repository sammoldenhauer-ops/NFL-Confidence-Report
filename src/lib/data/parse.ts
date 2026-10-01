import { parse } from "csv-parse/sync";
import { normalizeName, findNameCollisions, type NameCollision } from "../integrity/names";
import { verifyBlendedColumns, type BlendedRow, type BlendFinding } from "../shares";
import { tryNormalizeStat } from "../stats";
import type { StatType } from "../sim/engine";

// The starter files' names do not match their contents, so identity comes from the header row.

export type SchemaKind =
  | "graded_props"
  | "calibration_summary"
  | "share_baseline"
  | "share_overrides"
  | "proj_qb"
  | "proj_rb"
  | "proj_wrte"
  | "readme";

export function classifyHeaders(headers: string[]): SchemaKind | null {
  const h = new Set(headers.map((x) => x.trim()));
  const has = (...cols: string[]) => cols.every((c) => h.has(c));
  if (has("player", "stat", "line", "odds", "confidence_pct", "actual", "hit")) return "graded_props";
  if (has("bucket", "n", "hit_rate", "avg_confidence", "gap")) return "calibration_summary";
  if (has("team", "player", "target_share_pct", "blended_target_share_pct")) return "share_baseline";
  if (has("team", "player", "this_game_target_share_pct")) return "share_overrides";
  if (has("mean_pass_att")) return "proj_qb";
  if (has("mean_carries")) return "proj_rb";
  if (has("mean_targets")) return "proj_wrte";
  return null;
}

export type Row = Record<string, string>;

export function readCsv(text: string): { headers: string[]; rows: Row[] } {
  const rows = parse(text, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    trim: true,
  }) as Row[];
  const headers = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0].split(",").map((s) => s.trim());
  return { headers, rows };
}

const numOrNull = (v: string | undefined): number | null => {
  if (v === undefined || v === "" || v.toLowerCase() === "nan") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export type Finding = { check: string; severity: "info" | "warn" | "error"; subject?: string; detail?: unknown };

// ---------- graded props ----------

export type GradedRow = {
  playerName: string;
  statType: StatType;
  line: number;
  side: "over" | "under";
  odds: number;
  dollarWin: number | null;
  ourMean: number | null;
  confidencePct: number;
  source: string | null;
  gameLabel: string;
  actual: number;
  hitOriginal: boolean;
  excludeFromCalibration: boolean;
  isPush: boolean;
  sideImputed: boolean;
};

export function parseGraded(rows: Row[]): { rows: GradedRow[]; findings: Finding[] } {
  const out: GradedRow[] = [];
  const findings: Finding[] = [];
  let sideImputed = 0;
  let hitMismatch = 0;
  let pushes = 0;
  const unknownStats = new Set<string>();
  const mismatchSamples: string[] = [];

  for (const r of rows) {
    const stat = tryNormalizeStat(r.stat ?? "");
    if (!stat) {
      unknownStats.add(r.stat ?? "");
      continue;
    }
    const line = numOrNull(r.line);
    const conf = numOrNull(r.confidence_pct);
    const actual = numOrNull(r.actual);
    const odds = numOrNull(r.odds);
    if (line === null || conf === null || actual === null || odds === null) {
      findings.push({ check: "graded_row_incomplete", severity: "warn", subject: r.player, detail: r });
      continue;
    }
    const sideRaw = (r.side ?? "").toLowerCase();
    const side: "over" | "under" = sideRaw === "under" ? "under" : "over";
    if (!sideRaw) sideImputed++;
    const hit = (r.hit ?? "").toLowerCase() === "true";
    const isPush = actual === line;
    if (isPush) pushes++;
    const expected = isPush ? false : side === "over" ? actual > line : actual < line;
    if (expected !== hit) {
      hitMismatch++;
      if (mismatchSamples.length < 5) mismatchSamples.push(`${r.player} ${r.stat} ${line} ${side} actual=${actual} hit=${r.hit}`);
    }
    out.push({
      playerName: r.player,
      statType: stat,
      line,
      side,
      odds,
      dollarWin: numOrNull(r.dollar_win),
      ourMean: numOrNull(r.our_mean),
      confidencePct: conf,
      source: r.source || null,
      gameLabel: r.game,
      actual,
      hitOriginal: hit,
      excludeFromCalibration: (r.exclude_from_calibration ?? "").toLowerCase() === "true",
      isPush,
      sideImputed: !sideRaw,
    });
  }
  if (sideImputed)
    findings.push({
      check: "graded_blank_side",
      severity: "warn",
      detail: `${sideImputed} rows have no side; treated as Over (all have confidence consistent with Over).`,
    });
  if (unknownStats.size)
    findings.push({ check: "graded_unknown_stat", severity: "warn", detail: [...unknownStats] });
  if (pushes)
    findings.push({
      check: "graded_pushes_counted_as_miss",
      severity: "warn",
      detail: `${pushes} rows have actual == line. The source flagged them all as misses, and confidence for integer TD lines appears to have counted the push probability as a win. Kept as status=push; use the legacy toggle to reproduce the original buckets.`,
    });
  if (hitMismatch)
    findings.push({
      check: "graded_hit_flag_mismatch",
      severity: "warn",
      detail: { count: hitMismatch, samples: mismatchSamples },
    });
  return { rows: out, findings };
}

// ---------- share baseline / overrides ----------

export type BaselineRow = BlendedRow & { position: string | null };

export function parseBaseline(rows: Row[]): { rows: BaselineRow[]; findings: Finding[]; blendFindings: BlendFinding[]; collisions: NameCollision[] } {
  const out: BaselineRow[] = rows.map((r) => ({
    team: r.team ?? "",
    player: r.player,
    position: r.position || null,
    targetPct: numOrNull(r.target_share_pct),
    rushPct: numOrNull(r.rush_share_pct),
    wk1TargetPct: numOrNull(r.wk1_target_share_pct),
    wk1RushPct: numOrNull(r.wk1_rush_share_pct),
    blendedTargetPct: numOrNull(r.blended_target_share_pct),
    blendedRushPct: numOrNull(r.blended_rush_share_pct),
  }));
  const findings: Finding[] = [];
  const noTeam = out.filter((r) => !r.team);
  if (noTeam.length)
    findings.push({
      check: "share_row_no_team",
      severity: "warn",
      detail: `${noTeam.length} baseline rows have no team (§5.5): ${noTeam.slice(0, 8).map((r) => r.player).join(", ")}...`,
    });
  const collisions = findNameCollisions(out.map((r) => ({ team: r.team, name: r.player })));
  for (const c of collisions) findings.push({ check: `name_${c.kind}`, severity: "warn", subject: c.team, detail: c.names });
  const blendFindings = verifyBlendedColumns(out);
  for (const b of blendFindings) findings.push({ check: "blended_mismatch", severity: "error", subject: `${b.team} ${b.player}`, detail: b });
  return { rows: out, findings, blendFindings, collisions };
}

export type OverrideRow = { team: string; player: string; targetPct: number | null; rushPct: number | null };

export function parseOverrides(rows: Row[]): OverrideRow[] {
  return rows.map((r) => ({
    team: r.team,
    player: r.player,
    targetPct: numOrNull(r.this_game_target_share_pct),
    rushPct: numOrNull(r.this_game_rush_share_pct),
  }));
}

// ---------- calibration summary (used only as a regression reference) ----------

export type CalibrationRef = { bucket: string; n: number; hitRate: number; avgConfidence: number; gap: number };

export function parseCalibrationRef(rows: Row[]): CalibrationRef[] {
  return rows.map((r) => ({
    bucket: r.bucket,
    n: Number(r.n),
    hitRate: Number(r.hit_rate),
    avgConfidence: Number(r.avg_confidence),
    gap: Number(r.gap),
  }));
}

// ---------- projections (wide -> long) ----------

export type ProjectionLong = {
  playerName: string;
  team: string | null;
  opponent: string;
  week: number;
  stat: string;
  mean: number;
  sd: number | null;
};

const WIDE: Record<"proj_qb" | "proj_rb" | "proj_wrte", Array<[string, string, string | null]>> = {
  proj_qb: [
    ["pass_att", "mean_pass_att", null],
    ["completions", "mean_completions", null],
    ["pass_yds", "mean_pass_yds", "sd_pass_yds"],
    ["pass_td", "mean_pass_td", null],
    ["int", "mean_int", null],
    ["rush_att", "mean_rush_att", null],
    ["rush_yds", "mean_rush_yds", null],
    ["rush_td", "mean_rush_td", null],
  ],
  proj_rb: [
    ["rush_att", "mean_carries", "sd_carries"],
    ["rush_yds", "mean_rush_yds", "sd_rush_yds"],
    ["rec", "mean_rec", "sd_rec"],
    ["rec_yds", "mean_rec_yds", "sd_rec_yds"],
    ["td_total", "mean_td", "sd_td"],
  ],
  proj_wrte: [
    ["targets", "mean_targets", "sd_targets"],
    ["rec", "mean_rec", "sd_rec"],
    ["rec_yds", "mean_rec_yds", "sd_rec_yds"],
    ["rec_td", "mean_td", "sd_td"],
  ],
};

/** BYE / blank rows are skipped. SDs are the RAW model SDs (the 1.30x is applied in simulate()). */
export function expandProjections(kind: "proj_qb" | "proj_rb" | "proj_wrte", rows: Row[]): ProjectionLong[] {
  const out: ProjectionLong[] = [];
  for (const r of rows) {
    const week = numOrNull(r.week);
    if (week === null || !r.player || r.opponent === "BYE") continue;
    for (const [stat, meanCol, sdCol] of WIDE[kind]) {
      const mean = numOrNull(r[meanCol]);
      if (mean === null) continue;
      out.push({
        playerName: r.player,
        team: r.team || null,
        opponent: r.opponent,
        week,
        stat,
        mean,
        sd: sdCol ? numOrNull(r[sdCol]) : null,
      });
    }
  }
  return out;
}

export { normalizeName };
