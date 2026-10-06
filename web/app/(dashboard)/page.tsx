"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { icons } from "@/components/icons";
import { groups, modules } from "@/lib/nav";
import { api } from "@/lib/api";
import { canDo } from "@/lib/access";
import { rs } from "@/lib/bookings";
import { getOverview } from "@/lib/overview";

const quick = ["slots", "bookings", "payments", "arrivals"];

type Live = { pendingPayments: number; arrivalsToday: number; disputes: number; refundsDue: number; bookingsToday: number };
const attention: { label: string; icon: string; href: string; key: keyof Live }[] = [
  { label: "Pending payments", icon: "wallet", href: "/payments", key: "pendingPayments" },
  { label: "Arrivals", icon: "bell", href: "/arrivals", key: "arrivalsToday" },
  { label: "Disputes", icon: "scale", href: "/disputes", key: "disputes" },
  { label: "Refunds due", icon: "receipt", href: "/payments", key: "refundsDue" },
];
const HIDE = "uf-hide-numbers";
const readHidden = () => { if (typeof window === "undefined") return false; try { return localStorage.getItem(HIDE) === "1"; } catch { return false; } };

function Tile({ href, label, Icon, badge }: { href: string; label: string; Icon: React.ElementType; badge?: string }) {
  return (
    <Link href={href} className="flex flex-col items-center gap-2 text-center text-[13px] font-medium leading-tight">
      <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-surface-2 text-foreground/75 lg:h-14 lg:w-14">
        <Icon size={26} strokeWidth={1.6} />
        {badge && <span className="absolute -right-2 -top-2 rounded-full bg-brand px-1.5 text-[11px] font-bold text-white">{badge}</span>}
      </span>
      <span className="text-foreground/80">{label}</span>
    </Link>
  );
}

const Card = ({ title, children }: { title?: string; children: React.ReactNode }) => (
  <section className="rounded-2xl bg-surface p-5 shadow-sm lg:p-6">
    {title && <h2 className="mb-4 text-lg font-semibold">{title}</h2>}
    <div className="grid grid-cols-4 gap-x-2 gap-y-5 sm:grid-cols-5 lg:grid-cols-4 xl:grid-cols-5">{children}</div>
  </section>
);

export default function Home() {
  // the eye hides the money and counts (for when the screen is shared); the choice is remembered on this device
  const [hidden, setHidden] = useState(readHidden);
  const [live, setLive] = useState<Live | null>(null);
  const [sales, setSales] = useState<number | null>(null);
  const allowed = canDo("dashboard.view");

  const flip = () => { const next = !hidden; setHidden(next); try { localStorage.setItem(HIDE, next ? "1" : "0"); } catch { /* the choice just is not remembered */ } };

  useEffect(() => {
    if (!allowed) return;
    let on = true;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" }).format(new Date());
    const load = () => {
      api<Live>("/admin/dashboard").then((d) => on && setLive(d)).catch(() => {});
      getOverview(today, today).then((o) => on && setSales(o.today.total)).catch(() => {});
    };
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 30000);
    return () => { on = false; clearInterval(t); };
  }, [allowed]);

  const money = hidden ? "XXXX.XX" : sales === null ? "—" : rs(sales).replace("Rs. ", "");
  const count = hidden ? "XX" : live === null ? "—" : String(live.bookingsToday);

  return (
    <div className="w-full space-y-4 lg:space-y-6">
      {/* green curve behind the summary card */}
      <div className="-mx-4 -mt-4 h-14 rounded-b-[2rem] bg-brand lg:hidden" />

      <section className="-mt-12 overflow-hidden rounded-2xl bg-surface shadow-sm lg:mt-0">
        <div className="relative grid grid-cols-2 bg-surface-2 px-5 py-4 lg:px-8 lg:py-6">
          <div>
            <p className="text-xs text-muted">NPR · Revenue today</p>
            <p className="text-xl font-bold lg:text-3xl">{money}</p>
          </div>
          <div className="pl-6">
            <p className="text-xs text-muted">Bookings today</p>
            <p className="text-xl font-bold lg:text-3xl">{count}</p>
          </div>
          <button onClick={flip} aria-label={hidden ? "Show numbers" : "Hide numbers"} className="absolute left-1/2 top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-surface shadow lg:left-auto lg:right-8 lg:translate-x-0">
            {hidden ? <EyeOff size={22} /> : <Eye size={22} />}
          </button>
        </div>
        <div className="grid grid-cols-4 gap-2 px-3 py-4 lg:grid-cols-4 lg:gap-4 lg:px-8 lg:py-6">
          {quick.map((slug) => {
            const m = modules.find((x) => x.slug === slug)!;
            return <Tile key={slug} href={`/${slug}`} label={m.title} Icon={icons[m.icon]} />;
          })}
        </div>
      </section>

      <Link href="/overview" className="flex items-center justify-between rounded-2xl bg-surface p-4 text-sm font-semibold shadow-sm"><span>Overview: today&apos;s sales, a week chart and what needs attention</span><span className="text-brand">Open</span></Link>

      <Card title="Needs attention">
        {attention.map((a) => <Tile key={a.label} href={a.href} label={a.label} Icon={icons[a.icon]} badge={live && live[a.key] > 0 ? String(live[a.key]) : undefined} />)}
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-2 lg:gap-6">
        {groups.map((g) => (
          <Card key={g} title={g}>
            {modules.filter((m) => m.group === g).map((m) => <Tile key={m.slug} href={`/${m.slug}`} label={m.title} Icon={icons[m.icon]} />)}
          </Card>
        ))}
      </div>
    </div>
  );
}
