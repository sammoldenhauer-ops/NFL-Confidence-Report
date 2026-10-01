import "dotenv/config";
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);
const ddl = readFileSync("src/db/views.sql", "utf8");
await sql.query(ddl);
console.log("views applied");
