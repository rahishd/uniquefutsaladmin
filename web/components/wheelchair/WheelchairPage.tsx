"use client";

import { useEffect, useState } from "react";
import { Accessibility, Check, ChevronLeft, ChevronRight, Phone, Search, X } from "lucide-react";
import { Badge } from "../bookings/Badge";
import { guard } from "@/lib/access";
import { useHighlight } from "@/lib/highlight";
import { ago } from "@/lib/complaints";
import { PAGE_SIZE, QUICK_REPLIES, STATUS, WCounts, WList, WRequest, WStatus, clock, dayLabel, listRequests, requestCounts, updateRequest } from "@/lib/wheelchair";

const TABS: { id: WStatus | ""; label: string; key: keyof WCounts }[] = [
  { id: "pending", label: "New", key: "pending" },
  { id: "confirmed", label: "Confirmed", key: "confirmed" },
  { id: "completed", label: "Done", key: "completed" },
  { id: "declined", label: "Declined", key: "declined" },
  { id: "cancelled", label: "Cancelled", key: "cancelled" },
  { id: "", label: "All", key: "all" },
];

function Card({ r, onSaved }: { r: WRequest; onSaved: () => void }) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const st = STATUS[r.status];
  const closed = r.status === "cancelled";

  async function save(status?: WStatus) {
    if (!guard("wheelchair.reply")) return;
    setBusy(true);
    setMsg("");
    try {
      await updateRequest(r.id, { ...(status ? { status } : {}), ...(reply.trim() ? { reply: reply.trim() } : {}) });
      setReply("");
      onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li data-hl={`wc-${r.id}`} className={`space-y-3 rounded-2xl bg-surface p-4 shadow-sm ${r.status === "pending" ? "border-l-4 border-amber-500" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{dayLabel(r.date)} · {clock(r.time)}</p>
          <p className="text-sm text-muted">{r.people} wheelchair {r.people === 1 ? "user" : "users"}{r.bookingCode ? ` · booking ${r.bookingCode}` : ""}</p>
        </div>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      {r.note && <p className="whitespace-pre-line rounded-xl bg-surface-2 p-3 text-sm">{r.note}</p>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span className="font-semibold text-foreground">{r.customerName || "Customer"}</span>
        <a href={`tel:${r.customerPhone}`} className="flex items-center gap-1 text-brand"><Phone size={12} /> {r.customerPhone}</a>
        <span className="font-mono">{r.code}</span>
        <span>asked {ago(r.createdAt)}</span>
      </div>
      {r.staffReply && <p className="rounded-xl bg-brand/10 p-3 text-sm"><span className="block text-xs font-semibold text-brand">Your reply</span>{r.staffReply}</p>}

      {!closed && (
        <div className="space-y-2 border-t border-line pt-3">
          <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} maxLength={1000} placeholder="Reply to the customer (optional)"
            className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
          <div className="flex flex-wrap gap-1.5">
            {QUICK_REPLIES.map((q) => (
              <button key={q} type="button" onClick={() => setReply(q)} className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] text-muted hover:text-foreground">{q.slice(0, 34)}…</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {r.status !== "confirmed" && (
              <button disabled={busy} onClick={() => save("confirmed")} className="flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"><Check size={14} /> Confirm</button>
            )}
            {r.status !== "completed" && (
              <button disabled={busy} onClick={() => save("completed")} className="rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Mark done</button>
            )}
            {r.status !== "declined" && (
              <button disabled={busy} onClick={() => save("declined")} className="flex items-center gap-1 rounded-full border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-600 disabled:opacity-50"><X size={14} /> Decline</button>
            )}
            <button disabled={busy || !reply.trim()} onClick={() => save()} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-40">Send reply only</button>
          </div>
          {msg && <p className="text-xs text-red-600" role="alert">{msg}</p>}
        </div>
      )}
    </li>
  );
}

export default function WheelchairPage() {
  useHighlight();
  const [status, setStatus] = useState<WStatus | "">("pending");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [pageNo, setPageNo] = useState(1);
  const [data, setData] = useState<WList | null>(null);
  const [counts, setCounts] = useState<WCounts | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => { setQ(search); setPageNo(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let live = true;
    listRequests({ status, q, page: pageNo })
      .then((d) => { if (live) { setData(d); setError(""); } })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load requests"); });
    requestCounts().then((c) => { if (live) setCounts(c); }).catch(() => {});
    return () => { live = false; };
  }, [status, q, pageNo, tick]);

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Wheelchair Requests</h1>
        <p className="text-sm text-muted">Customers tell us when they are coming with a wheelchair. Confirm, decline or reply, and they are told in their app.</p>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-surface p-1 shadow-sm" role="tablist" aria-label="Request status">
        {TABS.map((t) => (
          <button key={t.label} role="tab" aria-selected={status === t.id} onClick={() => { setStatus(t.id); setPageNo(1); setData(null); }}
            className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold ${status === t.id ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}>
            {t.label}{counts ? <span className={`ml-1.5 rounded-full px-1.5 text-xs ${status === t.id ? "bg-white/25" : t.id === "pending" && counts.pending > 0 ? "bg-amber-500 text-white" : "bg-surface-2"}`}>{counts[t.key]}</span> : null}
          </button>
        ))}
      </div>

      <label className="relative block">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input value={search} onChange={(e) => { setSearch(e.target.value); setData(null); }} placeholder="Search name, phone, code or note"
          className="w-full rounded-xl border border-line bg-surface py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand" />
      </label>

      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!data && !error && <p className="py-10 text-center text-sm text-muted">Loading requests…</p>}
      {data && data.items.length === 0 && (
        <div className="grid place-items-center gap-2 rounded-2xl bg-surface py-14 text-center text-muted shadow-sm">
          <Accessibility size={32} strokeWidth={1.5} />
          <p>{q || status ? "No requests match." : "No wheelchair requests yet."}</p>
        </div>
      )}

      <ul className="grid items-start gap-2 xl:grid-cols-2">
        {data?.items.map((r) => <Card key={r.id} r={r} onSaved={() => setTick((t) => t + 1)} />)}
      </ul>

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-2 text-sm">
          <button disabled={pageNo <= 1} onClick={() => { setPageNo(pageNo - 1); setData(null); }} className="flex items-center gap-1 rounded-xl bg-surface px-3 py-2 shadow-sm disabled:opacity-40"><ChevronLeft size={16} /> Previous</button>
          <span className="text-muted">Page {pageNo} of {pages} · {data.total} requests</span>
          <button disabled={pageNo >= pages} onClick={() => { setPageNo(pageNo + 1); setData(null); }} className="flex items-center gap-1 rounded-xl bg-surface px-3 py-2 shadow-sm disabled:opacity-40">Next <ChevronRight size={16} /></button>
        </div>
      )}
    </div>
  );
}
