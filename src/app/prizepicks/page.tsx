import fs from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

type Game = {
  game: string;
  home: string;
  away: string;
  kickoff_utc: string;
  favorite: string | null;
  spread: number;
  total: number;
};

type Note = { team: string; player: string; status: string; note: string };
type OutHandled = { team: string; player: string; recent_share: number; kind: string };

type Slate = {
  title: string;
  generated_at: string;
  model_version: string;
  games: Game[];
  legs: unknown[];
  injuries: { outs_handled: OutHandled[]; notes: Note[] };
};

async function loadSlate(): Promise<Slate | null> {
  const file = path.join(process.cwd(), "public/data/prizepicks/latest/slate.json");
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

export default async function PrizePicksPage() {
  const slate = await loadSlate();

  if (!slate) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">PrizePicks</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          No slate has been published yet. Run the &quot;PrizePicks - build &amp; publish slate&quot;
          GitHub Action to generate one.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-16">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{slate.title}</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Model {slate.model_version} - generated {new Date(slate.generated_at).toLocaleString()}
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Games</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {slate.games.map((g) => (
            <div
              key={g.game}
              className="rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="font-medium">{g.game}</div>
              <div className="mt-1 text-zinc-600 dark:text-zinc-400">
                {g.favorite ? `${g.favorite} -${g.spread}` : "Even"} &middot; total {g.total}
              </div>
            </div>
          ))}
        </div>
      </section>

      {(slate.injuries.outs_handled.length > 0 || slate.injuries.notes.length > 0) && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">Injuries &amp; notes</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {slate.injuries.outs_handled.map((o, i) => (
              <li key={`out-${i}`} className="text-zinc-700 dark:text-zinc-300">
                <span className="font-medium">
                  {o.player} ({o.team})
                </span>{" "}
                - OUT, {o.recent_share}% {o.kind} redistributed
              </li>
            ))}
            {slate.injuries.notes.map((n, i) => (
              <li key={`note-${i}`} className="text-zinc-700 dark:text-zinc-300">
                <span className="font-medium">
                  {n.player} ({n.team})
                </span>{" "}
                - {n.status}: {n.note}
              </li>
            ))}
          </ul>
        </section>
      )}

      <a
        href="/data/prizepicks/latest/report.xlsx"
        download
        className="w-fit rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
      >
        Download full report (.xlsx)
      </a>
    </div>
  );
}
