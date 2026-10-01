"use client";

import { useActionState, useState } from "react";
import { generateReport, type GenerateReportState } from "./actions";
import type { ReportRow } from "../../lib/sim/report";

const initialState: GenerateReportState = { groups: null, parseErrors: [], season: new Date().getFullYear(), week: 1, logged: null };

const PLACEHOLDER = `Trey McBride | rec | 3.5 | Over | -900 | ARI @ SEA
Christian Watson | rec_yds | 19.5 | Under | -120 | GB @ MIN
Jalen Hurts | rush_td | 0.5 | Over | -200 | WAS @ PHI`;

function ConfidenceRow({ row }: { row: Extract<ReportRow, { status: "ok" }> }) {
  return (
    <tr className="border-t border-zinc-100 dark:border-zinc-800">
      <td className="py-2 pr-4 font-medium">{row.playerName}</td>
      <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-400">{row.stat}</td>
      <td className="py-2 pr-4">
        {row.side === "over" ? "O" : "U"} {row.line}
      </td>
      <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-400">{row.odds > 0 ? `+${row.odds}` : row.odds}</td>
      <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-400">{row.ourMean.toFixed(1)}</td>
      <td className="py-2 pr-4">
        <span
          className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
            row.confidencePct >= 70
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
              : row.confidencePct >= 50
                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
          }`}
        >
          {row.confidencePct.toFixed(1)}%
        </span>
      </td>
    </tr>
  );
}

function Table({ rows, empty }: { rows: Extract<ReportRow, { status: "ok" }>[]; empty: string }) {
  if (rows.length === 0) return <p className="py-6 text-sm text-zinc-500">{empty}</p>;
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="text-xs uppercase tracking-wide text-zinc-500">
          <th className="pb-2 pr-4 font-medium">Player</th>
          <th className="pb-2 pr-4 font-medium">Stat</th>
          <th className="pb-2 pr-4 font-medium">Line</th>
          <th className="pb-2 pr-4 font-medium">Odds</th>
          <th className="pb-2 pr-4 font-medium">Our mean</th>
          <th className="pb-2 pr-4 font-medium">Confidence</th>
        </tr>
      </thead>
      <tbody>
        {rows
          .slice()
          .sort((a, b) => b.confidencePct - a.confidencePct)
          .map((r, i) => (
            <ConfidenceRow key={i} row={r} />
          ))}
      </tbody>
    </table>
  );
}

export default function ReportForm() {
  const [state, formAction, pending] = useActionState(generateReport, initialState);
  const [tab, setTab] = useState<"all" | "favorites" | "underdogs">("all");

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-3">
        <label className="text-sm font-medium" htmlFor="lines">
          Paste prop lines
        </label>
        <textarea
          id="lines"
          name="lines"
          rows={8}
          placeholder={PLACEHOLDER}
          className="w-full rounded-md border border-zinc-300 bg-white p-3 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            Season
            <input
              name="season"
              type="number"
              defaultValue={state.season}
              className="w-24 rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex items-center gap-2">
            Week
            <input
              name="week"
              type="number"
              defaultValue={state.week}
              className="w-16 rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
            <input type="checkbox" name="log" />
            Also log these props (for later grading)
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-zinc-900 px-4 py-1.5 font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {pending ? "Simulating..." : "Run report"}
          </button>
        </div>
      </form>

      {state.logged !== null && (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">Logged {state.logged} prop(s) for grading once their games complete.</p>
      )}

      {state.parseErrors.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-medium">{state.parseErrors.length} line(s) could not be parsed:</p>
          <ul className="mt-1 list-disc pl-5">
            {state.parseErrors.map((e, i) => (
              <li key={i}>
                <code>{e.raw}</code> — {e.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.groups && (() => {
        const groups = state.groups;
        return (
        <div>
          {groups.unresolved.length > 0 && (
            <div className="mb-4 rounded-md border border-zinc-300 bg-zinc-100 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900">
              <p className="font-medium">{groups.unresolved.length} line(s) had no matching projection for week {state.week}:</p>
              <ul className="mt-1 list-disc pl-5 text-zinc-600 dark:text-zinc-400">
                {groups.unresolved.map((r, i) => (
                  <li key={i}>
                    {r.playerName} ({r.stat}){" "}
                    {r.status === "ambiguous" && `— ambiguous: ${r.candidates.join(", ")}`}
                    {r.status === "no_projection" && "— no projection on file"}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
            {(["all", "favorites", "underdogs"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium capitalize ${
                  tab === t
                    ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                    : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                }`}
              >
                {t} ({groups[t].length})
              </button>
            ))}
          </div>
          <div className="pt-4">
            {tab === "all" && <Table rows={groups.all} empty="No lines yet." />}
            {tab === "favorites" && <Table rows={groups.favorites} empty="No favorites (-100 to -250) in this batch." />}
            {tab === "underdogs" && <Table rows={groups.underdogs} empty="No underdogs (positive odds) in this batch." />}
          </div>
        </div>
        );
      })()}
    </div>
  );
}
