"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Leg, PlayType, Side } from "../../../lib/entry-math";
import { gradeEntryAction, listEntriesAction, saveEntryAction } from "./actions";
import type { EntryRow } from "../../../lib/bankroll";

type AvailableLeg = { player: string; team: string; stat: string; ladder: { line: number; pick: Side; chance: number }[] };
type Row = { player: string; stat: string; side: Side | ""; line: number | ""; free: boolean };
const EMPTY_ROW: Row = { player: "", stat: "", side: "", line: "", free: false };
const DRAFT_KEY = "pp_draft_entry";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function legsToRows(legs: Leg[]): Row[] {
  const rows: Row[] = legs.map((l) => ({ player: l.player, stat: l.stat, side: l.side, line: l.line, free: l.free }));
  while (rows.length < 6) rows.push({ ...EMPTY_ROW });
  return rows;
}

export default function EntryInputClient({ availableLegs }: { availableLegs: AvailableLeg[] }) {
  const searchParams = useSearchParams();
  const [view, setView] = useState<"chooser" | "form" | "table">("chooser");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [status, setStatus] = useState<"pending" | "win" | "loss">("pending");

  const [entryDate, setEntryDate] = useState(today());
  const [playType, setPlayType] = useState<PlayType>("power");
  const [promo, setPromo] = useState("");
  const [rows, setRows] = useState<Row[]>(Array.from({ length: 6 }, () => ({ ...EMPTY_ROW })));
  const [stake, setStake] = useState("");
  const [multiplier, setMultiplier] = useState("");
  const [payout, setPayout] = useState<number | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    // Reads sessionStorage (client-only) to apply a draft built in Entry Builder. Must stay an effect, not a lazy
    // useState initializer: sessionStorage isn't available during SSR, so seeding state from it at render time
    // would make the server-rendered HTML (no draft) mismatch the client's first render (draft applied).
    if (searchParams.get("draft") === "1") {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as { legs: Leg[]; playType: PlayType; promo: string | null; multiplier?: number };
        // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-time sync from sessionStorage, see comment above
        setRows(legsToRows(draft.legs));
        setPlayType(draft.playType);
        setPromo(draft.promo ?? "");
        if (draft.multiplier) setMultiplier(String(draft.multiplier));
        sessionStorage.removeItem(DRAFT_KEY);
        setEntryDate(today());
        setEditingId(null);
        setStatus("pending");
        setView("form");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm() {
    setEntryDate(today());
    setPlayType("power");
    setPromo("");
    setRows(Array.from({ length: 6 }, () => ({ ...EMPTY_ROW })));
    setStake("");
    setMultiplier("");
    setPayout(null);
    setEditingId(null);
    setStatus("pending");
  }

  function openNew() {
    resetForm();
    setView("form");
  }

  function openRow(row: EntryRow) {
    setEditingId(row.id);
    setEntryDate(row.entryDate);
    setPlayType(row.playType as PlayType);
    setPromo(row.promo ?? "");
    setRows(legsToRows(row.legs));
    setStake(String(row.stakeDollars));
    setMultiplier(String(row.multiplier));
    setPayout(row.payoutDollars);
    setStatus(row.status as "pending" | "win" | "loss");
    setView("form");
  }

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function setFree(i: number) {
    setRows((prev) => prev.map((r, idx) => ({ ...r, free: idx === i ? !r.free : false })));
  }

  async function handleSave() {
    const legs = rows
      .filter((r) => r.player && r.stat && r.side && r.line !== "")
      .map((r) => ({ player: r.player, team: availableLegs.find((a) => a.player === r.player)?.team ?? "", stat: r.stat, side: r.side as Side, line: r.line as number, free: r.free }));
    const s = Number(stake);
    const m = Number(multiplier);
    if (legs.length < 1 || !Number.isFinite(s) || !Number.isFinite(m)) {
      setSaveMsg("Fill in at least one leg, $ entry, and multiplier.");
      return;
    }
    await saveEntryAction({ entryDate, playType, promo: promo || null, legs, stakeDollars: s, multiplier: m });
    setSaveMsg("Saved");
    setTimeout(() => {
      setSaveMsg(null);
      resetForm();
      setView("chooser");
    }, 1200);
  }

  async function handleGrade(result: "win" | "loss") {
    if (editingId === null) return;
    await gradeEntryAction(editingId, result);
    setStatus(result);
    setPayout(result === "win" ? Number(stake) * Number(multiplier) : 0);
  }

  if (view === "chooser") {
    return (
      <div className="flex flex-col items-center gap-10 pt-16">
        <h1 className="pp-title text-lg">ENTRY INPUT</h1>
        <div className="flex gap-4">
          <button type="button" onClick={() => setView("table")} className="rounded-full px-8 py-3 text-base" style={{ background: "var(--pp-yellow)", color: "black" }}>
            SAVED
          </button>
          <button type="button" onClick={openNew} className="rounded-full px-8 py-3 text-base" style={{ background: "var(--pp-green)", color: "black" }}>
            NEW
          </button>
        </div>
      </div>
    );
  }

  if (view === "table") {
    return <SavedTable onOpen={openRow} onBack={() => setView("chooser")} />;
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="pp-title text-lg">ENTRY INPUT</h1>
        <label className="flex items-center gap-2 text-base">
          DATE:
          <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="rounded-full border border-white bg-transparent px-2 py-1" />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setPlayType("power")} className="rounded-full px-5 py-1.5 text-base" style={{ background: "var(--pp-purple)", color: "black", opacity: playType === "power" ? 1 : 0.5 }}>
          POWER
        </button>
        <button type="button" disabled title="Coming soon" className="rounded-full px-5 py-1.5 text-base opacity-30" style={{ background: "var(--pp-teal)", color: "black" }}>
          FLEX
        </button>
        <label className="flex flex-1 items-center gap-2 text-base">
          PROMO:
          <input value={promo} onChange={(e) => setPromo(e.target.value)} className="flex-1 rounded-full border border-white bg-transparent px-3 py-1" />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-[2fr_1.2fr_0.9fr_1fr_0.6fr] gap-1 text-sm">
          <span>PLAYER</span>
          <span>STAT</span>
          <span>▲/▼</span>
          <span>LINE</span>
          <span>FREE</span>
        </div>
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[2fr_1.2fr_0.9fr_1fr_0.6fr] items-center gap-1">
            <select value={row.player} onChange={(e) => updateRow(i, { player: e.target.value, stat: "", side: "", line: "" })} className="rounded-full border border-white bg-transparent px-2 py-1 text-sm">
              <option value="" />
              {[...new Set(availableLegs.map((l) => l.player))].sort().map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select value={row.stat} onChange={(e) => updateRow(i, { stat: e.target.value, side: "", line: "" })} disabled={!row.player} className="rounded-full border border-white bg-transparent px-2 py-1 text-sm">
              <option value="" />
              {row.player &&
                [...new Set(availableLegs.filter((l) => l.player === row.player).map((l) => l.stat))].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
            </select>
            <select value={row.side} onChange={(e) => updateRow(i, { side: e.target.value as Side })} disabled={!row.stat} className="rounded-full border border-white bg-transparent px-2 py-1 text-sm">
              <option value="" />
              <option value="More">▲</option>
              <option value="Less">▼</option>
            </select>
            <select value={row.line} onChange={(e) => updateRow(i, { line: Number(e.target.value) })} disabled={!row.stat} className="rounded-full border border-white bg-transparent px-2 py-1 text-sm">
              <option value="" />
              {row.player &&
                row.stat &&
                [...new Set((availableLegs.find((l) => l.player === row.player && l.stat === row.stat)?.ladder ?? []).map((r) => r.line))]
                  .sort((a, b) => a - b)
                  .map((ln) => (
                    <option key={ln} value={ln}>
                      {ln}
                    </option>
                  ))}
            </select>
            <button type="button" onClick={() => setFree(i)} aria-label="Free space" className="mx-auto h-6 w-6 rounded-full border-2" style={{ borderColor: "white", background: row.free ? "var(--pp-green)" : "transparent" }} />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-base">
        <label className="flex items-center gap-2">
          $ ENTRY:
          <input value={stake} onChange={(e) => setStake(e.target.value)} inputMode="decimal" className="w-20 rounded-full border border-white bg-transparent px-2 py-1 text-center" />
        </label>
        <label className="flex items-center gap-2">
          MULTIPLIER:
          <input value={multiplier} onChange={(e) => setMultiplier(e.target.value)} inputMode="decimal" className="w-16 rounded-full border border-white bg-transparent px-2 py-1 text-center" />
        </label>
        <label className="flex items-center gap-2">
          PAYOUT:
          <input value={payout !== null ? `$${payout.toFixed(2)}` : ""} disabled className="w-20 rounded-full border border-white bg-transparent px-2 py-1 text-center opacity-70" />
        </label>
      </div>

      <div className="flex items-center justify-end gap-3">
        {saveMsg && <span className="text-sm" style={{ color: "var(--pp-fg-dim)" }}>{saveMsg}</span>}
        <button type="button" onClick={handleSave} className="rounded-full px-6 py-1.5 text-base" style={{ background: "var(--pp-green)", color: "black" }}>
          SAVE
        </button>
      </div>

      {editingId !== null && status === "pending" && (
        <div className="flex justify-center gap-6 pt-6">
          <button type="button" onClick={() => handleGrade("win")} className="rounded-full px-8 py-2 text-base" style={{ background: "var(--pp-green)", color: "black" }}>
            WIN
          </button>
          <button type="button" onClick={() => handleGrade("loss")} className="rounded-full px-8 py-2 text-base" style={{ background: "var(--pp-red)", color: "black" }}>
            LOSS
          </button>
        </div>
      )}
      {editingId !== null && status !== "pending" && (
        <p className="pp-title text-center text-sm" style={{ color: status === "win" ? "var(--pp-green)" : "var(--pp-red)" }}>
          {status.toUpperCase()}
        </p>
      )}
    </div>
  );
}

function SavedTable({ onOpen, onBack }: { onOpen: (row: EntryRow) => void; onBack: () => void }) {
  const [rows, setRows] = useState<EntryRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [sortBy, setSortBy] = useState<"entryDate" | "legCount" | "status" | "payoutDollars">("entryDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "win" | "loss">("all");

  async function load(reset: boolean) {
    const nextOffset = reset ? 0 : offset;
    const res = await listEntriesAction({ sortBy, sortDir, offset: nextOffset });
    const filtered = statusFilter === "all" ? res.rows : res.rows.filter((r) => r.status === statusFilter);
    setRows(reset ? filtered : [...rows, ...filtered]);
    setHasMore(res.hasMore);
    setOffset(nextOffset + 10);
  }

  useEffect(() => {
    // Standard "refetch from the server when filters/sort change" pattern - load() is async, so its setState
    // calls run after the effect body has already returned, not synchronously within it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, sortDir, statusFilter]);

  function toggleSort(col: typeof sortBy) {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(col);
      setSortDir("desc");
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="text-base" style={{ color: "var(--pp-fg-dim)" }}>
          ← back
        </button>
        <h1 className="pp-title text-lg">ENTRY INPUT</h1>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="rounded-full border border-white bg-transparent px-2 py-1 text-sm">
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="win">Win</option>
          <option value="loss">Loss</option>
        </select>
      </div>

      <table className="w-full text-center text-lg">
        <thead>
          <tr className="text-base">
            <th className="cursor-pointer underline" onClick={() => toggleSort("entryDate")}>
              DATE
            </th>
            <th className="cursor-pointer underline" onClick={() => toggleSort("legCount")}>
              LEGS
            </th>
            <th className="cursor-pointer underline" onClick={() => toggleSort("status")}>
              W/L
            </th>
            <th className="cursor-pointer underline" onClick={() => toggleSort("payoutDollars")}>
              PAYOUT
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} onClick={() => onOpen(r)} className="cursor-pointer">
              <td className="py-1">{r.entryDate}</td>
              <td className="py-1">{r.legs.length}</td>
              <td className="py-1" style={{ color: r.status === "win" ? "var(--pp-green)" : r.status === "loss" ? "var(--pp-red)" : "var(--pp-fg-dim)" }}>
                {r.status === "pending" ? "P" : r.status === "win" ? "W" : "L"}
              </td>
              <td className="py-1">{r.payoutDollars !== null ? `$${r.payoutDollars.toFixed(2)}` : "-"}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="py-6" style={{ color: "var(--pp-fg-dim)" }}>
                No entries yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {hasMore && (
        <button type="button" onClick={() => load(false)} className="mx-auto rounded-full border border-white px-6 py-1.5 text-base">
          LOAD MORE
        </button>
      )}
    </div>
  );
}
