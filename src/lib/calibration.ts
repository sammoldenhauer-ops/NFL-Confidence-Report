import { isNull, sql } from "drizzle-orm";
import type { Db } from "../db";
import { dataQualityFindings } from "../db/schema";
import { CALIBRATION_BUCKETS } from "./constants";

export type BucketRow = { bucket: string; n: number; hitRate: number | null; avgConfidence: number | null; gap: number | null };

/** Mirrors db/views.sql's calibration_summary (strict: pushes and excluded rows dropped). */
export async function getCalibrationSummary(db: Db): Promise<BucketRow[]> {
  const res = await db.execute(sql`select bucket, n, hit_rate, avg_confidence, gap from calibration_summary`);
  const byBucket = new Map(
    res.rows.map((r) => [
      r.bucket as string,
      {
        bucket: r.bucket as string,
        n: Number(r.n),
        hitRate: r.hit_rate === null ? null : Number(r.hit_rate),
        avgConfidence: r.avg_confidence === null ? null : Number(r.avg_confidence),
        gap: r.gap === null ? null : Number(r.gap),
      },
    ]),
  );
  // Always return all 7 buckets in order, even with n=0, so the UI never silently drops a row.
  return CALIBRATION_BUCKETS.map((b) => byBucket.get(b.label) ?? { bucket: b.label, n: 0, hitRate: null, avgConfidence: null, gap: null });
}

export async function getOpenFindings(db: Db, limit = 50) {
  return db
    .select()
    .from(dataQualityFindings)
    .where(isNull(dataQualityFindings.resolvedAt))
    .orderBy(sql`created_at desc`)
    .limit(limit);
}
