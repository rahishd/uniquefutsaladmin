"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Download, Search } from "lucide-react";
import { Badge } from "../bookings/Badge";
import {
  AuditFilters, AuditList, AuditQuery, AuditRow, PAGE_SIZE, allAudit, auditFilters, detailPairs, downloadAuditCsv, listAudit, nice,
} from "@/lib/audit";

const input = "rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const nepalToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" }).format(new Date());
const shift = (key: string, days: number) => new Date(new Date(`${key}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Kathmandu", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
const EMPTY: AuditQuery = { q: "", staffId: "", entity: "", action: "", from: "", to: "" };
type Range = "all" | "today" | "yesterday" | "custom";

// Colour by what kind of action it was
const tone = (a: string) => /delete|remove|cancel|reject|suspend|refund|void|block/.test(a) ? "bg-red-500/15 text-red-700" : /create|add|new|walk-in|approve|activate|resume|collect|verify|paid/.test(a) ? "bg-green-500/15 text-green-700" : "bg-blue-500/15 text-blue-700";

function Entry({ r }: { r: AuditRow }) {
  const [open, setOpen] = useState(false);
  const pairs = detailPairs(r.details);
  return (
    <li className="rounded-2xl bg-surface shadow-sm">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-start gap-3 p-3 text-left sm:p-4">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-xs font-bold text-brand">{r.staffName.slice(0, 1).toUpperCase()}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm"><strong>{r.staffName}</strong> <Badge tone={tone(r.action)}>{nice(r.action)}</Badge> <span className="font-medium">{nice(r.entity)}</span>{r.entityId && <span className="ml-1 break-all text-xs text-muted">{r.entityId}</span>}</span>
          <span className="block text-xs text-muted">{when(r.createdAt)}{r.ip ? ` · ${r.ip}` : ""}</span>
        </span>
        <ChevronDown size={18} className={`mt-1 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-line px-4 py-3 text-sm">
          {pairs.length === 0 ? <p className="text-xs text-muted">No more details were saved for this action.</p> : (
            <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[max-content_1fr]">
              {pairs.map((p) => <div key={p.k} className="contents"><dt className="text-xs font-semibold text-muted">{p.k}</dt><dd className="break-words">{p.v}</dd></div>)}
            </dl>
          )}
        </div>
      )}
    </li>
  );
}

export default function AuditPage() {
  const [f, setF] = useState<AuditQuery>(EMPTY);
  const [range, setRange] = useState<Range>("all");
  const [search, setSearch] = useState("");
  const [pageNo, setPageNo] = useState(1);
  const [data, setData] = useState<AuditList | null>(null);
  const [facets, setFacets] = useState<AuditFilters | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { auditFilters().then(setFacets).catch(() => {}); }, []);
  useEffect(() => { const t = setTimeout(() => { setF((x) => (x.q === search.trim() ? x : { ...x, q: search.trim() })); setPageNo(1); }, 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => {
    let live = true;
    listAudit(f, pageNo)
      .then((d) => { if (live) { setData(d); setError(""); } })
      .catch((e) => { if (live) { setData(null); setError(e instanceof Error ? e.message : "Could not load the audit log"); } });
    return () => { live = false; };
  }, [f, pageNo]);

  const set = (patch: Partial<AuditQuery>) => { setF((x) => ({ ...x, ...patch })); setPageNo(1); setData(null); setError(""); };
  const pickRange = (r: Range) => {
    setRange(r);
    const t = nepalToday();
    if (r === "all") set({ from: "", to: "" });
    else if (r === "today") set({ from: t, to: t });
    else if (r === "yesterday") set({ from: shift(t, -1), to: shift(t, -1) });
  };
  const filtered = !!(f.q || f.staffId || f.entity || f.action || f.from || f.to);
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const s = facets?.summary;

  async function download() {
    setBusy(true);
    try { downloadAuditCsv(await allAudit(f)); } catch (e) { setError(e instanceof Error ? e.message : "Could not download"); } finally { setBusy(false); }
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold"><ClipboardList className="text-brand" /> Audit Log</h1>
          <p className="text-sm text-muted">Who changed what, and when. Every staff action that saves something is recorded here and cannot be edited.</p>
        </div>
        <button onClick={download} disabled={busy || !data || data.total === 0} className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold disabled:opacity-50"><Download size={15} /> {busy ? "Preparing…" : "Download"}</button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {([["Today", s?.today], ["Last 7 days", s?.week], ["All time", s?.total]] as const).map(([l, v]) => (
          <div key={l} className="rounded-2xl bg-surface p-3 shadow-sm"><p className="text-xs text-muted">{l}</p><p className="text-lg font-bold">{v ?? "—"}</p></div>
        ))}
      </div>

      <div className="space-y-3 rounded-2xl bg-surface p-3 shadow-sm sm:p-4">
        <label className="relative block">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a name, a booking code, a phone or any word in the details" className={`${input} w-full pl-10`} />
        </label>
        <div className="grid gap-2 sm:grid-cols-3">
          <select aria-label="Staff" className={input} value={f.staffId} onChange={(e) => set({ staffId: e.target.value })}>
            <option value="">All staff</option>{facets?.staff.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.count})</option>)}
          </select>
          <select aria-label="What was changed" className={input} value={f.entity} onChange={(e) => set({ entity: e.target.value })}>
            <option value="">Everything</option>{facets?.entities.map((x) => <option key={x.name} value={x.name}>{nice(x.name)} ({x.count})</option>)}
          </select>
          <select aria-label="Action" className={input} value={f.action} onChange={(e) => set({ action: e.target.value })}>
            <option value="">All actions</option>{facets?.actions.map((x) => <option key={x.name} value={x.name}>{nice(x.name)} ({x.count})</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-2xl bg-surface-2 p-1" role="tablist" aria-label="Period">
            {([["all", "All time"], ["today", "Today"], ["yesterday", "Yesterday"], ["custom", "Custom"]] as const).map(([id, l]) => (
              <button key={id} role="tab" aria-selected={range === id} onClick={() => pickRange(id)} className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-sm font-semibold ${range === id ? "bg-brand text-white" : "text-muted"}`}>{l}</button>
            ))}
          </div>
          {range === "custom" && (
            <>
              <label className="flex items-center gap-1.5 text-sm">From <input type="date" className={input} value={f.from} max={nepalToday()} onChange={(e) => set({ from: e.target.value })} /></label>
              <label className="flex items-center gap-1.5 text-sm">Till <input type="date" className={input} value={f.to} max={nepalToday()} onChange={(e) => set({ to: e.target.value })} /></label>
            </>
          )}
          {filtered && <button onClick={() => { setSearch(""); setRange("all"); setF(EMPTY); setPageNo(1); setData(null); }} className="ml-auto text-sm font-semibold text-brand">Clear filters</button>}
        </div>
      </div>

      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!data && !error && <p className="py-10 text-center text-sm text-muted">Loading…</p>}
      {data && <p className="text-sm text-muted">{data.total} {data.total === 1 ? "entry" : "entries"}{filtered ? " match" : ""}</p>}
      {data && data.items.length === 0 && <p className="rounded-2xl bg-surface p-8 text-center text-sm text-muted">{filtered ? "Nothing matches these filters." : "No actions have been recorded yet."}</p>}

      <ul className="space-y-2">{data?.items.map((r) => <Entry key={r.id} r={r} />)}</ul>

      {data && pages > 1 && (
        <div className="flex items-center justify-between">
          <button disabled={pageNo <= 1} onClick={() => setPageNo((p) => p - 1)} className="flex items-center gap-1 rounded-full border border-line px-4 py-2 text-sm disabled:opacity-40"><ChevronLeft size={16} /> Newer</button>
          <span className="text-sm text-muted">Page {pageNo} of {pages}</span>
          <button disabled={pageNo >= pages} onClick={() => setPageNo((p) => p + 1)} className="flex items-center gap-1 rounded-full border border-line px-4 py-2 text-sm disabled:opacity-40">Older <ChevronRight size={16} /></button>
        </div>
      )}
    </div>
  );
}
