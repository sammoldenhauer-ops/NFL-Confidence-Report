import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// §8 core tables. gsis_id is the only identity used for grading joins (§5.1).

export const players = pgTable(
  "players",
  {
    gsisId: text("gsis_id").primaryKey(),
    displayName: text("display_name").notNull(),
    nameNormalized: text("name_normalized").notNull(),
    pfrId: text("pfr_id"),
    status: text("status"),
    team: text("team"),
    position: text("position"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("players_name_norm_idx").on(t.nameNormalized)],
);

// Permanent blended baseline. Overrides live in share_overrides and never write here (§8, §5.3).
export const shareBaseline = pgTable(
  "share_baseline",
  {
    id: serial("id").primaryKey(),
    season: integer("season").notNull(),
    team: text("team"),
    playerName: text("player_name").notNull(),
    playerId: text("player_id").references(() => players.gsisId),
    position: text("position"),
    targetSharePct: doublePrecision("target_share_pct"),
    rushSharePct: doublePrecision("rush_share_pct"),
    wk1TargetSharePct: doublePrecision("wk1_target_share_pct"),
    blendedTargetSharePct: doublePrecision("blended_target_share_pct"),
    wk1RushSharePct: doublePrecision("wk1_rush_share_pct"),
    blendedRushSharePct: doublePrecision("blended_rush_share_pct"),
    sourceFile: text("source_file"),
  },
  (t) => [uniqueIndex("share_baseline_uq").on(t.season, t.team, t.playerName)],
);

export const shareOverrides = pgTable("share_overrides", {
  id: serial("id").primaryKey(),
  playerName: text("player_name").notNull(),
  playerId: text("player_id").references(() => players.gsisId),
  team: text("team").notNull(),
  week: integer("week").notNull(),
  season: integer("season").notNull(),
  targetSharePct: doublePrecision("target_share_pct"),
  rushSharePct: doublePrecision("rush_share_pct"),
  reason: text("reason"),
  expiresAfterWeek: integer("expires_after_week"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Long format: one row per (player, week, stat). sd_stat is the RAW model SD; the 1.30x
// correction is applied in the simulator only (§3.2).
export const playerProjections = pgTable(
  "player_projections",
  {
    id: serial("id").primaryKey(),
    playerName: text("player_name").notNull(),
    playerId: text("player_id").references(() => players.gsisId),
    team: text("team"),
    opponent: text("opponent"),
    week: integer("week").notNull(),
    season: integer("season").notNull(),
    statType: text("stat_type").notNull(),
    meanStat: doublePrecision("mean_stat").notNull(),
    sdStat: doublePrecision("sd_stat"),
    source: text("source"),
  },
  (t) => [
    uniqueIndex("player_projections_uq").on(t.season, t.week, t.playerName, t.statType, t.source),
    index("player_projections_player_idx").on(t.playerId, t.season, t.week),
  ],
);

export const games = pgTable("games", {
  gameId: text("game_id").primaryKey(),
  season: integer("season").notNull(),
  week: integer("week").notNull(),
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  completed: boolean("completed").default(false).notNull(),
});

export const props = pgTable(
  "props",
  {
    id: serial("id").primaryKey(),
    playerName: text("player_name").notNull(),
    playerId: text("player_id").references(() => players.gsisId),
    statType: text("stat_type").notNull(),
    line: doublePrecision("line").notNull(),
    odds: integer("odds").notNull(),
    side: text("side").notNull(),
    dollarWin: doublePrecision("dollar_win"),
    confidencePct: doublePrecision("confidence_pct"),
    pushPct: doublePrecision("push_pct"),
    ourMean: doublePrecision("our_mean"),
    gameLabel: text("game_label"),
    gameId: text("game_id"),
    week: integer("week").notNull(),
    season: integer("season").notNull(),
    source: text("source"),
    sourceFile: text("source_file"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("props_week_idx").on(t.season, t.week),
    index("props_player_idx").on(t.playerId),
    // Makes re-running the same source file/paste idempotent instead of duplicating rows. Two
    // different sources quoting the same line (e.g. two books) are legitimately separate rows.
    uniqueIndex("props_natural_uq").on(t.season, t.week, t.playerName, t.statType, t.line, t.side, t.gameLabel, t.sourceFile),
  ],
);

export const gradedProps = pgTable(
  "graded_props",
  {
    propId: integer("prop_id")
      .primaryKey()
      .references(() => props.id),
    actualResult: doublePrecision("actual_result"),
    hit: boolean("hit"),
    // 'hit' | 'miss' | 'push' | 'void'. Historical imports keep the original hit flag as-is.
    status: text("status").notNull(),
    excludeFromCalibration: boolean("exclude_from_calibration").default(false).notNull(),
    excludeReason: text("exclude_reason"),
    gradedAt: timestamp("graded_at").defaultNow().notNull(),
  },
  (t) => [index("graded_props_status_idx").on(t.status)],
);

export const playerGameStats = pgTable(
  "player_game_stats",
  {
    playerId: text("player_id").notNull(),
    gameId: text("game_id").notNull(),
    season: integer("season").notNull(),
    week: integer("week").notNull(),
    team: text("team"),
    passYds: doublePrecision("pass_yds").default(0).notNull(),
    passTd: integer("pass_td").default(0).notNull(),
    rushYds: doublePrecision("rush_yds").default(0).notNull(),
    rushTd: integer("rush_td").default(0).notNull(),
    rec: integer("rec").default(0).notNull(),
    recYds: doublePrecision("rec_yds").default(0).notNull(),
    recTd: integer("rec_td").default(0).notNull(),
    targets: integer("targets").default(0).notNull(),
  },
  (t) => [uniqueIndex("player_game_stats_uq").on(t.playerId, t.gameId)],
);

export const snapCounts = pgTable(
  "snap_counts",
  {
    playerId: text("player_id").notNull(),
    gameId: text("game_id").notNull(),
    season: integer("season").notNull(),
    week: integer("week").notNull(),
    team: text("team"),
    offenseSnaps: integer("offense_snaps"),
    offensePct: doublePrecision("offense_pct"),
  },
  (t) => [uniqueIndex("snap_counts_uq").on(t.playerId, t.gameId)],
);

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Automated data-quality gates (§5). Open findings block finalizing a report/calibration run.
export const dataQualityFindings = pgTable(
  "data_quality_findings",
  {
    id: serial("id").primaryKey(),
    check: text("check").notNull(),
    severity: text("severity").notNull(),
    subject: text("subject"),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
    resolvedNote: text("resolved_note"),
  },
  (t) => [index("dq_open_idx").on(t.check, t.resolvedAt)],
);

export const ingestRuns = pgTable("ingest_runs", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  season: integer("season"),
  ok: boolean("ok").notNull(),
  detail: jsonb("detail"),
  ranAt: timestamp("ran_at").defaultNow().notNull(),
});
