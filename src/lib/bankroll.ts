import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { Leg, PlayType } from "./entry-math";

const STARTING_BANKROLL_KEY = "starting_bankroll";

export async function getStartingBankroll(): Promise<number | null> {
  const db = getDb();
  const row = await db.query.appSettings.findFirst({ where: eq(schema.appSettings.key, STARTING_BANKROLL_KEY) });
  if (!row) return null;
  return (row.value as { amount: number }).amount;
}

export async function setStartingBankroll(amount: number) {
  const db = getDb();
  await db
    .insert(schema.appSettings)
    .values({ key: STARTING_BANKROLL_KEY, value: { amount } })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value: { amount }, updatedAt: new Date() } });
}

export async function getBankrollSummary(): Promise<{ starting: number | null; current: number | null; upDown: number | null }> {
  const starting = await getStartingBankroll();
  if (starting === null) return { starting: null, current: null, upDown: null };
  const db = getDb();
  const graded = await db
    .select({ net: sql<number>`coalesce(sum(${schema.entries.payoutDollars} - ${schema.entries.stakeDollars}), 0)` })
    .from(schema.entries)
    .where(sql`${schema.entries.status} != 'pending'`);
  const upDown = Number(graded[0]?.net ?? 0);
  return { starting, current: starting + upDown, upDown };
}

export type EntryRow = {
  id: number;
  entryDate: string;
  playType: string;
  promo: string | null;
  legs: Leg[];
  stakeDollars: number;
  multiplier: number;
  payoutDollars: number | null;
  status: string;
};

export async function listEntries(opts: {
  sortBy?: "entryDate" | "legCount" | "status" | "payoutDollars";
  sortDir?: "asc" | "desc";
  offset?: number;
  limit?: number;
}): Promise<{ rows: EntryRow[]; hasMore: boolean }> {
  const db = getDb();
  const limit = opts.limit ?? 10;
  const offset = opts.offset ?? 0;
  const sortCol =
    opts.sortBy === "status"
      ? schema.entries.status
      : opts.sortBy === "payoutDollars"
        ? schema.entries.payoutDollars
        : opts.sortBy === "legCount"
          ? sql`jsonb_array_length(${schema.entries.legs})`
          : schema.entries.entryDate;
  const order = opts.sortDir === "asc" ? sortCol : desc(sortCol);
  const rows = await db.select().from(schema.entries).orderBy(order).limit(limit + 1).offset(offset);
  const hasMore = rows.length > limit;
  return { rows: rows.slice(0, limit) as unknown as EntryRow[], hasMore };
}

export async function insertEntry(data: {
  entryDate: string;
  playType: PlayType;
  promo: string | null;
  legs: Leg[];
  stakeDollars: number;
  multiplier: number;
}): Promise<number> {
  const db = getDb();
  const [row] = await db
    .insert(schema.entries)
    .values({ ...data, legs: data.legs, status: "pending" })
    .returning({ id: schema.entries.id });
  return row.id;
}

export async function gradeEntry(id: number, result: "win" | "loss") {
  const db = getDb();
  const entry = await db.query.entries.findFirst({ where: eq(schema.entries.id, id) });
  if (!entry) throw new Error("Entry not found");
  const payoutDollars = result === "win" ? entry.stakeDollars * entry.multiplier : 0;
  await db
    .update(schema.entries)
    .set({ status: result, payoutDollars, gradedAt: new Date() })
    .where(eq(schema.entries.id, id));
}

export async function recordMultiplier(data: { playType: PlayType; promo: string | null; legs: Leg[]; multiplier: number }) {
  const db = getDb();
  await db.insert(schema.ppMultipliers).values({ ...data, legCount: data.legs.length });
}

export async function getReferenceMultiplier(legCount: number, playType: PlayType, promo: string | null): Promise<number | null> {
  const db = getDb();
  const row = await db.query.ppMultipliers.findFirst({
    where: and(
      eq(schema.ppMultipliers.legCount, legCount),
      eq(schema.ppMultipliers.playType, playType),
      promo ? eq(schema.ppMultipliers.promo, promo) : sql`${schema.ppMultipliers.promo} is null`,
    ),
    orderBy: desc(schema.ppMultipliers.loggedAt),
  });
  return row?.multiplier ?? null;
}
