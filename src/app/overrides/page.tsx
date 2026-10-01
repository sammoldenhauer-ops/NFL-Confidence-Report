import { desc } from "drizzle-orm";
import { getDb } from "../../db";
import { shareOverrides } from "../../db/schema";
import { addOverride } from "./actions";

// Overrides are added in-season and must show up immediately, not after the next deploy.
export const dynamic = "force-dynamic";

export default async function OverridesPage() {
  const db = getDb();
  const rows = await db.select().from(shareOverrides).orderBy(desc(shareOverrides.createdAt)).limit(100);
  const season = Number(process.env.SEASON ?? new Date().getFullYear());
  const week = Number(process.env.WEEK ?? 1);

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Share Overrides</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Temporary, this-game-only target/rush share adjustments (injuries, role changes). These
        never modify the permanent blended baseline — only the simulation layer reads them on top
        of it.
      </p>

      <form action={addOverride} className="mt-6 grid grid-cols-2 gap-3 rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          Player
          <input name="playerName" required className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950" />
        </label>
        <label className="flex flex-col gap-1">
          Team
          <input name="team" required className="rounded border border-zinc-300 px-2 py-1 uppercase dark:border-zinc-700 dark:bg-zinc-950" />
        </label>
        <label className="flex flex-col gap-1">
          Week
          <input name="week" type="number" defaultValue={week} required className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950" />
        </label>
        <label className="flex flex-col gap-1">
          Season
          <input name="season" type="number" defaultValue={season} required className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950" />
        </label>
        <label className="flex flex-col gap-1">
          New target share %
          <input name="targetSharePct" type="number" step="0.1" className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950" />
        </label>
        <label className="flex flex-col gap-1">
          New rush share %
          <input name="rushSharePct" type="number" step="0.1" className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950" />
        </label>
        <label className="col-span-2 flex flex-col gap-1 sm:col-span-3">
          Reason
          <input name="reason" placeholder="e.g. WR1 out, redistributing to WR2/WR3" className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950" />
        </label>
        <button type="submit" className="col-span-2 rounded-md bg-zinc-900 px-4 py-2 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900 sm:col-span-3">
          Add override
        </button>
      </form>

      <table className="mt-8 w-full text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-zinc-500">
            <th className="pb-2 pr-4 font-medium">Player</th>
            <th className="pb-2 pr-4 font-medium">Team</th>
            <th className="pb-2 pr-4 font-medium">Wk</th>
            <th className="pb-2 pr-4 font-medium">Target %</th>
            <th className="pb-2 pr-4 font-medium">Rush %</th>
            <th className="pb-2 pr-4 font-medium">Reason</th>
            <th className="pb-2 pr-4 font-medium">Resolved ID</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-zinc-100 dark:border-zinc-800">
              <td className="py-2 pr-4 font-medium">{r.playerName}</td>
              <td className="py-2 pr-4">{r.team}</td>
              <td className="py-2 pr-4">{r.week}</td>
              <td className="py-2 pr-4">{r.targetSharePct ?? "—"}</td>
              <td className="py-2 pr-4">{r.rushSharePct ?? "—"}</td>
              <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-400">{r.reason ?? "—"}</td>
              <td className="py-2 pr-4">
                {r.playerId ? (
                  <span className="text-zinc-500">{r.playerId}</span>
                ) : (
                  <span className="text-amber-700 dark:text-amber-400">unresolved</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
