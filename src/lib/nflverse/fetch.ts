import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { parse } from "csv-parse";

// §2: always pull the latest release, never a cached snapshot.
const BASE = "https://github.com/nflverse/nflverse-data/releases/download";
export const NFLVERSE = {
  pbp: (season: number) => `${BASE}/pbp/play_by_play_${season}.csv.gz`,
  snapCounts: (season: number) => `${BASE}/snap_counts/snap_counts_${season}.csv`,
  players: () => `${BASE}/players/players.csv`,
};

async function open(url: string): Promise<Readable> {
  const res = await fetch(url, { redirect: "follow", cache: "no-store" });
  if (!res.ok || !res.body) throw new Error(`nflverse fetch failed ${res.status} for ${url}`);
  return Readable.fromWeb(res.body as import("node:stream/web").ReadableStream);
}

const parser = () => parse({ columns: true, relax_quotes: true, relax_column_count: true, skip_empty_lines: true });

export async function* streamCsv(url: string): AsyncGenerator<Record<string, string>> {
  const src = await open(url);
  const gz = url.endsWith(".gz");
  const stream = (gz ? src.pipe(createGunzip()) : src).pipe(parser());
  for await (const rec of stream) yield rec as Record<string, string>;
}

export async function fetchCsv(url: string): Promise<Record<string, string>[]> {
  const out: Record<string, string>[] = [];
  for await (const r of streamCsv(url)) out.push(r);
  return out;
}
