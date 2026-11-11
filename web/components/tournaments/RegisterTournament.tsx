"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { rs } from "@/lib/bookings";
import { findCustomer } from "@/lib/slots";
import Switch from "../Switch";
import { HostDay, Preview, SERVICES, fmtDay, h12, previewHosting, registerTournament } from "@/lib/hosted-tournaments";

const input = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");
const nepalToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" }).format(new Date());
const shift = (key: string, days: number) => new Date(new Date(`${key}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
const START = Array.from({ length: 24 }, (_, h) => h); // 12 AM .. 11 PM
const END = Array.from({ length: 24 }, (_, h) => h + 1); // 1 AM .. 12 AM (midnight)

// Register a tournament the venue hosts: who hosts it, the agreed hourly rate, and the hours of each chosen day.
export default function RegisterTournament({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const today = nepalToday();
  const [name, setName] = useState("");
  const [hostName, setHostName] = useState("");
  const [hostPhone, setHostPhone] = useState("");
  // the number typed belongs to a registered customer: their name is shown, and put in the name box if it is still empty
  const [known, setKnown] = useState<{ phone: string; name: string } | null>(null);
  useEffect(() => {
    const digits = hostPhone.replace(/\D/g, "").slice(-10);
    if (digits.length < 10) return;
    let live = true;
    const t = setTimeout(() => {
      findCustomer(digits, 3)
        .then((r) => {
          if (!live) return;
          const c = r.items.find((x) => x.phoneNumber.replace(/\D/g, "").slice(-10) === digits && x.name);
          setKnown(c ? { phone: digits, name: c.name as string } : null);
          if (c) setHostName((cur) => (cur.trim() ? cur : (c.name as string)));
        })
        .catch(() => live && setKnown(null));
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [hostPhone]);
  const shownKnown = known && hostPhone.replace(/\D/g, "").slice(-10) === known.phone ? known : null;
  const [rate, setRate] = useState("");
  const [services, setServices] = useState<string[]>([]); // the extra services: on or off
  const [amounts, setAmounts] = useState<Record<string, string>>({}); // what each service costs (Rs.), kept as typed
  const flip = (id: string) => setServices((x) => (x.includes(id) ? x.filter((v) => v !== id) : [...x, id]));
  const [days, setDays] = useState<HostDay[]>([]);
  const [extra, setExtra] = useState("");
  const [preview, setPreview] = useState<{ key: string; data: Preview } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const sorted = useMemo(() => [...days].sort((a, b) => a.date.localeCompare(b.date)), [days]);
  const hours = sorted.reduce((n, d) => n + Math.max(0, d.endHour - d.startHour), 0);
  const minRate = Number(rate);
  const daysOk = sorted.length > 0 && sorted.every((d) => d.endHour > d.startHour);
  const key = JSON.stringify([sorted, minRate]);
  const shown = preview?.key === key ? preview.data : null;

  const quick: [string, string][] = [["Today", today], ["Tomorrow", shift(today, 1)], ["Day after tomorrow", shift(today, 2)]];
  const has = (date: string) => days.some((d) => d.date === date);
  const toggle = (date: string) => { setDays((x) => (x.some((d) => d.date === date) ? x.filter((d) => d.date !== date) : [...x, { date, startHour: 9, endHour: 12 }])); setError(""); };
  const patch = (date: string, p: Partial<HostDay>) => setDays((x) => x.map((d) => (d.date === date ? { ...d, ...p } : d)));
  const addPicked = () => { if (extra && !has(extra)) toggle(extra); setExtra(""); };

  // as the days change, ask the server whether those hours are free
  useEffect(() => {
    if (!daysOk || !(minRate >= 100)) return;
    let live = true;
    const t = setTimeout(() => {
      previewHosting({ name: name || "Tournament", hostName: hostName || "Host", hostPhone: hostPhone || "9800000000", minRate, days: sorted })
        .then((p) => { if (live) { setPreview({ key, data: p }); setError(""); } })
        .catch((e) => live && setError(msg(e)));
    }, 350);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, daysOk]);

  const problem = name.trim().length < 2 ? "Enter the event name." : hostName.trim().length < 2 ? "Enter the host or manager name." : !/^\+?\d[\d\s-]{6,16}$/.test(hostPhone.trim()) ? "Enter the host's contact number." : !(minRate >= 100) ? "Enter the minimum rate per hour (at least Rs. 100)." : !sorted.length ? "Choose at least one day." : !daysOk ? "Each day's end time must be after its start time." : "";
  const clash = !!shown?.clashes.length;

  async function save() {
    if (!guard("tournaments.create")) return;
    if (problem) return setError(problem);
    setBusy(true); setError("");
    try { const b = await registerTournament({ name: name.trim(), hostName: hostName.trim(), hostPhone: hostPhone.trim(), minRate, days: sorted, services, serviceAmounts: Object.fromEntries(services.map((id) => [id, Number(amounts[id]) || 0])) }); onCreated(b.id); } catch (e) { setError(msg(e)); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label="Register a tournament" onClick={(e) => e.stopPropagation()} className="max-h-[96vh] w-full max-w-xl space-y-3 overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl md:max-w-4xl">
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="text-lg font-bold">Register a tournament</h2><p className="text-sm text-muted">The court is held for the days and hours you choose, and customers can see the event.</p></div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-surface-2"><X size={20} /></button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <div className="space-y-3">
        <label className="block text-sm font-medium">Event name<input className={`${input} mt-1`} value={name} maxLength={80} onChange={(e) => { setName(e.target.value); setError(""); }} placeholder="Tuna Cup 2026" /></label>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
          <label className="block text-sm font-medium">Host / manager name<input className={`${input} mt-1`} value={hostName} maxLength={60} onChange={(e) => { setHostName(e.target.value); setError(""); }} placeholder="Anil Gurung" /></label>
          <label className="block text-sm font-medium">Their contact number<input inputMode="tel" className={`${input} mt-1`} value={hostPhone} maxLength={17} onChange={(e) => { setHostPhone(e.target.value.replace(/[^\d+\s-]/g, "")); setError(""); }} placeholder="98XXXXXXXX" />
            {shownKnown && (
              <span role="status" className="mt-1.5 flex flex-wrap items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-700">
                Registered customer: <strong>{shownKnown.name}</strong>
                {hostName.trim() !== shownKnown.name && <button type="button" onClick={() => { setHostName(shownKnown.name); setError(""); }} className="rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white">Use this name</button>}
              </span>
            )}
          </label>
        </div>
        <label className="block text-sm font-medium">Minimum rate per hour (Rs.)<input inputMode="numeric" className={`${input} mt-1`} value={rate} onChange={(e) => { setRate(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }} placeholder="2000" /></label>

        <div className="space-y-2 rounded-xl border border-line p-3">
          <p className="text-sm font-bold">Additional services</p>
          <ul className="divide-y divide-line">
            {SERVICES.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-sm font-medium">{v.label}</span>
                <span className="flex items-center gap-2">
                  {services.includes(v.id) && (
                    <label className="flex items-center gap-1.5 text-xs text-muted">{v.per === "bottle" ? "Rs. per bottle" : "Rs."}
                      <input inputMode="numeric" aria-label={`${v.label} amount`} value={amounts[v.id] ?? ""} onChange={(e) => setAmounts((x) => ({ ...x, [v.id]: e.target.value.replace(/D/g, "").slice(0, 7) }))} placeholder="0" className={`${input} !w-24 !px-2 !py-1.5 text-right`} />
                    </label>
                  )}
                  <span className={`w-7 text-right text-xs font-bold ${services.includes(v.id) ? "text-emerald-600" : "text-muted"}`}>{services.includes(v.id) ? "On" : "Off"}</span><Switch on={services.includes(v.id)} onChange={() => flip(v.id)} label={v.label} /></span>
              </li>
            ))}
          </ul>
        </div>

        </div>
        <div className="space-y-3">
        <div className="space-y-3 rounded-xl border border-line p-3">
          <p className="text-sm font-bold">Days and times</p>
          <div className="flex flex-wrap gap-1.5">
            {quick.map(([label, date]) => <button key={date} type="button" aria-pressed={has(date)} onClick={() => toggle(date)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${has(date) ? "bg-brand text-white" : "border border-line"}`}>{label}</button>)}
          </div>
          <div className="flex gap-2">
            <input type="date" className={input} value={extra} min={today} onChange={(e) => setExtra(e.target.value)} aria-label="Another date" />
            <button type="button" onClick={addPicked} disabled={!extra || has(extra)} className="flex shrink-0 items-center gap-1 rounded-full border border-line px-4 text-sm font-semibold disabled:opacity-40"><Plus size={15} /> Add day</button>
          </div>
          {sorted.length === 0 && <p className="text-xs text-muted">Pick today, tomorrow, the day after, or add any other date. Then choose the hours for each day.</p>}
          <ul className="space-y-2">
            {sorted.map((d) => (
              <li key={d.date} className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 p-2.5">
                <span className="w-36 shrink-0 text-sm font-semibold">{fmtDay(d.date)}{d.date === today ? " (today)" : d.date === shift(today, 1) ? " (tomorrow)" : ""}</span>
                <select aria-label={`Start time on ${d.date}`} className={`${input} !w-28`} value={d.startHour} onChange={(e) => { const v = Number(e.target.value); patch(d.date, { startHour: v, endHour: d.endHour <= v ? Math.min(24, v + 1) : d.endHour }); }}>{START.map((h) => <option key={h} value={h}>{h12(h)}</option>)}</select>
                <span className="text-sm text-muted">to</span>
                <select aria-label={`End time on ${d.date}`} className={`${input} !w-28`} value={d.endHour} onChange={(e) => patch(d.date, { endHour: Number(e.target.value) })}>{END.filter((h) => h > d.startHour).map((h) => <option key={h} value={h}>{h12(h)}</option>)}</select>
                <span className="text-xs text-muted">{d.endHour - d.startHour} h</span>
                <button type="button" onClick={() => toggle(d.date)} aria-label={`Remove ${d.date}`} className="ml-auto rounded-full p-1.5 text-red-600 hover:bg-red-500/10"><Trash2 size={15} /></button>
              </li>
            ))}
          </ul>
        </div>

        {daysOk && minRate >= 100 && (
          <div className="rounded-xl bg-brand/10 p-3 text-sm">
            <p className="flex justify-between"><span>{sorted.length} day{sorted.length === 1 ? "" : "s"}, {hours} hour{hours === 1 ? "" : "s"} x {rs(minRate)}</span><strong>{rs(hours * minRate)}</strong></p>
            <p className="text-xs text-muted">The court charge. Goods and extras are added to the bill while the tournament runs.</p>
          </div>
        )}
        {clash && shown && (
          <div className="rounded-xl bg-red-500/10 p-3 text-sm text-red-700" role="alert">
            <p className="font-semibold">These hours are not free ({shown.clashes.length}):</p>
            <ul className="mt-1 max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs">{shown.clashes.slice(0, 12).map((c, i) => <li key={i}>{fmtDay(c.date)}, {h12(c.hour)}: {c.reason}</li>)}</ul>
            <p className="mt-1 text-xs">Change the hours, or cancel those bookings first.</p>
          </div>
        )}
        {daysOk && minRate >= 100 && shown && !clash && <p className="text-sm font-semibold text-brand">All these hours are free.</p>}

        {(error || problem) && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error || problem}</p>}
        <button onClick={save} disabled={busy || !!problem || clash || !shown} className="w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-50">{busy ? "Registering…" : "Register and hold the court"}</button>
        </div>
        </div>
      </div>
    </div>
  );
}
