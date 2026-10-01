import ReportForm from "./ReportForm";

export default function ReportPage() {
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Confidence Report</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        One prop per line: player, stat, line, side, odds (pipe, tab, or comma separated). Side
        and odds are optional — side defaults to Over, odds to -110.
      </p>
      <div className="mt-6">
        <ReportForm />
      </div>
    </div>
  );
}
