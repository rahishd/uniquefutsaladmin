"use client";

import { useEffect, useState } from "react";
import { Banknote, QrCode } from "lucide-react";
import { Badge } from "../bookings/Badge";
import { ApiError } from "@/lib/api";
import { prettyDate, rs } from "@/lib/bookings";
import { Report as ReportData, getReport } from "@/lib/inventory";

const field = "rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const nepalToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" }).format(new Date());
const shift = (key: string, days: number) => new Date(new Date(`${key}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
const h12 = (h: number) => `${h % 12 || 12}:00 ${h < 12 ? "AM" : "PM"}`;
const hhmm = (t: string) => { const h = Number(t.slice(0, 2)); return `${h % 12 || 12}${t.slice(2, 5)} ${h < 12 ? "AM" : "PM"}`; };
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kathmandu" });
type Range = "today" | "yesterday" | "custom";

function Section({ title, summary, children }: { title: string; summary?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-surface p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-lg font-bold">{title}</h2>{summary && <p className="text-sm text-muted">{summary}</p>}</div>
      {children}
    </section>
  );
}
const Empty = ({ text }: { text: string }) => <p className="py-4 text-center text-sm text-muted">{text}</p>;
const payTone = (p: string) => (p === "Not paid" || p === "On credit" ? "bg-red-500/15 text-red-700" : "bg-green-500/15 text-green-700");

export default function Report() {
  const [range, setRange] = useState<Range>("today");
  const [from, setFrom] = useState(nepalToday());
  const [to, setTo] = useState(nepalToday());
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState("");

  const today = nepalToday();
  const [f, t] = range === "today" ? [today, today] : range === "yesterday" ? [shift(today, -1), shift(today, -1)] : [from, to];
  const invalid = f > t || !f || !t;

  useEffect(() => {
    if (invalid) return;
    let live = true;
    getReport(f, t)
      .then((d) => { if (live) { setData(d); setError(""); } })
      .catch((e) => { if (live) { setData(null); setError(e instanceof ApiError || e instanceof Error ? e.message : "Could not load the report"); } });
    return () => { live = false; };
  }, [f, t, invalid]);

  const shown = data && data.from === f && data.to === t ? data : null;
  const day = (k: string) => prettyDate(k);
  const src = shown?.totals.bySource;
  const sum = (s?: { cash: number; fonepay: number }) => (s ? s.cash + s.fonepay : 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-2xl bg-surface p-1 shadow-sm" role="tablist" aria-label="Report period">
          {([["today", "Today"], ["yesterday", "Yesterday"], ["custom", "Custom date range"]] as const).map(([id, l]) => (
            <button key={id} role="tab" aria-selected={range === id} onClick={() => setRange(id)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold ${range === id ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}>{l}</button>
          ))}
        </div>
        {range === "custom" && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-sm">From <input type="date" className={field} value={from} max={today} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="flex items-center gap-1.5 text-sm">To <input type="date" className={field} value={to} max={today} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
        )}
        {!invalid && <p className="text-sm text-muted">{f === t ? day(f) : `${day(f)} to ${day(t)}`}</p>}
      </div>
      {invalid && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">The From date must not be after the To date.</p>}
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!shown && !error && !invalid && <p className="py-10 text-center text-sm text-muted">Loading…</p>}

      {shown && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-surface p-4 shadow-sm"><p className="flex items-center gap-2 text-sm text-muted"><QrCode size={16} /> Fonepay</p><p className="text-2xl font-bold">{rs(shown.totals.fonepay)}</p></div>
            <div className="rounded-2xl bg-surface p-4 shadow-sm"><p className="flex items-center gap-2 text-sm text-muted"><Banknote size={16} /> Cash</p><p className="text-2xl font-bold">{rs(shown.totals.cash)}</p></div>
            <div className="rounded-2xl bg-brand/10 p-4"><p className="text-sm text-muted">Total sales</p><p className="text-2xl font-bold text-brand">{rs(shown.totals.total)}</p></div>
          </div>
          <p className="-mt-1 text-xs text-muted">
            Games {rs(sum(src?.games))} · Goods {rs(sum(src?.goods))} · Gamezone {rs(sum(src?.gamezone))}.
            {" "}Only paid money counts, once: unpaid games and goods on credit are left out until collected. Games are counted on the game date. Memberships are listed below and are not in these totals.
          </p>

          <Section title="1. Games" summary={`${shown.games.count} games · ${shown.games.paidCount} paid · ${rs(shown.games.amount)}`}>
            {shown.games.items.length === 0 ? <Empty text="No games in this period." /> : (
              <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs text-muted"><tr><th className="py-2 pr-3">Date and time</th><th className="pr-3">Team</th><th className="pr-3 text-right">Rate</th><th className="pr-3">Promo code</th><th>Payment</th></tr></thead>
                <tbody className="divide-y divide-line">{shown.games.items.map((g) => (
                  <tr key={g.id}>
                    <td className="whitespace-nowrap py-2 pr-3">{day(g.date)}, {hhmm(g.startTime)}<span className="block text-[11px] text-muted">{g.code}</span></td>
                    <td className="pr-3 font-medium">{g.team}</td>
                    <td className="pr-3 text-right font-semibold">{rs(g.rate)}</td>
                    <td className="pr-3">{g.promoCode ? <>{g.promoCode}<span className="block text-[11px] text-muted">{g.discount ? `saved ${rs(g.discount)}` : ""}</span></> : <span className="text-muted">None</span>}</td>
                    <td><Badge tone={payTone(g.payment)}>{g.payment}</Badge></td>
                  </tr>))}</tbody>
              </table></div>
            )}
          </Section>

          <Section title="2. Customer purchases" summary={`${shown.purchases.customers.length} customers · ${rs(shown.purchases.total)}`}>
            {shown.purchases.customers.length === 0 ? <Empty text="No goods were sold in this period." /> : (
              <ul className="space-y-3">{shown.purchases.customers.map((c) => (
                <li key={c.phone ?? c.name} className="rounded-xl border border-line p-3">
                  <div className="flex items-baseline justify-between gap-2"><p className="font-bold">{c.name}{c.phone && c.phone !== c.name ? <span className="ml-2 text-xs font-normal text-muted">{c.phone}</span> : null}</p><p className="font-bold">{rs(c.total)}</p></div>
                  {c.sales.map((s) => (
                    <div key={s.id} className="mt-2 border-t border-line pt-2 text-sm">
                      <div className="flex items-center justify-between gap-2"><span className="text-xs text-muted">{time(s.time)}</span><Badge tone={payTone(s.payment)}>{s.payment}</Badge></div>
                      <ul className="mt-1 space-y-0.5">{s.items.map((i, k) => <li key={k} className="flex justify-between gap-3"><span>{i.qty} x {i.name} <span className="text-xs text-muted">@ {rs(i.price)}</span></span><span className="font-semibold">{rs(i.amount)}</span></li>)}</ul>
                    </div>
                  ))}
                </li>))}</ul>
            )}
          </Section>

          <Section title="3. Gamezone" summary={`${shown.gamezone.count} sessions · ${rs(shown.gamezone.amount)}`}>
            {shown.gamezone.items.length === 0 ? <Empty text="No Gamezone sessions in this period." /> : (
              <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs text-muted"><tr><th className="py-2 pr-3">Customer</th><th className="pr-3">Session</th><th className="pr-3">Extra add-on time</th><th className="pr-3 text-right">Total bill</th><th>Payment</th></tr></thead>
                <tbody className="divide-y divide-line">{shown.gamezone.items.map((g) => (
                  <tr key={g.code}>
                    <td className="py-2 pr-3 font-medium">{g.customer}<span className="block text-[11px] font-normal text-muted">{g.phone ?? ""}</span></td>
                    <td className="pr-3">{day(g.date)}, {h12(g.startHour)}<span className="block text-[11px] text-muted">{g.console} · {g.game} · {g.players} player{g.players === 1 ? "" : "s"} · {g.hours} h</span></td>
                    <td className="pr-3">{g.extraHours > 0 ? `+${g.extraHours} h` : <span className="text-muted">None</span>}</td>
                    <td className="pr-3 text-right font-semibold">{rs(g.total)}</td>
                    <td><Badge tone={payTone(g.payment)}>{g.payment}</Badge></td>
                  </tr>))}</tbody>
              </table></div>
            )}
          </Section>

          <Section title="4. Memberships" summary={`${shown.memberships.count} · ${rs(shown.memberships.amount)}`}>
            {shown.memberships.items.length === 0 ? <Empty text="No memberships were made or paid in this period." /> : (
              <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs text-muted"><tr><th className="py-2 pr-3">Member</th><th className="pr-3">Plan</th><th className="pr-3">Hour and days</th><th className="pr-3">Period</th><th className="pr-3 text-right">Amount</th><th>Status</th></tr></thead>
                <tbody className="divide-y divide-line">{shown.memberships.items.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2 pr-3 font-medium">{m.customer}<span className="block text-[11px] font-normal text-muted">{m.memberCode} · {m.phone}</span></td>
                    <td className="pr-3">{m.plan}{m.length ? `, ${m.length.replace("_", " ")}` : ""}</td>
                    <td className="pr-3">{m.timeSlot ? hhmm(m.timeSlot) : "—"}<span className="block text-[11px] text-muted">{m.days.length === 7 ? "Every day" : m.days.map((d) => d.slice(0, 3)).join(", ")}</span></td>
                    <td className="whitespace-nowrap pr-3">{day(m.startDate)} to {day(m.endDate)}</td>
                    <td className="pr-3 text-right font-semibold">{rs(m.amount)}</td>
                    <td><Badge tone={m.paymentStatus === "verified" ? "bg-green-500/15 text-green-700" : "bg-amber-500/15 text-amber-700"}>{m.paymentStatus === "verified" ? "Paid" : "Waiting for payment"}</Badge></td>
                  </tr>))}</tbody>
              </table></div>
            )}
          </Section>

          <Section title="5. Items sold" summary={`${shown.itemsSold.reduce((t, i) => t + i.qty, 0)} items`}>
            {shown.itemsSold.length === 0 ? <Empty text="No items were sold in this period." /> : (
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted"><tr><th className="py-2 pr-3">Item</th><th className="pr-3 text-right">Quantity</th><th className="text-right">Worth</th></tr></thead>
                <tbody className="divide-y divide-line">{shown.itemsSold.map((i) => <tr key={i.name}><td className="py-2 pr-3 font-medium">{i.name}</td><td className="pr-3 text-right">{i.qty}</td><td className="text-right font-semibold">{rs(i.amount)}</td></tr>)}</tbody>
              </table>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
