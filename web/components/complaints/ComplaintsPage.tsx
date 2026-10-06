"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Image as ImageIcon, MessageSquareWarning, Search } from "lucide-react";
import { Badge } from "../bookings/Badge";
import ComplaintSheet from "./ComplaintSheet";
import { CATEGORIES, CCounts, CList, CStatus, Complaint, PAGE_SIZE, STATUS, ago, complaintCounts, listComplaints } from "@/lib/complaints";

const TABS: { id: CStatus | ""; label: string; key: keyof CCounts }[] = [
  { id: "", label: "All", key: "all" },
  { id: "open", label: "New", key: "open" },
  { id: "in_review", label: "In review", key: "in_review" },
  { id: "resolved", label: "Resolved", key: "resolved" },
  { id: "closed", label: "Closed", key: "closed" },
];

export default function ComplaintsPage() {
  const [status, setStatus] = useState<CStatus | "">(typeof window !== "undefined" && new URLSearchParams(window.location.search).get("q") ? "" : "open");
  const [category, setCategory] = useState("");
  // opened from a customer with ?q=<phone>: start on that customer, across all statuses
  const fromLink = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("q") ?? "" : "";
  const [search, setSearch] = useState(fromLink);
  const [q, setQ] = useState(fromLink);
  const [pageNo, setPageNo] = useState(1);
  const [data, setData] = useState<CList | null>(null);
  const [counts, setCounts] = useState<CCounts | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Complaint | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => { setQ(search); setPageNo(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let live = true;
    listComplaints({ status, category, q, page: pageNo })
      .then((d) => { if (live) { setData(d); setError(""); } })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load complaints"); });
    complaintCounts().then((c) => { if (live) setCounts(c); }).catch(() => {});
    return () => { live = false; };
  }, [status, category, q, pageNo, tick]);

  const pick = (fn: () => void) => { fn(); setPageNo(1); setData(null); setError(""); };
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const input = "rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Complaints</h1>
        <p className="text-sm text-muted">What customers report from the app. Reply and the customer is told in their app.</p>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-surface p-1 shadow-sm" role="tablist" aria-label="Complaint status">
        {TABS.map((t) => (
          <button key={t.label} role="tab" aria-selected={status === t.id} onClick={() => pick(() => setStatus(t.id))}
            className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold ${status === t.id ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}>
            {t.label}{counts ? <span className={`ml-1.5 rounded-full px-1.5 text-xs ${status === t.id ? "bg-white/25" : t.id === "open" && counts.open > 0 ? "bg-amber-500 text-white" : "bg-surface-2"}`}>{counts[t.key]}</span> : null}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <label className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setData(null); }} placeholder="Search name, phone, code or words" className={`${input} w-full pl-10`} />
        </label>
        <select value={category} onChange={(e) => pick(() => setCategory(e.target.value))} aria-label="Category" className={`${input} max-w-[10.5rem]`}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </div>

      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!data && !error && <p className="py-10 text-center text-sm text-muted">Loading complaints…</p>}
      {data && data.items.length === 0 && (
        <div className="grid place-items-center gap-2 rounded-2xl bg-surface py-14 text-center text-muted shadow-sm">
          <MessageSquareWarning size={32} strokeWidth={1.5} />
          <p>{q || category || status ? "No complaints match these filters." : "No complaints yet."}</p>
        </div>
      )}

      <ul className="space-y-2">
        {data?.items.map((c) => {
          const st = STATUS[c.status];
          return (
            <li key={c.id}>
              <button onClick={() => setOpen(c)} className={`w-full space-y-2 rounded-2xl bg-surface p-4 text-left shadow-sm hover:ring-2 hover:ring-brand/40 ${c.status === "open" ? "border-l-4 border-amber-500" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{c.categoryLabel}</p>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </div>
                <p className="line-clamp-2 text-sm text-muted">{c.message}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span className="font-semibold text-foreground">{c.customerName || "Customer"}</span>
                  <span>{c.customerPhone}</span>
                  <span className="font-mono">{c.code}</span>
                  <span>{ago(c.createdAt)}</span>
                  {c.photos.length > 0 && <span className="flex items-center gap-1"><ImageIcon size={13} /> {c.photos.length}</span>}
                  {c.staffReply && <span className="text-brand">Replied</span>}
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-2 text-sm">
          <button disabled={pageNo <= 1} onClick={() => { setPageNo(pageNo - 1); setData(null); }} className="flex items-center gap-1 rounded-xl bg-surface px-3 py-2 shadow-sm disabled:opacity-40"><ChevronLeft size={16} /> Previous</button>
          <span className="text-muted">Page {pageNo} of {pages} · {data.total} complaints</span>
          <button disabled={pageNo >= pages} onClick={() => { setPageNo(pageNo + 1); setData(null); }} className="flex items-center gap-1 rounded-xl bg-surface px-3 py-2 shadow-sm disabled:opacity-40">Next <ChevronRight size={16} /></button>
        </div>
      )}

      {open && <ComplaintSheet complaint={open} onClose={() => setOpen(null)} onSaved={() => setTick((t) => t + 1)} />}
    </div>
  );
}
