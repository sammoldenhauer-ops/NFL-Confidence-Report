// One-off cleanup: collapse duplicate player_not_found/player_ambiguous findings that were
// written once per weekly row before import-data.mts deduped by (status, name, teamHints).
import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../src/db";

const db = getDb();
const res = await db.execute(sql`
  delete from data_quality_findings a
  using data_quality_findings b
  where a.id > b.id
    and a."check" = b."check"
    and a.subject = b.subject
    and a."check" in ('player_not_found', 'player_ambiguous')
`);
console.log("deleted duplicate rows:", res.rowCount ?? res.rows?.length ?? res);
