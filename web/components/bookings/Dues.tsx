"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Plus, Check } from "lucide-react";
import PaySplit, { INITIAL_PAY, PayState, paymentsFor } from "../PaySplit";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { DuesInfo, DueRow, collectDues, getDues, prettyDate, rs } from "@/lib/bookings";

const hour12 = (t: string) => { const h = Number(t.slice(0, 2)); return `${h % 12 || 12}${t.slice(2)} ${h < 12 ? "AM" : "PM"}`; };
const shortDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

// Shown for an unpaid booking: this booking plus everything else the same customer owes: old unpaid games (up to today), goods taken on credit,
// and upcoming bookings (optional: add with + or skip). Everything chosen is collected in one payment, in one method or split.
export default function Dues({ bookingId, onPaid }: { bookingId: string; onPaid: () => void }) {
  const [info, setInfo] = useState<DuesInfo | null>(null);
  const [error, setError] = useState("");
  const [on, setOn] = useState<Record<string, boolean>>({});
  const [goodsOn, setGoodsOn] = useState<Record<string, boolean>>({});
  const [pay, setPay] = useState<PayState>(INITIAL_PAY);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ total: number; count: number; billCode: string | null; points: number } | null>(null);

  useEffect(() => {
    let live = true;
    getDues(bookingId).then((d) => {
      if (!live) return;
      setInfo(d);
      // this booking, today's, every old due and all goods on credit are included; upcoming ones are the staff's choice
      setOn(Object.fromEntries([d.current, ...d.past, ...d.today].map((x) => [x.id, true])));
      setGoodsOn(Object.fromEntries(d.goods.map((g) => [g.id, true])));
    }).catch((e) => live && setError(e instanceof ApiError ? e.message : "Could not load the dues"));
    return () => { live = false; };
  }, [bookingId]);

  if (error && !info) return <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>;
  if (!info) return null;
  if (done) {
    return (
      <section className="mt-4 grid place-items-center gap-2 rounded-xl bg-brand/10 p-4 text-center">
        <CheckCircle2 size={32} className="text-brand" />
        <p className="font-bold">Collected {rs(done.total)} for {done.count} due{done.count === 1 ? "" : "s"}</p>
        {done.billCode && <p className="text-xs text-muted">Bill {done.billCode} saved on the customer&apos;s account{done.points ? ` · ${done.points} loyalty points added` : ""}.</p>}
      </section>
    );
  }
  const all: DueRow[] = [info.current, ...info.past, ...info.today, ...info.upcoming];
  const chosen = all.filter((x) => on[x.id]);
  const chosenGoods = info.goods.filter((g) => goodsOn[g.id]);
  const total = chosen.reduce((s, x) => s + x.total, 0) + chosenGoods.reduce((s, g) => s + g.amount, 0);
  const count = chosen.length + chosenGoods.length;
  const toggle = (id: string) => setOn((o) => ({ ...o, [id]: !o[id] }));
  const allUpcoming = info.upcoming.length > 0 && info.upcoming.every((x) => on[x.id]);
  const setUpcoming = (v: boolean) => setOn((o) => ({ ...o, ...Object.fromEntries(info.upcoming.map((x) => [x.id, v])) }));
  const ready = paymentsFor(total, pay);

  async function collect() {
    if (!guard("payments.collect")) return;
    if (ready.problem) return setError(ready.problem);
    setBusy(true); setError("");
    try {
      const r = await collectDues({ anchorId: bookingId, bookingIds: chosen.map((x) => x.id), goodsDueIds: chosenGoods.map((g) => g.id), ...(ready.payments ? { payments: ready.payments } : { method: ready.single === "cash" ? "venue" : ready.single }) });
      setDone(r); onPaid();
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not collect the payment"); } finally { setBusy(false); }
  }

  const row = (x: DueRow, kind: "fixed" | "past" | "optional") => (
    <li key={x.id} className={`flex items-center gap-3 rounded-xl p-2.5 text-sm ${on[x.id] ? "bg-red-500/10" : "bg-surface-2"}`}>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{prettyDate(x.date)}, {hour12(x.startTime)}</span>
        <span className="block text-[11px] text-muted">{x.code}{x.promoCode ? ` · promo ${x.promoCode}` : ""}{x.status === "confirmed" && kind === "optional" ? " · not played yet" : ""}</span>
      </span>
      <span className="font-semibold">{rs(x.total)}</span>
      {kind === "optional" ? (
        <button type="button" onClick={() => toggle(x.id)} aria-pressed={!!on[x.id]} aria-label={on[x.id] ? `Skip ${x.code}` : `Add ${x.code} to today's payment`}
          className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold ${on[x.id] ? "bg-brand text-white" : "border border-line"}`}>
          {on[x.id] ? <><Check size={13} /> Added</> : <><Plus size={13} /> Pay today</>}
        </button>
      ) : kind === "past" ? (
        <button type="button" onClick={() => toggle(x.id)} aria-pressed={!!on[x.id]} aria-label={`${on[x.id] ? "Remove" : "Include"} ${x.code}`} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${on[x.id] ? "bg-red-600 text-white" : "border border-line"}`}>{on[x.id] ? "Included" : "Left out"}</button>
      ) : null}
    </li>
  );

  const nothingElse = info.past.length + info.today.length + info.upcoming.length + info.goods.length === 0;
  return (
    <section className="mt-4 space-y-3 rounded-xl border border-red-500/30 p-3" aria-label="Unpaid dues">
      <div>
        <p className="font-semibold text-red-600">Unpaid dues{info.customer.name ? `: ${info.customer.name}` : ""}</p>
        {!info.customer.known && <p className="text-xs text-muted">This booking has no phone number, so other dues cannot be found.</p>}
      </div>

      <ul className="space-y-1.5">{row(info.current, "fixed")}</ul>

      {info.goods.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Inventory dues, goods on credit ({rs(info.goodsTotal)})</p>
          <ul className="space-y-1.5">
            {info.goods.map((g) => (
              <li key={g.id} className={`flex items-center gap-3 rounded-xl p-2.5 text-sm ${goodsOn[g.id] ? "bg-red-500/10" : "bg-surface-2"}`}>
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{g.items}</span><span className="block text-[11px] text-muted">Taken {shortDay(g.createdAt)}</span></span>
                <span className="font-semibold">{rs(g.amount)}</span>
                <button type="button" onClick={() => setGoodsOn((o) => ({ ...o, [g.id]: !o[g.id] }))} aria-pressed={!!goodsOn[g.id]} aria-label={`${goodsOn[g.id] ? "Remove" : "Include"} goods: ${g.items}`} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${goodsOn[g.id] ? "bg-red-600 text-white" : "border border-line"}`}>{goodsOn[g.id] ? "Included" : "Left out"}</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {info.past.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Old dues, up to today ({rs(info.pastTotal)})</p>
          <ul className="space-y-1.5">{info.past.map((x) => row(x, "past"))}</ul>
        </div>
      )}
      {info.today.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Also today</p>
          <ul className="space-y-1.5">{info.today.map((x) => row(x, "past"))}</ul>
        </div>
      )}
      {info.upcoming.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Upcoming payments (optional)</p>
            <button type="button" onClick={() => setUpcoming(!allUpcoming)} className="rounded-full border border-line px-3 py-1 text-xs font-bold">{allUpcoming ? "Clear all" : `Select all (${info.upcoming.length})`}</button>
          </div>
          <ul className="space-y-1.5">{info.upcoming.map((x) => row(x, "optional"))}</ul>
        </div>
      )}
      {nothingElse && info.customer.known && <p className="text-xs text-muted">No other unpaid bookings or goods for this customer.</p>}

      <div className="space-y-2 border-t border-line pt-3">
        <div className="flex items-center justify-between"><span className="text-sm text-muted">{count} selected</span><span className="text-xl font-bold">{rs(total)}</span></div>
        <PaySplit total={total} value={pay} onChange={(v) => { setPay(v); setError(""); }} />
        {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
        <button onClick={collect} disabled={busy || count === 0 || !!ready.problem} className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : `Collect ${rs(total)}`}</button>
      </div>
    </section>
  );
}
