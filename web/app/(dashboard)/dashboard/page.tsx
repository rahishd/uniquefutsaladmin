"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { icons } from "@/components/icons";
import { modules } from "@/lib/nav";
import { api } from "@/lib/api";
import { canDo, canSeePage } from "@/lib/access";
import { rs } from "@/lib/bookings";
import { getOverview } from "@/lib/overview";

type Live = { pendingPayments: number; arrivalsToday: number; disputes: number; refundsDue: number; bookingsToday: number; tasks: Record<string, number> };

function Tile({ href, label, Icon, badge }: { href: string; label: string; Icon: React.ElementType; badge?: string }) {
  return (
    <Link href={href} className="flex flex-col items-center justify-center gap-1 text-center text-[10px] font-medium leading-tight lg:gap-2 lg:text-[13px]">
      <span className="relative grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-foreground/75 lg:h-14 lg:w-14">
        <Icon size={22} strokeWidth={1.6} />
        {badge && <span className="absolute -right-2 -top-2 min-w-[20px] rounded-full bg-brand px-1.5 text-center text-[11px] font-bold leading-5 text-white">{badge}</span>}
      </span>
      <span className="text-foreground/80">{label}</span>
    </Link>
  );
}

const Card = ({ title, children }: { title?: string; children: React.ReactNode }) => (
  <section className="flex h-[calc(100dvh-12rem)] flex-col rounded-2xl bg-surface p-3 shadow-sm lg:h-[calc(100dvh-8rem)] lg:p-6">
    {title && <h2 className="mb-4 text-lg font-semibold">{title}</h2>}
    <div className="grid min-h-0 flex-1 grid-cols-4 auto-rows-fr place-items-center gap-x-1 sm:grid-cols-5 lg:grid-cols-6">{children}</div>
  </section>
);

export default function Home() {
  const [live, setLive] = useState<Live | null>(null);
  const [sales, setSales] = useState<{ total: number; games: number; goods: number; gamezone: number } | null>(null);
  const allowed = canDo("dashboard.view");

  useEffect(() => {
    if (!allowed) return;
    let on = true;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" }).format(new Date());
    const load = () => {
      api<Live>("/admin/dashboard").then((d) => on && setLive(d)).catch(() => {});
      getOverview(today, today).then((o) => on && setSales({ total: o.today.total, games: o.bySource.games.cash + o.bySource.games.fonepay, goods: o.bySource.goods.cash + o.bySource.goods.fonepay, gamezone: o.bySource.gamezone.cash + o.bySource.gamezone.fonepay })).catch(() => {});
    };
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 30000);
    return () => { on = false; clearInterval(t); };
  }, [allowed]);

  const money = sales === null ? "—" : rs(sales.total).replace("Rs. ", "");
  const split = !sales ? "" : `Games ${rs(sales.games)} · Goods ${rs(sales.goods)} · Gamezone ${rs(sales.gamezone)}`;
  const count = live === null ? "—" : String(live.bookingsToday);

  return (
    <div className="w-full space-y-4 lg:space-y-6">


      <Card>
        {modules.filter((m) => canSeePage(m.slug)).map((m) => {
          const n = live?.tasks?.[m.slug] ?? 0;
          return <Tile key={m.slug} href={`/${m.slug}`} label={m.title} Icon={icons[m.icon]} badge={n > 0 ? String(n) : undefined} />;
        })}
      </Card>
    </div>
  );
}
