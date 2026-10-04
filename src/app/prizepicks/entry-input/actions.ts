"use server";

import { revalidatePath } from "next/cache";
import { gradeEntry, insertEntry, listEntries } from "../../../lib/bankroll";
import type { Leg, PlayType } from "../../../lib/entry-math";

export async function saveEntryAction(data: {
  entryDate: string;
  playType: PlayType;
  promo: string | null;
  legs: Leg[];
  stakeDollars: number;
  multiplier: number;
}) {
  const id = await insertEntry(data);
  revalidatePath("/prizepicks");
  return { id };
}

export async function gradeEntryAction(id: number, result: "win" | "loss") {
  await gradeEntry(id, result);
  revalidatePath("/prizepicks");
}

export async function listEntriesAction(opts: {
  sortBy?: "entryDate" | "legCount" | "status" | "payoutDollars";
  sortDir?: "asc" | "desc";
  offset?: number;
}) {
  return listEntries(opts);
}
