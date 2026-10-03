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

export const ingestRuns = pgTable("ingest_runs", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  season: integer("season"),
  ok: boolean("ok").notNull(),
  detail: jsonb("detail"),
  ranAt: timestamp("ran_at").defaultNow().notNull(),
});
