"use client";

import { useEffect, useState } from "react";
import { Check, Gamepad2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { rs } from "@/lib/bookings";
import { DEFAULT_GZ_PLANS, GzCatalog, getGzCatalog } from "@/lib/courts";
import { GzCustomer, GzDay, createGzSession, searchGzCustomers } from "@/lib/gamezone";
import { todayKey } from "@/lib/slots";

// The same steps the customer sees in the app (console, game, players, hours, then a free start time), for staff booking at the desk or on the
// phone. Only start times where the chosen console is free for all the hours are offered, worked out from the day's sessions.
const OPEN = 10; // sessions run 10 AM to 10 PM, like the customer app
const CLOSE = 22;
const input = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const h12 = (h: number) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "AM" : "PM"}`;

const Chip = ({ on, onClick, children, disabled }: { on: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) => (
  <button type="button" onClick={onClick} disabled={disabled} aria-pressed={on}
    className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition disabled:opacity-40 ${on ? "bg-brand text-white" : "bg-surface-2 text-foreground hover:bg-surface-2/70"}`}>{children}</button>
);
const Step = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
  <div className="space-y-1.5 sm:flex sm:items-start sm:gap-3 sm:space-y-0">
    <p className="flex shrink-0 items-center gap-2 text-sm font-semibold sm:w-28 sm:pt-1"><span className="grid h-5 w-5 place-items-center rounded-full bg-brand/10 text-[11px] font-bold text-brand">{n}</span>{title}</p>
    <div className="min-w-0 flex-1 space-y-2">
    {children}
    </div>
  </div>
);

export default function StaffBooking({ date, day, onBooked, dateControl }: { date: string; day: GzDay | null; onBooked: () => void; dateControl?: React.ReactNode }) {
  const [cat, setCat] = useState<GzCatalog | null>(null);
  const [consoleId, setConsoleId] = useState("");
  const [game, setGame] = useState("");
  const [players, setPlayers] = useState(1);
  const [hours, setHours] = useState(1);
  const [startHour, setStartHour] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [paid, setPaid] = useState(false);
  const [linked, setLinked] = useState<GzCustomer | null>(null);
  const [field, setField] = useState<"name" | "phone" | null>(null);
  const [hits, setHits] = useState<GzCustomer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ code: string; total: number } | null>(null);

  useEffect(() => {
    getGzCatalog()
      .then((c) => {
        setCat(c);
        setConsoleId((c.consoles.find((x) => x.active) ?? c.consoles[0])?.id ?? "");
        setGame((c.games.find((x) => x.active) ?? c.games[0])?.name ?? "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load consoles and games"));
  }, []);

  // suggest registered customers while staff type a name or a number
  useEffect(() => {
    const q = (field === "phone" ? phone : name).trim();
    if (!field || linked || q.length < 2) return;
    let live = true;
    const t = setTimeout(() => { searchGzCustomers(q).then((r) => { if (live) setHits(r.items); }).catch(() => { if (live) setHits([]); }); }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [field, name, phone, linked]);

  const plans = cat && cat.plans.length ? cat.plans : DEFAULT_GZ_PLANS;
  const rate = plans.find((p) => p.players === players)?.ratePerPersonHour ?? 0;
  const total = rate * players * hours;
  const consoles = (cat?.consoles ?? []).filter((c) => c.active);
  const games = (cat?.games ?? []).filter((g) => g.active);
  const pickConsole = consoles.length > 1; // with a single console there is nothing to choose, so the step is not shown
  const skip = pickConsole ? 0 : 1; // later steps move up by one number
  const nowHour = new Date().getHours();

  // a start time is free when the console has no live session in any of its hours
  const taken = new Set<number>();
  for (const s of day?.items ?? []) if (s.consoleId === consoleId && s.status !== "cancelled") for (let h = s.startHour; h < s.startHour + s.hours; h++) taken.add(h);
  const starts = Array.from({ length: CLOSE - OPEN }, (_, i) => OPEN + i).filter((h) => h + hours <= CLOSE);
  const free = (h: number) => !Array.from({ length: hours }, (_, i) => h + i).some((x) => taken.has(x)) && (date !== todayKey() || h > nowHour);
  const phoneOk = phone === "" || /^9\d{9}$/.test(phone);
  const ready = startHour !== null && free(startHour) && name.trim().length >= 2 && phoneOk && !!consoleId && !!game;

  function pickCustomer(c: GzCustomer) { setLinked(c); setName(c.name ?? c.phoneNumber); setPhone(c.phoneNumber); setHits([]); }

  async function book() {
    if (!guard("gamezone.manage") || startHour === null) return;
    setBusy(true);
    setError("");
    try {
      const r = await createGzSession({ consoleId, gameTitle: game, date, startHour, hours, players, customerName: name.trim(), customerPhone: phone || undefined, paid });
      setDone(r);
      setStartHour(null); setName(""); setPhone(""); setLinked(null); setPaid(false); setHits([]);
      onBooked();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not book the session");
    } finally {
      setBusy(false);
    }
  }

  if (!cat) return <p className="rounded-2xl bg-surface p-4 text-center text-sm text-muted shadow-sm">{error || "Loading Gamezone…"}</p>;

  return (
    <section aria-label="Book a Gamezone session" className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-3 sm:flex-1">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand/10 text-brand"><Gamepad2 size={20} /></span>
          <div className="min-w-0">
            <h2 className="font-bold">Book a Gamezone session</h2>
            <p className="text-xs text-muted">For someone at the desk or on the phone. Only free start times are shown.</p>
          </div>
        </div>
        {dateControl && <div className="sm:ml-auto sm:shrink-0">{dateControl}</div>}
      </div>

      {done && (
        <p role="status" className="flex items-center gap-2 rounded-xl bg-brand/10 p-3 text-sm font-semibold text-brand"><Check size={16} /> Booked · <span className="font-mono">{done.code}</span> · {rs(done.total)}</p>
      )}

      {pickConsole && (
        <Step n={1} title="Console">
          <div className="flex flex-wrap gap-1.5">{consoles.map((c) => <Chip key={c.id} on={consoleId === c.id} onClick={() => { setConsoleId(c.id); setStartHour(null); }}>{c.name}</Chip>)}</div>
        </Step>
      )}
      <Step n={2 - skip} title="Game">
        <div className="flex flex-wrap gap-1.5">{games.map((g) => <Chip key={g.id} on={game === g.name} onClick={() => setGame(g.name)}>{g.name}</Chip>)}</div>
      </Step>
      <Step n={3 - skip} title="Players">
        <div className="flex flex-wrap gap-1.5">{plans.map((p) => <Chip key={p.players} on={players === p.players} onClick={() => setPlayers(p.players)}>{p.label} · {rs(p.ratePerPersonHour)} each</Chip>)}</div>
      </Step>
      <Step n={4 - skip} title="Hours">
        <div className="flex flex-wrap gap-1.5">{[1, 2, 3, 4].map((n) => <Chip key={n} on={hours === n} onClick={() => { setHours(n); setStartHour(null); }}>{n} {n === 1 ? "hour" : "hours"}</Chip>)}</div>
      </Step>
      <Step n={5 - skip} title="Start time">
        {!day ? <p className="text-sm text-muted">Loading free times…</p> : !starts.some(free) ? <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">No free {hours === 1 ? "hour" : `${hours}-hour time`} on this date for this console. Pick another day{hours > 1 ? " or fewer hours" : ""}.</p> : (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {starts.filter((h) => free(h) || (startHour !== null && h > startHour && h < startHour + hours)).map((h) => { // only free times, plus the later hours of the chosen session
              const ok = free(h);
              const on = startHour === h;
              const part = startHour !== null && h > startHour && h < startHour + hours; // the later hours of the chosen session
              return (
                <button key={h} type="button" disabled={!ok} onClick={() => setStartHour(h)} aria-pressed={on}
                  className={`rounded-xl border px-3 py-1.5 text-left transition ${on || part ? "border-brand bg-brand text-white" : ok ? "border-line bg-surface hover:border-brand" : "border-line bg-surface-2 opacity-60"}`}>
                  <span className="block text-[13px] font-semibold leading-tight">{h12(h)}</span>
                  <span className={`text-[11px] ${on || part ? "text-white/80" : ok ? "text-emerald-600" : "text-muted"}`}>{part ? "In your session" : ok ? `Available · ${rs(total)}` : "Booked"}</span>
                </button>
              );
            })}
          </div>
        )}
      </Step>

      {startHour !== null && (
        <Step n={6 - skip} title="Customer">
          <div className="relative grid gap-3 sm:grid-cols-2" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setTimeout(() => setField(null), 100); }}>
            <label className="block space-y-1"><span className="text-xs font-semibold text-muted">Customer name</span>
              <input className={input} value={name} maxLength={60} autoComplete="off" placeholder="Type a name to find a registered customer" onFocus={() => setField("name")}
                onChange={(e) => { setName(e.target.value); setLinked(null); setField("name"); }} /></label>
            <label className="block space-y-1"><span className="text-xs font-semibold text-muted">Mobile number (optional, links to their account)</span>
              <input className={input} inputMode="numeric" value={phone} autoComplete="off" placeholder="98XXXXXXXX" onFocus={() => setField("phone")}
                onChange={(e) => { setPhone(e.target.value.replace(/\D/g, "").slice(0, 10)); setLinked(null); setField("phone"); }} />
              {!phoneOk && <span className="text-xs text-red-600">A 10-digit number starting with 9</span>}</label>
            {field && !linked && hits.length > 0 && (
              <ul role="listbox" aria-label="Registered customers" className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-lg">
                {hits.map((c) => (
                  <li key={c.phoneNumber}>
                    <button type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => pickCustomer(c)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2">
                      <span className="min-w-0 truncate font-semibold">{c.name ?? "Customer"}</span><span className="shrink-0 text-xs text-muted">{c.phoneNumber}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {linked && <p className="rounded-xl bg-brand/10 px-3 py-2 text-xs font-semibold text-brand">Registered customer: {linked.name ?? linked.phoneNumber} · {linked.phoneNumber}. This session will show on their account.</p>}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} /> Already paid (cash at venue)</label>
          <p className="rounded-xl bg-surface-2 p-3 text-sm">Total <strong className="text-lg">{rs(total)}</strong> <span className="text-muted">· {rs(rate)} × {players} {players === 1 ? "player" : "players"} × {hours} h · {h12(startHour)} to {h12(startHour + hours)}</span></p>
          {date < todayKey() && <p className="text-xs text-muted">This date has passed, so the session is saved as completed.</p>}
          {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
          <button type="button" onClick={book} disabled={busy || !ready} className="w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-50 sm:w-auto sm:px-10">{busy ? "Booking…" : "Book session"}</button>
        </Step>
      )}
      {startHour === null && error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
    </section>
  );
}
