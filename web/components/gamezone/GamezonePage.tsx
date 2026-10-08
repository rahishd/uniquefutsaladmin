"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Gamepad2, Phone, Plus, Search } from "lucide-react";
import { Badge } from "../bookings/Badge";
import NewSessionModal from "./NewSessionModal";
import GamezoneTab from "../courts/GamezoneTab";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { prettyDate, rs } from "@/lib/bookings";
import { shiftDate, todayKey } from "@/lib/slots";
import {
  GzDay, GzList, GzScope, GzSession, PAGE_SIZE, PAY, STATUS, cancelGz, canCancel, canClose, completeGz, getGzDay, listGzSessions, markGzPaid, owes, timeSpan,
} from "@/lib/gamezone";

const TABS = [
  { id: "board", label: "Day board" },
  { id: "sessions", label: "All sessions" },
  { id: "setup", label: "Rates & games" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const REFRESH_MS = 20000;
const input = "rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";

// The three things staff do to a session. Each checks the permission first, asks once, then reloads.
function useActions(onDone: () => void, setError: (m: string) => void) {
  return useCallback(async (s: GzSession, kind: "pay" | "done" | "cancel") => {
    const perm = kind === "pay" ? "gamezone.collect" : "gamezone.manage";
    if (!guard(perm)) return;
    const who = s.customerName || "this customer";
    const ask = kind === "pay" ? `Mark ${rs(s.total)} as received from ${who}?` : kind === "done" ? `Mark ${s.code} as completed?` : `Cancel ${s.code} for ${who}? The console hour is freed${s.paymentStatus === "paid" ? " and a refund becomes due" : ""}, and the customer is told.`;
    if (!window.confirm(ask)) return;
    setError("");
    try {
      await (kind === "pay" ? markGzPaid(s.code) : kind === "done" ? completeGz(s.code) : cancelGz(s.code));
      onDone();
    } catch (e) { setError(e instanceof ApiError ? e.message : "That did not save"); }
  }, [onDone, setError]);
}

type Act = (s: GzSession, kind: "pay" | "done" | "cancel") => void;

function Buttons({ s, act }: { s: GzSession; act: Act }) {
  const b = "rounded-full px-3 py-1.5 text-xs font-semibold";
  return (
    <span className="flex flex-wrap gap-2">
      {owes(s) && <button onClick={() => act(s, "pay")} className={`${b} bg-brand text-white`}>Mark paid</button>}
      {canClose(s) && <button onClick={() => act(s, "done")} className={`${b} bg-surface-2`}>Complete</button>}
      {canCancel(s) && <button onClick={() => act(s, "cancel")} className={`${b} bg-red-500/10 text-red-600`}>Cancel</button>}
    </span>
  );
}

function Card({ s, act, showDate }: { s: GzSession; act: Act; showDate?: boolean }) {
  const st = STATUS[s.status] ?? { label: s.status, tone: "bg-surface-2 text-muted" };
  const pay = PAY[s.paymentStatus] ?? { label: s.paymentStatus, tone: "bg-surface-2 text-muted" };
  return (
    <li className={`space-y-3 rounded-2xl bg-surface p-4 shadow-sm ${s.status === "cancelled" ? "opacity-70" : ""}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"><Gamepad2 size={20} /></span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 break-words font-semibold">{s.customerName || "Guest"}{!s.registered && <span className="ml-2 text-xs font-medium text-muted">Guest</span>}</p>
          <p className="text-sm text-muted">{showDate && <>{prettyDate(s.date)} · </>}{timeSpan(s)} · {s.consoleName}</p>
          <p className="text-xs text-muted">{s.gameTitle} · {s.players} {s.players === 1 ? "player" : "players"} · {s.hours} {s.hours === 1 ? "hour" : "hours"} · <span className="font-mono">{s.code}</span></p>
        </div>
        <p className="shrink-0 font-bold">{rs(s.total)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
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
  const act = useActions(reload, setError);

  useEffect(() => {
    let live = true;
    const load = () => getGzDay(date).then((d) => { if (live) { setDay(d); setError((e) => (e.startsWith("Could not") ? "" : e)); } }).catch((e) => { if (live) setError(e instanceof Error ? `Could not load: ${e.message}` : "Could not load Gamezone"); });
    load();
    const id = date === todayKey() ? setInterval(load, REFRESH_MS) : undefined;
    return () => { live = false; if (id) clearInterval(id); };
  }, [date, tick]);

  const go = (d: string) => { setDay(null); setDate(d); };
  const t = day?.totals;
  const consoles = day ? day.consoles.filter((c) => c.active || day.items.some((i) => i.consoleId === c.id)) : [];

  return (
    <div className="space-y-4">
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
  const act = useActions(reload, setError);

  useEffect(() => {
    const id = setTimeout(() => { setQ(search.trim()); setPageNo(1); }, 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    let live = true;
    listGzSessions({ scope, page: pageNo, q })
      .then((d) => { if (live) { setData(d); setError(""); } })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load sessions"); });
    return () => { live = false; };
  }, [scope, pageNo, q, tick]);

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-4">
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
    </div>
  );
}

export default function GamezonePage() {
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
