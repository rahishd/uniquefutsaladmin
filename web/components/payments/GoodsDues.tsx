"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import PaySplit, { INITIAL_PAY, PayState, paymentsFor } from "../PaySplit";
import WhatsAppInvoice from "../WhatsAppInvoice";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { rs } from "@/lib/bookings";
import { BillResult, CreditDue, checkout, creditDues } from "@/lib/inventory";

type Group = { phone: string; name: string | null; total: number; dues: CreditDue[] };
const when = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

// Goods put on a customer's account (Inventory > Sales > "Put on account"). One card per customer; Collect takes every due of theirs in one payment.
export default function GoodsDues({ tick, onChanged }: { tick: number; onChanged: () => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<CreditDue[] | null>(null);
  const [error, setError] = useState("");
  const [pick, setPick] = useState<Group | null>(null);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      creditDues(q).then((d) => { if (live) { setRows(d.items); setError(""); } }).catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load"); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [q, tick]);

  const groups = useMemo(() => {
    const m = new Map<string, Group>();
    for (const r of rows ?? []) {
      const g = m.get(r.phone) ?? { phone: r.phone, name: r.name, total: 0, dues: [] };
      g.total += r.amount;
      g.dues.push(r);
      m.set(r.phone, g);
    }
    return [...m.values()];
  }, [rows]);
  const owed = groups.reduce((t, g) => t + g.total, 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-surface p-4 shadow-sm"><p className="text-xs text-muted">Goods on credit (to collect)</p><p className="text-xl font-bold text-amber-600">{rows ? rs(owed) : "—"}</p><p className="text-xs text-muted">{rows ? `${rows.length} sale${rows.length === 1 ? "" : "s"}` : " "}</p></div>
        <div className="rounded-2xl bg-surface p-4 shadow-sm"><p className="text-xs text-muted">Customers owing</p><p className="text-xl font-bold">{rows ? groups.length : "—"}</p><p className="text-xs text-muted">Put on account from Inventory &gt; Sales</p></div>
      </div>
      <label className="relative block">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone" className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 pl-10 text-sm outline-none focus:border-brand" />
      </label>
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!rows && !error && <p className="py-10 text-center text-sm text-muted">Loading…</p>}
      {rows && groups.length === 0 && <p className="rounded-2xl bg-surface py-14 text-center text-muted shadow-sm">No goods are waiting to be paid.</p>}
      <ul className="grid items-start gap-2 xl:grid-cols-2">
        {groups.map((g) => (
          <li key={g.phone} className="rounded-2xl bg-surface p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="truncate font-semibold">{g.name ?? "Customer"}</p><p className="text-sm text-muted">{g.phone}</p></div>
              <p className="shrink-0 text-lg font-bold text-amber-600">{rs(g.total)}</p>
            </div>
            <ul className="mt-2 space-y-1 border-t border-line pt-2 text-sm">
              {g.dues.map((d) => <li key={d.id} className="flex justify-between gap-3"><span className="min-w-0 truncate">{d.items} <span className="text-xs text-muted">· {when(d.createdAt)}</span></span><span className="font-semibold">{rs(d.amount)}</span></li>)}
            </ul>
            <button onClick={() => guard("payments.collect") && setPick(g)} className="mt-3 w-full rounded-full bg-brand py-2 text-sm font-semibold text-white">Collect {rs(g.total)}</button>
          </li>
        ))}
      </ul>
      {pick && <CollectGoods group={pick} onClose={() => setPick(null)} onDone={onChanged} />}
    </div>
  );
}

function CollectGoods({ group, onClose, onDone }: { group: Group; onClose: () => void; onDone: () => void }) {
  const [pay, setPay] = useState<PayState>(INITIAL_PAY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bill, setBill] = useState<BillResult | null>(null);
  const ready = paymentsFor(group.total, pay);

  async function save() {
    if (!guard("payments.collect") || !guard("inventory.sell")) return;
    if (ready.problem) return setError(ready.problem);
    setBusy(true);
    setError("");
    const how = ready.payments ? { payments: ready.payments, fonepayQrId: ready.fonepayQrId } : { payment: ready.single === "cash" ? ("cash" as const) : ("online" as const), fonepayQrId: ready.fonepayQrId };
    try {
      setBill((await checkout({ phone: group.phone, ...how, items: [], bookingIds: [], goodsDueIds: group.dues.map((d) => d.id) })) as BillResult);
      onDone();
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : "Could not save the payment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label="Collect goods payment" onClick={(e) => e.stopPropagation()} className="max-h-[94vh] w-full max-w-sm space-y-4 overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="flex items-start justify-between">
          <div><h2 className="text-lg font-bold">Collect goods payment</h2><p className="text-sm text-muted">{group.name ?? "Customer"} · {group.phone}</p></div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-surface-2"><X size={20} /></button>
        </div>
        <p className="text-3xl font-bold">{rs(group.total)}</p>
        {bill ? (
          <div className="grid place-items-center gap-3 text-center">
            <p className="font-bold text-brand">Payment saved · {bill.code}</p>
            <WhatsAppInvoice phone={group.phone} code={bill.code} name={group.name} lines={bill.lines} total={bill.total} points={Math.round((bill.pointsGoods + bill.pointsGames) * 10) / 10} />
            <button onClick={onClose} className="w-full rounded-xl border border-line py-3 font-semibold">Done</button>
          </div>
        ) : (
          <>
            <ul className="space-y-1 text-sm">{group.dues.map((d) => <li key={d.id} className="flex justify-between gap-3"><span className="truncate">{d.items}</span><span className="font-semibold">{rs(d.amount)}</span></li>)}</ul>
            <PaySplit total={group.total} value={pay} onChange={(v) => { setPay(v); setError(""); }} customerPhone={group.phone} />
            {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
            <button disabled={busy || !!ready.problem} onClick={save} className="w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-60">{busy ? "Saving…" : "Mark as paid"}</button>
          </>
        )}
      </div>
    </div>
  );
}
