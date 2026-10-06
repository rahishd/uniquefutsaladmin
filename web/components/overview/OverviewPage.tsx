"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Banknote, QrCode } from "lucide-react";
import { prettyDate, rs } from "@/lib/bookings";
import { Overview, getOverview } from "@/lib/overview";

const hhmm = (t: string) => { const h = Number(t.slice(0, 2)); return `${h % 12 || 12}${t.slice(2, 5)} ${h < 12 ? "AM" : "PM"}`; };
const dayName = (k: string) => new Date(`${k}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });

function Week({ week }: { week: Overview["week"] }) {
  const max = Math.max(1, ...week.map((d) => d.total));
  return (
    <div className="flex h-40 items-end gap-2" role="img" aria-label="Sales for the last 7 days">
      {week.map((d, i) => (
        <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-[10px] font-semibold text-muted">{d.total ? rs(d.total).replace("Rs. ", "") : ""}</span>
          <div className="flex w-full flex-1 items-end"><div className={`w-full rounded-t-lg ${i === week.length - 1 ? "bg-brand" : "bg-brand/40"}`} style={{ height: `${Math.max(4, Math.round((d.total / max) * 100))}px` }} /></div>
          <span className="text-[11px] text-muted">{dayName(d.date)}</span>
        </div>
      ))}
    </div>
  );
}

export default function OverviewPage() {
  const [d, setD] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const load = () => getOverview().then((x) => live && (setD(x), setError(""))).catch((e) => live && setError(e instanceof Error ? e.message : "Could not load the overview"));
    load();
    const id = setInterval(load, 60_000); // keeps itself fresh while it stays open
    return () => { live = false; clearInterval(id); };
  }, []);

  if (error && !d) return <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>;
  if (!d) return <p className="py-10 text-center text-sm text-muted">Loading…</p>;

  const diff = d.today.total - d.yesterday.total;
  const a = d.attention;
  const items: { label: string; n: number; href: string; hint?: string }[] = [
    { label: "Unpaid games today", n: a.unpaidGamesToday, href: "/bookings" },
    { label: "Goods on credit", n: a.goodsDue.count, href: "/inventory", hint: rs(a.goodsDue.amount) },
    { label: "Low or out of stock", n: a.lowStock, href: "/inventory" },
    { label: "Members waiting for payment", n: a.membersWaiting, href: "/membership" },
    { label: "Memberships expiring (15 days)", n: a.membersExpiring, href: "/membership" },
    { label: "Open complaints", n: a.openComplaints, href: "/complaints" },
    { label: "Referrals to review", n: a.pendingReferrals, href: "/refer" },
    { label: "Disputed results", n: a.disputes, href: "/disputes" },
  ];

  return (
    <div className="w-full space-y-4 lg:space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="text-sm text-muted">{prettyDate(d.date)}. Money is counted once, as in the Inventory report.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-brand/10 p-4">
          <p className="text-sm text-muted">Sales today</p><p className="text-3xl font-bold text-brand">{rs(d.today.total)}</p>
          <p className={`mt-1 flex items-center gap-1 text-xs font-semibold ${diff >= 0 ? "text-green-700" : "text-red-600"}`}>
            {diff >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />} {rs(Math.abs(diff))} {diff >= 0 ? "more" : "less"} than yesterday ({rs(d.yesterday.total)})
          </p>
        </div>
        <div className="rounded-2xl bg-surface p-4 shadow-sm"><p className="flex items-center gap-2 text-sm text-muted"><QrCode size={16} /> Fonepay today</p><p className="text-2xl font-bold">{rs(d.today.fonepay)}</p></div>
        <div className="rounded-2xl bg-surface p-4 shadow-sm"><p className="flex items-center gap-2 text-sm text-muted"><Banknote size={16} /> Cash today</p><p className="text-2xl font-bold">{rs(d.today.cash)}</p></div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {([["Games today", String(d.games.count), `${d.games.paid} paid`], ["Gamezone sessions", String(d.gamezone), ""], ["Items sold", String(d.itemsSold), ""], ["New customers", String(d.newCustomers), ""], ["Games", rs(d.bySource.games.cash + d.bySource.games.fonepay), "collected"]] as const).map(([l, v, h]) => (
          <div key={l} className="rounded-2xl bg-surface p-3 shadow-sm"><p className="text-xs text-muted">{l}</p><p className="text-lg font-bold">{v}</p>{h && <p className="text-[11px] text-muted">{h}</p>}</div>
        ))}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2 lg:gap-6">
        <section className="rounded-2xl bg-surface p-4 shadow-sm lg:p-5">
          <h2 className="mb-3 text-lg font-semibold">Last 7 days</h2>
          <Week week={d.week} />
        </section>

        <section className="rounded-2xl bg-surface p-4 shadow-sm lg:p-5">
          <h2 className="mb-3 text-lg font-semibold">Needs attention</h2>
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
        {d.nextGames.length === 0 ? <p className="py-3 text-sm text-muted">No more games today.</p> : (
          <ul className="divide-y divide-line">
            {d.nextGames.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span><strong>{hhmm(g.startTime)}</strong> · {g.customerName ?? "Guest"}<span className="ml-2 text-xs text-muted">{g.code}</span></span>
                <span className="flex items-center gap-2"><span className="font-semibold">{rs(g.totalPrice)}</span><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${g.paymentStatus === "completed" ? "bg-green-500/15 text-green-700" : "bg-red-500/15 text-red-700"}`}>{g.paymentStatus === "completed" ? "Paid" : "Unpaid"}</span></span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
