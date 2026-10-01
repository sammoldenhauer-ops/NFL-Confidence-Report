import "dotenv/config";
import { getDb } from "../src/db";
import { gradePendingProps } from "../src/lib/grading-run";

const db = getDb();
const summary = await gradePendingProps(db);
console.log(`Graded ${summary.graded} props: ${summary.hit} hit, ${summary.miss} miss, ${summary.push} push, ${summary.void} void.`);
