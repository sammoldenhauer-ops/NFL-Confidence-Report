"use server";

import { computeEntry, type Leg, type PlayType } from "../../../lib/entry-math";
import { loadSims, loadSlate } from "../../../lib/slate-data";
import { getReferenceMultiplier, getStartingBankroll, recordMultiplier, getBankrollSummary } from "../../../lib/bankroll";

export async function computeEntryAction(input: {
  legs: (Leg | null)[];
  playType: PlayType;
  mult?: number;
}) {
  const [slate, sims] = await Promise.all([loadSlate(), loadSims()]);
  if (!slate || !sims) return { error: "No slate published yet." as const };

  const legCount = input.legs.filter((l) => l !== null).length;
  const referenceMult = legCount >= 2 ? await getReferenceMultiplier(legCount, input.playType, null) : null;
  const mult = input.mult ?? referenceMult ?? undefined;

  const { current } = await getBankrollSummary();
  const result = computeEntry(input.legs, input.playType, slate.settings, slate.standard_payouts, slate.stack_corrections, sims, {
    mult,
    bankroll: current ?? undefined,
  });
  return { result, usedReferenceMult: mult !== undefined && input.mult === undefined && referenceMult !== null };
}

export async function saveMultiplierAction(input: { legs: (Leg | null)[]; playType: PlayType; promo: string | null; multiplier: number }) {
  const legs = input.legs.filter((l): l is Leg => l !== null);
  if (legs.length < 1 || !Number.isFinite(input.multiplier)) return { ok: false as const };
  await recordMultiplier({ playType: input.playType, promo: input.promo || null, legs, multiplier: input.multiplier });
  return { ok: true as const };
}

export async function getBankrollForStake() {
  return getStartingBankroll();
}
