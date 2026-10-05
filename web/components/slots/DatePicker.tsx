"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { longDate, shiftDate, todayKey } from "@/lib/slots";

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const monthOf = (d: string) => d.slice(0, 7);
const shiftMonth = (m: string, n: number) => {
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};
const monthTitle = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" });

// Date bar with a dropdown month calendar: jump to any day in one tap. Days that have bookings show a count.
export default function DatePicker({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(monthOf(date));
  const [counts, setCounts] = useState<Record<string, number>>({});
  const box = useRef<HTMLDivElement>(null);
  const today = todayKey();

  useEffect(() => {
    if (!open) return;
    let live = true;
    api<{ date: string; count: number }[]>(`/admin/bookings/calendar?month=${month}`)
      .then((rows) => { if (live) setCounts(Object.fromEntries(rows.map((r) => [r.date, r.count]))); })
      .catch(() => {});
    return () => { live = false; };
  }, [open, month]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  const pick = (d: string) => { onChange(d); setOpen(false); };
  const toggle = () => { if (!open) setMonth(monthOf(date)); setOpen(!open); };

  const lead = new Date(`${month}-01T00:00:00Z`).getUTCDay();
  const total = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: total }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];

  return (
    <div ref={box} className="relative">
      <div className="flex items-center gap-1 rounded-full bg-surface px-2 py-1.5 shadow-sm">
        <button onClick={() => pick(shiftDate(date, -1))} aria-label="Previous day" className="rounded-full p-1.5 hover:bg-surface-2"><ChevronLeft size={16} /></button>
        <button onClick={toggle} aria-haspopup="dialog" aria-expanded={open} aria-label="Choose a date from the calendar"
          className="flex items-center gap-2 rounded-full px-2 py-1 text-[11px] font-extrabold tracking-wide hover:bg-surface-2">
          <CalendarDays size={14} className="text-orange-500" />
          {longDate(date)}
          <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        <button onClick={() => pick(shiftDate(date, 1))} aria-label="Next day" className="rounded-full p-1.5 hover:bg-surface-2"><ChevronRight size={16} /></button>
      </div>

      {open && (
        <div role="dialog" aria-label="Calendar" className="absolute left-0 z-40 mt-2 w-[19rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-surface p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month" className="rounded-full p-1.5 hover:bg-surface-2"><ChevronLeft size={16} /></button>
            <span className="text-sm font-bold">{monthTitle(month)}</span>
            <button onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month" className="rounded-full p-1.5 hover:bg-surface-2"><ChevronRight size={16} /></button>
          </div>

          <div className="mb-2 flex gap-1.5 text-xs font-semibold">
            <button onClick={() => pick(today)} className="rounded-full bg-brand/10 px-3 py-1 text-brand">Today</button>
            <button onClick={() => pick(shiftDate(today, 1))} className="rounded-full bg-surface-2 px-3 py-1">Tomorrow</button>
            <button onClick={() => pick(shiftDate(today, -1))} className="rounded-full bg-surface-2 px-3 py-1">Yesterday</button>
          </div>

          <div className="grid grid-cols-7 gap-y-1 text-center text-[11px] font-semibold text-muted">{DAYS.map((d) => <span key={d}>{d}</span>)}</div>
          <div className="mt-1 grid grid-cols-7 gap-y-1">
            {cells.map((d, i) => d === null ? <span key={`e${i}`} /> : (
              <button key={d} onClick={() => pick(d)} aria-label={`${longDate(d)}${counts[d] ? `, ${counts[d]} bookings` : ""}`} aria-current={d === date ? "date" : undefined}
                className={`relative mx-auto grid h-9 w-9 place-items-center rounded-full text-sm ${d === date ? "bg-brand font-bold text-white" : d === today ? "font-bold text-brand ring-1 ring-brand" : "hover:bg-surface-2"}`}>
                {Number(d.slice(8))}
                {counts[d] ? <span className={`absolute -bottom-0.5 rounded-full px-1 text-[9px] font-bold leading-3 ${d === date ? "bg-white text-brand" : "bg-orange-500 text-white"}`}>{counts[d]}</span> : null}
              </button>
            ))}
          </div>
          <p className="mt-2 text-center text-[11px] text-muted">The orange number is how many bookings that day has.</p>
        </div>
      )}
    </div>
  );
}
