"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Clock, Lock, Plus, X } from "lucide-react";
import BookSlotModal from "./BookSlotModal";
import DatePicker from "./DatePicker";
import BookingDetailSheet from "../bookings/BookingDetailSheet";
import { canDo } from "@/lib/auth";
import { Booking, bookingDetail, rs } from "@/lib/bookings";
import { Hour, OPEN_FROM, OPEN_TO, SlotBooking, getDay, hourLabel, nowHour, rejectBooking, todayKey } from "@/lib/slots";

const CARD: Record<string, { bg: string; label: string }> = {
  confirmed: { bg: "bg-red-600", label: "CONFIRMED MATCH" },
  pending: { bg: "bg-amber-500", label: "PENDING PAYMENT" },
  completed: { bg: "bg-slate-600", label: "SESSION COMPLETED" },
  no_show: { bg: "bg-slate-500", label: "NO-SHOW" },
};

function BookedCard({ h, onOpen, onReject }: { h: Hour; onOpen: () => void; onReject: () => void }) {
  const b = h.booking as SlotBooking;
  const c = CARD[b.status] ?? { bg: "bg-slate-600", label: b.status.toUpperCase() };
  const first = Number(b.startTime.slice(0, 2)) === h.hour;
  const live = b.status === "confirmed" || b.status === "pending";
  return (
    <div className={`flex flex-col gap-3 rounded-2xl ${c.bg} p-3 text-white shadow-sm sm:flex-row sm:items-center sm:gap-4 sm:p-4`}>
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left sm:gap-4" aria-label={`Details for ${b.customerName ?? "booking"}`}>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/20"><CalendarDays size={20} /></span>
        <span className="min-w-0">
          <span className="block text-[10px] font-bold tracking-wider opacity-80">{c.label}{!first ? ` · HOUR ${h.hour - Number(b.startTime.slice(0, 2)) + 1} OF ${b.duration}` : ""}</span>
          <span className="block truncate text-base font-extrabold italic leading-tight sm:text-lg">{(b.customerName || "Guest").toUpperCase()}{b.customerPhone ? ` - ${b.customerPhone}` : ""}</span>
          <span className="block text-[10px] font-semibold tracking-wide opacity-80">
            {b.duration} HOUR SESSION · {rs(b.totalPrice)} · {b.paymentStatus === "completed" ? "PAID" : "UNPAID"} · ID: #{b.code.replace("UF-", "")}
          </span>
        </span>
      </button>
      {live && first && canDo("bookings.write") && (
        <button onClick={onReject} className="flex shrink-0 items-center gap-1 self-end rounded-full bg-white px-3 py-1.5 text-[11px] font-bold tracking-wide text-red-600 sm:self-auto">
          <X size={13} /> REJECT
        </button>
      )}
    </div>
  );
}

export default function SlotsPage() {
  const [date, setDate] = useState(todayKey());
  const [hours, setHours] = useState<Hour[] | null>(null);
  const [error, setError] = useState("");
  const [book, setBook] = useState<number | null>(null);
  const [detail, setDetail] = useState<Booking | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let live = true;
    getDay(date)
      .then((d) => { if (live) { setHours(d.hours); setError(""); } })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load the day"); });
    return () => { live = false; };
  }, [date, tick]);

  const go = (d: string) => { setDate(d); setHours(null); setError(""); };
  const isPast = (hour: number) => date < todayKey() || (date === todayKey() && hour < nowHour());
  const shown = hours?.filter((h) => (h.hour >= OPEN_FROM && h.hour < OPEN_TO) || h.state !== "free") ?? [];

  async function reject(h: Hour) {
    const b = h.booking!;
    if (!window.confirm(`Reject ${b.customerName ?? "this booking"} (${b.code})? The hour will be freed${b.paymentStatus === "completed" ? " and a refund will be marked due" : ""}.`)) return;
    try {
      await rejectBooking(b.id);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reject the booking");
    }
  }

  async function open(h: Hour) {
    try {
      setDetail((await bookingDetail(h.booking!.id)).booking);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the booking");
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Book a Slot (manual)</h1>
          <p className="text-3xl font-black italic tracking-tight"><span>FIELD</span> <span className="text-orange-500">TIMELINE</span></p>
          <p className="text-xs text-muted">Visual occupancy grid for daily matches.</p>
        </div>
        <DatePicker date={date} onChange={go} />
      </div>

      {date !== todayKey() && <button onClick={() => go(todayKey())} className="text-sm font-semibold text-brand">Back to today</button>}

      <section className="rounded-3xl bg-surface p-3 shadow-sm sm:p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-line pb-3">
          <h2 className="text-xs font-extrabold tracking-wide">BOOKING SLOTS SCHEDULE</h2>
          <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold text-brand">ACTIVE SYSTEM</span>
          <span className="w-full text-xs text-muted sm:w-auto">Tap + on an open hour to book a customer by hand. Open hours are 5 AM to 10 PM.</span>
        </div>

        {error && <p className="mb-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
        {!hours && !error && <p className="py-12 text-center text-sm text-muted">Loading the day…</p>}

        <ul className="space-y-2">
          {shown.map((h) => {
            const past = isPast(h.hour);
            return (
              <li key={h.hour} className="flex items-center gap-3 sm:gap-4">
                <span className="w-16 shrink-0 text-xs font-extrabold sm:w-20 sm:text-sm">{hourLabel(h.hour)}</span>
                <div className="min-w-0 flex-1">
                  {h.state === "booked" && h.booking && <BookedCard h={h} onOpen={() => open(h)} onReject={() => reject(h)} />}

                  {h.state === "blocked" && (
                    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2 p-3 sm:p-4">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface text-muted"><Lock size={18} /></span>
                      <span className="min-w-0">
                        <span className="block text-[10px] font-bold tracking-wider text-muted">BLOCKED</span>
                        <span className="block truncate text-sm font-bold">{h.block?.reason ?? "Not available"}</span>
                      </span>
                    </div>
                  )}

                  {h.state === "free" && (
                    <button onClick={() => setBook(h.hour)} disabled={!canDo("bookings.write")} aria-label={`${past ? "Log a past booking at" : "Book"} ${hourLabel(h.hour)}`}
                      className={`flex w-full items-center gap-3 rounded-2xl border-2 border-dashed p-3 text-left hover:border-brand hover:bg-brand/5 sm:p-4 ${past ? "border-line opacity-60" : "border-line"}`}>
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted">{past ? <Clock size={18} /> : <Plus size={20} />}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-extrabold tracking-wide">{past ? "PAST SLOT (LOG NOW)" : "OPEN MATCH SLOT"}</span>
                        <span className="block text-[10px] font-semibold tracking-wide text-muted">{past ? "CLICK TO ADD RETROACTIVE BOOKING" : "AVAILABLE FOR BOOKING"}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-[9px] font-bold tracking-wider text-muted">PRICING:</span>
                        <span className="text-sm font-extrabold">{rs(h.price)}</span>
                      </span>
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {book !== null && hours && (
        <BookSlotModal date={date} hours={hours} hour={book} past={isPast(book)} onClose={() => setBook(null)} onBooked={() => { setBook(null); refresh(); }} />
      )}
      {detail && <BookingDetailSheet booking={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
