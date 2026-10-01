"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../../db";
import { players, shareOverrides } from "../../db/schema";
import { normalizeName } from "../../lib/integrity/names";
import { resolvePlayer, buildPlayerIndex, type PlayerLite } from "../../lib/data/resolve";

export async function addOverride(formData: FormData) {
  const playerName = String(formData.get("playerName") ?? "").trim();
  const team = String(formData.get("team") ?? "").trim().toUpperCase();
  const week = Number(formData.get("week"));
  const season = Number(formData.get("season"));
  const targetRaw = String(formData.get("targetSharePct") ?? "").trim();
  const rushRaw = String(formData.get("rushSharePct") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!playerName || !team || !week || !season) return;

  const db = getDb();
  const playerRows = await db.select().from(players);
  const index = buildPlayerIndex(playerRows as PlayerLite[]);
  const resolution = resolvePlayer(index, playerName, [team]);
  const playerId = resolution.status === "resolved" ? resolution.gsisId : null;

  await db.insert(shareOverrides).values({
    playerName,
    playerId,
    team,
    week,
    season,
    targetSharePct: targetRaw === "" ? null : Number(targetRaw),
    rushSharePct: rushRaw === "" ? null : Number(rushRaw),
    reason: reason || null,
    expiresAfterWeek: week,
  });

  revalidatePath("/overrides");
}

export { normalizeName };
