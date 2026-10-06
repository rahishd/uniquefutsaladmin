"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Badge } from "./Badge";
import Dues from "./Dues";
import { BookingDetail, METHOD, PAYMENT, STATUS, bookingDetail, prettyDate, rs, tags, Booking } from "@/lib/bookings";

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex justify-between gap-4 py-2 text-sm">
    <dt className="text-muted">{label}</dt>
    <dd className="text-right font-medium">{children}</dd>
  </div>
);

export default function BookingDetailSheet({ booking, onClose, onChanged }: { booking: Booking; onClose: () => void; onChanged?: () => void }) {
  const [detail, setDetail] = useState<BookingDetail | null>(null);
  const [error, setError] = useState("");
  const [again, setAgain] = useState(0); // refetch after a payment is collected

  useEffect(() => {
    let live = true;
    bookingDetail(booking.id).then((d) => live && setDetail(d)).catch((e) => live && setError(e instanceof Error ? e.message : "Could not load details"));
    return () => { live = false; };
  }, [booking.id, again]);

  const b = detail?.booking ?? booking;
  const st = STATUS[b.status] ?? { label: b.status, tone: "bg-slate-500/15 text-slate-500" };
  const pay = PAYMENT[b.paymentStatus] ?? { label: b.paymentStatus, tone: "bg-slate-500/15 text-slate-500" };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Booking details">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <p className="font-mono text-sm text-muted">{b.code}</p>
            <h2 className="text-xl font-bold">{prettyDate(b.date)}</h2>
            <p className="text-muted">{b.startTime} – {b.endTime} · {b.duration} hour{b.duration > 1 ? "s" : ""}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-surface-2"><X size={22} /></button>
        </div>

        <div className="mb-2 flex flex-wrap gap-2">
          <Badge tone={st.tone}>{st.label}</Badge>
          <Badge tone={pay.tone}>{pay.label}</Badge>
          {tags(b).map((t) => <Badge key={t} tone="bg-surface-2 text-muted">{t}</Badge>)}
        </div>

        <dl className="divide-y divide-line">
          <Row label="Customer">{b.customerName || "—"}</Row>
          <Row label="Mobile">{b.customerPhone || b.userId || "—"}</Row>
          <Row label="Account">{b.userId ? "Registered" : "Guest"}</Row>
          <Row label="Court price">{rs(b.basePrice)}</Row>
          {b.discountAmount > 0 && <Row label={`Discount${b.promoCode ? ` (${b.promoCode})` : ""}`}>− {rs(b.discountAmount)}</Row>}
          <Row label="Total">{rs(b.totalPrice)}</Row>
          <Row label="Paid so far">{rs(b.amountPaidNow)}</Row>
          {b.remainingAmount > 0 && <Row label="To collect">{rs(b.remainingAmount)}</Row>}
          <Row label="Payment method">{METHOD[b.paymentMethod] ?? b.paymentMethod}</Row>
          {b.notes && <Row label="Notes">{b.notes}</Row>}
          <Row label="Booked on">{new Date(b.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</Row>
          {b.cancelledAt && <Row label="Cancelled on">{new Date(b.cancelledAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</Row>}
        </dl>

        {booking.paymentStatus !== "completed" && !(b.status === "cancelled" || b.status === "expired") && <Dues bookingId={b.id} onPaid={() => { onChanged?.(); setAgain((n) => n + 1); }} />}

        {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
        {!detail && !error && <p className="mt-3 text-sm text-muted">Loading payment details…</p>}

        {detail?.paymentOrder && (
          <section className="mt-4 rounded-xl bg-surface-2 p-3 text-sm">
            <p className="mb-1 font-semibold">Online payment</p>
            <p className="text-muted">
              {METHOD[detail.paymentOrder.method] ?? detail.paymentOrder.method} · {rs(detail.paymentOrder.amount)} · {detail.paymentOrder.status}
              {detail.paymentOrder.paidAt ? ` · paid ${new Date(detail.paymentOrder.paidAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}` : ""}
            </p>
          </section>
        )}

        {detail && detail.playerStats.length > 0 && (
          <section className="mt-4 rounded-xl bg-surface-2 p-3 text-sm">
            <p className="mb-1 font-semibold">Goals and assists</p>
            {detail.playerStats.map((s) => <p key={s.userId} className="text-muted">{s.userId}: {s.goals} goals, {s.assists} assists</p>)}
          </section>
        )}
      </div>
    </div>
  );
}
