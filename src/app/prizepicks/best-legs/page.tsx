import { loadSlate } from "../../../lib/slate-data";

export const dynamic = "force-dynamic";

// Mirrors prizepicks-model/pipeline/slate_book3.py's Best Legs tab exactly: same step sizes, same "within 2
// steps of book line" filter, same Anytime TDs Less exclusion, sorted by confidence.
const STEP: Record<string, number> = { "Pass Yds": 10, "Pass TDs": 1, Receptions: 1, "Anytime TDs": 1 };

type Row = {
  key: string;
  player: string;
  stat: string;
  pick: "More" | "Less";
  line: number;
  bookLine: number;
  confidence: number;
  diff: number;
  value: number | null;
};

export default async function BestLegsPage() {
  const slate = await loadSlate();
  const rows: Row[] = [];

  if (slate) {
    for (const leg of slate.legs) {
      const step = STEP[leg.stat] ?? (leg.book_line >= 25 ? 5 : 2);
      for (const rung of leg.ladder) {
        const steps = Math.round((rung.line - leg.book_line) / step);
        if (Math.abs(steps) > 2) continue;
        if (leg.stat === "Anytime TDs" && rung.pick === "Less") continue;
        const bookSideProb = leg.book_p_over === null ? null : rung.pick === "More" ? leg.book_p_over : 1 - leg.book_p_over;
        rows.push({
          key: `${leg.key}-${rung.line}`,
          player: leg.player,
          stat: leg.stat,
          pick: rung.pick,
          line: rung.line,
          bookLine: leg.book_line,
          confidence: rung.chance,
          diff: rung.line - leg.book_line,
          value: bookSideProb === null ? null : (rung.chance - bookSideProb) * 100,
        });
      }
    }
    rows.sort((a, b) => b.confidence - a.confidence);
  }
  // The full within-2-steps filter still produces 3,000+ rows for a 14-game slate - rendering all of them
  // server-side is both slow (10s+ in dev) and not meaningfully "best" legs past a point. Cap to the top 150.
  const LIMIT = 150;
  const shown = rows.slice(0, LIMIT);

  return (
    <div>
      <h1 className="pp-title mb-6 text-center text-lg">BEST LEGS</h1>
      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--pp-border)" }}>
        <table className="w-full min-w-[640px] text-left text-lg">
          <thead>
            <tr className="border-b text-sm" style={{ borderColor: "var(--pp-border)" }}>
              <th className="px-2 py-2">CONF %</th>
              <th className="px-2 py-2">PLAYER</th>
              <th className="px-2 py-2">STAT</th>
              <th className="px-2 py-2">▲/▼</th>
              <th className="px-2 py-2">LINE</th>
              <th className="px-2 py-2">BOOK</th>
              <th className="px-2 py-2">DIFF</th>
              <th className="px-2 py-2">VALUE</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.key} className="border-b border-dashed" style={{ borderColor: "var(--pp-fg-dim)" }}>
                <td className="px-2 py-1.5">{(r.confidence * 100).toFixed(1)}</td>
                <td className="px-2 py-1.5">{r.player}</td>
                <td className="px-2 py-1.5">{r.stat}</td>
                <td className="px-2 py-1.5" style={{ color: r.pick === "More" ? "var(--pp-green)" : "var(--pp-red)" }}>
                  {r.pick === "More" ? "▲" : "▼"}
                </td>
                <td className="px-2 py-1.5">{r.line}</td>
                <td className="px-2 py-1.5">{r.bookLine}</td>
                <td className="px-2 py-1.5">
                  {r.diff > 0 ? "+" : ""}
                  {r.diff}
                </td>
                <td className="px-2 py-1.5">{r.value === null ? "-" : `${r.value > 0 ? "+" : ""}${r.value.toFixed(1)}`}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-2 py-6 text-center" style={{ color: "var(--pp-fg-dim)" }}>
                  No slate published yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
