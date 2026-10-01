import type { StatType } from "./sim/engine";

const ALIASES: Record<string, StatType> = {
  "pass yards": "pass_yds",
  pass_yds: "pass_yds",
  "passing yards": "pass_yds",
  "pass tds": "pass_td",
  pass_td: "pass_td",
  "pass td": "pass_td",
  "rush yards": "rush_yds",
  rush_yds: "rush_yds",
  "rushing yards": "rush_yds",
  "rec yards": "rec_yds",
  rec_yds: "rec_yds",
  "receiving yards": "rec_yds",
  receptions: "rec",
  rec: "rec",
  "rush tds": "rush_td",
  rush_td: "rush_td",
  "rec tds": "rec_td",
  rec_td: "rec_td",
};

export function normalizeStat(raw: string): StatType {
  const s = ALIASES[raw.trim().toLowerCase()];
  if (!s) throw new Error(`Unknown stat type: "${raw}"`);
  return s;
}

export function tryNormalizeStat(raw: string): StatType | null {
  return ALIASES[raw.trim().toLowerCase()] ?? null;
}
