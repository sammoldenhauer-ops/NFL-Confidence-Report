import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-16">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">NFL Confidence Report</h1>
        <p className="mt-2 max-w-2xl text-zinc-600 dark:text-zinc-400">
          Monte Carlo prop simulation against validated player projections, with a calibration
          ledger that tracks how predicted confidence lines up with real hit rates over the
          season.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Link
          href="/report"
          className="rounded-lg border border-zinc-200 bg-white p-5 transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
        >
          <h2 className="font-semibold">Confidence Report</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Paste prop lines, get a 3-tab confidence breakdown.
          </p>
        </Link>
        <Link
          href="/calibration"
          className="rounded-lg border border-zinc-200 bg-white p-5 transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
        >
          <h2 className="font-semibold">Calibration Dashboard</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Bucketed confidence vs. real hit rate, plus open data-quality findings.
          </p>
        </Link>
        <Link
          href="/overrides"
          className="rounded-lg border border-zinc-200 bg-white p-5 transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
        >
          <h2 className="font-semibold">Share Overrides</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            This-week-only target/rush share adjustments, without touching the baseline.
          </p>
        </Link>
      </div>
    </div>
  );
}
