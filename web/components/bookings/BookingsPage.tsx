"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Badge } from "./Badge";
import BookingDetailSheet from "./BookingDetailSheet";
import { Booking, BookingList, METHOD, PAGE_SIZE, PAYMENT, STATUS, Scope, bookingCounts, listBookings, prettyDate, rs, tags } from "@/lib/bookings";

const TABS: { scope: Scope; label: string }[] = [
  { scope: "today", label: "Today" },
  { scope: "upcoming", label: "Upcoming" },
  { scope: "previous", label: "Previous" },
];

const STATUSES = ["", "confirmed", "pending", "completed", "cancelled", "no_show", "expired"];

const EMPTY: Record<Scope, string> = {
  today: "No bookings for today.",
  upcoming: "No upcoming bookings.",
  previous: "No previous bookings.",
};

function BookingCard({ b, onOpen }: { b: Booking; onOpen: () => void }) {
  const st = STATUS[b.status] ?? { label: b.status, tone: "bg-slate-500/15 text-slate-500" };
  const pay = PAYMENT[b.paymentStatus] ?? { label: b.paymentStatus, tone: "bg-slate-500/15 text-slate-500" };
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-4 rounded-2xl bg-surface p-4 text-left shadow-sm hover:ring-2 hover:ring-brand/40">
      <div className="w-16 shrink-0 text-center">
        <p className="text-lg font-bold leading-tight">{b.startTime}</p>
        <p className="text-xs text-muted">to {b.endTime}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 break-words font-semibold">{b.customerName || "Guest"}</p>
        <p className="truncate text-sm text-muted">{b.customerPhone || b.userId || "No phone"} · <span className="font-mono">{b.code}</span></p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge tone={st.tone}>{st.label}</Badge>
          <Badge tone={pay.tone}>{pay.label}</Badge>
          {tags(b).map((t) => <Badge key={t} tone="bg-surface-2 text-muted">{t}</Badge>)}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-bold">{rs(b.totalPrice)}</p>
        <p className="text-xs text-muted">{METHOD[b.paymentMethod] ?? b.paymentMethod}</p>
      </div>
    </button>
  );
}

export default function BookingsPage() {
  const [scope, setScope] = useState<Scope>("today");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState(""); // search text after a short pause
  const [pageNo, setPageNo] = useState(1);
  const [data, setData] = useState<BookingList | null>(null);
  const [counts, setCounts] = useState<Record<Scope, number> | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Booking | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setQ(search); setPageNo(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { bookingCounts().then(setCounts).catch(() => {}); }, []);

  useEffect(() => {
    let live = true;
    listBookings({ scope, page: pageNo, q, status })
      .then((d) => { if (live) { setData(d); setError(""); } })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load bookings"); });
    return () => { live = false; };
  }, [scope, pageNo, q, status]);

  const loading = !data && !error;
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  // Group by date so a long Upcoming or Previous list is easy to scan.
  const groups = useMemo(() => {
    const m = new Map<string, Booking[]>();
    for (const b of data?.items ?? []) m.set(b.date, [...(m.get(b.date) ?? []), b]);
    return [...m.entries()];
  }, [data]);

  const pick = (fn: () => void) => { fn(); setPageNo(1); setData(null); setError(""); };

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Bookings</h1>
        <p className="text-sm text-muted">Court bookings from the app and the front desk.</p>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-surface p-1 shadow-sm" role="tablist">
        {TABS.map((t) => (
          <button key={t.scope} role="tab" aria-selected={scope === t.scope} onClick={() => pick(() => setScope(t.scope))}
            className={`rounded-xl px-2 py-2.5 text-sm font-semibold ${scope === t.scope ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}>
            {t.label}{counts ? <span className={`ml-1.5 rounded-full px-1.5 text-xs ${scope === t.scope ? "bg-white/25" : "bg-surface-2"}`}>{counts[t.scope]}</span> : null}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <label className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setData(null); }} placeholder="Search name, phone or code"
            className="w-full rounded-xl border border-line bg-surface py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand" />
        </label>
        <select value={status} onChange={(e) => pick(() => setStatus(e.target.value))} aria-label="Filter by status"
          className="rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-brand">
          {STATUSES.map((s) => <option key={s} value={s}>{s ? (STATUS[s]?.label ?? s) : "All statuses"}</option>)}
        </select>
      </div>

      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {loading && <p className="py-10 text-center text-sm text-muted">Loading bookings…</p>}

      {data && data.items.length === 0 && (
        <div className="grid place-items-center gap-2 rounded-2xl bg-surface py-14 text-center text-muted shadow-sm">
          <CalendarDays size={34} strokeWidth={1.5} />
          <p>{q || status ? "No bookings match your search." : EMPTY[scope]}</p>
        </div>
      )}

      <div className="space-y-5">
        {groups.map(([date, rows]) => (
          <section key={date} className="space-y-2">
            {scope !== "today" && <h2 className="px-1 text-sm font-semibold text-muted">{prettyDate(date)}</h2>}
            {rows.map((b) => <BookingCard key={b.id} b={b} onOpen={() => setOpen(b)} />)}
          </section>
        ))}
      </div>

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-2 text-sm">
          <button disabled={pageNo <= 1} onClick={() => { setPageNo(pageNo - 1); setData(null); }} className="flex items-center gap-1 rounded-xl bg-surface px-3 py-2 shadow-sm disabled:opacity-40"><ChevronLeft size={16} /> Previous</button>
          <span className="text-muted">Page {pageNo} of {pages} · {data.total} bookings</span>
          <button disabled={pageNo >= pages} onClick={() => { setPageNo(pageNo + 1); setData(null); }} className="flex items-center gap-1 rounded-xl bg-surface px-3 py-2 shadow-sm disabled:opacity-40">Next <ChevronRight size={16} /></button>
        </div>
      )}

      {open && <BookingDetailSheet booking={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
