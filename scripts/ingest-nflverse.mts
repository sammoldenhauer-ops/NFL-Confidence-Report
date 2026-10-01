// §2: pull the latest nflverse releases (players, pbp, snap counts) and upsert into the DB.
// Run before import-data so player/game resolution has something real to match against.
import "dotenv/config";
import { getDb } from "../src/db";
import { ingestNflverse } from "../src/lib/nflverse/ingest";

const season = Number(process.env.SEASON ?? new Date().getFullYear());
const db = getDb();

const summary = await ingestNflverse(db, season);
console.log(JSON.stringify(summary, null, 2));
