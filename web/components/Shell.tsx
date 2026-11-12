"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BarChart3, Bell, CalendarDays, ChevronDown, LayoutGrid, LayoutDashboard, Camera, LogOut, Plus, RefreshCw, ShoppingCart, Star, X } from "lucide-react";
import { icons } from "./icons";
import { groups, modules } from "@/lib/nav";
import { canSeePage } from "@/lib/access";
import { useLive } from "@/lib/live";
import DeniedDialog from "./DeniedDialog";
import ReminderPopup from "./reminders/ReminderPopup";
import NotificationBell from "./NotificationBell";
import SirenToggle from "./SirenToggle";
import ThemeToggle from "./ThemeToggle";
import LockButton from "./LockButton";
import LockScreen from "./LockScreen";
import { getToken } from "@/lib/api";
import { withBase } from "@/lib/base";
import { currentAdmin, logout, refreshAdmin, setAvatar, type Admin } from "@/lib/auth";

// The icon on each section's dropdown button
const GROUP_ICON: Record<string, React.ElementType> = {
  Operations: LayoutGrid, "Loyalty & Promos": icons.users, Community: icons.trophy, Gamezone: icons.gamepad, Communication: icons.megaphone, Business: icons.chart, Admin: icons.settings,
};

// Pages used all day, in this order (Overview is the landing page). Everything else sits behind the "More" button.
// deskOnly: shown in the top icon row on tablet and desktop only (the phone has its own bottom bar and the sidebar menu)
const frequents: { href: string; label: string; icon: React.ElementType; deskOnly?: boolean }[] = [
  { href: "/overview", label: "Overview and Reports", icon: BarChart3 },
  { href: "/slots", label: "Manual Booking", icon: icons.clock, deskOnly: true },
  { href: "/bookings", label: "Bookings & Payments", icon: icons.calendar, deskOnly: true },
  { href: "/sales", label: "Products & Sales", icon: ShoppingCart, deskOnly: true },
  { href: "/gamezone", label: "Gamezone", icon: icons.gamepad, deskOnly: true },
  { href: "/customers", label: "Customers", icon: icons.user },
  { href: "/membership", label: "Membership", icon: icons.idcard },
  { href: "/tournaments", label: "Tournaments", icon: icons.trophy },
  { href: "/teams", label: "Teams & Challenges", icon: icons.swords },
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
  const [openGroups, setOpenGroups] = useState<string[]>([]); // every section dropdown starts closed
  const [frequentsOpen, setFrequentsOpen] = useState(false);
  const [fresh, setFresh] = useState(false);
  // "Refresh": the page in front of you loads its numbers again, right here (no browser reload, you stay signed in and on the same page)
  const [pageKey, setPageKey] = useState(0);
  // the profile menu: opened by tapping the profile picture
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const down = (e: MouseEvent) => { if (menuBox.current && !menuBox.current.contains(e.target as Node)) setMenuOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [menuOpen]);
  const [spinning, setSpinning] = useState(false);
  const refreshPage = () => {
    setSpinning(true);
    router.refresh();
    setPageKey((k) => k + 1);
    setTimeout(() => setSpinning(false), 700);
  };
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
    refreshAdmin().then((a) => { if (live && a?.role === "organizer") router.replace("/organizer"); }).catch(() => {}).finally(() => { if (live) setFresh(true); });
    return () => { live = false; };
  }, [ready]);

  if (!ready || !fresh) return <div className="grid min-h-screen place-items-center text-sm text-muted">Loading…</div>;

  const visible = frequents.filter((f) => canSeePage(f.href.slice(1)));
  const who = admin?.role === "owner" ? "Owner" : admin?.role === "admin" ? "Admin" : "Staff";
  const avatar = photo === undefined ? admin?.avatar ?? null : photo;
  const initials = (admin?.name ?? who).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || who[0];
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const link = (href: string, label: string, Icon: React.ElementType, n?: number) => (
    <Link key={href} href={href} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${isActive(href) ? "bg-(--nav-ink)/10 font-semibold text-(--nav-ink)" : "text-(--nav-ink)/80 hover:bg-(--nav-ink)/5 hover:text-(--nav-ink)"}`}>
      {n !== undefined && <span aria-hidden className="w-5 shrink-0 text-right text-xs font-bold tabular-nums opacity-70">{n}.</span>}
      <Icon size={18} className="shrink-0" /> {label}
    </Link>
  );

  const nav = (href: string, label: string, Icon: React.ElementType) => (
    <Link href={href} className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 whitespace-nowrap py-2 text-[11px] ${isActive(href) ? "font-semibold text-white" : "text-white/70"}`}>
      <span className={`grid h-8 w-10 place-items-center rounded-xl ${isActive(href) ? "bg-white/15" : ""}`}><Icon size={20} /></span>
      {label}
    </Link>
  );

  const toggleGroup = (g: string) => setOpenGroups((o) => (o.includes(g) ? o.filter((x) => x !== g) : [...o, g]));

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
        <header className="sticky top-0 z-30 flex h-auto min-h-16 min-w-0 flex-wrap items-center md:flex-nowrap pb-2 pt-[max(calc(env(safe-area-inset-top)_-_0.625rem),0.5rem)] md:h-16 md:pb-0 md:pt-0 justify-between gap-3 bg-(--nav-wash) backdrop-blur-md pl-2 pr-4 text-(--nav-ink) lg:col-span-2 lg:pl-3 lg:pr-8">
          {/* the logo and name reload the portal from its home page (a plain link, not a client-side one, so it is a real restart) */}
          <a href={withBase("/")} aria-label="Unique Futsal, reload the portal" className="flex shrink-0 items-center gap-3 pr-2 text-(--nav-ink) no-underline">
            {/* the player alone, turned white for the navy bar */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.png" alt="" aria-hidden data-nav-logo className="h-9 w-auto brightness-0" />
            <span className="text-[11px] font-extrabold leading-[1.15] tracking-[0.14em] sm:hidden">UNIQUE<br />FUTSAL</span>
            <span className="hidden text-sm font-bold tracking-wide sm:inline">UNIQUE FUTSAL</span>
          </a>
          <span aria-hidden className="hidden h-8 w-px shrink-0 bg-(--nav-ink)/30 sm:block" />
          {/* the frequent pages as icons, on every page, for quick switching (the name shows on hover or long press) */}
          {/* the Dashboard is the page of shortcuts itself, so the icon row is not shown there */}
          {!pathname.startsWith("/dashboard") && (
            <nav aria-label="Frequent pages" className="order-last mx-0 flex min-w-0 basis-full md:order-none md:flex-1 md:basis-auto items-center justify-between gap-1.5 overflow-x-auto py-1 max-md:-mr-2 md:mx-3 md:justify-center md:gap-2.5 md:[mask-image:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                    className={`relative ${f.deskOnly ? "max-md:hidden " : ""}grid h-9 w-9 shrink-0 place-items-center rounded-xl md:h-11 md:w-11 md:rounded-2xl transition ${on ? "bg-[#f5822a] text-white shadow-lg ring-[#f5822a]" : "text-(--nav-ink) hover:bg-(--nav-ink)/5"}`}
                  >
                    <f.icon size={18} className="md:h-[22px] md:w-[22px]" />
                    {n > 0 && <span className="absolute -right-1.5 -top-1.5 grid min-w-[20px] place-items-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-5 text-white ring-2 ring-white">{n > 9 ? "9+" : n}</span>}
                  </Link>
                );
              })}
            </nav>
          )}
          <div className="flex shrink-0 items-center gap-3 pl-0 max-md:ml-auto md:pl-4">
            <div ref={menuBox} className="relative shrink-0">
              <button type="button" onClick={() => setMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={menuOpen} title={`${admin?.name ?? who} (${who})`} aria-label={`Profile menu: ${admin?.name ?? who}, ${who}`} className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-[#0c0b5d] ring-2 ring-white md:h-11 md:w-11">
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-sm font-bold text-white">{initials}</span>
                )}
              </button>
              <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Choose profile picture" onChange={(e) => { void choosePhoto(e.target.files?.[0]); e.target.value = ""; }} />
              {menuOpen && (
                <div role="menu" aria-label="Profile" className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-line bg-surface p-2 text-foreground shadow-xl">
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-[#0c0b5d] text-sm font-bold text-white">
                      {avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatar} alt="" className="h-full w-full object-cover" />
                      ) : initials}
                    </span>
                    <span className="min-w-0"><span className="block truncate text-sm font-bold">{admin?.name ?? who}</span><span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${who === "Staff" ? "bg-slate-500/15 text-slate-700" : "bg-brand/15 text-brand"}`}>{who}</span></span>
                  </div>
                  <div className="my-1 border-t border-line" />
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); picker.current?.click(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold hover:bg-surface-2"><Camera size={17} className="text-muted" /> Change picture</button>
                  <LockButton row onLocked={() => setMenuOpen(false)} />
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); logout(); router.replace("/login"); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-red-600 hover:bg-red-500/10"><LogOut size={17} /> Sign out</button>
                </div>
              )}
              {photoErr && <p role="alert" className="absolute right-0 top-full z-40 mt-2 w-56 rounded-xl bg-surface p-2.5 text-xs font-medium text-red-600 shadow-lg">{photoErr}</p>}
            </div>
            <button type="button" onClick={refreshPage} title="Refresh this page" aria-label="Refresh this page" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white shadow-md transition hover:bg-emerald-700 md:h-11 md:w-11 md:rounded-2xl">
              <RefreshCw size={18} className={`md:h-[22px] md:w-[22px] ${spinning ? "animate-spin" : ""}`} />
            </button>
              <NotificationBell />
          </div>
        </header>
      {ready && <LockScreen onSignOut={() => { logout(); router.replace("/login"); }} />}
      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-(--nav-ink)/20 bg-transparent p-4 text-(--nav-ink) transition-transform lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:row-start-2 lg:col-start-1 lg:w-auto lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="mb-4 flex justify-end lg:hidden">
          <button onClick={() => setOpen(false)} aria-label="Close menu"><X size={20} /></button>
        </div>
        <nav className="flex-1 divide-y divide-(--nav-ink)/15 overflow-y-auto border-y border-(--nav-ink)/15">
          {canSeePage("dashboard") && (
            <Link href="/dashboard" onClick={() => setOpen(false)} className="flex items-center gap-3 px-2 py-3 text-base font-bold text-(--nav-ink) transition hover:bg-(--nav-ink)/5">
              <LayoutDashboard size={22} /> Dashboard
            </Link>
          )}
          <div>
            <button onClick={() => setFrequentsOpen((v) => !v)} aria-expanded={frequentsOpen} className="flex w-full items-center gap-3 px-2 py-3 text-base font-bold text-(--nav-ink) transition hover:bg-(--nav-ink)/5">
              <Star size={22} /> Frequents
              <ChevronDown size={16} className={`ml-auto transition-transform ${frequentsOpen ? "rotate-180" : ""}`} />
            </button>
            {frequentsOpen && <div className="space-y-0.5 pb-2">{visible.map((f, i) => link(f.href, f.label, f.icon, i + 1))}</div>}
          </div>
          {/* one dropdown per section (Operations, Customers, Admin ...), styled like the Frequents one */}
          {groups.map((g) => {
            const items = modules.filter((m) => m.group === g && canSeePage(m.slug) && !frequents.some((f) => f.href === `/${m.slug}`));
            if (!items.length) return null;
            const Icon = GROUP_ICON[g] ?? LayoutGrid;
            const isOpen = openGroups.includes(g);
            return (
              <div key={g}>
                <button onClick={() => toggleGroup(g)} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-2 py-3 text-base font-bold text-(--nav-ink) transition hover:bg-(--nav-ink)/5">
                  <Icon size={22} /> {g}
                  <ChevronDown size={16} className={`ml-auto transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && <div className="space-y-0.5 pb-2">{items.map((m, i) => link(`/${m.slug}`, m.title, icons[m.icon], i + 1))}</div>}
              </div>
            );
          })}
        </nav>
        <div className="shrink-0 px-2 py-3 text-(--nav-ink)">
          <div className="flex items-center justify-between gap-2">
          <LockButton />
          <SirenToggle up />
          <ThemeToggle />
          </div>
        </div>
        <button onClick={() => { logout(); router.replace("/login"); }} className="mt-3 flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-red-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700">
          <LogOut size={18} /> Sign out
        </button>
      </aside>

      <div className="flex min-w-0 flex-col lg:col-start-2 lg:row-start-2">
        <main key={pageKey} className="mx-auto w-full max-w-[1400px] p-4 pb-28 lg:p-8 lg:pb-10">{children}</main>
        <DeniedDialog />
        <ReminderPopup />
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-end bg-[#0c0b5d] px-2 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-1 shadow-xl lg:hidden">
        {canSeePage("dashboard") && nav("/dashboard", "Dashboard", LayoutDashboard)}
        {canSeePage("bookings") && nav("/bookings", "Bookings", icons.wallet)}
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
