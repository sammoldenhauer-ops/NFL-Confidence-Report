"use server";

import { revalidatePath } from "next/cache";
import { setStartingBankroll } from "../../lib/bankroll";

export async function saveStartingBankroll(formData: FormData) {
  const amount = Number(formData.get("amount"));
  if (!Number.isFinite(amount) || amount < 0) return;
  await setStartingBankroll(amount);
  revalidatePath("/prizepicks");
}
