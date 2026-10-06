"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { rs } from "@/lib/bookings";
import { BulkPlan, OPEN_FROM, OPEN_TO, bulkBook, findCustomer, hhmm, hourLabel, shiftDate, todayKey } from "@/lib/slots";

const input = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const PAYMENT = [
  { id: "unpaid", label: "Not paid yet (collect at the venue)", method: "venue" as const, paid: false },
  { id: "cash", label: "Paid in cash at the venue", method: "venue" as const, paid: true },
  // Fonepay is not offered here: it needs a dynamic QR, made from the booking's unpaid dues after booking
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayName = (key: string) => new Date(`${key}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });

type Pattern = "weekly" | "daily" | "pick";

// Book the same hour(s) on many dates at once: a weekly team slot, a run of days, or hand-picked dates.
export default function BulkBookModal({ startDate, onClose, onBooked }: { startDate: string; onClose: () => void; onBooked: () => void }) {
  const [pattern, setPattern] = useState<Pattern>("weekly");
  const [from, setFrom] = useState(startDate < todayKey() ? todayKey() : startDate);
  const [count, setCount] = useState("8");
  const [picked, setPicked] = useState<string[]>([]);
  const [weekDays, setWeekDays] = useState<number[]>([]); // days of the week for "Every week"; empty = the weekday of the first date
  const [pick, setPick] = useState("");
  const [hour, setHour] = useState(18);
  const [duration, setDuration] = useState(1);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [found, setFound] = useState<{ phone: string; name: string } | null>(null);
  const [payment, setPayment] = useState("unpaid");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [mode, setMode] = useState<"free" | "all">("free");
  const [plan, setPlan] = useState<(BulkPlan & { stamp: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ made: number; skipped: string[] } | null>(null);

  const n = Math.max(0, Math.min(31, Number(count) || 0));
  const firstWeekday = from ? new Date(`${from}T00:00:00Z`).getUTCDay() : 0;
  const chosenDays = weekDays.length ? weekDays : [firstWeekday];
  // every chosen weekday in each of the next n weeks, starting from the first date, at most 31 dates
  const weekly = from ? Array.from({ length: n * 7 }, (_, i) => shiftDate(from, i)).filter((d) => chosenDays.includes(new Date(`${d}T00:00:00Z`).getUTCDay())) : [];
  const dates = pattern === "weekly" ? weekly.slice(0, 31) : pattern === "daily" ? Array.from({ length: n }, (_, i) => shiftDate(from, i)) : [...picked].sort();
  const phoneOk = /^9\d{9}$/.test(phone);
  const stamp = JSON.stringify([dates, hour, duration, price]);
  const stale = !plan || plan.stamp !== stamp;
  const registered = /^9\d{9}$/.test(phone) && found?.phone === phone ? found.name : null;

  useEffect(() => {
    if (!phoneOk) return;
    let live = true;
    findCustomer(phone).then((r) => {
      const c = r.items.find((x) => x.phoneNumber === phone);
      if (!live || !c) return;
      setFound({ phone, name: c.name ?? "Registered customer" });
      if (c.name) setName((x) => x || c.name!);
    }).catch(() => {});
    return () => { live = false; };
  }, [phone, phoneOk]);

  const body = () => {
    const pay = PAYMENT.find((p) => p.id === payment)!;
    return {
      dates, startTime: hhmm(hour), duration, customerName: name.trim(), paymentMethod: pay.method, paid: pay.paid, mode,
      ...(phone ? { customerPhone: phone } : {}), ...(price !== "" ? { priceOverride: Math.round(Number(price)) } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
  };
  const check = () => {
    if (dates.length === 0) return "Choose at least one date.";
    if (name.trim().length < 2) return "Enter the customer's name.";
    if (phone && !phoneOk) return "Enter a 10-digit mobile number starting with 9, or leave it empty.";
    if (hour + duration > 24) return "The booking cannot pass midnight.";
    return "";
  };

  async function preview() {
    const m = check();
    if (m) return setError(m);
    setBusy(true); setError("");
    try { setPlan({ ...(await bulkBook({ ...body(), dryRun: true })), stamp }); } catch (e) { setError(e instanceof ApiError ? e.message : "Could not check the dates"); } finally { setBusy(false); }
  }

  async function confirm() {
    if (!guard("bookings.create")) return;
    const m = check();
    if (m) return setError(m);
    setBusy(true); setError("");
    try {
      const r = await bulkBook(body());
      setDone({ made: r.created?.length ?? 0, skipped: r.skipped ?? [] });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the bookings");
      setPlan(null);
    } finally { setBusy(false); }
  }

  const lab = "block text-sm font-medium";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label="Bulk booking" onClick={(e) => e.stopPropagation()} className="max-h-[94vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="flex items-start justify-between">
          <div><h2 className="text-xl font-bold">Bulk booking</h2><p className="text-sm text-muted">Book the same hour on many days at once.</p></div>
          <button type="button" onClick={() => { if (done) onBooked(); onClose(); }} aria-label="Close" className="rounded-full p-1 hover:bg-surface-2"><X size={22} /></button>
        </div>

        {done ? (
          <div className="grid place-items-center gap-3 py-8 text-center">
            <CheckCircle2 size={44} className="text-brand" />
            <h3 className="text-lg font-bold">{done.made} booking{done.made === 1 ? "" : "s"} created</h3>
            {done.skipped.length > 0 && <p className="max-w-sm text-sm text-muted">Skipped because the hour was already booked or blocked: {done.skipped.map(dayName).join(", ")}.</p>}
            <button onClick={() => { onBooked(); onClose(); }} className="rounded-full bg-brand px-8 py-3 text-sm font-semibold text-white">Done</button>
          </div>
        ) : (
          <>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Which days?</legend>
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
                {([["weekly", "Every week"], ["daily", "Every day"], ["pick", "Pick dates"]] as const).map(([v, l]) => (
                  <button key={v} type="button" aria-pressed={pattern === v} onClick={() => setPattern(v)} className={`rounded-lg px-2 py-2 text-sm font-semibold ${pattern === v ? "bg-brand text-white" : "text-muted"}`}>{l}</button>
                ))}
              </div>
              {pattern !== "pick" ? (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label className={lab}>First date<input type="date" min={shiftDate(todayKey(), -60)} max={shiftDate(todayKey(), 60)} value={from} onChange={(e) => setFrom(e.target.value)} className={`${input} mt-1`} /></label>
                  <label className={lab}>{pattern === "weekly" ? "Number of weeks" : "Number of days"} (up to 31)<input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, "").slice(0, 2))} className={`${input} mt-1`} /></label>
                  {pattern === "weekly" && from && (
                    <div className="col-span-2 space-y-2">
                      <p className="text-sm font-medium">Which days of the week?</p>
                      <div className="flex flex-wrap gap-1.5">
                        {WEEKDAYS.map((d, i) => {
                          const on = chosenDays.includes(i);
                          return (
                            <button type="button" key={d} aria-pressed={on} onClick={() => setWeekDays(on ? chosenDays.filter((x) => x !== i) : [...chosenDays, i])}
                              className={`rounded-full px-4 py-2 text-sm font-semibold ${on ? "bg-brand text-white" : "bg-surface-2 text-muted"}`}>{d}</button>
                          );
                        })}
                      </div>
                      <p className="text-xs text-muted">
                        {dates.length === 0 ? "Choose at least one day." : `${dates.length} date${dates.length === 1 ? "" : "s"}: every ${chosenDays.slice().sort().map((i) => WEEKDAYS[i]).join(", ")} for ${n} week${n === 1 ? "" : "s"}, from ${dayName(from)}.`}
                        {n * chosenDays.length > 31 ? " Only the first 31 dates are used." : ""}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  <div className="flex gap-2">
                    <input type="date" min={shiftDate(todayKey(), -60)} max={shiftDate(todayKey(), 60)} value={pick} onChange={(e) => setPick(e.target.value)} className={input} aria-label="Date to add" />
                    <button type="button" onClick={() => { if (pick && !picked.includes(pick) && picked.length < 31) setPicked([...picked, pick]); setPick(""); }} disabled={!pick} className="rounded-full bg-brand px-5 text-sm font-semibold text-white disabled:opacity-50">Add</button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[...picked].sort().map((d) => <button key={d} type="button" onClick={() => setPicked(picked.filter((x) => x !== d))} aria-label={`Remove ${dayName(d)}`} className="flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold">{dayName(d)} <X size={12} /></button>)}
                    {picked.length === 0 && <p className="text-xs text-muted">No dates yet.</p>}
                  </div>
                </div>
              )}
            </fieldset>

            <div className="grid grid-cols-2 gap-3">
              <label className={lab}>Start time<select value={hour} onChange={(e) => setHour(Number(e.target.value))} className={`${input} mt-1`}>{Array.from({ length: OPEN_TO - OPEN_FROM }, (_, i) => OPEN_FROM + i).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select></label>
              <label className={lab}>Hours each day<select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={`${input} mt-1`}>{[1, 2, 3, 4].map((n2) => <option key={n2} value={n2}>{n2} hour{n2 > 1 ? "s" : ""}</option>)}</select></label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className={lab}>Mobile number <span className="font-normal text-muted">(optional)</span><input inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} placeholder="98XXXXXXXX" className={`${input} mt-1`} />
                {registered && <span className="mt-1 block text-xs font-normal text-brand">Registered: {registered}. Points go to their account.</span>}
              </label>
              <label className={lab}>Customer or team name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className={`${input} mt-1`} /></label>
              <label className={lab}>Price per game (Rs.) <span className="font-normal text-muted">empty = court price</span><input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} className={`${input} mt-1`} /></label>
              <label className={lab}>Payment<select value={payment} onChange={(e) => setPayment(e.target.value)} className={`${input} mt-1`}>{PAYMENT.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
            </div>
            <label className={lab}>Note <span className="font-normal text-muted">(optional)</span><input value={notes} maxLength={200} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. weekly league, school block" className={`${input} mt-1`} /></label>

            <fieldset className="space-y-2 rounded-xl bg-surface-2 p-3">
              <legend className="px-1 text-sm font-semibold">If some dates are already taken</legend>
              {([["free", "Book the free dates and skip the taken ones"], ["all", "Book all dates or none"]] as const).map(([v, l]) => (
                <label key={v} className="flex items-center gap-2 text-sm"><input type="radio" name="mode" checked={mode === v} onChange={() => setMode(v)} className="accent-[var(--brand)]" /> {l}</label>
              ))}
            </fieldset>

            {plan && !stale && (
              <div className="space-y-2 rounded-xl border border-line p-3">
                <p className="text-sm font-semibold">{plan.free} of {plan.requested} dates are free · {rs(plan.pricePerGame)} each · total {rs(plan.totalAmount)}</p>
                <ul className="grid max-h-44 gap-1 overflow-y-auto text-sm sm:grid-cols-2">
                  {plan.plan.map((p) => (
                    <li key={p.date} className={`flex items-center justify-between rounded-lg px-3 py-1.5 ${p.free ? "bg-brand/10 text-brand" : "bg-red-500/10 text-red-600"}`}><span>{dayName(p.date)}</span><span className="text-xs font-semibold">{p.free ? "Free" : "Taken"}</span></li>
                  ))}
                </ul>
              </div>
            )}

            {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={preview} disabled={busy || dates.length === 0} className="rounded-full border border-line py-3 text-sm font-semibold disabled:opacity-50">{busy ? "Checking…" : "Check the dates"}</button>
              <button type="button" onClick={confirm} disabled={busy || stale || (plan?.free ?? 0) === 0 || (mode === "all" && (plan?.taken ?? 0) > 0)} className="rounded-full bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : plan && !stale ? `Book ${plan.free} date${plan.free === 1 ? "" : "s"}` : "Book"}</button>
            </div>
            {stale && <p className="text-center text-xs text-muted">Check the dates first. You will see which are free and the total before anything is booked.</p>}
          </>
        )}
      </div>
    </div>
  );
}
