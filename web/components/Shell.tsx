"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { LayoutDashboard, LogOut, Menu, X } from "lucide-react";
import { icons } from "./icons";
import { groups, modules } from "@/lib/nav";
import { getToken } from "@/lib/api";
import { currentAdmin, logout, type Admin } from "@/lib/auth";

// Sign-in guard is only for the UI; the API enforces staff access on every request.
export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const signedIn = useSyncExternalStore(() => () => {}, () => !!getToken(), () => null);
  const ready = signedIn === true;
  const admin: Admin | null = ready ? currentAdmin() : null;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (signedIn === false) router.replace("/login");
  }, [signedIn, router]);

  if (!ready) return <div className="grid min-h-screen place-items-center text-sm text-muted">Loading…</div>;

  const link = (href: string, label: string, Icon: React.ElementType) => {
    const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
    return (
      <Link key={href} href={href} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${active ? "bg-brand text-white" : "text-muted hover:bg-surface-2 hover:text-foreground"}`}>
        <Icon size={18} /> {label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_1fr]">
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 overflow-y-auto border-r border-line bg-surface p-4 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-base font-bold leading-tight">UNIQUE FUTSAL</p>
            <p className="text-xs text-muted">Admin portal</p>
          </div>
          <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X size={20} /></button>
        </div>
        <nav className="space-y-5">
          {link("/", "Dashboard", LayoutDashboard)}
          {groups.map((g) => (
            <div key={g}>
              <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted">{g}</p>
              <div className="space-y-0.5">
                {modules.filter((m) => m.group === g).map((m) => link(`/${m.slug}`, m.title, icons[m.icon]))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-surface/90 px-4 backdrop-blur">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={22} /></button>
          <span className="hidden text-sm text-muted lg:block">{admin ? `${admin.name} · ${admin.role}` : "Signed in"}</span>
          <button onClick={() => { logout(); router.replace("/login"); }} className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-surface-2">
            <LogOut size={16} /> Sign out
          </button>
        </header>
        <main className="p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
