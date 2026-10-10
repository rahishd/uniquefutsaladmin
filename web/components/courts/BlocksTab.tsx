"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Lock, Trash2 } from "lucide-react";
import { prettyDate } from "@/lib/bookings";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { Block, HOURS, addBlock, getBlocks, previewBlock, removeBlock } from "@/lib/courts";
import { hourLabel, todayKey } from "@/lib/slots";

const field = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";

export default function BlocksTab() {
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [tick, setTick] = useState(0);
  const [date, setDate] = useState(todayKey());
  const [hours, setHours] = useState<number[]>([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const editable = true;

  useEffect(() => {
    let live = true;
    getBlocks()
      .then((b) => { if (live) setBlocks(b); })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load blocked hours"); });
    return () => { live = false; };
  }, [tick]);

  const byDate = useMemo(() => {
    const m = new Map<string, Block[]>();
    for (const b of blocks ?? []) m.set(b.date, [...(m.get(b.date) ?? []), b]);
    return [...m.entries()];
  }, [blocks]);

  const toggle = (h: number) => setHours((x) => (x.includes(h) ? x.filter((y) => y !== h) : [...x, h].sort((a, b) => a - b)));

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!guard("courts.block")) return;
    setError("");
    setNote("");
    if (!date) return setError("Pick a date.");
    if (hours.length === 0) return setError("Pick at least one hour to block.");
    if (reason.trim().length < 2) return setError("Write a short reason, for example floor repair.");
    setBusy(true);
    try {
      // games already booked in those hours are cancelled: show them first and ask
      const { wouldCancel } = await previewBlock({ date, hours, reason: reason.trim() });
      if (wouldCancel.length > 0) {
        const list = wouldCancel.slice(0, 8).map((x) => `• ${x.customer ?? x.phone ?? "Guest"} · ${x.time}${x.paid ? " (paid, refund due)" : ""}`).join("\n");
        const more = wouldCancel.length > 8 ? `\n…and ${wouldCancel.length - 8} more` : "";
        const ok = window.confirm(`Blocking these hours will CANCEL ${wouldCancel.length} booking${wouldCancel.length === 1 ? "" : "s"}:\n\n${list}${more}\n\nEach customer is told the reason: "${reason.trim()}". Paid online bookings are marked for refund.\n\nBlock and cancel them?`);
        if (!ok) { setBusy(false); return; }
      }
      const r = await addBlock({ date, hours, reason: reason.trim() });
      setNote(`Blocked ${hours.length} hour${hours.length > 1 ? "s" : ""} on ${prettyDate(date)}. Customers can no longer book them and will see the reason.${r.cancelled.length ? ` ${r.cancelled.length} booking${r.cancelled.length === 1 ? "" : "s"} cancelled and the customer${r.cancelled.length === 1 ? "" : "s"} told.` : ""}`);
      setHours([]);
      setReason("");
      setTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not block those hours");
    } finally {
      setBusy(false);
    }
  }

  async function remove(b: Block) {
    if (!guard("courts.block")) return;
    if (!window.confirm(`Open ${hourLabel(b.hour)} on ${prettyDate(b.date)} for booking again?`)) return;
    try {
      await removeBlock(b.id);
      setTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the block");
    }
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {note && <p className="rounded-xl bg-brand/10 p-3 text-sm text-brand" role="status">{note}</p>}

      {editable ? (
        <form onSubmit={submit} className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
          <h2 className="font-bold">Block hours</h2>
          <p className="text-xs text-muted">For repairs, tournaments or private events. Blocked hours cannot be booked in the app or at the desk, and customers see the reason you write. Bookings already in those hours are cancelled automatically and the customers are told why.</p>
          <label className="block text-sm font-medium">Date
            <input type="date" min={todayKey()} value={date} onChange={(e) => setDate(e.target.value)} className={`${field} mt-1`} />
          </label>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Hours</legend>
            <div className="flex flex-wrap gap-1.5">
              {HOURS.map((h) => (
                <button type="button" key={h} aria-pressed={hours.includes(h)} onClick={() => toggle(h)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${hours.includes(h) ? "bg-brand text-white" : "bg-surface-2 text-muted hover:bg-brand/10"}`}>{hourLabel(h)}</button>
              ))}
            </div>
          </fieldset>
          <label className="block text-sm font-medium">Reason
            <input value={reason} maxLength={120} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Floor repair" className={`${field} mt-1`} />
          </label>
          <button disabled={busy} className="w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-60">{busy ? "Blocking…" : `Block ${hours.length || ""} hour${hours.length === 1 ? "" : "s"}`}</button>
        </form>
      ) : (
        <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">You can view blocked hours. Only a manager or owner can block or open them.</p>
      )}

      <section className="space-y-3">
        <h2 className="px-1 text-sm font-bold">Upcoming blocked hours</h2>
        {!blocks && !error && <p className="py-6 text-center text-sm text-muted">Loading…</p>}
        {blocks && blocks.length === 0 && <p className="rounded-2xl bg-surface py-8 text-center text-sm text-muted shadow-sm">Nothing is blocked.</p>}
        {byDate.map(([d, list]) => (
          <div key={d} className="rounded-2xl bg-surface p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold">{prettyDate(d)}</h3>
              <Link href="/slots" className="text-xs font-semibold text-brand">Open Slots</Link>
            </div>
            <ul className="divide-y divide-line">
              {list.map((b) => (
                <li key={b.id} className="flex items-center gap-3 py-2">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted"><Lock size={16} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{hourLabel(b.hour)}</p>
                    <p className="truncate text-xs text-muted">{b.reason}</p>
                  </div>
                  {editable && <button onClick={() => remove(b)} aria-label={`Remove block at ${hourLabel(b.hour)}`} className="rounded-full p-2 text-red-600 hover:bg-red-500/10"><Trash2 size={16} /></button>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
