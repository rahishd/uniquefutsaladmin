"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { BarChart3, Bell, CalendarDays, LayoutGrid, LayoutDashboard, LogOut, Plus, Search, User, X } from "lucide-react";
import { icons } from "./icons";
import { groups, modules } from "@/lib/nav";
import DeniedDialog from "./DeniedDialog";
import NotificationBell from "./NotificationBell";
import { getToken } from "@/lib/api";
import { currentAdmin, logout, refreshAdmin, type Admin } from "@/lib/auth";

// Sign-in guard is only for the UI; the API enforces staff access on every request.
export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const signedIn = useSyncExternalStore(() => () => {}, () => !!getToken(), () => null);
  const ready = signedIn === true;
  const admin: Admin | null = ready ? currentAdmin() : null;
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState(false); // permissions re-read from the server for this page load

  useEffect(() => {
    if (signedIn === false) router.replace("/login");
  }, [signedIn, router]);

  useEffect(() => {
    if (!ready) return;
    let live = true;
    refreshAdmin().catch(() => {}).finally(() => { if (live) setFresh(true); });
    return () => { live = false; };
  }, [ready]);

  if (!ready || !fresh) return <div className="grid min-h-screen place-items-center text-sm text-muted">Loading…</div>;

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const link = (href: string, label: string, Icon: React.ElementType) => (
    <Link key={href} href={href} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${isActive(href) ? "bg-brand/10 font-semibold text-brand" : "text-muted hover:bg-surface-2 hover:text-foreground"}`}>
      <Icon size={18} /> {label}
    </Link>
  );

  const nav = (href: string, label: string, Icon: React.ElementType) => (
    <Link href={href} className={`flex flex-1 flex-col items-center gap-1 py-2 text-xs ${isActive(href) ? "font-semibold text-brand" : "text-muted"}`}>
      <span className={`grid h-9 w-12 place-items-center rounded-xl ${isActive(href) ? "bg-brand/10" : ""}`}><Icon size={22} /></span>
      {label}
    </Link>
  );

  const firstName = admin?.name?.split(" ")[0] ?? "Admin";

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-line bg-surface p-4 transition-transform lg:sticky lg:top-0 lg:h-screen lg:w-auto lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-base font-bold leading-tight">UNIQUE FUTSAL</p>
            <p className="text-xs text-muted">Admin portal</p>
          </div>
          <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X size={20} /></button>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto">
          {link("/", "Dashboard", LayoutDashboard)}
          {link("/overview", "Overview", BarChart3)}
          {groups.map((g) => (
            <div key={g}>
              <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted">{g}</p>
              <div className="space-y-0.5">{modules.filter((m) => m.group === g).map((m) => link(`/${m.slug}`, m.title, icons[m.icon]))}</div>
            </div>
          ))}
        </nav>
        <button onClick={() => { logout(); router.replace("/login"); }} className="mt-3 flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted hover:bg-surface-2">
          <LogOut size={18} /> Sign out
        </button>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between bg-header px-4 text-white lg:px-8">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-header"><User size={22} /></span>
            <span className="text-lg font-semibold">Hi, {firstName}</span>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/customers" aria-label="Search customers"><Search size={24} /></Link>
            <NotificationBell />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] p-4 pb-28 lg:p-8 lg:pb-10">{children}</main>
        <DeniedDialog />
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-end border-t border-line bg-surface lg:hidden">
        {nav("/", "Home", LayoutDashboard)}
        {nav("/bookings", "Bookings", CalendarDays)}
        <div className="flex flex-1 justify-center">
          <Link href="/slots" aria-label="Slots: book a customer" className="-mt-7 grid h-16 w-16 place-items-center rounded-full bg-brand text-white shadow-lg ring-4 ring-surface">
            <Plus size={30} />
          </Link>
        </div>
        {nav("/arrivals", "Arrivals", Bell)}
        <button onClick={() => setOpen(true)} className="flex flex-1 flex-col items-center gap-1 py-2 text-xs text-muted">
          <span className="grid h-9 w-12 place-items-center rounded-xl"><LayoutGrid size={22} /></span>
          More
        </button>
      </nav>
    </div>
  );
}
