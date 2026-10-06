"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Plus, Check } from "lucide-react";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { DuesInfo, DueRow, collectDues, getDues, prettyDate, rs } from "@/lib/bookings";

const hour12 = (t: string) => { const h = Number(t.slice(0, 2)); return `${h % 12 || 12}${t.slice(2)} ${h < 12 ? "AM" : "PM"}`; };
const METHODS = [{ id: "venue", label: "Cash" }, { id: "esewa", label: "eSewa" }, { id: "fonepay", label: "Fonepay" }] as const;

// Shown for an unpaid booking: this booking plus everything else the same customer owes. Old dues (up to today) are added to today's payment;
// upcoming bookings can be added with + or skipped.
export default function Dues({ bookingId, onPaid }: { bookingId: string; onPaid: () => void }) {
  const [info, setInfo] = useState<DuesInfo | null>(null);
  const [error, setError] = useState("");
  const [on, setOn] = useState<Record<string, boolean>>({});
  const [method, setMethod] = useState<"venue" | "esewa" | "fonepay">("venue");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ total: number; count: number; billCode: string | null; points: number } | null>(null);

  useEffect(() => {
    let live = true;
    getDues(bookingId).then((d) => {
      if (!live) return;
      setInfo(d);
      // this booking, today's and every old due are included; upcoming ones are the staff's choice
      setOn(Object.fromEntries([d.current, ...d.past, ...d.today].map((x) => [x.id, true])));
    }).catch((e) => live && setError(e instanceof ApiError ? e.message : "Could not load the dues"));
    return () => { live = false; };
  }, [bookingId]);

  if (error) return <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>;
  if (!info) return null;
  if (done) {
    return (
      <section className="mt-4 grid place-items-center gap-2 rounded-xl bg-brand/10 p-4 text-center">
        <CheckCircle2 size={32} className="text-brand" />
        <p className="font-bold">Collected {rs(done.total)} for {done.count} booking{done.count === 1 ? "" : "s"}</p>
        {done.billCode && <p className="text-xs text-muted">Bill {done.billCode} saved on the customer&apos;s account{done.points ? ` · ${done.points} loyalty points added` : ""}.</p>}
      </section>
    );
  }
  const all: DueRow[] = [info.current, ...info.past, ...info.today, ...info.upcoming];
  const chosen = all.filter((x) => on[x.id]);
  const total = chosen.reduce((s, x) => s + x.total, 0);
  const toggle = (id: string) => setOn((o) => ({ ...o, [id]: !o[id] }));

  async function collect() {
    if (!guard("payments.collect")) return;
    setBusy(true); setError("");
    try {
      const r = await collectDues({ anchorId: bookingId, bookingIds: chosen.map((x) => x.id), method });
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

  const nothingElse = info.past.length + info.today.length + info.upcoming.length === 0;
  return (
    <section className="mt-4 space-y-3 rounded-xl border border-red-500/30 p-3" aria-label="Unpaid dues">
      <div>
        <p className="font-semibold text-red-600">Unpaid dues{info.customer.name ? `: ${info.customer.name}` : ""}</p>
        {!info.customer.known && <p className="text-xs text-muted">This booking has no phone number, so other dues cannot be found.</p>}
      </div>

      <ul className="space-y-1.5">{row(info.current, "fixed")}</ul>

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
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Upcoming payments (optional)</p>
          <ul className="space-y-1.5">{info.upcoming.map((x) => row(x, "optional"))}</ul>
        </div>
      )}
      {nothingElse && info.customer.known && <p className="text-xs text-muted">No other unpaid bookings for this customer.</p>}

      <div className="space-y-2 border-t border-line pt-3">
        <div className="flex items-center justify-between"><span className="text-sm text-muted">{chosen.length} booking{chosen.length === 1 ? "" : "s"} selected</span><span className="text-xl font-bold">{rs(total)}</span></div>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
          {METHODS.map((m) => <button key={m.id} type="button" aria-pressed={method === m.id} onClick={() => setMethod(m.id)} className={`rounded-lg py-2 text-sm font-semibold ${method === m.id ? "bg-brand text-white" : "text-muted"}`}>{m.label}</button>)}
        </div>
        <button onClick={collect} disabled={busy || chosen.length === 0} className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : `Collect ${rs(total)}`}</button>
      </div>
    </section>
  );
}
