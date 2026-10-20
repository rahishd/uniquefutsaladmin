"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, CalendarDays, ChevronLeft, ChevronRight, Gamepad2, Phone, Play, Plus, Search, Square } from "lucide-react";
import { Badge } from "../bookings/Badge";
import CollectModal from "../payments/CollectModal";
import NewSessionModal from "./NewSessionModal";
import GamezoneTab from "../courts/GamezoneTab";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { useHighlight } from "@/lib/highlight";
import { prettyDate, rs } from "@/lib/bookings";
import { CollectTarget } from "@/lib/payments";
import { shiftDate, todayKey } from "@/lib/slots";
import {
  GzDay, GzList, GzScope, GzSession, PAGE_SIZE, PAY, STATUS, cancelGz, canCancel, canClose, canStart, completeGz, getGzDay, isRunning, listGzSessions, owes, startGz, timeSpan,
} from "@/lib/gamezone";
import { GZ_EXTRA_MAX_MIN, clockAt, getNow, hms, syncServerTime, useNow } from "@/lib/gz-clock";
import { soundReady, startSiren, stopSiren, unlockAudio } from "@/lib/gz-siren";

import { askConfirm } from "@/lib/confirm";
const TABS = [
  { id: "board", label: "Day board" },
  { id: "sessions", label: "All sessions" },
  { id: "setup", label: "Rates & games" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const REFRESH_MS = 20000;
const input = "rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";

// What staff do to a session. Each checks the permission first, then reloads.
// Start runs the clock at once; "Mark paid" opens the payment popup (cash, Fonepay QR or both); Stop / Complete and Cancel ask once.
type Kind = "start" | "pay" | "done" | "cancel";
function useActions(onDone: () => void, setError: (m: string) => void, onCollect: (s: GzSession) => void) {
  return useCallback(async (s: GzSession, kind: Kind) => {
    const perm = kind === "pay" ? "gamezone.collect" : "gamezone.manage";
    if (!guard(perm)) return;
    if (kind === "pay") return onCollect(s);
    unlockAudio(); // the click lets the browser play the alarm later
    const who = s.customerName || "this customer";
    let ask = "";
    if (kind === "done" && isRunning(s)) {
      const v = clockAt(s.clock!, getNow());
      ask = v.extraMinutes > 0
        ? `Stop ${s.code}? ${v.extraMinutes} extra ${v.extraMinutes === 1 ? "minute" : "minutes"} (${rs(v.extraCharge)}) will be added. The final bill is ${rs(s.total + v.extraCharge)}.`
        : `Stop ${s.code}? It is inside the booked time, so the bill stays ${rs(s.total)}.`;
    } else if (kind === "done") ask = `Mark ${s.code} as completed?`;
    else if (kind === "cancel") ask = `Cancel ${s.code} for ${who}? The console hour is freed${s.paymentStatus === "paid" ? " and a refund becomes due" : ""}, and the customer is told.`;
    if (ask && !(await askConfirm(ask))) return;
    setError("");
    try {
      await (kind === "start" ? startGz(s.code) : kind === "done" ? completeGz(s.code) : cancelGz(s.code));
      onDone();
    } catch (e) { setError(e instanceof ApiError ? e.message : "That did not save"); }
  }, [onDone, setError, onCollect]);
}

// "due" is what is still to collect (only the extra minutes, if the session was paid before it ran over)
const toTarget = (s: GzSession): CollectTarget => ({ kind: "gamezone", ref: s.code, code: s.code, customer: s.customerName, amount: s.due, method: s.paymentMethod, phone: s.customerPhone });

type Act = (s: GzSession, kind: Kind) => void;

function Buttons({ s, act }: { s: GzSession; act: Act }) {
  const b = "rounded-full px-3 py-1.5 text-xs font-semibold";
  const running = isRunning(s);
  return (
    <span className="flex flex-wrap gap-2">
      {canStart(s, todayKey()) && <button onClick={() => act(s, "start")} className={`${b} flex items-center gap-1.5 bg-emerald-600 text-white`}><Play size={12} fill="currentColor" /> Start</button>}
      {running && <button onClick={() => act(s, "done")} className={`${b} flex items-center gap-1.5 bg-red-600 text-white`}><Square size={11} fill="currentColor" /> Stop</button>}
      {owes(s) && <button onClick={() => act(s, "pay")} className={`${b} bg-brand text-white`}>Mark paid</button>}
      {canClose(s) && !running && <button onClick={() => act(s, "done")} className={`${b} bg-surface-2`}>Complete</button>}
      {canCancel(s) && <button onClick={() => act(s, "cancel")} className={`${b} bg-red-500/10 text-red-600`}>Cancel</button>}
    </span>
  );
}

// The live clock of a started session: time left while inside the booked hours; once it is up, the extra time and the extra charge climbing
// every minute, with the bill so far. When the session is stopped it shows what was charged.
function ClockPanel({ s, now }: { s: GzSession; now: number }) {
  const c = s.clock;
  if (!c) return null;
  const v = clockAt(c, now);
  if (!v.running) {
    return v.extraMinutes > 0
      ? <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-700">Ran {v.extraMinutes} {v.extraMinutes === 1 ? "minute" : "minutes"} over: +{rs(v.extraCharge)} added to the bill</p>
      : <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">Played within the booked time</p>;
  }
  if (v.stage === 0) {
    return (
      <div className="space-y-2 rounded-xl bg-emerald-500/10 px-3 py-2.5" role="timer" aria-label="Time left">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Time left</p>
            <p className="font-mono text-3xl font-bold tabular-nums text-emerald-700">{hms(v.remainingMs)}</p>
          </div>
          <p className="text-right text-xs text-muted">After time is up:<br /><span className="font-semibold">{rs(v.perMinute)} per minute</span></p>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-emerald-600/15"><div className="h-full rounded-full bg-emerald-600 transition-[width] duration-1000 ease-linear" style={{ width: `${Math.round(v.progress * 100)}%` }} /></div>
      </div>
    );
  }
  return (
    <div className="animate-pulse space-y-1.5 rounded-xl bg-red-600 px-3 py-2.5 text-white" role="timer" aria-label="Extra time">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide opacity-90">Time is up · extra time</p>
          <p className="font-mono text-3xl font-bold tabular-nums">+{hms(v.overMs)}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-bold uppercase tracking-wide opacity-90">Extra charge</p>
          <p className="text-3xl font-bold tabular-nums">+{rs(v.extraCharge)}</p>
        </div>
      </div>
      <p className="text-xs opacity-95">{v.extraMinutes} {v.extraMinutes === 1 ? "minute" : "minutes"} at {rs(v.perMinute)} per minute · bill so far <b>{rs(s.total + v.extraCharge)}</b></p>
      {v.stage === 2 && <p className="text-xs font-bold">Maximum extra time ({GZ_EXTRA_MAX_MIN} min) used. Stop the session.</p>}
    </div>
  );
}

// Rings the alarm while any running session on screen is out of time, until staff press Silence. It rings again if a session reaches the maximum extra time.
function useSiren(items: GzSession[]) {
  const now = useNow();
  const [quiet, setQuiet] = useState<Record<string, number>>({});
  const ringing = items.flatMap((s) => {
    if (!isRunning(s)) return [];
    const stage = clockAt(s.clock!, now).stage;
    return stage > (quiet[s.code] ?? 0) ? [{ s, stage }] : [];
  });
  const any = ringing.length > 0;
  useEffect(() => { if (any) startSiren(); else stopSiren(); }, [any]);
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); stopSiren(); };
  }, []);
  const silence = useCallback((code: string, stage: number) => setQuiet((q) => ({ ...q, [code]: stage })), []);
  return { ringing, silence };
}

function SirenBar({ ringing, silence }: { ringing: { s: GzSession; stage: number }[]; silence: (code: string, stage: number) => void }) {
  if (ringing.length === 0) return null;
  return (
    <div className="sticky top-2 z-30 space-y-2" role="alert">
      {ringing.map(({ s, stage }) => (
        <div key={s.code} className="flex flex-wrap items-center gap-3 rounded-2xl bg-red-600 px-4 py-3 text-white shadow-lg">
          <BellRing size={22} className="shrink-0 animate-bounce" />
          <p className="min-w-0 flex-1 text-sm font-bold">
            {stage === 2 ? "Maximum extra time used" : "Time is up"}: {s.consoleName} · {s.customerName || "Guest"}
            <span className="block text-xs font-medium opacity-90">Extra minutes are being charged. Stop the session when they finish.</span>
          </p>
          <button onClick={() => silence(s.code, stage)} className="rounded-full bg-white px-4 py-1.5 text-xs font-bold text-red-700">Silence</button>
        </div>
      ))}
      {!soundReady() && <p className="rounded-xl bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-800">The alarm sound is off until you click anywhere on this page once.</p>}
    </div>
  );
}

function Card({ s, act, showDate }: { s: GzSession; act: Act; showDate?: boolean }) {
  const now = useNow();
  const live = isRunning(s) ? clockAt(s.clock!, now) : null;
  const st = STATUS[s.status] ?? { label: s.status, tone: "bg-surface-2 text-muted" };
  const pay = PAY[s.paymentStatus] ?? { label: s.paymentStatus, tone: "bg-surface-2 text-muted" };
  return (
    <li data-hl={`g-${s.code}`} className={`space-y-3 rounded-2xl bg-surface p-4 shadow-sm ${s.status === "cancelled" ? "opacity-70" : ""}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"><Gamepad2 size={20} /></span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 break-words font-semibold">{s.customerName || "Guest"}{!s.registered && <span className="ml-2 text-xs font-medium text-muted">Guest</span>}</p>
          <p className="text-sm text-muted">{showDate && <>{prettyDate(s.date)} · </>}{timeSpan(s)} · {s.consoleName}</p>
          <p className="text-xs text-muted">{s.gameTitle} · {s.players} {s.players === 1 ? "player" : "players"} · {s.hours} {s.hours === 1 ? "hour" : "hours"} · <span className="font-mono">{s.code}</span></p>
        </div>
        <p className="shrink-0 text-right font-bold">{rs(s.total + (live?.extraCharge ?? 0))}{live && live.extraCharge > 0 && <span className="block text-[11px] font-semibold text-red-600">incl. +{rs(live.extraCharge)} extra</span>}</p>
      </div>
      <ClockPanel s={s} now={now} />
      <div className="flex flex-wrap items-center gap-2">
        {live && <Badge tone="bg-emerald-600 text-white">Running</Badge>}
        <Badge tone={st.tone}>{st.label}</Badge>
        <Badge tone={pay.tone}>{pay.label}</Badge>
        {s.checkedInAt && s.status === "confirmed" && <Badge tone="bg-orange-500 text-white">On the way</Badge>}
        <span className="ml-auto flex items-center gap-2">
          {s.customerPhone && <a href={`tel:${s.customerPhone}`} aria-label={`Call ${s.customerName || s.customerPhone}`} className="rounded-full bg-surface-2 p-2"><Phone size={14} /></a>}
          <Buttons s={s} act={act} />
        </span>
      </div>
    </li>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-2xl bg-surface p-3 shadow-sm">
      <p className="text-xs text-muted">{label}</p>
      <p className={`text-lg font-bold ${tone ?? ""}`}>{value}</p>
    </div>
  );
}

function DayBoard() {
  const [date, setDate] = useState(todayKey());
  const [day, setDay] = useState<GzDay | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const [collecting, setCollecting] = useState<GzSession | null>(null);
  const act = useActions(reload, setError, setCollecting);
  const siren = useSiren(day?.items ?? []);

  useEffect(() => {
    let live = true;
    const load = () => getGzDay(date).then((d) => { if (live) { syncServerTime(d.serverNow); setDay(d); setError((e) => (e.startsWith("Could not") ? "" : e)); } }).catch((e) => { if (live) setError(e instanceof Error ? `Could not load: ${e.message}` : "Could not load Gamezone"); });
    load();
    const id = date === todayKey() ? setInterval(load, REFRESH_MS) : undefined;
    return () => { live = false; if (id) clearInterval(id); };
  }, [date, tick]);

  const go = (d: string) => { setDay(null); setDate(d); };
  const t = day?.totals;
  const consoles = day ? day.consoles.filter((c) => c.active || day.items.some((i) => i.consoleId === c.id)) : [];

  return (
    <div className="space-y-4">
      <SirenBar ringing={siren.ringing} silence={siren.silence} />
      <div className="flex items-center justify-between gap-2 rounded-2xl bg-surface p-2 shadow-sm">
        <button onClick={() => go(shiftDate(date, -1))} aria-label="Previous day" className="rounded-xl p-2.5 hover:bg-surface-2"><ChevronLeft size={18} /></button>
        <label className="flex flex-1 items-center justify-center gap-2 text-sm font-semibold">
          <CalendarDays size={16} className="text-muted" />
          <input type="date" value={date} onChange={(e) => e.target.value && go(e.target.value)} aria-label="Day" className="bg-transparent text-center outline-none" />
          {date === todayKey() && <Badge tone="bg-brand/15 text-brand">Today</Badge>}
        </label>
        <button onClick={() => go(shiftDate(date, 1))} aria-label="Next day" className="rounded-xl p-2.5 hover:bg-surface-2"><ChevronRight size={18} /></button>
      </div>

      {t && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat label="Sessions" value={`${t.sessions} · ${t.hours} h`} />
          <Stat label="Received" value={rs(t.paid)} tone="text-brand" />
          <Stat label="Still to collect" value={rs(t.owed)} tone={t.owed > 0 ? "text-amber-600" : ""} />
          <Stat label="Cancelled" value={t.cancelled} />
        </div>
      )}

      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!day && !error && <p className="py-10 text-center text-sm text-muted">Loading sessions…</p>}
      {day && day.items.length === 0 && (
        <div className="grid place-items-center gap-2 rounded-2xl bg-surface py-14 text-center text-muted shadow-sm">
          <Gamepad2 size={32} strokeWidth={1.5} />
          <p>No Gamezone sessions on {prettyDate(date)}.</p>
        </div>
      )}

      {day && day.items.length > 0 && (
        <div className="grid items-start gap-4 xl:grid-cols-2">
          {consoles.map((c) => {
            const mine = day.items.filter((i) => i.consoleId === c.id);
            return (
              <section key={c.id} className="space-y-2">
                <h2 className="flex items-center gap-2 font-bold">{c.name}{!c.active && <span className="text-xs font-medium text-muted">Hidden in the app</span>}<span className="text-xs font-medium text-muted">{mine.length} {mine.length === 1 ? "session" : "sessions"}</span></h2>
                {mine.length === 0 ? <p className="rounded-2xl bg-surface p-4 text-sm text-muted shadow-sm">Free all day.</p> : <ul className="space-y-2">{mine.map((s) => <Card key={s.code} s={s} act={act} />)}</ul>}
              </section>
            );
          })}
        </div>
      )}
      {collecting && <CollectModal target={toTarget(collecting)} onClose={() => setCollecting(null)} onDone={reload} />}
    </div>
  );
}

const SCOPES: { id: GzScope; label: string }[] = [
  { id: "today", label: "Today" }, { id: "upcoming", label: "Upcoming" }, { id: "previous", label: "Previous" }, { id: "unpaid", label: "Unpaid" },
];

function Sessions() {
  const [scope, setScope] = useState<GzScope>("today");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [pageNo, setPageNo] = useState(1);
  const [data, setData] = useState<GzList | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const [collecting, setCollecting] = useState<GzSession | null>(null);
  const act = useActions(reload, setError, setCollecting);
  const siren = useSiren(data?.items ?? []);

  useEffect(() => {
    const id = setTimeout(() => { setQ(search.trim()); setPageNo(1); }, 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    let live = true;
    listGzSessions({ scope, page: pageNo, q })
      .then((d) => { if (live) { syncServerTime(d.serverNow); setData(d); setError(""); } })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load sessions"); });
    return () => { live = false; };
  }, [scope, pageNo, q, tick]);

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-4">
      <SirenBar ringing={siren.ringing} silence={siren.silence} />
      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-surface p-1 shadow-sm" role="tablist" aria-label="Sessions">
        {SCOPES.map((s) => (
          <button key={s.id} role="tab" aria-selected={scope === s.id} onClick={() => { setScope(s.id); setPageNo(1); setData(null); }}
            className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold ${scope === s.id ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}>{s.label}</button>
        ))}
      </div>
      <label className="relative block">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input value={search} onChange={(e) => { setSearch(e.target.value); setData(null); }} placeholder="Search name, phone or code" className={`${input} w-full pl-10`} />
      </label>

      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!data && !error && <p className="py-10 text-center text-sm text-muted">Loading sessions…</p>}
      {data && data.items.length === 0 && (
        <div className="grid place-items-center gap-2 rounded-2xl bg-surface py-14 text-center text-muted shadow-sm">
          <Gamepad2 size={32} strokeWidth={1.5} />
          <p>{q ? "No sessions match this search." : scope === "unpaid" ? "Nothing is waiting to be collected." : "No sessions here."}</p>
        </div>
      )}
      <ul className="grid items-start gap-2 xl:grid-cols-2">{data?.items.map((s) => <Card key={s.code} s={s} act={act} showDate />)}</ul>

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-2 text-sm">
          <button disabled={pageNo <= 1} onClick={() => { setPageNo(pageNo - 1); setData(null); }} className="flex items-center gap-1 rounded-xl bg-surface px-3 py-2 shadow-sm disabled:opacity-40"><ChevronLeft size={16} /> Previous</button>
          <span className="text-muted">Page {pageNo} of {pages} · {data.total} sessions</span>
          <button disabled={pageNo >= pages} onClick={() => { setPageNo(pageNo + 1); setData(null); }} className="flex items-center gap-1 rounded-xl bg-surface px-3 py-2 shadow-sm disabled:opacity-40">Next <ChevronRight size={16} /></button>
        </div>
      )}
      {collecting && <CollectModal target={toTarget(collecting)} onClose={() => setCollecting(null)} onDone={reload} />}
    </div>
  );
}

export default function GamezonePage() {
  useHighlight();
  const [tab, setTab] = useState<Tab>("board");
  const [booking, setBooking] = useState(false);
  const [version, setVersion] = useState(0); // bumping it reloads the board and the list after a new session
  return (
    <div className="w-full space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Gamezone (PS5)</h1>
          <p className="text-sm text-muted">Sessions on each console, collecting payment, and the rates, consoles and games customers see.</p>
        </div>
        <button onClick={() => guard("gamezone.manage") && setBooking(true)} className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16} /> New session</button>
      </div>
      {booking && <NewSessionModal date={todayKey()} onClose={() => setBooking(false)} onDone={() => setVersion((v) => v + 1)} />}
      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-surface p-1 shadow-sm" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold ${tab === t.id ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}>{t.label}</button>
        ))}
      </div>
      {tab === "board" && <DayBoard key={version} />}
      {tab === "sessions" && <Sessions key={version} />}
      {tab === "setup" && <GamezoneTab />}
    </div>
  );
}
