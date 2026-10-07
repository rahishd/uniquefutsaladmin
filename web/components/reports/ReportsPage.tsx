"use client";

import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Banknote, BarChart3, Download, MessageCircle, QrCode } from "lucide-react";
import { rs } from "@/lib/bookings";
import { Summary, change, downloadReportsPdf, getSummary, h12, nepalToday, periodLabel, reportsLink, shiftDay, shortDay } from "@/lib/reports";

type Range = "today" | "yesterday" | "week" | "month" | "thismonth" | "custom";
const RANGES: { id: Range; label: string }[] = [
  { id: "today", label: "Today" }, { id: "yesterday", label: "Yesterday" }, { id: "week", label: "Last 7 days" }, { id: "month", label: "Last 30 days" }, { id: "thismonth", label: "This month" }, { id: "custom", label: "Custom" },
];
const field = "rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl bg-surface p-4 shadow-sm lg:p-5 ${className}`}><h2 className="mb-3 text-lg font-bold">{title}</h2>{children}</section>;
}
const Line = ({ l, v, strong }: { l: string; v: string; strong?: boolean }) => <div className="flex justify-between gap-3 py-1.5 text-sm"><span className="text-muted">{l}</span><span className={strong ? "font-bold" : "font-semibold"}>{v}</span></div>;

function Bars({ items, pick, label, unit = "" }: { items: { key: string; value: number; label: string }[]; pick?: string; label: string; unit?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="overflow-x-auto"><div className="flex h-40 items-end gap-1.5" role="img" aria-label={label} style={{ minWidth: items.length > 14 ? items.length * 26 : undefined }}>
      {items.map((i) => (
        <div key={i.key} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${i.label}: ${unit}${i.value}`}>
          <div className="flex w-full flex-1 items-end"><div className={`w-full rounded-t ${i.key === pick ? "bg-brand" : "bg-brand/45"}`} style={{ height: `${Math.max(3, Math.round((i.value / max) * 100))}px` }} /></div>
          <span className="w-full truncate text-center text-[10px] text-muted">{i.label}</span>
        </div>
      ))}
    </div></div>
  );
}

export default function ReportsPage() {
  const [range, setRange] = useState<Range>("week");
  const [from, setFrom] = useState(shiftDay(nepalToday(), -6));
  const [to, setTo] = useState(nepalToday());
  const [d, setD] = useState<Summary | null>(null);
  const [error, setError] = useState("");

  const today = nepalToday();
  const [f, t] = range === "today" ? [today, today] : range === "yesterday" ? [shiftDay(today, -1), shiftDay(today, -1)] : range === "week" ? [shiftDay(today, -6), today]
    : range === "month" ? [shiftDay(today, -29), today] : range === "thismonth" ? [`${today.slice(0, 8)}01`, today] : [from, to];
  const invalid = !f || !t || f > t;

  useEffect(() => {
    if (invalid) return;
    let live = true;
    getSummary(f, t).then((x) => { if (live) { setD(x); setError(""); } }).catch((e) => { if (live) { setD(null); setError(e instanceof Error ? e.message : "Could not load the report"); } });
    return () => { live = false; };
  }, [f, t, invalid]);

  const shown = d && d.from === f && d.to === t ? d : null;
  const pct = shown ? change(shown.totals.total, shown.previous.total) : null;
  const sourceTotal = shown ? shown.games.source.app + shown.games.source.staff + shown.games.source.challenge : 0;

  return (
    <div className="w-full space-y-4 lg:space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><BarChart3 className="text-brand" /> Reports</h1>
          <p className="text-sm text-muted">{invalid ? "Choose the dates" : periodLabel({ from: f, to: t })}. Money is counted once, as in the Inventory report.</p>
        </div>
        {shown && (
          <div className="flex gap-2">
            <a href={reportsLink(shown)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-full bg-[#25D366] px-4 py-2 text-sm font-semibold text-white"><MessageCircle size={15} /> Send on WhatsApp</a>
            <button onClick={() => downloadReportsPdf(shown)} className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold"><Download size={15} /> Download PDF</button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-2xl bg-surface p-1 shadow-sm" role="tablist" aria-label="Report period">
          {RANGES.map((r) => <button key={r.id} role="tab" aria-selected={range === r.id} onClick={() => setRange(r.id)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold ${range === r.id ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}>{r.label}</button>)}
        </div>
        {range === "custom" && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-sm">From <input type="date" className={field} value={from} max={today} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="flex items-center gap-1.5 text-sm">Till <input type="date" className={field} value={to} max={today} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
        )}
      </div>

      {invalid && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">The From date must not be after the Till date.</p>}
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!shown && !error && !invalid && <p className="py-10 text-center text-sm text-muted">Loading…</p>}

      {shown && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-brand/10 p-4">
              <p className="text-sm text-muted">Total sales</p><p className="text-3xl font-bold text-brand">{rs(shown.totals.total)}</p>
              <p className={`mt-1 flex items-center gap-1 text-xs font-semibold ${(pct ?? 0) >= 0 ? "text-green-700" : "text-red-600"}`}>{(pct ?? 0) >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{pct === null ? "No sales in the period before" : `${Math.abs(pct)}% ${pct >= 0 ? "more" : "less"} than the ${shown.days} days before (${rs(shown.previous.total)})`}</p>
            </div>
            <div className="rounded-2xl bg-surface p-4 shadow-sm"><p className="flex items-center gap-2 text-sm text-muted"><QrCode size={16} /> Fonepay</p><p className="text-2xl font-bold">{rs(shown.totals.fonepay)}</p></div>
            <div className="rounded-2xl bg-surface p-4 shadow-sm"><p className="flex items-center gap-2 text-sm text-muted"><Banknote size={16} /> Cash</p><p className="text-2xl font-bold">{rs(shown.totals.cash)}</p></div>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-3 lg:gap-5">
            <Card title="Sales by day" className="lg:col-span-2">
              <Bars label="Sales by day" pick={shown.to} items={shown.byDay.map((x) => ({ key: x.date, value: x.total, label: shown.days > 14 ? shortDay(x.date).split(" ")[0] : shortDay(x.date) }))} unit="Rs. " />
              <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold text-brand">Show the numbers day by day</summary>
                <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm"><thead className="text-xs text-muted"><tr><th className="py-1.5 pr-3">Day</th><th className="pr-3 text-right">Cash</th><th className="pr-3 text-right">Fonepay</th><th className="text-right">Total</th></tr></thead>
                  <tbody className="divide-y divide-line">{[...shown.byDay].reverse().map((x) => <tr key={x.date}><td className="py-1.5 pr-3">{shortDay(x.date)}</td><td className="pr-3 text-right">{rs(x.cash)}</td><td className="pr-3 text-right">{rs(x.fonepay)}</td><td className="text-right font-semibold">{rs(x.total)}</td></tr>)}</tbody></table></div>
              </details>
            </Card>
            <Card title="Where sales come from">
              <Line l="Games" v={rs(shown.totals.games)} /><Line l="Goods" v={rs(shown.totals.goods)} /><Line l="Gamezone" v={rs(shown.totals.gamezone)} />{!!shown.totals.tournaments && <Line l="Tournaments" v={rs(shown.totals.tournaments)} />}
              <div className="mt-1 border-t border-line pt-1"><Line l="Total" v={rs(shown.totals.total)} strong /></div>
              <p className="mt-2 text-xs text-muted">Memberships are in their own card and not added here.</p>
            </Card>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-2 lg:gap-5">
            <Card title="Games">
              <Line l="Games" v={String(shown.games.count)} strong /><Line l="Paid" v={String(shown.games.paid)} />
              <Line l="Not paid yet" v={`${shown.games.unpaid} (${rs(shown.games.unpaidAmount)})`} /><Line l="Average rate" v={rs(shown.games.averageRate)} />
              <Line l="Cancelled" v={String(shown.games.cancelled)} /><Line l="No-shows" v={String(shown.games.noShows)} />
              <div className="mt-2 border-t border-line pt-2 text-sm">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Booked by</p>
                {([["Customers in the app", shown.games.source.app], ["Staff at the desk", shown.games.source.staff], ["Challenge games", shown.games.source.challenge]] as const).map(([l, n]) => (
                  <div key={l} className="py-1"><div className="flex justify-between"><span className="text-muted">{l}</span><span className="font-semibold">{n}</span></div><div className="mt-1 h-1.5 rounded-full bg-surface-2"><div className="h-1.5 rounded-full bg-brand" style={{ width: `${sourceTotal ? Math.round((n / sourceTotal) * 100) : 0}%` }} /></div></div>
                ))}
              </div>
            </Card>

            <Card title="Busy times">
              <p className="mb-2 text-sm text-muted">{shown.occupancy.bookedHours} hours booked ({shown.occupancy.perDay} a day)</p>
              <Bars label="Hours booked by weekday" items={shown.occupancy.weekdays.map((w) => ({ key: w.day, value: w.hours, label: w.day.slice(0, 3) }))} unit="" />
              <div className="mt-3 border-t border-line pt-2"><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Busiest hours</p>
                {shown.occupancy.peakHours.length === 0 ? <p className="text-sm text-muted">No games.</p> : shown.occupancy.peakHours.map((p) => <Line key={p.hour} l={h12(p.hour)} v={`${p.games} game${p.games === 1 ? "" : "s"}`} />)}
              </div>
            </Card>

            <Card title="Promo codes">
              {shown.promos.length === 0 ? <p className="text-sm text-muted">No promo codes were used.</p> : shown.promos.map((p) => <Line key={p.code} l={`${p.code} (${p.uses} time${p.uses === 1 ? "" : "s"})`} v={`saved ${rs(p.discount)}`} />)}
            </Card>

            <Card title="Best customers">
              {shown.topCustomers.length === 0 ? <p className="text-sm text-muted">No games in this period.</p> : (
                <ol className="space-y-1.5 text-sm">{shown.topCustomers.map((c, i) => <li key={`${c.phone}-${i}`} className="flex justify-between gap-3"><span className="min-w-0 truncate"><span className="mr-2 text-muted">{i + 1}.</span><strong>{c.name}</strong> <span className="text-xs text-muted">{c.games} game{c.games === 1 ? "" : "s"}</span></span><span className="font-semibold">{rs(c.spent)}</span></li>)}</ol>
              )}
            </Card>

            <Card title="Memberships (now)">
              <Line l="Active members" v={String(shown.memberships.active)} strong /><Line l="Expiring in 15 days" v={String(shown.memberships.expiringSoon)} />
              <Line l="Waiting for payment" v={String(shown.memberships.waitingForPayment)} /><Line l="Value of active memberships" v={rs(shown.memberships.activeValue)} />
            </Card>

            <Card title="Loyalty points (now)">
              <Line l="Points owed (upper estimate)" v={String(Math.round(shown.loyalty.unexpiredEarnedPoints + shown.loyalty.spentPoints))} strong />
              <Line l="Unused free-game vouchers" v={String(shown.loyalty.unusedVouchers)} />
              <p className="mt-2 text-xs text-muted">Points not yet spent or expired. Spent points are not matched to the batch they came from, so this can be a little high.</p>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
