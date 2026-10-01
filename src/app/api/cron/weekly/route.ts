import { NextResponse } from "next/server";
import { getDb } from "../../../../db";
import { gradePendingProps } from "../../../../lib/grading-run";
import { ingestNflverse } from "../../../../lib/nflverse/ingest";

// §2/§8: scheduled pull of new pbp/snap-count data, then re-grade any newly-completed games.
// No app auth (single-user deploy, per project decision) — this endpoint is protected only by
// CRON_SECRET, which Vercel sends as `Authorization: Bearer <secret>` for scheduled invocations.
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const season = Number(process.env.SEASON ?? new Date().getFullYear());
  const db = getDb();
  const ingest = await ingestNflverse(db, season);
  const grading = await gradePendingProps(db);

  return NextResponse.json({ ingest, grading });
}
