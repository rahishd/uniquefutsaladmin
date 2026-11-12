"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, BellRing, Phone, CalendarDays, CalendarPlus, Clock, Droplets, Gift, Hand, Lock, Plus, Tag, Trophy, UserRound, Wallet, X } from "lucide-react";
import { HelpCircle } from "lucide-react";
import BookSlotModal from "./BookSlotModal";
import BulkBookModal from "./BulkBookModal";
import DatePicker from "./DatePicker";
import BookingDetailSheet from "../bookings/BookingDetailSheet";
import { guard } from "@/lib/access";
import { useHighlight } from "@/lib/highlight";
import { Booking, bookingDetail, rs } from "@/lib/bookings";
import { Hour, OPEN_FROM, OPEN_TO, SlotBooking, getDay, hourLabel, nowHour, rejectBooking, todayKey } from "@/lib/slots";

import { askConfirm } from "@/lib/confirm";
const STATUS_LABEL: Record<string, string> = {
  confirmed: "CONFIRMED MATCH",
  pending: "PENDING PAYMENT",
  completed: "SESSION COMPLETED",
  no_show: "NO-SHOW",
};

// What the card shows at a glance: yellow = tournament, green = paid, red = not paid.
const isTournament = (b: SlotBooking) => b.customerPhone === "Tournament" || /(Tournament)/i.test(b.customerName ?? "") || /tournament/i.test(b.notes ?? "");
const isStaffBooked = (b: SlotBooking) => /WALK_IN/.test(b.notes ?? "");
const isBulk = (b: SlotBooking) => /BULK /.test(b.notes ?? "");
// A free game is claimed by the customer with loyalty points on the booking site; staff cannot create one here.
const isFreeGame = (b: SlotBooking) => !!b.voucherId || /FREE_MATCH/.test(b.notes ?? "");

function look(b: SlotBooking) {
  if (isFreeGame(b)) return { bg: "bg-violet-600 text-white", chip: "bg-white/20 text-white", btn: "text-violet-700", tone: "FREE" };
  if (isTournament(b)) return { bg: "bg-yellow-400 text-slate-900", chip: "bg-black/15 text-slate-900", btn: "text-slate-900", tone: "TOURNAMENT" };
  if (b.paymentStatus === "completed") return { bg: "bg-emerald-600 text-white", chip: "bg-white/20 text-white", btn: "text-emerald-700", tone: "PAID" };
  return { bg: "bg-red-600 text-white", chip: "bg-white/20 text-white", btn: "text-red-600", tone: "UNPAID" };
}

function BookedCard({ h, onOpen, onReject, today }: { h: Hour; onOpen: () => void; onReject: () => void; today: boolean }) {
  const [dlg, setDlg] = useState(false); // phone only: a booked hour is a compact tile; More opens all the details in a dialog
  const b = h.booking as SlotBooking;
  const c = look(b);
  const label = STATUS_LABEL[b.status] ?? b.status.toUpperCase();
  const first = Number(b.startTime.slice(0, 2)) === h.hour;
  const live = b.status === "confirmed" || b.status === "pending";
  const free = isFreeGame(b);
  const paid = b.paymentStatus === "completed";
  const tournament = isTournament(b);
  const guest = !b.userId && !tournament;
  const waived = !tournament && !free && (b.waterBottles ?? 0) === 0;
  const tags: { icon: React.ElementType; text: string }[] = [];
  if (guest) tags.push({ icon: UserRound, text: "GUEST" });
  if (tournament) tags.push({ icon: Trophy, text: "TOURNAMENT" });
  if (free) tags.push({ icon: Gift, text: "FREE GAME Â· LOYALTY POINTS" });
  else if (!tournament) tags.push(paid ? { icon: BadgeCheck, text: "PAID" } : { icon: Wallet, text: "UNPAID" });
  if (b.promoCode) tags.push({ icon: Tag, text: `PROMO ${b.promoCode}${b.discountAmount > 0 ? ` (-${rs(b.discountAmount)})` : ""}` });
  if (isStaffBooked(b)) tags.push({ icon: Hand, text: isBulk(b) ? "BOOKED BY STAFF (BULK)" : "BOOKED BY STAFF" });
  if (waived) tags.push({ icon: Droplets, text: "MINERAL WATER WAIVED" });
  // the customer's "I'm coming" tap, for today's games that are still on (finished and rejected ones need no arrival)
  const endHour = Number(b.endTime.slice(0, 2)) || 24;
  if (today && live && !tournament && h.hour < endHour && nowHour() < endHour) {
    if (b.checkedInAt) {
      const t = new Date(b.checkedInAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kathmandu" });
      tags.unshift({ icon: BellRing, text: `COMING Â· CONFIRMED ${t.toUpperCase()}` });
    } else tags.unshift({ icon: HelpCircle, text: "ARRIVAL NOT CONFIRMED" });
  }
  const hourOf = h.hour - Number(b.startTime.slice(0, 2)) + 1;
  const callable = !!b.customerPhone && b.customerPhone !== "Tournament" && /[0-9]{6,}/.test(b.customerPhone);
  // an unpaid game can be collected on the Payments page, already filtered to this customer (their number, or the booking code)
  const collect = !free && !tournament && !paid && live && first;
  const payUrl = `/payments?kind=court&status=unpaid&period=all&q=${encodeURIComponent(callable ? (b.customerPhone as string) : b.code)}`;
  return (
    <>
    {/* phone: the whole tile opens the details dialog; the Call button inside it dials */}
    <div role="button" tabIndex={0} onClick={() => setDlg(true)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDlg(true); } }} aria-haspopup="dialog" aria-label={`Details for ${b.customerName ?? "booking"}`}
      className={`cursor-pointer space-y-2.5 rounded-2xl ${c.bg} p-3 shadow-sm transition active:scale-[0.99] sm:hidden`}>
      <div className="flex items-center">
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block break-words text-base font-extrabold leading-tight">{(b.customerName || "Guest").toUpperCase()}</span>
          {!first && <span className="block text-[10px] font-semibold opacity-80">HOUR {hourOf} OF {b.duration}</span>}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {callable && <a href={`tel:${b.customerPhone}`} onClick={(e) => e.stopPropagation()} title="Call now" aria-label={`Call ${b.customerName ?? "the customer"} now`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white shadow-md" style={{ color: "#059669" }}><Phone size={17} /></a>}
        {first && <span className="min-w-0 flex-1 truncate rounded-full bg-black/20 px-3 py-1.5 text-center text-base font-black tabular-nums">{free ? "FREE GAME" : rs(b.totalPrice)}</span>}
      </div>
    </div>
    {dlg && (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:hidden" onClick={() => setDlg(false)}>
        <div role="dialog" aria-modal="true" aria-label={`Booking details: ${b.customerName ?? "booking"}`} onClick={(e) => e.stopPropagation()} className={`max-h-[88vh] w-full max-w-md space-y-3 overflow-y-auto rounded-3xl ${c.bg} p-5 shadow-2xl`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold tracking-wider opacity-80">{label}{!first ? ` Â· HOUR ${hourOf} OF ${b.duration}` : ""}</p>
              <p className="break-words text-xl font-extrabold leading-tight">{(b.customerName || "Guest").toUpperCase()}</p>
              {callable && <p className="mt-0.5 text-sm font-semibold opacity-90">{b.customerPhone}</p>}
            </div>
            <button onClick={() => setDlg(false)} aria-label="Close" className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${c.chip}`}><X size={16} /></button>
          </div>
          <p className="text-xs font-semibold tracking-wide opacity-90">{b.duration} HOUR SESSION Â· {free ? "FREE GAME" : `${rs(b.totalPrice)} Â· ${paid ? "PAID" : "UNPAID"}`} Â· ID: #{b.code.replace("UF-", "")}</p>
          {tags.length > 0 && <div className="flex flex-wrap gap-1.5">{tags.map((t) => <span key={t.text} className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-extrabold tracking-wider ${c.chip}`}><t.icon size={12} />{t.text}</span>)}</div>}
          {first && (
            <div className="rounded-2xl bg-black/15 p-3">
              <p className="text-[10px] font-bold tracking-wider opacity-80">{free ? "GAME PRICE" : paid ? "AMOUNT PAID" : "AMOUNT DUE"}</p>
              {!free && b.discountAmount > 0 && <p className="text-xs font-semibold line-through opacity-70">{rs(b.totalPrice + b.discountAmount)}</p>}
              <p className="text-3xl font-black leading-tight">{free ? "FREE" : rs(b.totalPrice)}</p>
              {!free && b.discountAmount > 0 && <p className="mt-1 flex items-center gap-1 text-[11px] font-extrabold"><Tag size={12} /> SAVED {rs(b.discountAmount)}</p>}
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {collect && <Link href={payUrl} className="flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-extrabold tracking-wide shadow-md" style={{ background: "#0c0b5d", color: "#ffffff" }}><Wallet size={14} /> COLLECT PAYMENT</Link>}
            {callable && <a href={`tel:${b.customerPhone}`} className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-extrabold tracking-wide" style={{ color: "#059669" }}><Phone size={14} /> CALL NOW</a>}
            <button onClick={() => { setDlg(false); onOpen(); }} className={`rounded-full px-4 py-2 text-xs font-extrabold tracking-wide ${c.chip}`}>OPEN BOOKING</button>
            {live && first && <button onClick={() => { setDlg(false); onReject(); }} className={`ml-auto flex items-center gap-1 rounded-full bg-white px-4 py-2 text-xs font-extrabold tracking-wide ${c.btn}`}><X size={13} /> REJECT</button>}
          </div>
        </div>
      </div>
    )}
    <div className={`max-sm:hidden flex flex-col gap-3 rounded-2xl ${c.bg} p-3 shadow-sm sm:flex-row sm:items-center sm:gap-4 sm:p-4`}>
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left sm:gap-4" aria-label={`Details for ${b.customerName ?? "booking"}`}>
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${c.chip}`}>{free ? <Gift size={20} /> : <CalendarDays size={20} />}</span>
        <span className="min-w-0">
          <span className="block text-[10px] font-bold tracking-wider opacity-80">{label}{!first ? ` Â· HOUR ${h.hour - Number(b.startTime.slice(0, 2)) + 1} OF ${b.duration}` : ""}</span>
          <span className="block truncate text-base font-extrabold leading-tight sm:text-lg">{(b.customerName || "Guest").toUpperCase()}{b.customerPhone && b.customerPhone !== "Tournament" ? ` - ${b.customerPhone}` : ""}</span>
          <span className="block text-[10px] font-semibold tracking-wide opacity-90">
            {b.duration} HOUR SESSION Â· {free ? "FREE GAME" : `${rs(b.totalPrice)} Â· ${b.paymentStatus === "completed" ? "PAID" : "UNPAID"}`} Â· ID: #{b.code.replace("UF-", "")}
          </span>
          {tags.length > 0 && (
            <span className="mt-1.5 flex flex-wrap gap-1">
              {tags.map((t) => <span key={t.text} className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-extrabold tracking-wider ${c.chip}`}><t.icon size={11} />{t.text}</span>)}
            </span>
          )}
        </span>
      </button>
      {first && (
        <div className="flex shrink-0 flex-col items-end self-end text-right sm:self-center">
          <span className="text-[9px] font-bold tracking-wider opacity-80">{free ? "GAME PRICE" : paid ? "AMOUNT PAID" : "AMOUNT DUE"}</span>
          {!free && b.discountAmount > 0 && <span className="text-[11px] font-semibold line-through opacity-70">{rs(b.totalPrice + b.discountAmount)}</span>}
          <span className="text-xl font-black leading-tight sm:text-2xl">{free ? "FREE" : rs(b.totalPrice)}</span>
          {!free && b.discountAmount > 0 && <span className={`mt-0.5 flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-extrabold ${c.chip}`}><Tag size={10} /> SAVED {rs(b.discountAmount)}</span>}
        </div>
      )}
      {live && first && (
        <button onClick={onReject} className={`flex shrink-0 items-center gap-1 self-end rounded-full bg-white px-3 py-1.5 text-[11px] font-bold tracking-wide sm:self-auto ${c.btn}`}>
          <X size={13} /> REJECT
        </button>
      )}
    </div>
    </>
  );
}

function Legend() {
  const items = [["bg-emerald-600", "Paid"], ["bg-red-600", "Not paid"], ["bg-yellow-400", "Tournament"], ["bg-violet-600", "Free game (loyalty)"]] as const;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted" aria-label="Colour guide">
      {items.map(([bg, l]) => <span key={l} className="flex items-center gap-1.5"><span className={`h-3 w-3 rounded ${bg}`} />{l}</span>)}
    </div>
  );
}

export default function SlotsPage() {
  // a live notification opens the day of the booking (?date=YYYY-MM-DD) and highlights it (?hl=)
  const [date, setDate] = useState(() => {
    const d = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("date") : null;
    return d && /^d{4}-d{2}-d{2}$/.test(d) ? d : todayKey();
  });
  const [hours, setHours] = useState<Hour[] | null>(null);
  const [error, setError] = useState("");
  const [book, setBook] = useState<number | null>(null);
  const [bulk, setBulk] = useState(false);
  const [detail, setDetail] = useState<Booking | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // Keep the grid live: re-fetch every 10s and when the tab regains focus, so customer-site bookings appear on their own.
  useEffect(() => {
    const bump = () => { if (document.visibilityState === "visible") refresh(); };
    const t = setInterval(bump, 10000);
    document.addEventListener("visibilitychange", bump);
    window.addEventListener("focus", bump);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", bump); window.removeEventListener("focus", bump); };
  }, [refresh]);

  useEffect(() => {
    let live = true;
    getDay(date)
      .then((d) => { if (live) { setHours(d.hours); setError(""); } })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load the day"); });
    return () => { live = false; };
  }, [date, tick]);

  const go = (d: string) => { setDate(d); setHours(null); setError(""); };
  const isPast = (hour: number) => date < todayKey() || (date === todayKey() && hour < nowHour());
  useHighlight(!!hours);
  const shown = hours?.filter((h) => (h.hour >= OPEN_FROM && h.hour < OPEN_TO) || h.state !== "free") ?? [];

  async function reject(h: Hour) {
    if (!guard("bookings.cancel")) return;
    const b = h.booking!;
    if (!(await askConfirm(`Reject ${b.customerName ?? "this booking"} (${b.code})? The hour will be freed${b.paymentStatus === "completed" ? " and a refund will be marked due" : ""}.`))) return;
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
    <div className="w-full space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight">Manual Booking</h1>
        </div>
        <button onClick={() => guard("bookings.create") && setBulk(true)} className="flex shrink-0 items-center whitespace-nowrap gap-1.5 rounded-full border border-line bg-surface px-3 py-2 text-xs font-semibold hover:border-brand"><CalendarPlus size={14} /> Bulk booking</button>
      </div>
      <DatePicker date={date} onChange={go} />

      {date !== todayKey() && <button onClick={() => go(todayKey())} className="text-sm font-semibold text-brand">Back to today</button>}

      <section className="rounded-3xl bg-surface p-3 shadow-sm sm:p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-line pb-3">
          <h2 className="text-xs font-extrabold tracking-wide">BOOKING SLOTS SCHEDULE</h2>
          <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold text-brand">ACTIVE SYSTEM</span>
        </div>

        {error && <p className="mb-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
        {!hours && !error && <p className="py-12 text-center text-sm text-muted">Loading the dayâ€¦</p>}

        <ul className="space-y-2">
          {shown.map((h) => {
            const past = isPast(h.hour);
            return (
              <li key={h.hour} data-hl={h.booking && Number(h.booking.startTime.slice(0, 2)) === h.hour ? `b-${h.booking.id}` : undefined} className="flex items-center gap-3 sm:gap-4">
                <span className="w-16 shrink-0 text-xs font-extrabold sm:w-20 sm:text-sm">{hourLabel(h.hour)}</span>
                <div className="min-w-0 flex-1">
                  {h.state === "booked" && h.booking && <BookedCard h={h} today={date === todayKey()} onOpen={() => open(h)} onReject={() => reject(h)} />}

                  {h.state === "blocked" && (
                    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2 p-3 sm:p-4">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface text-muted"><Lock size={18} /></span>
                      <span className="min-w-0">
                        <span className="block text-[10px] font-bold tracking-wider text-muted">BLOCKED</span>
                        <span className="block truncate text-sm font-bold">{h.block?.reason ?? "Not available"}</span>
                      </span>
                    </div>
                  )}

                  {h.state === "free" && h.member && (
                    <div className="flex items-center gap-3 rounded-2xl border border-violet-500/40 bg-violet-500/10 p-3 sm:p-4">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface text-violet-600"><Lock size={18} /></span>
                      <span className="min-w-0">
                        <span className="block text-[10px] font-bold tracking-wider text-violet-700">MEMBER HOLD{h.member.memberCode ? ` Â· ${h.member.memberCode}` : ""}</span>
                        <span className="block truncate text-sm font-bold">{h.member.name ?? h.member.userId}</span>
                      </span>
                    </div>
                  )}

                  {h.state === "free" && !h.member && (
                    <button onClick={() => guard("bookings.create") && setBook(h.hour)} aria-label={`${past ? "Log a past booking at" : "Book"} ${hourLabel(h.hour)}`}
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
        <div className="mt-4 space-y-3 border-t border-line pt-3">
        <p className="text-xs text-muted">Tap + on an open hour to book a customer by hand. Open hours are 5 AM to 10 PM.</p>
        <Legend />
        <p className="text-xs leading-relaxed text-muted">Chips on each game show Guest, Paid or Unpaid, Promo code with its amount, Free game, booked by staff and Mineral water waived. On today&apos;s games, Coming means the customer tapped I&apos;m coming in the app; Arrival not confirmed means they have not yet.</p>
        </div>
      </section>

      {book !== null && hours && (
        <BookSlotModal date={date} hours={hours} hour={book} past={isPast(book)} onClose={() => setBook(null)} onBooked={() => { setBook(null); refresh(); }} />
      )}
      {bulk && <BulkBookModal startDate={date} onClose={() => setBulk(false)} onBooked={refresh} />}
      {detail && <BookingDetailSheet booking={detail} onClose={() => setDetail(null)} onChanged={refresh} billing={false} />}
    </div>
  );
}
