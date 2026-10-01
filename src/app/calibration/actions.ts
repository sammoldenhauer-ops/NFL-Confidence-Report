"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "../../db";
import { dataQualityFindings } from "../../db/schema";

export async function resolveFinding(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  const db = getDb();
  await db.update(dataQualityFindings).set({ resolvedAt: new Date() }).where(eq(dataQualityFindings.id, id));
  revalidatePath("/calibration");
}
