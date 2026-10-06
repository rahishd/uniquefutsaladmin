"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Badge } from "../bookings/Badge";
import CollectModal from "./CollectModal";
import { guard } from "@/lib/access";
import { prettyDate, rs } from "@/lib/bookings";
import { Filters, Kind, Ledger, METHOD_LABEL, Mode, PAGE_SIZE, PayStatus, Period, Row, Summary, listPayments, paymentSummary } from "@/lib/payments";

const STATUS_TABS: { id: PayStatus | ""; label: string }[] = [
  { id: "", label: "All" }, { id: "paid", label: "Paid" }, { id: "unpaid", label: "Unpaid" }, { id: "cancelled", label: "Cancelled" },
];
const PERIODS: { id: Period; label: string }[] = [
  { id: "today", label: "Today" }, { id: "week", label: "7 days" }, { id: "month", label: "This month" }, { id: "all", label: "All time" }, { id: "custom", label: "Custom" },
];
const MODES: { id: Mode | ""; label: string }[] = [
  { id: "", label: "All payment modes" }, { id: "cash", label: "Cash at venue" }, { id: "online", label: "Online (Fonepay)" },
];
const TONE: Record<PayStatus, { label: string; tone: string }> = {
  paid: { label: "Paid", tone: "bg-brand/15 text-brand" },
  unpaid: { label: "Unpaid", tone: "bg-amber-500/15 text-amber-600" },
  cancelled: { label: "Cancelled", tone: "bg-slate-500/15 text-slate-500" },
};

function Card({ title, value, sub, tone }: { title: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="rounded-2xl bg-surface p-4 shadow-sm">
      <p className="text-xs text-muted">{title}</p>
      <p className={`text-xl font-bold ${tone ?? ""}`}>{value}</p>
      <p className="text-xs text-muted">{sub}</p>
    </div>
  );
}

export default function PaymentsPage() {
  const [f, setF] = useState<Filters>({ kind: "court", status: "", mode: "", period: "month", from: "", to: "", q: "" });
  const [search, setSearch] = useState("");
  const [pageNo, setPageNo] = useState(1);
  const [data, setData] = useState<Ledger | null>(null);
  const [sum, setSum] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [collecting, setCollecting] = useState<Row | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => { setF((x) => (x.q === search ? x : { ...x, q: search })); setPageNo(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let live = true;
    listPayments(f, pageNo)
      .then((d) => { if (live) { setData(d); setError(""); } })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load payments"); });
    paymentSummary(f).then((s) => { if (live) setSum(s); }).catch(() => {});
    return () => { live = false; };
  }, [f, pageNo, tick]);

  const change = (patch: Partial<Filters>) => { setF({ ...f, ...patch }); setPageNo(1); setData(null); setSum(null); setError(""); };
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const input = "rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Payments</h1>
        <p className="text-sm text-muted">Who has paid, who still owes, and how: cash at the venue or online.</p>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-surface p-1 shadow-sm" role="tablist" aria-label="Payment type">
        {([["court", "Court bookings"], ["gamezone", "Gamezone"]] as [Kind, string][]).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={f.kind === id} onClick={() => change({ kind: id })}
            className={`rounded-xl py-2.5 text-sm font-semibold ${f.kind === id ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}>{label}</button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card title="Paid" value={sum ? rs(sum.paid.sum) : "—"} sub={sum ? `${sum.paid.count} payments` : " "} tone="text-brand" />
        <Card title="Unpaid (to collect)" value={sum ? rs(sum.unpaid.sum) : "—"} sub={sum ? `${sum.unpaid.count} bookings` : " "} tone="text-amber-600" />
        <Card title="Cash at venue (paid)" value={sum ? rs(sum.paidCash.sum) : "—"} sub={sum ? `${sum.paidCash.count} payments` : " "} />
        <Card title="Online (paid)" value={sum ? rs(sum.paidOnline.sum) : "—"} sub={sum ? `Fonepay ${rs(sum.paidFonepay.sum)}${sum.paidEsewa.sum > 0 ? ` · earlier eSewa ${rs(sum.paidEsewa.sum)}` : ""}` : " "} />
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-surface p-1 shadow-sm" role="tablist" aria-label="Payment status">
        {STATUS_TABS.map((t) => (
          <button key={t.label} role="tab" aria-selected={f.status === t.id} onClick={() => change({ status: t.id })}
            className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold ${f.status === t.id ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}>
            {t.label}
            {sum && t.id === "paid" ? <span className="ml-1.5 text-xs opacity-80">{sum.paid.count}</span> : null}
            {sum && t.id === "unpaid" ? <span className="ml-1.5 text-xs opacity-80">{sum.unpaid.count}</span> : null}
            {sum && t.id === "cancelled" ? <span className="ml-1.5 text-xs opacity-80">{sum.cancelled}</span> : null}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          <label className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setData(null); }} placeholder="Search name, phone or booking code" className={`${input} w-full pl-10`} />
          </label>
          <select value={f.mode} onChange={(e) => change({ mode: e.target.value as Mode | "" })} aria-label="Payment mode" className={`${input} max-w-[11rem]`}>
            {MODES.map((m) => <option key={m.label} value={m.id}>{m.label}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Game date">
          {PERIODS.map((p) => (
            <button key={p.id} onClick={() => change({ period: p.id })} aria-pressed={f.period === p.id}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${f.period === p.id ? "bg-brand text-white" : "bg-surface text-muted shadow-sm hover:bg-surface-2"}`}>{p.label}</button>
          ))}
          {f.period === "custom" && (
            <span className="flex items-center gap-1.5 text-xs">
              <input type="date" value={f.from} max={f.to || undefined} onChange={(e) => change({ from: e.target.value })} aria-label="From date" className={`${input} py-1.5`} />
              to
              <input type="date" value={f.to} min={f.from || undefined} onChange={(e) => change({ to: e.target.value })} aria-label="To date" className={`${input} py-1.5`} />
            </span>
          )}
        </div>
        <p className="text-xs text-muted">Dates are the game date.</p>
      </div>

      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!data && !error && <p className="py-10 text-center text-sm text-muted">Loading payments…</p>}
      {data && data.items.length === 0 && <p className="rounded-2xl bg-surface py-14 text-center text-muted shadow-sm">No payments match these filters.</p>}

      <ul className="grid items-start gap-2 xl:grid-cols-2">
        {data?.items.map((r) => {
          const st = TONE[r.status];
          return (
            <li key={`${r.kind}-${r.id}`} className="flex items-center gap-3 rounded-2xl bg-surface p-4 shadow-sm">
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 break-words font-semibold">{r.customer || "Guest"}</p>
                <p className="truncate text-sm text-muted">{r.phone || "No phone"} · <span className="font-mono">{r.code}</span></p>
                <p className="text-xs text-muted">{prettyDate(r.date)} · {r.time}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone={st.tone}>{st.label}</Badge>
                  <Badge tone={r.mode === "cash" ? "bg-surface-2 text-foreground" : "bg-blue-500/15 text-blue-600"}>{r.mode === "cash" ? "Cash at venue" : `Online · ${METHOD_LABEL[r.method] ?? r.method}`}</Badge>
                </div>
              </div>
              <div className="shrink-0 space-y-2 text-right">
                <p className={`font-bold ${r.status === "cancelled" ? "text-muted line-through" : ""}`}>{rs(r.amount)}</p>
                {r.status === "unpaid" && (
                  <button onClick={() => guard("payments.collect") && setCollecting(r)} className="rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white">Mark paid</button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-2 text-sm">
          <button disabled={pageNo <= 1} onClick={() => { setPageNo(pageNo - 1); setData(null); }} className="flex items-center gap-1 rounded-xl bg-surface px-3 py-2 shadow-sm disabled:opacity-40"><ChevronLeft size={16} /> Previous</button>
          <span className="text-muted">Page {pageNo} of {pages} · {data.total} rows</span>
          <button disabled={pageNo >= pages} onClick={() => { setPageNo(pageNo + 1); setData(null); }} className="flex items-center gap-1 rounded-xl bg-surface px-3 py-2 shadow-sm disabled:opacity-40">Next <ChevronRight size={16} /></button>
        </div>
      )}

      {collecting && <CollectModal target={collecting} onClose={() => setCollecting(null)} onDone={() => { setCollecting(null); setTick((t) => t + 1); }} />}
    </div>
  );
}
