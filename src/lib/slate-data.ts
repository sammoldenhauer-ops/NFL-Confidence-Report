import fs from "node:fs/promises";
import path from "node:path";
import type { SimsData, StackCorrections, StandardPayouts, SlateSettings } from "./entry-math";

export type SlateLeg = {
  key: string;
  player: string;
  team: string;
  game: string;
  stat: string;
  book_line: number;
  p_more: number;
  p_less: number;
  book_p_over: number | null;
  ladder: { line: number; pick: "More" | "Less"; chance: number }[];
};

export type SlateGame = {
  game: string;
  home: string;
  away: string;
  kickoff_utc: string;
  favorite: string | null;
  spread: number;
  total: number;
};

export type Slate = {
  title: string;
  generated_at: string;
  model_version: string;
  games: SlateGame[];
  legs: SlateLeg[];
  injuries: { outs_handled: unknown[]; notes: unknown[] };
  settings: SlateSettings;
  standard_payouts: StandardPayouts;
  stack_corrections: StackCorrections;
};

const DATA_DIR = path.join(process.cwd(), "public/data/prizepicks/latest");

export async function loadSlate(): Promise<Slate | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(DATA_DIR, "slate.json"), "utf8"));
  } catch {
    return null;
  }
}

export async function loadSims(): Promise<SimsData | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(DATA_DIR, "sims.json"), "utf8"));
  } catch {
    return null;
  }
}
