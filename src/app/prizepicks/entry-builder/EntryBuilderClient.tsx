"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Leg, PlayType, Side, EntryResult } from "../../../lib/entry-math";
import { computeEntryAction, saveMultiplierAction } from "./actions";

type AvailableLeg = {
  player: string;
  team: string;
  stat: string;
  bookLine: number;
  ladder: { line: number; pick: Side; chance: number }[];
};

type Row = { player: string; stat: string; side: Side | ""; line: number | ""; free: boolean };

const EMPTY_ROW: Row = { player: "", stat: "", side: "", line: "", free: false };
const DRAFT_KEY = "pp_draft_entry";

function rowToLeg(row: Row, team: string): Leg | null {
  if (!row.player || !row.stat || !row.side || row.line === "") return null;
  return { player: row.player, team, stat: row.stat, side: row.side, line: row.line, free: row.free };
}

export default function EntryBuilderClient({ availableLegs }: { availableLegs: AvailableLeg[] }) {
  const router = useRouter();
  const [playType, setPlayType] = useState<PlayType>("power");
  const [promo, setPromo] = useState("");
  const [rows, setRows] = useState<Row[]>(Array.from({ length: 6 }, () => ({ ...EMPTY_ROW })));
  const [multiplierInput, setMultiplierInput] = useState("");
  const [result, setResult] = useState<EntryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const players = useMemo(() => [...new Set(availableLegs.map((l) => l.player))].sort(), [availableLegs]);
  const statsFor = (player: string) => [...new Set(availableLegs.filter((l) => l.player === player).map((l) => l.stat))];
  const ladderFor = (player: string, stat: string) => availableLegs.find((l) => l.player === player && l.stat === stat)?.ladder ?? [];
  const teamFor = (player: string) => availableLegs.find((l) => l.player === player)?.team ?? "";

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function setFree(i: number) {
    setRows((prev) => prev.map((r, idx) => ({ ...r, free: idx === i ? !r.free : false })));
  }

  const legsForCompute = rows.map((r) => rowToLeg(r, teamFor(r.player)));
  const filledIndices = rows.map((r, i) => (rowToLeg(r, teamFor(r.player)) ? i : -1)).filter((i) => i >= 0);

  useEffect(() => {
    const mult = multiplierInput ? Number(multiplierInput) : undefined;
    const t = setTimeout(async () => {
      const res = await computeEntryAction({ legs: legsForCompute, playType, mult });
      if ("error" in res) {
        setError(res.error ?? "Something went wrong.");
        setResult(null);
      } else {
        setError(null);
        setResult(res.result);
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(legsForCompute), playType, multiplierInput]);

  function hitPctFor(rowIndex: number): string {
    if (!result) return "";
    const pos = filledIndices.indexOf(rowIndex);
    if (pos === -1) return "";
    const lr = result.legResults[pos];
    return lr ? `${(lr.p * 100).toFixed(1)}%` : "";
  }

  async function handleSave() {
    const mult = Number(multiplierInput);
    if (!Number.isFinite(mult)) {
      setSaveStatus("Enter the PrizePicks multiplier first");
      return;
    }
    const res = await saveMultiplierAction({ legs: legsForCompute, playType, promo: promo || null, multiplier: mult });
    setSaveStatus(res.ok ? "Saved" : "Nothing to save");
    setTimeout(() => setSaveStatus(null), 2000);
  }

  function handleBuild() {
    const legs = legsForCompute.filter((l): l is Leg => l !== null);
    const mult = multiplierInput ? Number(multiplierInput) : result?.payout ?? undefined;
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ legs, playType, promo: promo || null, multiplier: mult }));
    router.push("/prizepicks/entry-input?draft=1");
  }

  const dimmed = !result || result.verdict !== "PLAY";
  const isPlay = result?.verdict === "PLAY";
  const isSkip = result?.verdict === "SKIP";
  const showError = result && (result.verdict === "ADD_LEGS" || result.verdict === "FIX_LEGS" || result.verdict === "FLEX_NEEDS_3" || result.verdict === "NEED_MULT");

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="pp-title text-lg">ENTRY BUILDER</h1>
        <div className="flex flex-col items-end gap-1 text-sm">
          {showError && <span style={{ color: "var(--pp-red)" }}>ERROR: {result!.verdictReason}</span>}
          {error && <span style={{ color: "var(--pp-red)" }}>{error}</span>}
          <span className="pp-title text-xs">
            VERDICT:{" "}
            <span style={{ color: isPlay ? "var(--pp-green)" : dimmed ? "var(--pp-fg-dim)" : undefined }}>PLAY</span>{" "}
            <span style={{ color: isSkip ? "var(--pp-red)" : dimmed && !isSkip ? "var(--pp-fg-dim)" : undefined }}>SKIP</span>
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setPlayType("power")}
          className="rounded-full px-5 py-1.5 text-base"
          style={{ background: "var(--pp-purple)", color: "black", opacity: playType === "power" ? 1 : 0.5 }}
        >
          POWER
        </button>
        <button type="button" disabled title="Coming soon" className="rounded-full px-5 py-1.5 text-base opacity-30" style={{ background: "var(--pp-teal)", color: "black" }}>
          FLEX
        </button>
        <label className="flex flex-1 items-center gap-2 text-base">
          PROMO:
          <input
            value={promo}
            onChange={(e) => setPromo(e.target.value)}
            className="flex-1 rounded-full border border-white bg-transparent px-3 py-1"
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-[2fr_1.2fr_0.9fr_1fr_0.6fr_0.9fr] gap-1 text-sm">
          <span>PLAYER</span>
          <span>STAT</span>
          <span>▲/▼</span>
          <span>LINE</span>
          <span>FREE</span>
          <span>HIT %</span>
        </div>
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[2fr_1.2fr_0.9fr_1fr_0.6fr_0.9fr] items-center gap-1">
            <select
              value={row.player}
              onChange={(e) => updateRow(i, { player: e.target.value, stat: "", side: "", line: "" })}
              className="rounded-full border border-white bg-transparent px-2 py-1 text-sm"
            >
              <option value="" />
              {players.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select
              value={row.stat}
              onChange={(e) => updateRow(i, { stat: e.target.value, side: "", line: "" })}
              disabled={!row.player}
              className="rounded-full border border-white bg-transparent px-2 py-1 text-sm"
            >
              <option value="" />
              {row.player &&
                statsFor(row.player).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
            </select>
            <select
              value={row.side}
              onChange={(e) => updateRow(i, { side: e.target.value as Side })}
              disabled={!row.stat}
              className="rounded-full border border-white bg-transparent px-2 py-1 text-sm"
            >
              <option value="" />
              <option value="More">▲</option>
              <option value="Less">▼</option>
            </select>
            <select
              value={row.line}
              onChange={(e) => updateRow(i, { line: Number(e.target.value) })}
              disabled={!row.stat}
              className="rounded-full border border-white bg-transparent px-2 py-1 text-sm"
            >
              <option value="" />
              {row.player &&
                row.stat &&
                [...new Set(ladderFor(row.player, row.stat).map((r) => r.line))]
                  .sort((a, b) => a - b)
                  .map((ln) => (
                    <option key={ln} value={ln}>
                      {ln}
                    </option>
                  ))}
            </select>
            <button
              type="button"
              onClick={() => setFree(i)}
              aria-label="Free space"
              className="mx-auto h-6 w-6 rounded-full border-2"
              style={{ borderColor: "white", background: row.free ? "var(--pp-green)" : "transparent" }}
            />
            <span className="text-center text-sm">{hitPctFor(i)}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-base">
          PRIZEPICKS MULTIPLIER:
          <input
            value={multiplierInput}
            onChange={(e) => setMultiplierInput(e.target.value)}
            inputMode="decimal"
            placeholder={result ? String(result.payout ?? "") : ""}
            className="w-24 rounded-full border border-white bg-transparent px-3 py-1 text-center"
          />
        </label>
        <div className="flex gap-3">
          <button type="button" onClick={handleBuild} className="rounded-full px-5 py-1.5 text-sm" style={{ background: "var(--pp-orange)", color: "black" }}>
            BUILD &gt;
          </button>
          <button type="button" onClick={handleSave} className="rounded-full px-5 py-1.5 text-sm" style={{ background: "var(--pp-green)", color: "black" }}>
            SAVE
          </button>
        </div>
      </div>
      {saveStatus && <p className="text-right text-sm" style={{ color: "var(--pp-fg-dim)" }}>{saveStatus}</p>}

      <div className="flex flex-col items-center gap-3">
        <h2 className="pp-title text-sm underline">INFO</h2>
        <div className="grid w-full grid-cols-2 gap-x-6 gap-y-2 text-base">
          <InfoRow label="ALL HIT %" value={result ? `${(result.allHit * 100).toFixed(1)}%` : ""} />
          <InfoRow label="CUSHION NEED" value={result ? `${(result.cushion * 100).toFixed(1)}%` : ""} />
          <InfoRow label="BREAKEVEN %" value={result?.breakEven ? `${(result.breakEven * 100).toFixed(1)}%` : ""} />
          <InfoRow label="SUGGESTED STAKE" value={result?.stake !== null && result?.stake !== undefined ? `$${result.stake.toFixed(2)}` : ""} />
          <InfoRow label="EV" value={result?.ev !== null && result?.ev !== undefined ? `${(result.ev * 100).toFixed(1)}%` : ""} />
          <InfoRow label="LOSS CHANCE %" value={result?.chanceLoses !== null && result?.chanceLoses !== undefined ? `${(result.chanceLoses * 100).toFixed(1)}%` : ""} />
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span>{label}:</span>
      <span className="min-w-16 rounded-full border border-white px-3 py-0.5 text-center text-sm">{value}</span>
    </div>
  );
}
