"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Baby, Bell, CalendarCheck, CalendarPlus, CreditCard, Gamepad2, HeartHandshake, Megaphone, MessageSquareWarning, RotateCcw, Scale, Swords, UserPlus, Users, X,
} from "lucide-react";
import { api } from "@/lib/api";
import { canDo } from "@/lib/access";

type Counts = { pendingPayments: number; disputes: number; refundsDue: number; arrivalsToday: number };
type Item = { id: string; type: string; title: string; text: string; href: string; at: string };

// What needs attention right now, worked out from the live dashboard numbers. Items disappear when they are dealt with.
const ITEMS: { key: keyof Counts; href: string; icon: React.ElementType; text: (n: number) => string }[] = [
  { key: "arrivalsToday", href: "/arrivals", icon: CalendarCheck, text: (n) => `${n} ${n === 1 ? "customer is" : "customers are"} on the way today` },
  { key: "refundsDue", href: "/payments", icon: RotateCcw, text: (n) => `${n} ${n === 1 ? "refund" : "refunds"} to pay back` },
  { key: "pendingPayments", href: "/payments", icon: CreditCard, text: (n) => `${n} ${n === 1 ? "payment" : "payments"} waiting for the customer` },
  { key: "disputes", href: "/disputes", icon: Scale, text: (n) => `${n} disputed match ${n === 1 ? "result needs" : "results need"} a decision` },
];

const ICON: Record<string, React.ElementType> = {
  booking: CalendarPlus, payment: CreditCard, customer: UserPlus, complaint: MessageSquareWarning, referral: HeartHandshake, academy: Baby,
  challenge: Swords, result: Scale, gamezone: Gamepad2, membership: Users, arrival: CalendarCheck,
};

const SEEN = "uf-activity-seen";
const readSeen = () => { try { return localStorage.getItem(SEEN) ?? ""; } catch { return ""; } };
const saveSeen = (iso: string) => { try { localStorage.setItem(SEEN, iso); } catch { /* private window: the badge simply resets on reload */ } };

const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};

// The bell: what customers just did in the app (live, every 15 seconds) and what needs attention now.
export default function NotificationBell() {
  const [c, setC] = useState<Counts | null>(null);
  const [feed, setFeed] = useState<Item[]>([]);
  // nothing is "new" the first time this browser opens the portal
  const [seen, setSeen] = useState(() => { if (typeof window === "undefined") return ""; const v = readSeen(); if (v) return v; const now = new Date().toISOString(); saveSeen(now); return now; });
  const [toast, setToast] = useState<Item | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const known = useRef(new Set<string>());
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

  const loadFeed = useCallback(() => {
    api<{ items: Item[] }>("/admin/activity").then(({ items }) => {
      const fresh = items.filter((i) => !known.current.has(i.id));
      items.forEach((i) => known.current.add(i.id));
      setFeed(items);
      if (!first.current && fresh.length > 0) setToast(fresh[0]); // something new arrived while the portal was open
      first.current = false;
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!allowed) return;
    loadFeed();
    const t = setInterval(() => document.visibilityState === "visible" && loadFeed(), 15000);
    const vis = () => document.visibilityState === "visible" && loadFeed();
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [allowed, loadFeed]);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 7000); return () => clearTimeout(t); }, [toast]);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  const rows = ITEMS.filter((i) => (c?.[i.key] ?? 0) > 0);
  const fresh = feed.filter((i) => seen && i.at > seen).length;
  // arrivals are information, not a to-do, so they do not count on the red badge
  const badge = rows.filter((r) => r.key !== "arrivalsToday").reduce((n, r) => n + (c?.[r.key] ?? 0), 0) + fresh;

  useEffect(() => { document.title = badge > 0 ? `(${badge}) Unique Futsal Admin` : "Unique Futsal Admin"; }, [badge]);

  function toggle() {
    setOpen((o) => {
      if (!o) setToast(null);
      return !o;
    });
  }
  function markSeen() { const now = new Date().toISOString(); saveSeen(now); setSeen(now); }

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={toggle} aria-label={badge ? `Notifications, ${badge} new or needing attention` : "Notifications"} aria-expanded={open} className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-white/10">
        <Bell size={24} />
        {badge > 0 && <span className="absolute right-0 top-0 grid min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-[11px] font-bold leading-[18px] text-white">{badge > 9 ? "9+" : badge}</span>}
      </button>

      {toast && !open && (
        <Link href={toast.href} onClick={() => setToast(null)} className="fixed bottom-24 left-4 right-4 z-[60] flex items-start gap-3 rounded-2xl border border-line bg-surface p-3 text-foreground shadow-xl sm:left-auto sm:right-6 sm:w-96 lg:bottom-6" role="status">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-brand">{(() => { const I = ICON[toast.type] ?? Bell; return <I size={18} />; })()}</span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{toast.title}</span><span className="block truncate text-xs text-muted">{toast.text}</span></span>
          <button type="button" aria-label="Dismiss" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setToast(null); }} className="text-muted"><X size={16} /></button>
        </Link>
      )}

      {open && (
        <div role="dialog" aria-label="Notifications" className="absolute right-0 top-12 z-50 flex max-h-[80vh] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-line bg-surface text-foreground shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold">What customers just did</p>
            {fresh > 0 && <button type="button" onClick={markSeen} className="text-xs font-semibold text-brand">Mark all as read</button>}
          </div>
          <div className="overflow-y-auto">
            {!allowed && <p className="px-4 py-6 text-center text-sm text-muted">Alerts are shown to accounts that can see the Dashboard.</p>}
            {allowed && feed.length === 0 && <p className="px-4 py-5 text-center text-sm text-muted">Nothing new from customers in the last 24 hours.</p>}
            <ul>
              {feed.slice(0, 15).map((i) => {
                const I = ICON[i.type] ?? Bell;
                const isNew = !!seen && i.at > seen;
                return (
                  <li key={i.id}>
                    <Link href={i.href} onClick={() => setOpen(false)} className={`flex items-start gap-3 px-4 py-2.5 text-sm hover:bg-surface-2 ${isNew ? "bg-brand/5" : ""}`}>
                      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand/10 text-brand"><I size={16} /></span>
                      <span className="min-w-0 flex-1"><span className="flex items-center gap-2 font-semibold">{i.title}{isNew && <span className="h-2 w-2 rounded-full bg-red-500" aria-label="new" />}</span><span className="block truncate text-xs text-muted">{i.text}</span></span>
                      <span className="shrink-0 text-[11px] text-muted">{ago(i.at)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {allowed && c && rows.length > 0 && (
              <>
                <p className="border-y border-line bg-surface-2 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">Needs your attention</p>
                <ul>
                  {rows.map((r) => (
                    <li key={r.key}>
                      <Link href={r.href} onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-surface-2">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-brand"><r.icon size={18} /></span>
                        <span>{r.text(c[r.key])}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          {canDo("notifications.send") && (
            <Link href="/notifications" onClick={() => setOpen(false)} className="flex items-center gap-2 border-t border-line px-4 py-3 text-sm font-semibold text-brand hover:bg-surface-2"><Megaphone size={16} /> Send a notice to customers</Link>
          )}
        </div>
      )}
    </div>
  );
}
