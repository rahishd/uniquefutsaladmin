"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Banknote, Download, MessageCircle, QrCode } from "lucide-react";
import { prettyDate, rs } from "@/lib/bookings";
import { Report, getReport } from "@/lib/inventory";
import { Overview, getOverview } from "@/lib/overview";
import { downloadReport, whatsappLink } from "@/lib/report-export";

const field = "rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const hhmm = (t: string) => { const h = Number(t.slice(0, 2)); return `${h % 12 || 12}${t.slice(2, 5)} ${h < 12 ? "AM" : "PM"}`; };
const dayName = (k: string) => new Date(`${k}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
const nepalToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" }).format(new Date());
const shift = (key: string, days: number) => new Date(new Date(`${key}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
type Range = "today" | "yesterday" | "custom";

function Week({ week, last }: { week: Overview["week"]; last: string }) {
  const max = Math.max(1, ...week.map((d) => d.total));
  return (
    <div className="flex h-40 items-end gap-2" role="img" aria-label="Sales for 7 days">
      {week.map((d) => (
        <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-[10px] font-semibold text-muted">{d.total ? rs(d.total).replace("Rs. ", "") : ""}</span>
          <div className="flex w-full flex-1 items-end"><div className={`w-full rounded-t-lg ${d.date === last ? "bg-brand" : "bg-brand/40"}`} style={{ height: `${Math.max(4, Math.round((d.total / max) * 100))}px` }} /></div>
          <span className="text-[11px] text-muted">{dayName(d.date)}</span>
        </div>
      ))}
    </div>
  );
}

export default function OverviewPage() {
  const [range, setRange] = useState<Range>("today");
  const [from, setFrom] = useState(nepalToday());
  const [to, setTo] = useState(nepalToday());
  const [d, setD] = useState<Overview | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");

  const today = nepalToday();
  const [f, t] = range === "today" ? [today, today] : range === "yesterday" ? [shift(today, -1), shift(today, -1)] : [from, to];
  const invalid = !f || !t || f > t;

  useEffect(() => {
    if (invalid) return;
    let live = true;
    const load = () => Promise.all([getOverview(f, t), getReport(f, t)])
      .then(([o, r]) => { if (live) { setD(o); setReport(r); setError(""); } })
      .catch((e) => { if (live) { setD(null); setReport(null); setError(e instanceof Error ? e.message : "Could not load the overview"); } });
    load();
    const id = setInterval(load, 60_000); // keeps itself fresh while it stays open
    return () => { live = false; clearInterval(id); };
  }, [f, t, invalid]);

  const shown = d && d.from === f && d.to === t ? d : null;
  const period = f === t ? prettyDate(f) : `${prettyDate(f)} to ${prettyDate(t)}`;
  const diff = shown ? shown.today.total - shown.yesterday.total : 0;
  const prevLabel = !shown ? "" : shown.days > 1 ? `the ${shown.days} days before` : f === today ? "yesterday" : "the day before";
  const a = shown?.attention;
  const items = a ? [
    { label: "Unpaid games today", n: a.unpaidGamesToday, href: "/bookings", hint: "" },
    { label: "Goods on credit", n: a.goodsDue.count, href: "/inventory", hint: rs(a.goodsDue.amount) },
    { label: "Low or out of stock", n: a.lowStock, href: "/inventory", hint: "" },
    { label: "Members waiting for payment", n: a.membersWaiting, href: "/membership", hint: "" },
    { label: "Memberships expiring (15 days)", n: a.membersExpiring, href: "/membership", hint: "" },
    { label: "Open complaints", n: a.openComplaints, href: "/complaints", hint: "" },
    { label: "Referrals to review", n: a.pendingReferrals, href: "/refer", hint: "" },
    { label: "Disputed results", n: a.disputes, href: "/disputes", hint: "" },
  ] : [];

  return (
    <div className="w-full space-y-4 lg:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Overview</h1>
          <p className="text-sm text-muted">{invalid ? "Choose the dates" : period}. Money is counted once, as in the Inventory report.</p>
        </div>
        {report && (
          <div className="flex gap-2">
            <a href={whatsappLink(report)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-full bg-[#25D366] px-4 py-2 text-sm font-semibold text-white"><MessageCircle size={15} /> Send on WhatsApp</a>
            <button onClick={() => downloadReport(report)} className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold"><Download size={15} /> Download</button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-2xl bg-surface p-1 shadow-sm" role="tablist" aria-label="Overview period">
          {([["today", "Today"], ["yesterday", "Yesterday"], ["custom", "Custom (From to till)"]] as const).map(([id, l]) => (
            <button key={id} role="tab" aria-selected={range === id} onClick={() => setRange(id)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold ${range === id ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}>{l}</button>
          ))}
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
              <p className="text-sm text-muted">Total sales</p><p className="text-3xl font-bold text-brand">{rs(shown.today.total)}</p>
              <p className={`mt-1 flex items-center gap-1 text-xs font-semibold ${diff >= 0 ? "text-green-700" : "text-red-600"}`}>
                {diff >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />} {rs(Math.abs(diff))} {diff >= 0 ? "more" : "less"} than {prevLabel} ({rs(shown.yesterday.total)})
              </p>
            </div>
            <div className="rounded-2xl bg-surface p-4 shadow-sm"><p className="flex items-center gap-2 text-sm text-muted"><QrCode size={16} /> Fonepay</p><p className="text-2xl font-bold">{rs(shown.today.fonepay)}</p></div>
            <div className="rounded-2xl bg-surface p-4 shadow-sm"><p className="flex items-center gap-2 text-sm text-muted"><Banknote size={16} /> Cash</p><p className="text-2xl font-bold">{rs(shown.today.cash)}</p></div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {([["Games", String(shown.games.count), `${shown.games.paid} paid`], ["Gamezone sessions", String(shown.gamezone), ""], ["Items sold", String(shown.itemsSold), ""], ["New customers", String(shown.newCustomers), "today"], ["Games collected", rs(shown.bySource.games.cash + shown.bySource.games.fonepay), ""]] as const).map(([l, v, h]) => (
              <div key={l} className="rounded-2xl bg-surface p-3 shadow-sm"><p className="text-xs text-muted">{l}</p><p className="text-lg font-bold">{v}</p>{h && <p className="text-[11px] text-muted">{h}</p>}</div>
            ))}
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-2 lg:gap-6">
            <section className="rounded-2xl bg-surface p-4 shadow-sm lg:p-5">
              <h2 className="mb-3 text-lg font-semibold">7 days up to {prettyDate(shown.to)}</h2>
              <Week week={shown.week} last={shown.to} />
            </section>

            <section className="rounded-2xl bg-surface p-4 shadow-sm lg:p-5">
              <h2 className="mb-3 text-lg font-semibold">Needs attention <span className="text-xs font-normal text-muted">(right now)</span></h2>
              <ul className="divide-y divide-line">
                {items.map((i) => (
                  <li key={i.label}>
                    <Link href={i.href} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-brand">
                      <span>{i.label}{i.hint ? <span className="ml-2 text-xs text-muted">{i.hint}</span> : null}</span>
                      <span className={`min-w-8 rounded-full px-2.5 py-0.5 text-center text-xs font-bold ${i.n > 0 ? "bg-red-500/15 text-red-700" : "bg-surface-2 text-muted"}`}>{i.n}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="rounded-2xl bg-surface p-4 shadow-sm lg:p-5">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Next games today</h2><Link href="/slots" className="text-sm font-semibold text-brand">Open Slots</Link></div>
            {shown.nextGames.length === 0 ? <p className="py-3 text-sm text-muted">No more games today.</p> : (
              <ul className="divide-y divide-line">
                {shown.nextGames.map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span><strong>{hhmm(g.startTime)}</strong> · {g.customerName ?? "Guest"}<span className="ml-2 text-xs text-muted">{g.code}</span></span>
                    <span className="flex items-center gap-2"><span className="font-semibold">{rs(g.totalPrice)}</span><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${g.paymentStatus === "completed" ? "bg-green-500/15 text-green-700" : "bg-red-500/15 text-red-700"}`}>{g.paymentStatus === "completed" ? "Paid" : "Unpaid"}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
