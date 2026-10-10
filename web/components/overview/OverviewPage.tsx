"use client";

import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Banknote, Download, Globe, MessageCircle, QrCode } from "lucide-react";
import { prettyDate, rs } from "@/lib/bookings";
import { Report, getReport } from "@/lib/inventory";
import { Overview, getOverview } from "@/lib/overview";
import { downloadReportPdf } from "@/lib/report-pdf";
import { whatsappLink } from "@/lib/report-export";

const field = "rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const nepalToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" }).format(new Date());
const shift = (key: string, days: number) => new Date(new Date(`${key}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
const clock = (t: string) => { const h = Number(t.slice(0, 2)); return `${h % 12 || 12}${t.slice(2, 5)}`; };
const ampm = (t: string) => (Number(t.slice(0, 2)) % 24 < 12 ? "AM" : "PM");
const span = (a: string, b: string) => (ampm(a) === ampm(b) ? `${clock(a)}-${clock(b)} ${ampm(b)}` : `${clock(a)} ${ampm(a)}-${clock(b)} ${ampm(b)}`);
const h12 = (h: number) => `${h % 12 || 12}`;
const pcs = (n: number) => `${n} pc${n === 1 ? "" : "s"}`;
type Range = "today" | "yesterday" | "custom";

function Section({ n, title, children, total }: { n: number; title: string; children: React.ReactNode; total?: React.ReactNode }) {
  return (
    <section className="glass-card rounded-2xl p-4 lg:p-5">
      <h2 className="mb-3 text-lg font-bold">{n}. {title}</h2>
      {children}
      {total && <p className="mt-3 border-t border-line pt-3 text-base font-bold">{total}</p>}
    </section>
  );
}
const Rows = ({ rows, empty }: { rows: React.ReactNode[]; empty: string }) =>
  rows.length === 0 ? <p className="py-2 text-sm text-muted">{empty}</p> : (
    <ol className="space-y-2 text-sm">{rows.map((r, i) => <li key={i} className="flex gap-3"><span className="w-6 shrink-0 text-muted">{i + 1}.</span><span className="min-w-0 flex-1">{r}</span></li>)}</ol>
  );

export default function OverviewPage() {
  const [range, setRange] = useState<Range>("today");
  const [from, setFrom] = useState(nepalToday());
  const [to, setTo] = useState(nepalToday());
  const [ov, setOv] = useState<Overview | null>(null);
  const [r, setR] = useState<Report | null>(null);
  const [error, setError] = useState("");

  const today = nepalToday();
  const [f, t] = range === "today" ? [today, today] : range === "yesterday" ? [shift(today, -1), shift(today, -1)] : [from, to];
  const invalid = !f || !t || f > t;

  useEffect(() => {
    if (invalid) return;
    let live = true;
    const load = () => Promise.all([getOverview(f, t), getReport(f, t)])
      .then(([o, rep]) => { if (live) { setOv(o); setR(rep); setError(""); } })
      .catch((e) => { if (live) { setOv(null); setR(null); setError(e instanceof Error ? e.message : "Could not load the overview"); } });
    load();
    const id = setInterval(load, 60_000); // keeps itself fresh while it stays open
    return () => { live = false; clearInterval(id); };
  }, [f, t, invalid]);

  const shown = ov && r && ov.from === f && ov.to === t && r.from === f && r.to === t ? { ov, r } : null;
  const period = f === t ? prettyDate(f) : `${prettyDate(f)} to ${prettyDate(t)}`;
  const label = f === t ? (f === today ? "Today" : prettyDate(f)) : "this period";

  return (
    <div className="w-full space-y-4 lg:space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Overview</h1>
          <p className="text-sm text-muted">{invalid ? "Choose the dates" : period}. Money is counted once, as in the Inventory report.</p>
        </div>
        {shown && (
          <div className="flex gap-2">
            <a href={whatsappLink(shown.r)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-full bg-[#25D366] px-4 py-2 text-sm font-semibold text-white"><MessageCircle size={15} /> Send on WhatsApp</a>
            <button onClick={() => downloadReportPdf(shown.r)} className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold"><Download size={15} /> Download PDF</button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="glass-card flex gap-1 rounded-2xl p-1" role="tablist" aria-label="Overview period">
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

      {shown && (() => {
        const { ov: o, r: d } = shown;
        const diff = o.today.total - o.yesterday.total;
        const prev = o.days > 1 ? `the ${o.days} days before` : f === today ? "yesterday" : "the day before";
        const gameTotal = d.games.items.reduce((s, g) => s + g.rate, 0);
        const itemTotal = d.itemsSold.reduce((s, i) => s + i.amount, 0);
        return (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="glass-card glass-card-brand rounded-2xl p-4">
                <p className="text-sm text-muted">Total sales</p><p className="text-3xl font-bold text-brand">{rs(o.today.total)}</p>
                <p className={`mt-1 flex items-center gap-1 text-xs font-semibold ${diff >= 0 ? "text-green-700" : "text-red-600"}`}>{diff >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />} {rs(Math.abs(diff))} {diff >= 0 ? "more" : "less"} than {prev}</p>
              </div>
              <div className="glass-card rounded-2xl p-4"><p className="flex items-center gap-2 text-sm text-muted"><QrCode size={16} /> Fonepay</p><p className="text-2xl font-bold">{rs(o.today.fonepay)}</p></div>
              <div className="glass-card rounded-2xl p-4"><p className="flex items-center gap-2 text-sm text-muted"><Banknote size={16} /> Cash</p><p className="text-2xl font-bold">{rs(o.today.cash)}</p></div>
              <div className="glass-card rounded-2xl p-4">
                <p className="flex items-center gap-2 text-sm text-muted"><Globe size={16} /> Website visits</p>
                <p className="text-2xl font-bold">{o.visits.visitors}</p>
                <p className="mt-1 text-xs text-muted">{o.visits.visitors === 1 ? "visitor" : "visitors"}: {o.visits.pageViews} pages opened · {o.visits.signedIn} signed in{o.visits.visitors !== o.visits.previous && <span className={`ml-1 font-semibold ${o.visits.visitors > o.visits.previous ? "text-green-700" : "text-red-600"}`}>({o.visits.visitors > o.visits.previous ? "+" : "-"}{Math.abs(o.visits.visitors - o.visits.previous)} vs {prev})</span>}</p>
              </div>
            </div>

            <Section n={1} title={`Futsal games (${label})`} total={`Total: ${rs(gameTotal)}`}>
              <Rows empty="No games in this period." rows={d.games.items.map((g) => (
                <span key={g.id}><strong>{g.team}</strong> - {span(g.startTime, g.endTime)} - {rs(g.rate)} - Promocode: {g.promoCode ?? "none"}{!g.paid && <span className="ml-2 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-700">Unpaid</span>}{f !== t && <span className="ml-2 text-xs text-muted">{prettyDate(g.date)}</span>}</span>
              ))} />
            </Section>

            <Section n={2} title="Items sold" total={`Total: ${rs(itemTotal)}`}>
              <Rows empty="No items were sold in this period." rows={d.itemsSold.map((i) => <span key={i.name}><strong>{i.name}</strong> - {pcs(i.qty)} - {rs(i.amount)}</span>)} />
            </Section>

            <Section n={3} title="Gamezone" total={`Total: ${rs(d.gamezone.amount)}`}>
              <Rows empty="No Gamezone sessions in this period." rows={d.gamezone.items.map((g) => (
                <span key={g.code}><strong>{g.customer}</strong> - {g.hours} Hour{g.hours === 1 ? "" : "s"} - {g.players === 1 ? "Solo" : `${g.players} Players`} - {rs(g.total)}{g.extraHours > 0 && <span className="ml-1 text-xs text-muted">(+{g.extraHours} h extra)</span>}{!g.paid && <span className="ml-2 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-700">Unpaid</span>}<span className="ml-2 text-xs text-muted">{h12(g.startHour)}:00 {g.startHour < 12 ? "AM" : "PM"}</span></span>
              ))} />
            </Section>

            <Section n={4} title="Membership" total={<span>Total Received: {rs(d.memberships.received)}<br />Due Remaining: {rs(d.memberships.due)}</span>}>
              <Rows empty="No memberships were made, paid or are waiting for payment." rows={d.memberships.items.map((m) => (
                <span key={m.id}><strong>{m.customer}</strong> - {m.due > 0 ? <>Paid: {rs(m.paid)} Due: <span className="font-semibold text-red-600">{rs(m.due)}</span></> : <>Paid: {rs(m.paid)}</>} - Duration left: {m.daysLeft > 0 ? `${m.daysLeft} days` : "ended"}<span className="ml-2 text-xs text-muted">{m.memberCode}</span></span>
              ))} />
            </Section>

            <Section n={5} title="Tournament" total={<span>Total: {rs(d.tournaments.amount)}{d.tournaments.received !== undefined && <><br />Received: {rs(d.tournaments.received)}<br />Due: {rs(d.tournaments.due ?? 0)}</>}</span>}>
              <Rows empty="No tournaments in this period." rows={d.tournaments.items.map((x) => (
                <span key={x.id}><strong>{x.name}</strong> - {prettyDate(x.startDate)}{x.startDate !== x.endDate ? ` to ${prettyDate(x.endDate)}` : ""} - {rs(x.amount)}{x.hosted && <span className="text-xs text-muted"> (host {x.hostName ?? ""}: received {rs(x.received ?? 0)}, due {rs(x.due ?? 0)})</span>}<span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${x.paid ? "bg-green-500/15 text-green-700" : "bg-red-500/15 text-red-700"}`}>{x.paid ? "Paid" : "Unpaid"}</span></span>
              ))} />
            </Section>

            <Section n={6} title="Inventory stock value" total={<span>Stock value: {rs(d.stock.costValue)} at cost, {rs(d.stock.retailValue)} at selling price</span>}>
              <Rows empty="No products yet." rows={d.stock.items.map((p) => (
                <span key={p.name}><strong>{p.name}</strong> - {pcs(p.left)} {p.state === "low" ? <span className="font-semibold text-amber-700">(Low Stock): restock soon</span> : p.state === "out" ? <span className="font-semibold text-red-600">(Out of stock): restock now</span> : "left"}</span>
              ))} />
              <p className="mt-3 text-sm"><strong>{label === "Today" ? "Today" : "In this period"} items added:</strong> {d.stock.added.length === 0 ? "none" : d.stock.added.map((a) => `Added ${a.qty} ${a.name}`).join(", ")}</p>
            </Section>

            <Section n={7} title="Remaining dues (before today)" total={`Total dues: ${rs(d.dues.amount)}`}>
              <Rows empty="No dues. Everyone has paid." rows={d.dues.items.map((x, i) => (
                <span key={i}><strong>{x.team}</strong> - {rs(x.amount)} - {prettyDate(x.date)}<span className="ml-2 text-xs text-muted">{x.kind === "Goods" ? `Goods: ${x.detail}` : `Game ${x.detail}`}{x.phone ? ` · ${x.phone}` : ""}</span></span>
              ))} />
            </Section>
          </>
        );
      })()}
    </div>
  );
}
