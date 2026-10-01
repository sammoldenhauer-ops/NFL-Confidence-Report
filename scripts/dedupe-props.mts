// One-off cleanup: remove duplicate props rows (and their graded_props) left over from before
// the props_natural_uq constraint existed, keeping the lowest-id (first-imported) copy.
import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../src/db";

const db = getDb();

const dupes = await db.execute(sql`
  select array_agg(id order by id) ids
  from props
  group by season, week, player_name, stat_type, line, side, coalesce(game_label, ''), coalesce(source_file, '')
  having count(*) > 1
`);
console.log("duplicate groups:", dupes.rows.length);

for (const row of dupes.rows) {
  const ids = row.ids as number[];
  const [, ...toDelete] = ids;
  if (toDelete.length === 0) continue;
  console.log("deleting prop ids", toDelete, "keeping", ids[0]);
  const idList = sql.join(
    toDelete.map((id) => sql`${id}`),
    sql`, `,
  );
  await db.execute(sql`delete from graded_props where prop_id in (${idList})`);
  await db.execute(sql`delete from props where id in (${idList})`);
}
console.log("done");
