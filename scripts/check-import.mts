import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../src/db";

const db = getDb();

const counts = await db.execute(sql`
  select 'props' t, count(*) n from props
  union all select 'graded_props', count(*) from graded_props
  union all select 'share_baseline', count(*) from share_baseline
  union all select 'share_overrides', count(*) from share_overrides
  union all select 'player_projections', count(*) from player_projections
  union all select 'players w/ resolved props', count(distinct player_id) from props where player_id is not null
`);
console.log("row counts:", counts.rows);

const byCheck = await db.execute(sql`
  select "check", severity, count(*) n from data_quality_findings group by "check", severity order by n desc
`);
console.log("\nfindings by check:", byCheck.rows);

const unresolvedPlayers = await db.execute(sql`
  select subject, count(*) n from data_quality_findings where "check" = 'player_not_found' group by subject order by n desc limit 15
`);
console.log("\ntop unresolved player names:", unresolvedPlayers.rows);

const propsResolved = await db.execute(sql`select count(*) filter (where player_id is not null) resolved, count(*) total from props`);
console.log("\nprops resolution:", propsResolved.rows);

const blendMismatch = await db.execute(sql`select subject, detail from data_quality_findings where "check" = 'blended_mismatch' limit 10`);
console.log("\nblended_mismatch samples:", JSON.stringify(blendMismatch.rows, null, 2));

const nameCollisions = await db.execute(sql`select "check", subject, detail from data_quality_findings where "check" like 'name_%' limit 10`);
console.log("\nname collision samples:", JSON.stringify(nameCollisions.rows, null, 2));

const cal = await db.execute(sql`select * from calibration_summary`);
console.log("\ncalibration_summary (real data, strict view):", cal.rows);
