"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { rs } from "@/lib/bookings";
import { DEFAULT_GZ_PLANS, GzCatalog, getGzCatalog } from "@/lib/courts";
import { GzCustomer, createGzSession, searchGzCustomers } from "@/lib/gamezone";
import { todayKey } from "@/lib/slots";

const input = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const h12 = (h: number) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "AM" : "PM"}`;
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6 AM to 11 PM start

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block space-y-1"><span className="text-xs font-semibold text-muted">{label}</span>{children}</label>
);

// Staff book a Gamezone session for someone at the desk or on the phone. Price comes from the rates; the server checks the console is free.
export default function NewSessionModal({ date: initialDate, onClose, onDone }: { date: string; onClose: () => void; onDone: () => void }) {
  const [cat, setCat] = useState<GzCatalog | null>(null);
  const [date, setDate] = useState(initialDate || todayKey());
  const [consoleId, setConsoleId] = useState("");
  const [game, setGame] = useState("");
  const [startHour, setStartHour] = useState(Math.min(21, Math.max(10, new Date().getHours() + 1)));
  const [hours, setHours] = useState(1);
  const [players, setPlayers] = useState(1);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [paid, setPaid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<{ code: string; total: number } | null>(null);
  const [linked, setLinked] = useState<GzCustomer | null>(null); // a registered customer picked from the suggestions
  const [field, setField] = useState<"name" | "phone" | null>(null); // which box the suggestions belong to
  const [hits, setHits] = useState<GzCustomer[]>([]);

  // Suggest registered customers while staff type a name or a number. Typing again clears the link, so the session
  // is only tied to an account when a suggestion was chosen or the number typed is exactly theirs.
  useEffect(() => {
    const q = (field === "phone" ? phone : name).trim();
    if (!field || linked || q.length < 2) { setHits([]); return; }
    let live = true;
    const t = setTimeout(() => {
      searchGzCustomers(q).then((r) => { if (live) setHits(r.items); }).catch(() => { if (live) setHits([]); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [field, name, phone, linked]);

  function pick(c: GzCustomer) {
    setLinked(c);
    setName(c.name ?? c.phoneNumber);
    setPhone(c.phoneNumber);
    setHits([]);
  }

  useEffect(() => {
    getGzCatalog()
      .then((c) => {
        setCat(c);
        setConsoleId((c.consoles.find((x) => x.active) ?? c.consoles[0])?.id ?? "");
        setGame((c.games.find((x) => x.active) ?? c.games[0])?.name ?? "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load consoles and games"));
  }, []);

  const plans = cat && cat.plans.length ? cat.plans : DEFAULT_GZ_PLANS;
  const rate = plans.find((p) => p.players === players)?.ratePerPersonHour ?? 0;
  const total = rate * players * hours;
  const phoneOk = phone === "" || /^9\d{9}$/.test(phone);
  const ready = Boolean(consoleId && game && name.trim().length >= 2 && phoneOk && startHour + hours <= 24);

  async function save() {
    if (!guard("gamezone.manage")) return;
    setBusy(true);
    setError("");
    try {
      const r = await createGzSession({ consoleId, gameTitle: game, date, startHour, hours, players, customerName: name.trim(), customerPhone: phone || undefined, paid });
      setSaved(r);
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not book the session");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label="Book a Gamezone session" onClick={(e) => e.stopPropagation()} className="max-h-[94vh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">Book a Gamezone session</h2>
            <p className="text-sm text-muted">For someone at the desk or on the phone.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-surface-2"><X size={20} /></button>
        </div>

        {saved ? (
          <div className="grid place-items-center gap-3 py-4 text-center">
            <p className="font-bold text-brand">Session booked · <span className="font-mono">{saved.code}</span></p>
            <p className="text-sm text-muted">{rs(saved.total)} {paid ? "received" : "to collect at the venue"}</p>
            <button onClick={onClose} className="w-full rounded-xl border border-line py-3 font-semibold">Done</button>
          </div>
        ) : (
          <>
            <div className="relative space-y-4" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setTimeout(() => setField(null), 100); }}>
              <Field label="Customer name">
                <input className={input} value={name} maxLength={60} autoComplete="off" onFocus={() => setField("name")}
                  onChange={(e) => { setName(e.target.value); setLinked(null); setField("name"); }} placeholder="Type a name to find a registered customer" />
              </Field>
              <Field label="Mobile number (optional, links to their account)">
                <input className={input} inputMode="numeric" value={phone} autoComplete="off" onFocus={() => setField("phone")}
                  onChange={(e) => { setPhone(e.target.value.replace(/\D/g, "").slice(0, 10)); setLinked(null); setField("phone"); }} placeholder="98XXXXXXXX" />
                {!phoneOk && <span className="text-xs text-red-600">A 10-digit number starting with 9</span>}
              </Field>
              {linked && <p className="rounded-xl bg-brand/10 px-3 py-2 text-xs font-semibold text-brand">Registered customer: {linked.name ?? linked.phoneNumber} · {linked.phoneNumber}. This session will show on their account.</p>}
              {field && hits.length > 0 && (
                <ul className={`absolute left-0 right-0 z-10 max-h-56 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-lg ${field === "phone" ? "top-[8.5rem]" : "top-[4.5rem]"}`} role="listbox" aria-label="Registered customers">
                  {hits.map((c) => (
                    <li key={c.phoneNumber}>
                      <button type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(c)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2">
                        <span className="min-w-0 truncate font-semibold">{c.name ?? "Customer"}</span>
                        <span className="shrink-0 text-xs text-muted">{c.phoneNumber}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date"><input type="date" className={input} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></Field>
              <Field label="Start time">
                <select className={input} value={startHour} onChange={(e) => setStartHour(Number(e.target.value))}>{HOURS.map((h) => <option key={h} value={h}>{h12(h)}</option>)}</select>
              </Field>
              <Field label="Console">
                <select className={input} value={consoleId} onChange={(e) => setConsoleId(e.target.value)}>{cat?.consoles.map((c) => <option key={c.id} value={c.id}>{c.name}{c.active ? "" : " (hidden)"}</option>)}</select>
              </Field>
              <Field label="Game">
                <select className={input} value={game} onChange={(e) => setGame(e.target.value)}>{cat?.games.map((g) => <option key={g.id} value={g.name}>{g.name}</option>)}</select>
              </Field>
              <Field label="Players">
                <select className={input} value={players} onChange={(e) => setPlayers(Number(e.target.value))}>{plans.map((p) => <option key={p.players} value={p.players}>{p.label} ({p.players})</option>)}</select>
              </Field>
              <Field label="Hours">
                <select className={input} value={hours} onChange={(e) => setHours(Number(e.target.value))}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} {n === 1 ? "hour" : "hours"}</option>)}</select>
              </Field>
            </div>

            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} /> Already paid (cash at venue)</label>
            <p className="rounded-xl bg-surface-2 p-3 text-sm">Total <strong className="text-lg">{rs(total)}</strong> <span className="text-muted">· {rs(rate)} × {players} {players === 1 ? "player" : "players"} × {hours} h</span></p>
            {date < todayKey() && <p className="text-xs text-muted">This date has passed, so the session is saved as completed.</p>}
            {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
            <button onClick={save} disabled={busy || !ready} className="w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-50">{busy ? "Booking…" : "Book session"}</button>
          </>
        )}
      </div>
    </div>
  );
}
