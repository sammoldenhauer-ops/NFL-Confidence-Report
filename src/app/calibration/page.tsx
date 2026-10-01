import { getDb } from "../../db";
import { getCalibrationSummary, getOpenFindings } from "../../lib/calibration";
import { resolveFinding } from "./actions";

// This ledger grows every week (§7/§8) — never freeze it as a build-time snapshot.
export const dynamic = "force-dynamic";

function GapCell({ gap }: { gap: number | null }) {
  if (gap === null) return <span className="text-zinc-400">—</span>;
  const good = Math.abs(gap) <= 3;
  const bad = Math.abs(gap) > 6;
  return (
    <span
      className={
        good
          ? "text-emerald-700 dark:text-emerald-400"
          : bad
            ? "font-semibold text-red-700 dark:text-red-400"
            : "text-amber-700 dark:text-amber-400"
      }
    >
      {gap > 0 ? "+" : ""}
      {gap.toFixed(1)}
    </span>
  );
}

export default async function CalibrationPage() {
  const db = getDb();
  const [buckets, findings] = await Promise.all([getCalibrationSummary(db), getOpenFindings(db)]);
  const total = buckets.reduce((s, b) => s + b.n, 0);

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Calibration Dashboard</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Predicted confidence vs. actual hit rate, by bucket. Gap = hit rate − avg confidence; a
        large negative gap means the model is overconfident in that range. Pushes and
        calibration-excluded props are not counted ({total} props in this view).
      </p>

      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-zinc-500">
            <th className="pb-2 pr-4 font-medium">Bucket</th>
            <th className="pb-2 pr-4 font-medium">n</th>
            <th className="pb-2 pr-4 font-medium">Hit rate</th>
            <th className="pb-2 pr-4 font-medium">Avg confidence</th>
            <th className="pb-2 pr-4 font-medium">Gap</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.bucket} className="border-t border-zinc-100 dark:border-zinc-800">
              <td className="py-2 pr-4 font-medium">{b.bucket}</td>
              <td className="py-2 pr-4">{b.n}</td>
              <td className="py-2 pr-4">{b.hitRate === null ? "—" : `${b.hitRate.toFixed(1)}%`}</td>
              <td className="py-2 pr-4">{b.avgConfidence === null ? "—" : `${b.avgConfidence.toFixed(1)}%`}</td>
              <td className="py-2 pr-4">
                <GapCell gap={b.gap} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Open questions (§7) — not solved, keep watching</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
          <li>
            The 40–60% bucket has shown a persistent overconfidence gap all season even after the
            1.30x SD correction. Watch whether it narrows, stays flat, or is explained by a
            specific stat type as more weeks land here.
          </li>
          <li>
            Team-level score projections (the 4-window formula) haven&apos;t been backtested as
            thoroughly as player props — treat team totals/spreads with more caution.
          </li>
          <li>
            No injury-impact formula exists for RB/WR/TE (tested, came back statistically null) —
            share-redistribution via the overrides page is the only lever for those cases.
          </li>
          <li>No automated &quot;player is out&quot; detection — still a manual, weekly input.</li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Open data-quality findings ({findings.length})</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Automated §5 checks from the last import/grade run. Resolve only after verifying in the
          source data — resolving here does not change any stored numbers.
        </p>
        <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
          {findings.length === 0 && <li className="py-3 text-sm text-zinc-500">No open findings.</li>}
          {findings.map((f) => (
            <li key={f.id} className="flex items-start justify-between gap-4 py-3 text-sm">
              <div>
                <span className="mr-2 inline-block rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide dark:bg-zinc-800">
                  {f.severity}
                </span>
                <span className="font-medium">{f.check}</span>
                {f.subject && <span className="text-zinc-600 dark:text-zinc-400"> — {f.subject}</span>}
                {f.detail !== null && (
                  <pre className="mt-1 overflow-x-auto rounded bg-zinc-50 p-2 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                    {JSON.stringify(f.detail)}
                  </pre>
                )}
              </div>
              <form action={resolveFinding}>
                <input type="hidden" name="id" value={f.id} />
                <button type="submit" className="shrink-0 rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700">
                  Mark reviewed
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
