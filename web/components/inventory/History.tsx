"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ReceiptText } from "lucide-react";
import { ApiError } from "@/lib/api";
import { Bill, Log, PAGE_SIZE, Paged, Sale, listBills, listLogs, listSales, rs } from "@/lib/inventory";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

function Pager({ page, total, onPage }: { page: number; total: number; onPage: (n: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (total <= PAGE_SIZE) return null;
  return (
    <div className="flex items-center justify-between pt-2 text-sm">
      <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="flex items-center gap-1 rounded-xl bg-surface px-3 py-2 shadow-sm disabled:opacity-40"><ChevronLeft size={16} /> Previous</button>
      <span className="text-muted">Page {page} of {pages}</span>
      <button disabled={page >= pages} onClick={() => onPage(page + 1)} className="flex items-center gap-1 rounded-xl bg-surface px-3 py-2 shadow-sm disabled:opacity-40">Next <ChevronRight size={16} /></button>
    </div>
  );
}

function usePaged<T>(load: (page: number) => Promise<Paged<T>>, tick: number) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<T> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    load(page).then((d) => { if (live) { setData(d); setError(""); } }).catch((e) => { if (live) setError(e instanceof ApiError ? e.message : "Could not load"); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, tick]);
  return { page, setPage: (n: number) => { setData(null); setPage(n); }, data, error };
}

export function Sales({ tick }: { tick: number }) {
  const [view, setView] = useState<"bills" | "goods">("bills");
  return (
    <div className="space-y-3">
      <div className="grid max-w-sm grid-cols-2 gap-1 rounded-xl bg-surface p-1 shadow-sm">
        {([["bills", "Customer bills"], ["goods", "All goods sales"]] as const).map(([v, l]) => <button key={v} aria-pressed={view === v} onClick={() => setView(v)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${view === v ? "bg-brand text-white" : "text-muted"}`}>{l}</button>)}
      </div>
      {view === "bills" ? <Bills tick={tick} /> : <GoodsSales tick={tick} />}
    </div>
  );
}

function Bills({ tick }: { tick: number }) {
  const { page, setPage, data, error } = usePaged<Bill>(listBills, tick);
  return (
    <div className="space-y-3">
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!data && !error && <p className="py-8 text-center text-sm text-muted">Loading bills…</p>}
      {data?.items.length === 0 && <div className="grid place-items-center gap-2 rounded-2xl bg-surface py-12 text-center text-muted shadow-sm"><ReceiptText size={32} strokeWidth={1.5} /><p>No customer bills yet. Enter a customer number when selling to make one.</p></div>}
      <ul className="grid items-start gap-3 xl:grid-cols-2">
        {data?.items.map((b) => (
          <li key={b.id} className="space-y-2 rounded-2xl bg-surface p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="truncate font-semibold">{b.customerName ?? b.customerPhone}</p><p className="text-xs text-muted">{b.customerPhone} · <span className="font-mono">{b.code}</span> · {when(b.createdAt)} · {b.paymentMethod === "cash" ? "Cash" : "Online"}</p></div>
              <p className="shrink-0 text-lg font-bold">{rs(b.total)}</p>
            </div>
            <ul className="space-y-0.5 text-sm">
              {b.lines.map((l, i) => <li key={i} className="flex justify-between gap-3"><span className="truncate text-muted">{l.type === "goods" && l.quantity > 1 ? `${l.quantity} x ` : ""}{l.label}</span><span>{rs(l.amount)}</span></li>)}
            </ul>
            {b.points > 0 && <p className="text-xs font-semibold text-amber-600">+{b.points} loyalty points</p>}
          </li>
        ))}
      </ul>
      {data && <Pager page={page} total={data.total} onPage={setPage} />}
    </div>
  );
}

function GoodsSales({ tick }: { tick: number }) {
  const { page, setPage, data, error } = usePaged<Sale>(listSales, tick);
  return (
    <div className="space-y-3">
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!data && !error && <p className="py-8 text-center text-sm text-muted">Loading sales…</p>}
      {data?.items.length === 0 && <div className="grid place-items-center gap-2 rounded-2xl bg-surface py-12 text-center text-muted shadow-sm"><ReceiptText size={32} strokeWidth={1.5} /><p>No goods sold yet.</p></div>}
      <ul className="grid items-start gap-2 xl:grid-cols-2">
        {data?.items.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-4 shadow-sm">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{s.items ?? "Goods"}</p>
              <p className="text-xs text-muted">{when(s.soldAt)} · {s.customerName ?? s.customerPhone ?? "Walk-in"}{s.soldBy ? ` · by ${s.soldBy}` : ""}</p>
            </div>
            <p className="shrink-0 text-lg font-bold">{rs(s.amount)}</p>
          </li>
        ))}
      </ul>
      {data && <Pager page={page} total={data.total} onPage={setPage} />}
    </div>
  );
}

export function Logs({ tick }: { tick: number }) {
  const { page, setPage, data, error } = usePaged<Log>(listLogs, tick);
  return (
    <div className="space-y-3">
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!data && !error && <p className="py-8 text-center text-sm text-muted">Loading the log…</p>}
      {data?.items.length === 0 && <div className="grid place-items-center gap-2 rounded-2xl bg-surface py-12 text-center text-muted shadow-sm"><ReceiptText size={32} strokeWidth={1.5} /><p>No stock changes yet.</p></div>}
      <ul className="grid items-start gap-2 xl:grid-cols-2">
        {data?.items.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-4 shadow-sm">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{l.product}</p>
              <p className="truncate text-xs text-muted">{l.reason ?? "Change"} · {when(l.createdAt)}</p>
            </div>
            <p className={`shrink-0 text-lg font-bold ${l.change < 0 ? "text-red-600" : "text-brand"}`}>{l.change > 0 ? "+" : ""}{l.change} <span className="text-xs font-normal text-muted">{l.unit}</span></p>
          </li>
        ))}
      </ul>
      {data && <Pager page={page} total={data.total} onPage={setPage} />}
    </div>
  );
}
