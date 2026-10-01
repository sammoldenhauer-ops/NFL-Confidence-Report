import { tryNormalizeStat } from "../stats";
import type { StatType } from "../sim/engine";

export type PastedLine = {
  raw: string;
  playerName: string;
  stat: StatType;
  line: number;
  side: "over" | "under";
  odds: number;
  gameLabel: string | null;
};

export type PasteError = { raw: string; reason: string };

export type PasteResult = { lines: PastedLine[]; errors: PasteError[] };

/**
 * Accepts loosely-formatted pasted prop lines, one per row, tab/comma/pipe-delimited or
 * sportsbook-style free text: "Player Name | Stat | Line | Over/Under | Odds". The side
 * defaults to Over when omitted, matching the convention already established in §9's data.
 */
export function parsePastedLines(text: string): PasteResult {
  const lines: PastedLine[] = [];
  const errors: PasteError[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const raw = rawLine.trim();
    if (!raw || raw.startsWith("#")) continue;

    const parts = raw
      .split(/\t|\||,/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length < 3) {
      errors.push({ raw, reason: "Expected at least player, stat, and line" });
      continue;
    }

    const lineIdx = parts.findIndex((p, i) => i > 0 && /^-?\d+(\.\d+)?$/.test(p));
    if (lineIdx === -1) {
      errors.push({ raw, reason: "No numeric line value found" });
      continue;
    }
    const playerName = parts[0];
    const statRaw = parts.slice(1, lineIdx).join(" ") || parts[1];
    const stat = tryNormalizeStat(statRaw);
    if (!stat) {
      errors.push({ raw, reason: `Unrecognized stat "${statRaw}"` });
      continue;
    }
    const lineVal = Number(parts[lineIdx]);

    const rest = parts.slice(lineIdx + 1);
    const sideToken = rest.find((p) => /^(over|under|o|u)$/i.test(p));
    const side: "over" | "under" = sideToken && /^u/i.test(sideToken) ? "under" : "over";
    const oddsToken = rest.find((p) => /^[+-]?\d{2,5}$/.test(p) && p !== String(lineVal));
    const odds = oddsToken ? Number(oddsToken) : -110;
    const gameLabel = rest.find((p) => /@|\bvs\.?\b/i.test(p)) ?? null;

    lines.push({ raw, playerName, stat, line: lineVal, side, odds, gameLabel });
  }

  return { lines, errors };
}
