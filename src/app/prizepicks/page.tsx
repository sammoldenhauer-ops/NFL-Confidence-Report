import { getBankrollSummary } from "../../lib/bankroll";
import { loadSlate } from "../../lib/slate-data";
import { saveStartingBankroll } from "./actions";

export const dynamic = "force-dynamic";

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "numeric", day: "numeric", year: "2-digit", hour: "numeric", minute: "2-digit" });
}

export default async function HomePage() {
  const [slate, bankroll] = await Promise.all([loadSlate(), getBankrollSummary()]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-10 pt-10 text-center">
      <h1 className="pp-title text-xl tracking-wide">
        LAST RUN: {slate ? fmtDate(slate.generated_at) : "X/X/X X:XX AM/PM"}
      </h1>

      <div className="flex w-full flex-col items-center gap-2">
        <h2 className="pp-title text-base">BANKROLL:</h2>
        {bankroll.starting === null ? (
          <form action={saveStartingBankroll} className="flex items-center gap-2">
            <span>$</span>
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0"
              required
              className="w-28 rounded-md border border-white bg-transparent px-2 py-1 text-center text-xl"
            />
            <button type="submit" className="rounded-md px-3 py-1 text-base" style={{ background: "var(--pp-green)", color: "black" }}>
              Save
            </button>
          </form>
        ) : (
          <p className="text-2xl">${bankroll.current!.toFixed(2)}</p>
        )}
        {bankroll.starting === null && (
          <p className="text-base" style={{ color: "var(--pp-fg-dim)" }}>
            will be manually put in once and tracked as entries are entered
          </p>
        )}
      </div>

      <div className="flex w-full flex-col items-center gap-2">
        <h2 className="pp-title text-base">UP/DOWN:</h2>
        {bankroll.upDown === null ? (
          <p className="text-base" style={{ color: "var(--pp-fg-dim)" }}>
            will be tracked as entries are entered
          </p>
        ) : (
          <p className="text-2xl" style={{ color: bankroll.upDown >= 0 ? "var(--pp-green)" : "var(--pp-red)" }}>
            {bankroll.upDown >= 0 ? "+" : "-"}${Math.abs(bankroll.upDown).toFixed(2)}
          </p>
        )}
      </div>
    </div>
  );
}
