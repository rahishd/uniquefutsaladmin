"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BarChart3, Bell, CalendarDays, ChevronDown, LayoutGrid, LayoutDashboard, LogOut, Plus, ShoppingCart, Star, X } from "lucide-react";
import { icons } from "./icons";
import { groups, modules } from "@/lib/nav";
import { canSeePage } from "@/lib/access";
import { useLive } from "@/lib/live";
import DeniedDialog from "./DeniedDialog";
import ReminderPopup from "./reminders/ReminderPopup";
import NotificationBell from "./NotificationBell";
import SirenToggle from "./SirenToggle";
import { getToken } from "@/lib/api";
import { currentAdmin, logout, refreshAdmin, setAvatar, type Admin } from "@/lib/auth";

// Pages used all day, in this order (Overview is the landing page). Everything else sits behind the "More" button.
const frequents: { href: string; label: string; icon: React.ElementType }[] = [
  { href: "/overview", label: "Overview", icon: BarChart3 },
  { href: "/arrivals", label: "Arrivals", icon: icons.bell },
  { href: "/slots", label: "Slots", icon: icons.clock },
  { href: "/bookings", label: "Bookings", icon: icons.calendar },
  { href: "/sales", label: "Sales", icon: ShoppingCart },
  { href: "/payments", label: "Payments", icon: icons.wallet },
  { href: "/gamezone", label: "Gamezone", icon: icons.gamepad },
  { href: "/customers", label: "Customers", icon: icons.users },
  { href: "/membership", label: "Membership", icon: icons.badge },
  { href: "/tournaments", label: "Tournaments", icon: icons.trophy },
  { href: "/ev-charging", label: "EV Charging", icon: icons.battery },
  { href: "/verify", label: "Verify Documents", icon: icons.shield },
  { href: "/digital-id", label: "Digital ID", icon: icons.scan },
];

// Sign-in guard is only for the UI; the API enforces staff access on every request.
export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const signedIn = useSyncExternalStore(() => () => {}, () => !!getToken(), () => null);
  const ready = signedIn === true;
  const admin: Admin | null = ready ? currentAdmin() : null;
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false); // both sections start closed; the sidebar shows only the two headings
  const [frequentsOpen, setFrequentsOpen] = useState(false);
  const [fresh, setFresh] = useState(false);
  const live = useLive(); // permissions re-read from the server for this page load
  const [photo, setPhoto] = useState<string | null | undefined>(undefined); // set once the person changes their picture here
  const [photoErr, setPhotoErr] = useState("");
  const picker = useRef<HTMLInputElement>(null);

  async function choosePhoto(file?: File) {
    if (!file) return;
    setPhotoErr("");
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return setPhotoErr("Choose a JPG, PNG or WebP picture.");
    if (file.size > 8 * 1024 * 1024) return setPhotoErr("The picture is too large (8 MB limit).");
    try {
      const image = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
      setPhoto(await setAvatar(image));
    } catch (e) {
      setPhotoErr(e instanceof Error ? e.message : "Could not save the picture.");
    }
  }

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

  const visible = frequents.filter((f) => canSeePage(f.href.slice(1)));
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kathmandu", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const who = admin?.role === "owner" ? "Owner" : admin?.role === "admin" ? "Admin" : "Staff";
  const avatar = photo === undefined ? admin?.avatar ?? null : photo;
  const initials = (admin?.name ?? who).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || who[0];
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const link = (href: string, label: string, Icon: React.ElementType) => (
    <Link key={href} href={href} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${isActive(href) ? "bg-brand/10 font-semibold text-brand" : "text-muted hover:bg-surface-2 hover:text-foreground"}`}>
      <Icon size={18} /> {label}
    </Link>
  );

  const nav = (href: string, label: string, Icon: React.ElementType) => (
    <Link href={href} className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 whitespace-nowrap py-2 text-[11px] ${isActive(href) ? "font-semibold text-white" : "text-white/70"}`}>
      <span className={`grid h-8 w-10 place-items-center rounded-xl ${isActive(href) ? "bg-white/15" : ""}`}><Icon size={20} /></span>
      {label}
    </Link>
  );

  const moreOpen = more;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
        <header className="sticky top-0 z-30 flex h-auto min-h-16 min-w-0 items-center pb-2 pt-[max(calc(env(safe-area-inset-top)_-_0.625rem),0.5rem)] md:h-16 md:pb-0 md:pt-0 justify-between gap-3 bg-header pl-2 pr-4 text-white lg:col-span-2 lg:pl-3 lg:pr-8">
          <div className="flex shrink-0 items-center gap-3 pr-2">
            {/* the player alone, turned white for the navy bar */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.png" alt="" aria-hidden className="h-9 w-auto brightness-0 invert" />
            <span className="hidden text-sm font-bold tracking-wide sm:inline">UNIQUE FUTSAL</span>
          </div>
          <span aria-hidden className="hidden h-8 w-px shrink-0 bg-white/30 sm:block" />
          {/* the frequent pages as icons, on every page, for quick switching (the name shows on hover or long press) */}
          <nav aria-label="Frequent pages" className="mx-2 flex min-w-0 flex-1 items-center justify-start gap-1.5 overflow-x-auto py-1 [mask-image:linear-gradient(to_right,transparent,#000_10px,#000_calc(100%-10px),transparent)] md:mx-3 md:justify-center md:gap-2.5 md:[mask-image:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {visible.map((f) => {
              const on = isActive(f.href);
              const n = live.unseenFor(f.href).length;
              return (
                <Link
                  key={f.href}
                  href={f.href}
                  title={n > 0 ? `${f.label}: ${n} new` : f.label}
                  aria-label={n > 0 ? `${f.label}, ${n} new` : f.label}
                  aria-current={on ? "page" : undefined}
                  onClick={(e) => {
                    // with something new, open the newest one and highlight it; otherwise a normal link
                    const go = live.openLive(f.href);
                    if (go) { e.preventDefault(); router.push(go); }
                  }}
                  className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-xl md:h-11 md:w-11 md:rounded-2xl transition ${on ? "bg-[#f5822a] text-white shadow-lg ring-[#f5822a]" : "bg-[#1e2d5e] text-white/90 hover:bg-[#2a3c74] hover:text-white"}`}
                >
                  <f.icon size={18} className="md:h-[22px] md:w-[22px]" />
                  {n > 0 && <span className="absolute -right-1.5 -top-1.5 grid min-w-[20px] place-items-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-5 text-white ring-2 ring-header">{n > 9 ? "9+" : n}</span>}
                </Link>
              );
            })}
          </nav>
          <div className="flex shrink-0 items-center gap-3 pl-4">
            <SirenToggle />
            <NotificationBell />
          </div>
        </header>
      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-line bg-surface p-4 transition-transform lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:row-start-2 lg:col-start-1 lg:w-auto lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="mb-4 flex justify-end lg:hidden">
          <button onClick={() => setOpen(false)} aria-label="Close menu"><X size={20} /></button>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto">
          {canSeePage("dashboard") && (
            <Link href="/dashboard" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-2xl bg-[#87ceeb] px-4 py-3.5 text-base font-bold text-[#0c0b5d] shadow-sm transition hover:bg-[#6bb8d9]">
              <LayoutDashboard size={22} /> Dashboard
            </Link>
          )}
          <div>
            <button onClick={() => setFrequentsOpen((v) => !v)} aria-expanded={frequentsOpen} className="mb-2 flex w-full items-center gap-3 rounded-2xl bg-[#87ceeb] px-4 py-3.5 text-base font-bold text-[#0c0b5d] shadow-sm transition hover:bg-[#6bb8d9]">
              <Star size={22} /> Frequents
              <ChevronDown size={16} className={`ml-auto transition-transform ${frequentsOpen ? "rotate-180" : ""}`} />
            </button>
            {frequentsOpen && <div className="space-y-0.5">{visible.map((f) => link(f.href, f.label, f.icon))}</div>}
          </div>
          <div>
            <button onClick={() => setMore(!moreOpen)} aria-expanded={moreOpen} className="flex w-full items-center gap-3 rounded-2xl bg-[#87ceeb] px-4 py-3.5 text-base font-bold text-[#0c0b5d] shadow-sm transition hover:bg-[#6bb8d9]">
              <LayoutGrid size={22} /> More
              <ChevronDown size={16} className={`ml-auto transition-transform ${moreOpen ? "rotate-180" : ""}`} />
            </button>
            {moreOpen && (
              <div className="mt-3 space-y-5">
                {groups.map((g) => {
                  const items = modules.filter((m) => m.group === g && canSeePage(m.slug) && !frequents.some((f) => f.href === `/${m.slug}`));
                  if (!items.length) return null;
                  return (
                    <div key={g}>
                      <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted">{g}</p>
                      <div className="space-y-0.5">{items.map((m) => link(`/${m.slug}`, m.title, icons[m.icon]))}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </nav>
        <div className="mt-3 flex shrink-0 items-center gap-3 rounded-2xl bg-[#87ceeb] px-4 py-3 text-[#0c0b5d] shadow-sm">
          <button type="button" onClick={() => picker.current?.click()} title="Change profile picture" aria-label="Change profile picture" className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-[#0c0b5d] ring-2 ring-white">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-lg font-bold text-white">{initials}</span>
            )}
          </button>
          <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Choose profile picture" onChange={(e) => { void choosePhoto(e.target.files?.[0]); e.target.value = ""; }} />
          <div className="min-w-0 text-left">
            <p className="text-xs text-[#0c0b5d]/80">{greeting}</p>
            <p className="truncate text-base font-bold">{who}</p>
            {photoErr && <p role="alert" className="mt-1 text-xs font-medium text-red-700">{photoErr}</p>}
          </div>
        </div>
        <button onClick={() => { logout(); router.replace("/login"); }} className="mt-3 flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-red-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700">
          <LogOut size={18} /> Sign out
        </button>
      </aside>

      <div className="flex min-w-0 flex-col lg:col-start-2 lg:row-start-2">
        <main className="mx-auto w-full max-w-[1400px] p-4 pb-28 lg:p-8 lg:pb-10">{children}</main>
        <DeniedDialog />
        <ReminderPopup />
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-end bg-[#0c0b5d] px-2 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-1 shadow-xl lg:hidden">
        {canSeePage("dashboard") && nav("/dashboard", "Dashboard", LayoutDashboard)}
        {canSeePage("payments") && nav("/payments", "Payments", icons.wallet)}
        <div className="flex flex-1 justify-center">
          {canSeePage("slots") && (
            <Link href="/slots" aria-label="Slots: book a customer" className="-mt-7 grid h-16 w-16 place-items-center rounded-full bg-white text-[#0c0b5d] shadow-lg ring-4 ring-[#0c0b5d]">
              <Plus size={30} />
            </Link>
          )}
        </div>
        {canSeePage("gamezone") && nav("/gamezone", "Gamezone", icons.gamepad)}
        {canSeePage("sales") && nav("/sales", "Sales", ShoppingCart)}
      </nav>
    </div>
  );
}
