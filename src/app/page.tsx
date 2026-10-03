import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-16">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">NFL Confidence Report</h1>
        <p className="mt-2 max-w-2xl text-zinc-600 dark:text-zinc-400">
          Sam&apos;s PrizePicks NFL prop model: market-centered Monte Carlo simulation with an Entry
          Builder that calls PLAY or SKIP on 2-6 leg entries.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Link
          href="/prizepicks"
          className="rounded-lg border border-zinc-200 bg-white p-5 transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
        >
          <h2 className="font-semibold">PrizePicks</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            This week&apos;s slate, games, and injury notes, with the full report to download.
          </p>
        </Link>
      </div>
    </div>
  );
}
