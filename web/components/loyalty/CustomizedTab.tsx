"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { ClaimRules, ClaimShift, getClaimRules, saveClaimRules } from "@/lib/loyalty";

// Loyalty Points > Customized: when and how customers can claim free games. The customer server enforces it on every claim.
const input = "rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");
const nepalToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" }).format(new Date());
const shiftDay = (key: string, days: number) => new Date(new Date(`${key}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
const dow = (key: string) => new Date(`${key}T00:00:00Z`).getUTCDay();
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHIFTS: { id: ClaimShift; label: string; hint: string }[] = [
  { id: "Morning", label: "Morning", hint: "early games" },
  { id: "Day", label: "Day", hint: "daytime games" },
  { id: "Evening", label: "Evening", hint: "from 5 PM" },
];

export default function CustomizedTab() {
  const [saved, setSaved] = useState<ClaimRules | null>(null);
  const [r, setR] = useState<ClaimRules | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    let live = true;
    getClaimRules().then((x) => { if (live) { setSaved(x); setR(x); } }).catch((e) => live && setErr(msg(e)));
    return () => { live = false; };
  }, []);

  if (!r || !saved) return <p className="rounded-2xl bg-surface p-4 text-sm text-muted shadow-sm">{err || "Loading..."}</p>;
  const dirty = JSON.stringify(r) !== JSON.stringify(saved);
  const set = (p: Partial<ClaimRules>) => { setOk(""); setErr(""); setR({ ...r, ...p }); };
  const today = nepalToday();

  // is claiming on for this date, by the weekday list and the calendar (the time of day and shifts apply on top)
  const isOn = (k: string) => r.enabled && (r.overrides[k] ?? r.days.includes(dow(k)));
  const cycle = (k: string) => {
    const next = { ...r.overrides };
    if (next[k] === undefined) next[k] = !r.days.includes(dow(k)); // first tap flips what the weekday rule says
    else delete next[k]; // second tap goes back to the weekday rule
    set({ overrides: next });
  };
  const turn = (keys: string[], on: boolean) => {
    const next = { ...r.overrides };
    for (const k of keys) { if (r.days.includes(dow(k)) === on) delete next[k]; else next[k] = on; }
    set({ overrides: next });
  };
  const span = (n: number) => Array.from({ length: n }, (_, i) => shiftDay(today, i));

  // the calendar: five weeks, starting on the Sunday of this week
  const start = shiftDay(today, -dow(today));
  const cells = Array.from({ length: 35 }, (_, i) => shiftDay(start, i));

  async function save() {
    setBusy(true); setErr(""); setOk("");
    try { const s = await saveClaimRules(r!); setSaved(s); setR(s); setOk("Saved. Customers see the new rules right away."); }
    catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }

  const label = "mb-1 block text-xs font-semibold text-muted";
  const chip = "rounded-full border border-line px-3 py-1.5 text-xs font-semibold";
  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-surface p-4 shadow-sm lg:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Free game claims</h2>
            <p className="text-sm text-muted">Control when customers can turn points into a free game. Saved changes apply at once in the app.</p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={r.enabled} onChange={(e) => set({ enabled: e.target.checked })} className="h-5 w-5" />
            {r.enabled ? "Claims are ON" : "Claims are OFF"}
          </label>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl bg-surface p-4 shadow-sm lg:p-5">
          <h3 className="mb-3 font-bold">Limits and time</h3>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={label} htmlFor="lc-day">Free games per day</label><input id="lc-day" type="number" min={0} max={50} value={r.perDay} onChange={(e) => set({ perDay: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} className={`${input} w-full`} /></div>
            <div><label className={label} htmlFor="lc-week">Free games per week</label><input id="lc-week" type="number" min={0} max={200} value={r.perWeek} onChange={(e) => set({ perWeek: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} className={`${input} w-full`} /></div>
            <div><label className={label} htmlFor="lc-from">Claiming opens at</label><input id="lc-from" type="time" value={r.from} onChange={(e) => e.target.value && set({ from: e.target.value })} className={`${input} w-full`} /></div>
            <div><label className={label} htmlFor="lc-to">Claiming closes at</label><input id="lc-to" type="time" value={r.to} onChange={(e) => e.target.value && set({ to: e.target.value })} className={`${input} w-full`} /></div>
          </div>
          <p className="mt-2 text-xs text-muted">Per customer, however many points they hold. The week means the last 7 days. Times are Nepal time.</p>

          <h3 className="mb-2 mt-5 font-bold">Which shifts</h3>
          <div className="flex flex-wrap gap-2">
            {SHIFTS.map((s) => {
              const on = r.shifts.includes(s.id);
              return <button key={s.id} type="button" aria-pressed={on} onClick={() => set({ shifts: on ? r.shifts.filter((x) => x !== s.id) : [...r.shifts, s.id] })} className={`rounded-xl px-3.5 py-2 text-sm font-semibold ${on ? "bg-brand text-white" : "border border-line text-muted"}`}>{s.label} <span className="text-[11px] font-normal opacity-80">{s.hint}</span></button>;
            })}
          </div>

          <h3 className="mb-2 mt-5 font-bold">Which days of the week</h3>
          <div className="flex flex-wrap gap-2">
            {DAY_NAMES.map((n, i) => {
              const on = r.days.includes(i);
              return <button key={n} type="button" aria-pressed={on} onClick={() => set({ days: on ? r.days.filter((x) => x !== i) : [...r.days, i] })} className={`w-12 rounded-xl py-2 text-sm font-semibold ${on ? "bg-brand text-white" : "border border-line text-muted"}`}>{n}</button>;
            })}
          </div>
        </section>

        <section className="rounded-2xl bg-surface p-4 shadow-sm lg:p-5">
          <h3 className="mb-1 font-bold">Calendar: turn claims on or off for a day</h3>
          <p className="mb-3 text-xs text-muted">Tap a day to switch it. A day you changed has a ring; tap it again to go back to the weekday rule.</p>
          <div className="mb-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => turn(span(1), false)} className={chip}>Turn off today</button>
            <button type="button" onClick={() => turn([shiftDay(today, 1)], false)} className={chip}>Turn off tomorrow</button>
            <button type="button" onClick={() => turn(span(7), false)} className={chip}>Turn off next 7 days</button>
            <button type="button" onClick={() => turn(span(7), true)} className={chip}>Turn on next 7 days</button>
          </div>
          <div className="grid grid-cols-7 gap-1.5 text-center" role="grid" aria-label="Claim days">
            {DAY_NAMES.map((n) => <div key={n} className="pb-1 text-[11px] font-semibold text-muted">{n}</div>)}
            {cells.map((k) => {
              const past = k < today;
              const on = isOn(k);
              const changed = r.overrides[k] !== undefined;
              return (
                <button key={k} type="button" disabled={past} onClick={() => cycle(k)} aria-label={`${k}: claims ${on ? "on" : "off"}${changed ? " (changed)" : ""}`}
                  className={`flex h-12 flex-col items-center justify-center rounded-xl text-sm font-semibold disabled:opacity-30 ${on ? "bg-emerald-500/15 text-emerald-700" : "bg-rose-500/15 text-rose-700"} ${changed ? "ring-2 ring-brand" : ""} ${k === today ? "outline outline-2 outline-offset-1 outline-amber-400" : ""}`}>
                  <span>{Number(k.slice(8))}</span>
                  <span className="text-[9px] font-medium">{on ? "on" : "off"}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted"><span className="text-emerald-700">Green</span> = customers can claim, <span className="text-rose-700">red</span> = closed. Today has a yellow outline.</p>
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={!dirty || busy} onClick={save} className="flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy && <Loader2 size={16} className="animate-spin" />} Save changes</button>
        {dirty && <button type="button" onClick={() => setR(saved)} className="rounded-full border border-line px-5 py-3 text-sm font-semibold">Discard</button>}
        {ok && <span role="status" className="text-sm text-emerald-700">{ok}</span>}
        {err && <span role="alert" className="text-sm text-rose-600">{err}</span>}
      </div>
    </div>
  );
}
