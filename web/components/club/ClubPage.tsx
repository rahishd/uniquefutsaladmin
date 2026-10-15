"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Badge } from "../bookings/Badge";
import CustomerSheet from "../customers/CustomerSheet";
import { prettyDate, rs } from "@/lib/bookings";
import { ClubList, ClubMemberRow, ClubStatus, PAGE_SIZE, listClub } from "@/lib/club";

const TABS: { id: ClubStatus; label: string }[] = [
  { id: "", label: "All" }, { id: "active", label: "Active" }, { id: "expiring", label: "Ending in 7 days" }, { id: "expired", label: "Expired" },
];
const TONE = {
  active: { label: "Active", tone: "bg-emerald-500/15 text-emerald-700" },
  expiring: { label: "Ending soon", tone: "bg-amber-500/15 text-amber-700" },
  expired: { label: "Expired", tone: "bg-surface-2 text-muted" },
} as const;

const day = (iso: string) => prettyDate(iso.slice(0, 10));

// Unique Club members: who is in, who is about to run out, what the club has earned and how much discount it has given.
export default function ClubPage() {
  const [status, setStatus] = useState<ClubStatus>("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [pageNo, setPageNo] = useState(1);
  const [data, setData] = useState<ClubList | null>(null);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState<ClubMemberRow | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setQ(search); setPageNo(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let live = true;
    listClub({ status, q, page: pageNo })
      .then((d) => { if (live) { setData(d); setError(""); } })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load the club members"); });
    return () => { live = false; };
  }, [status, q, pageNo]);

  const pick = (s: ClubStatus) => { setStatus(s); setPageNo(1); setData(null); setError(""); };
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const s = data?.summary;

  return (
    <div className="w-full space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><BadgeCheck size={24} className="text-brand" /> Unique Club</h1>
        <p className="text-sm text-muted">Members of the club: Rs. 1,500 for 30 days and 10% off. Customers join in the app; the Rs. 1,500 payments are in Payments &gt; Unique Club.</p>
      </header>

      <section aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {([
          ["Active members", s ? String(s.active) : "…"],
          ["Ending in 7 days", s ? String(s.expiring) : "…"],
          ["Expired", s ? String(s.expired) : "…"],
          ["Club fees collected", s ? rs(s.revenue) : "…"],
          ["Payments", s ? String(s.payments) : "…"],
        ] as const).map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-surface p-3 shadow-sm"><p className="text-xs text-muted">{label}</p><p className="text-lg font-bold">{value}</p></div>
        ))}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Status" className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button key={t.id || "all"} role="tab" aria-selected={status === t.id} onClick={() => pick(t.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${status === t.id ? "bg-brand text-white" : "bg-surface shadow-sm"}`}>{t.label}</button>
          ))}
        </div>
        <label className="relative ml-auto block w-full sm:w-64">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or mobile number" aria-label="Search members"
            className="w-full rounded-xl border border-line bg-surface py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand" />
        </label>
      </div>

      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!data && !error && <p className="py-10 text-center text-sm text-muted">Loading members…</p>}
      {data && data.items.length === 0 && <p className="rounded-2xl bg-surface py-14 text-center text-muted shadow-sm">No club members match these filters.</p>}

      <ul className="grid items-start gap-2 xl:grid-cols-2">
        {data?.items.map((m) => {
          const st = TONE[m.status];
          return (
            <li key={m.phone} className="rounded-2xl bg-surface p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <button onClick={() => setViewing(m)} title="View customer details" className="line-clamp-2 break-words text-left font-semibold underline-offset-2 hover:text-brand hover:underline">{m.name || "Customer"}</button>
                  <p className="text-sm text-muted">{m.phone}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge tone={st.tone}>{st.label}</Badge>
                  {m.status !== "expired" && <span className="text-xs text-muted">{m.daysLeft} day{m.daysLeft === 1 ? "" : "s"} left</span>}
                </div>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                <div><dt className="text-xs text-muted">Joined</dt><dd className="font-medium">{day(m.startedAt)}</dd></div>
                <div><dt className="text-xs text-muted">{m.status === "expired" ? "Ended" : "Valid until"}</dt><dd className="font-medium">{day(m.validUntil)}</dd></div>
                <div><dt className="text-xs text-muted">Paid</dt><dd className="font-medium">{rs(m.paidTotal)} <span className="text-xs text-muted">({m.payments}×)</span></dd></div>
                <div><dt className="text-xs text-muted">Discount given</dt><dd className="font-medium">{rs(m.discountGiven)} <span className="text-xs text-muted">({m.discountedGames} game{m.discountedGames === 1 ? "" : "s"})</span></dd></div>
                <div className="col-span-2 sm:col-span-2">
                  <dt className="text-xs text-muted">Membership and tournament discount</dt>
                  <dd className="font-medium">
                    {m.mature
                      ? <span className="text-emerald-700">Unlocked</span>
                      : m.status === "expired"
                        ? <span className="text-muted">Club ended</span>
                        : <span className="text-amber-700">Day {Math.min(m.daysIn, data.matureAfterDays)} of {data.matureAfterDays} · {Math.min(m.gamesPlayed, data.matureAfterGames)} of {data.matureAfterGames} games</span>}
                  </dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-2 text-sm">
          <button disabled={pageNo <= 1} onClick={() => { setPageNo(pageNo - 1); setData(null); }} className="flex items-center gap-1 rounded-xl bg-surface px-3 py-2 shadow-sm disabled:opacity-40"><ChevronLeft size={16} /> Previous</button>
          <span className="text-muted">Page {pageNo} of {pages} · {data.total} members</span>
          <button disabled={pageNo >= pages} onClick={() => { setPageNo(pageNo + 1); setData(null); }} className="flex items-center gap-1 rounded-xl bg-surface px-3 py-2 shadow-sm disabled:opacity-40">Next <ChevronRight size={16} /></button>
        </div>
      )}

      {viewing && (
        <CustomerSheet
          customer={{ phoneNumber: viewing.phone, name: viewing.name, email: null, isActive: true, createdAt: "", mode: "player", vip: null, stats: { gamesPlayed: 0, gamezoneSessions: 0, paidTotal: 0, unpaidTotal: 0, openComplaints: 0, cancelStreak: 0 } }}
          onClose={() => setViewing(null)}
          onChanged={() => {}}
        />
      )}
    </div>
  );
}
