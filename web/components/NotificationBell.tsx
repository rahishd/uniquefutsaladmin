"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, CalendarCheck, CreditCard, Megaphone, RotateCcw, Scale } from "lucide-react";
import { api } from "@/lib/api";
import { canDo } from "@/lib/access";

type Counts = { pendingPayments: number; disputes: number; refundsDue: number; arrivalsToday: number };

// What needs attention right now, worked out from the live dashboard numbers. Items disappear when they are dealt with.
const ITEMS: { key: keyof Counts; href: string; icon: React.ElementType; text: (n: number) => string }[] = [
  { key: "arrivalsToday", href: "/arrivals", icon: CalendarCheck, text: (n) => `${n} ${n === 1 ? "customer is" : "customers are"} on the way today` },
  { key: "refundsDue", href: "/payments", icon: RotateCcw, text: (n) => `${n} ${n === 1 ? "refund" : "refunds"} to pay back` },
  { key: "pendingPayments", href: "/payments", icon: CreditCard, text: (n) => `${n} ${n === 1 ? "payment" : "payments"} waiting for the customer` },
  { key: "disputes", href: "/overview", icon: Scale, text: (n) => `${n} disputed match ${n === 1 ? "result needs" : "results need"} a decision` },
];

export default function NotificationBell() {
  const [c, setC] = useState<Counts | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const allowed = canDo("dashboard.view");

  useEffect(() => {
    if (!allowed) return;
    let live = true;
    const load = () => api<Counts>("/admin/dashboard").then((d) => live && setC(d)).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    const vis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", vis);
    return () => { live = false; clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [allowed]);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  const rows = ITEMS.filter((i) => (c?.[i.key] ?? 0) > 0);
  // arrivals are information, not a to-do, so they do not count on the red badge
  const badge = rows.filter((r) => r.key !== "arrivalsToday").reduce((n, r) => n + (c?.[r.key] ?? 0), 0);

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={badge ? `Notifications, ${badge} need attention` : "Notifications"} aria-expanded={open} className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-white/10">
        <Bell size={24} />
        {badge > 0 && <span className="absolute right-0 top-0 grid min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-[11px] font-bold leading-[18px] text-white">{badge > 9 ? "9+" : badge}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications" className="absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-surface text-foreground shadow-xl">
          <p className="border-b border-line px-4 py-3 text-sm font-semibold">Needs your attention</p>
          {!allowed && <p className="px-4 py-6 text-center text-sm text-muted">Alerts are shown to accounts that can see the Dashboard.</p>}
          {allowed && !c && <p className="px-4 py-6 text-center text-sm text-muted">Loading…</p>}
          {allowed && c && rows.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">All clear. Nothing is waiting.</p>}
          <ul>
            {rows.map((r) => (
              <li key={r.key}>
                <Link href={r.href} onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-surface-2">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-brand"><r.icon size={18} /></span>
                  <span>{r.text(c![r.key])}</span>
                </Link>
              </li>
            ))}
          </ul>
          {canDo("notifications.send") && (
            <Link href="/notifications" onClick={() => setOpen(false)} className="flex items-center gap-2 border-t border-line px-4 py-3 text-sm font-semibold text-brand hover:bg-surface-2"><Megaphone size={16} /> Send a notice to customers</Link>
          )}
        </div>
      )}
    </div>
  );
}
