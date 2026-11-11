"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, Eye, EyeOff, LayoutDashboard, Loader2, Lock, Network, Radio, UserRound, Users } from "lucide-react";
import TieSheetTab from "./TieSheetTab";
import DashboardTab, { type DashView } from "./DashboardTab";
import LiveTab from "./LiveTab";
import { TeamsTab } from "./SimpleTabs";
import { ApiError, getToken } from "@/lib/api";
import { currentAdmin, loginOrganizer, logout } from "@/lib/auth";
import { fmtDay, h12 } from "@/lib/hosted-tournaments";
import { OrgMe, OrgTeam, OrgTournament, orgMe, orgTeams } from "@/lib/organizer";

// The Tournament Organizer app (opened at /organizer). A staff-made "Unique Futsal ID" (the account's email) and password sign in; the
// account sees only the tournaments the venue gave it. The footer holds the four sections of the app: the Dashboard (the tournament, the prize pool, the rules, the bill and the account), Live, the Teams and the Tie-sheet.
type Tab = "dashboard" | "tiesheet" | "live" | "teams";
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "live", label: "Live", icon: Radio },
  { id: "teams", label: "Teams", icon: Users },
  { id: "tiesheet", label: "Tie-sheet", icon: Network },
];
const STATE: Record<OrgTournament["state"], { label: string; tone: string }> = {
  upcoming: { label: "Upcoming", tone: "bg-white/20 text-white" },
  live: { label: "Live now", tone: "bg-rose-500 text-white" },
  completed: { label: "Finished", tone: "bg-white/20 text-white" },
};
const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");

function Logo({ className = "h-9" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo-mark.png" alt="Unique Futsal" className={`${className} w-auto brightness-0 invert`} />;
}

/* ---------------- sign-in ---------------- */
function SignIn({ onDone, notice }: { onDone: () => void; notice?: string }) {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(notice ?? "");

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (busy) return;
    setBusy(true); setErr("");
    try {
      const a = await loginOrganizer(id.trim(), pw);
      if (a.role !== "organizer") { logout(); setErr("This app is for Tournament Organizers. Staff sign in to the admin portal."); return; }
      onDone();
    } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }

  const box = "flex items-center gap-3 rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-[#0c0b5d] transition focus-within:border-[#0c0b5d] focus-within:ring-4 focus-within:ring-[#0c0b5d]/10";
  return (
    <main className="min-h-dvh bg-white text-[#0c0b5d]" style={{ colorScheme: "light" }}>
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
        {/* dark blue header with the logo */}
        <header className="relative overflow-hidden rounded-b-[2.5rem] bg-[linear-gradient(160deg,#0b1f4d_0%,#0a1b44_60%,#081738_100%)] px-6 pb-12 pt-[max(env(safe-area-inset-top),2.5rem)] text-center text-white shadow-[0_18px_40px_-18px_rgba(12,11,93,0.6)]">
          <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.12]" viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice" fill="none" stroke="#fff" strokeWidth="1.5">
            {[0, 1, 2, 3].map((i) => <path key={i} d={`M ${-20 + i * 30} 320 Q ${140 + i * 40} ${60 + i * 20} ${380 + i * 20} -10`} />)}
          </svg>
          <div className="relative flex flex-col items-center">
            <span className="grid h-24 w-24 place-items-center rounded-full bg-white/10 ring-1 ring-white/20"><Logo className="h-14" /></span>
            <h1 className="mt-5 text-[1.7rem] font-extrabold leading-tight tracking-tight">Tournament Organizer</h1>
            <p className="mt-1 text-sm font-medium uppercase tracking-[0.25em] text-white/70">Unique Futsal</p>
          </div>
        </header>

        <form onSubmit={submit} className="flex flex-1 flex-col gap-4 px-6 pb-10 pt-8" noValidate>
          <div>
            <h2 className="text-xl font-extrabold">Welcome</h2>
            <p className="mt-1 text-sm text-slate-500">Sign in with your Unique Futsal ID (email or mobile number) and your password.</p>
          </div>
          <label className={box}><UserRound size={19} className="shrink-0 text-slate-400" />
            <input value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" inputMode="email" placeholder="Unique Futsal ID" aria-label="Unique Futsal ID" autoCapitalize="none" className="w-full bg-transparent text-base text-[#0c0b5d] outline-none placeholder:text-slate-400" /></label>
          <label className={box}><Lock size={19} className="shrink-0 text-slate-400" />
            <input value={pw} onChange={(e) => setPw(e.target.value)} type={show ? "text" : "password"} autoComplete="current-password" placeholder="Password" aria-label="Password" className="w-full bg-transparent text-base text-[#0c0b5d] outline-none placeholder:text-slate-400" />
            <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} className="shrink-0 text-slate-400">{show ? <EyeOff size={19} /> : <Eye size={19} />}</button></label>
          {err && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{err}</p>}
          <button type="submit" disabled={busy || !id.trim() || !pw} className="mt-1 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0c0b5d] px-5 py-4 text-base font-bold text-white shadow-[0_12px_24px_-10px_rgba(12,11,93,0.7)] transition active:scale-[0.99] disabled:opacity-50">{busy && <Loader2 size={18} className="animate-spin" />} Sign in</button>
          <p className="mt-auto pt-6 text-center text-xs text-slate-500">Registered a tournament with the venue? Use the mobile number and password of your Unique Futsal account. Forgot it?<b className="mt-1 block text-sm font-bold text-slate-700">Ask the venue.</b></p>
        </form>
      </div>
    </main>
  );
}

/* ---------------- the app ---------------- */
export default function OrganizerApp() {
  const [me, setMe] = useState<OrgMe | null>(null);
  const [phase, setPhase] = useState<"loading" | "signin" | "ready">("loading");
  const [tid, setTid] = useState("");
  const [tab, setTab] = useState<Tab>("dashboard");
  const [dashView, setDashView] = useState<DashView>(""); // the Dashboard page that is open (the Back button returns to the four icons)
  const [teams, setTeams] = useState<OrgTeam[] | null>(null);
  const [maxTeams, setMaxTeams] = useState(0);
  const [error, setError] = useState("");

  const open = useCallback(async () => {
    try {
      const m = await orgMe();
      setMe(m); setTid((cur) => (m.tournaments.some((t) => t.id === cur) ? cur : m.tournaments[0]?.id ?? "")); setPhase("ready");
    } catch (e) {
      if (!(e instanceof ApiError && (e.status === 401 || e.status === 403))) setError(msg(e));
      setPhase("signin");
    }
  }, []);

  useEffect(() => {
    // someone signed in as portal staff gets the sign-in screen again; an organizer opens straight in
    const t = setTimeout(() => { if (getToken() && currentAdmin()?.role === "organizer") void open(); else setPhase("signin"); }, 0);
    return () => clearTimeout(t);
  }, [open]);

  // the registered teams of the chosen tournament (the tie-sheet suggests them, the Teams page lists them)
  const reloadTeams = useCallback(() => {
    if (!tid) return;
    orgTeams(tid).then((r) => { setTeams(r.items); setMaxTeams(r.maxTeams); }).catch(() => setTeams([]));
  }, [tid]);
  useEffect(() => {
    const t = setTimeout(() => { setTeams(null); reloadTeams(); }, 0);
    return () => clearTimeout(t);
  }, [reloadTeams]);

  // New teams: the Teams tab blinks while a team registered that the organizer has not seen yet. What is on the Teams page counts as seen,
  // kept per tournament in this phone's browser. The first time ever, the teams that are already there count as seen.
  const seenKey = `uf-org-seen-${tid}`;
  const [seen, setSeen] = useState<string[] | null | undefined>(undefined); // undefined: not read yet, null: nothing kept yet
  const markSeen = useCallback((ids: string[]) => {
    try { localStorage.setItem(seenKey, JSON.stringify(ids)); } catch { /* private mode: it just blinks again */ }
    setSeen(ids);
  }, [seenKey]);
  useEffect(() => {
    const t = setTimeout(() => {
      try { const raw = localStorage.getItem(seenKey); setSeen(raw ? (JSON.parse(raw) as string[]) : null); } catch { setSeen(null); }
    }, 0);
    return () => clearTimeout(t);
  }, [seenKey]);
  useEffect(() => {
    if (!teams || seen === undefined) return;
    const h = setTimeout(() => { if (seen === null || tab === "teams") markSeen(teams.map((x) => x.id)); }, 0);
    return () => clearTimeout(h);
  }, [teams, seen, tab, markSeen]);
  const newTeams = teams && seen ? teams.filter((x) => !seen.includes(x.id)).length : 0;
  // look for new registrations every half minute while the app is open
  useEffect(() => {
    const h = setInterval(() => { if (document.visibilityState === "visible") reloadTeams(); }, 30_000);
    return () => clearInterval(h);
  }, [reloadTeams]);

  if (phase === "loading") return <main className="grid min-h-dvh place-items-center bg-header text-white"><Loader2 className="animate-spin" /></main>;
  if (phase === "signin" || !me) return <SignIn onDone={() => { setPhase("loading"); void open(); }} notice={error} />;

  const t = me.tournaments.find((x) => x.id === tid);
  const days = t?.days ?? [];
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col bg-background">
      <header className="sticky top-0 z-30 bg-header px-4 pb-4 pt-[max(env(safe-area-inset-top),0.75rem)] text-white shadow-lg">
        <div className="flex items-center gap-3">
          <Logo />
          <div className="min-w-0 flex-1 leading-tight"><p className="text-[11px] uppercase tracking-widest text-white/60">Unique Futsal</p><p className="text-sm font-bold">Tournament Organizer</p></div>
          {t && <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATE[t.state].tone}`}>{STATE[t.state].label}</span>}
        </div>

        {/* the tournament's details card is only on the Tournament page of the Dashboard; every other page keeps just a small switch when there is more than one tournament */}
        {t && !(tab === "dashboard" && dashView === "tournament") ? (
          me.tournaments.length > 1 && (
            <select value={tid} onChange={(e) => setTid(e.target.value)} aria-label="Tournament" className="mt-3 w-full rounded-xl bg-white/15 px-3 py-2 text-sm font-bold text-white outline-none">
              {me.tournaments.map((x) => <option key={x.id} value={x.id} className="text-black">{x.name}</option>)}
            </select>
          )
        ) : t ? (
          <div className="mt-3 space-y-2 rounded-2xl bg-white/10 p-3.5">
            {me.tournaments.length > 1 ? (
              <select value={tid} onChange={(e) => setTid(e.target.value)} aria-label="Tournament" className="w-full rounded-xl bg-white/15 px-3 py-2 text-base font-bold text-white outline-none">
                {me.tournaments.map((x) => <option key={x.id} value={x.id} className="text-black">{x.name}</option>)}
              </select>
            ) : <h1 className="text-lg font-extrabold leading-snug">{t.name}</h1>}
            <p className="flex items-center gap-2 text-xs text-white/80"><CalendarDays size={14} /> {t.startDate === t.endDate ? fmtDay(t.startDate) : `${fmtDay(t.startDate)} to ${fmtDay(t.endDate)}`}</p>
            {days.length > 0 && <p className="text-xs text-white/70">{days.map((d) => `${h12(d.startHour)} to ${h12(d.endHour)}`).filter((v, i, a) => a.indexOf(v) === i).join(" · ")} · {teams ? `${teams.filter((x) => x.status === "approved").length} teams` : "..."}</p>}
            {t.hostName && <p className="text-xs text-white/70">Organizer: {t.hostName}</p>}
          </div>
        ) : <p className="mt-3 rounded-2xl bg-white/10 p-3.5 text-sm">No tournament is assigned to this account yet. Ask the venue.</p>}
      </header>

      <main className="flex flex-1 flex-col px-4 pb-28 pt-4">
        {tab === "dashboard" && <DashboardTab me={me} t={t} teams={teams} maxTeams={maxTeams} onMaxTeams={(n) => { setMaxTeams(n); setMe((m) => (m ? { ...m, tournaments: m.tournaments.map((x) => (x.id === tid ? { ...x, maxTeams: n } : x)) } : m)); }} onMe={setMe} onSignOut={() => { setMe(null); setPhase("signin"); }} view={dashView} setView={setDashView} />}
        {t && tab === "live" && <LiveTab key={t.id} tournament={t} />}
        {t && tab === "tiesheet" && <TieSheetTab key={t.id} tournament={t} teams={teams ?? []} />}
        {t && tab === "teams" && <TeamsTab tid={t.id} teams={teams} max={maxTeams} onChanged={reloadTeams} />}
        {!t && <p className="py-16 text-center text-sm text-muted">Nothing to show yet.</p>}
        <footer className="mt-auto pt-10 text-center text-[11px] leading-relaxed text-muted"><p className="font-semibold">Unique Futsal Product &copy; 2027</p><p>Designed &amp; Developed By: Rahish Dumre</p></footer>
      </main>

      {/* a round Back button at the right end of the footer while a Dashboard page is open */}
      {tab === "dashboard" && dashView !== "" && (
        <button type="button" onClick={() => setDashView("")} aria-label="Back to the Dashboard" title="Back" className="fixed bottom-[calc(max(env(safe-area-inset-bottom),0.5rem)+4.75rem)] right-4 z-50 grid h-12 w-12 place-items-center rounded-full bg-[#f5822a] text-white shadow-lg ring-4 ring-white/80 transition active:scale-90">
          <ArrowLeft size={22} />
        </button>
      )}

      <nav aria-label="Organizer menu" className="fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-3xl items-stretch border-t border-white/10 bg-header px-1 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1 text-white shadow-[0_-8px_24px_rgba(0,0,0,0.25)]">
        {TABS.map(({ id, label, icon: Icon }) => {
          const on = tab === id;
          return (
            <button key={id} type="button" onClick={() => { setTab(id); if (id === "dashboard" && tab === "dashboard") setDashView(""); if (id === "teams") reloadTeams(); }} aria-current={on ? "page" : undefined} className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] ${on ? "font-bold text-white" : "text-white/65"}`}>
              <span className={`relative grid h-8 w-12 place-items-center rounded-full transition ${on ? "bg-[#f5822a] text-white shadow-md" : ""} ${id === "teams" && newTeams > 0 && !on ? "animate-pulse bg-[#f5822a]/30 text-[#f5822a] ring-2 ring-[#f5822a]" : ""}`}>
                <Icon size={20} />
                {id === "teams" && newTeams > 0 && !on && <span aria-label={`${newTeams} new team${newTeams === 1 ? "" : "s"}`} className="absolute -right-1 -top-1 grid min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-[18px] text-white ring-2 ring-[#0c0b5d]">{newTeams > 9 ? "9+" : newTeams}</span>}
              </span>
              {label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
