"use client";

import { useEffect, useState } from "react";
import { Package, ShoppingBag, X } from "lucide-react";
import { Badge } from "../bookings/Badge";
import Dues from "../bookings/Dues";
import { prettyDate, rs } from "@/lib/bookings";
import { CustomerGoods, CustomerGoodsItem, METHOD_LABEL, Row, customerGoods } from "@/lib/payments";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
const KIND: Record<string, string> = { court: "Court booking", gamezone: "Gamezone session", club: "Unique Club membership", gift: "Gift Card points" };

const Line = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex justify-between gap-4 py-2 text-sm"><dt className="text-muted">{label}</dt><dd className="text-right font-medium">{children}</dd></div>
);

// One goods entry: what was taken (each product and quantity), who gave it, when, and what it cost.
function Goods({ g }: { g: CustomerGoodsItem }) {
  return (
    <li className={`space-y-1.5 rounded-xl p-3 text-sm ${g.status === "due" ? "bg-red-500/10" : "bg-surface-2"}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-start gap-2"><Package size={16} className="mt-0.5 shrink-0 text-muted" /><span className="min-w-0 font-medium">{g.items}</span></span>
        <span className="shrink-0 font-bold">{rs(g.amount)}</span>
      </div>
      {g.lines.length > 1 && (
        <ul className="ml-6 space-y-0.5 text-xs text-muted">
          {g.lines.map((l, i) => <li key={i} className="flex justify-between gap-3"><span>{l.quantity} × {l.label}</span><span>{rs(l.amount)}</span></li>)}
        </ul>
      )}
      <p className="ml-6 text-[11px] text-muted">
        {g.source}{g.by ? ` (${g.by})` : ""} · {when(g.createdAt)}
        {g.status === "paid" && g.paidAt ? ` · paid ${when(g.paidAt)}${g.paidBy ? ` by ${g.paidBy}` : ""}${g.checkoutCode ? ` · bill ${g.checkoutCode}` : ""}` : ""}
      </p>
    </li>
  );
}

// Click a payment row to see everything about it: the booking or session, every inventory item this customer took from the venue (still owed and
// already paid), and, for an unpaid court booking, all their dues with the payment form.
export default function PaymentDetails({ row, onClose, onChanged }: { row: Row; onClose: () => void; onChanged: () => void }) {
  const [goods, setGoods] = useState<CustomerGoods | null>(null);
  const [error, setError] = useState("");
  const [again, setAgain] = useState(0);

  useEffect(() => {
    if (!row.phone) return;
    let live = true;
    customerGoods(row.phone).then((g) => live && setGoods(g)).catch((e) => live && setError(e instanceof Error ? e.message : "Could not load the goods"));
    return () => { live = false; };
  }, [row.phone, again]);

  const status = row.status === "paid" ? { label: "Paid", tone: "bg-brand/15 text-brand" } : row.status === "unpaid" ? { label: "Unpaid", tone: "bg-amber-500/15 text-amber-600" } : { label: "Cancelled", tone: "bg-slate-500/15 text-slate-500" };
  const collectHere = row.kind === "court" && row.status === "unpaid"; // the dues form (includes the goods) takes the payment

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label="Payment details" onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted">{KIND[row.kind] ?? row.kind} · <span className="font-mono">{row.code}</span></p>
            <h2 className="truncate text-xl font-bold">{row.customer || "Guest"}</h2>
            <p className="text-sm text-muted">{row.phone || "No phone"}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-surface-2"><X size={22} /></button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Badge tone={status.tone}>{status.label}</Badge>
          <Badge tone={row.mode === "cash" ? "bg-surface-2 text-foreground" : "bg-blue-500/15 text-blue-600"}>{row.mode === "cash" ? "Cash at venue" : `Online · ${METHOD_LABEL[row.method] ?? row.method}`}</Badge>
          {(row.clubDiscount ?? 0) > 0 && <Badge tone="bg-sky-500/15 text-sky-700">Club member −{rs(row.clubDiscount!)}</Badge>}
        </div>

        <dl className="divide-y divide-line rounded-xl border border-line px-3">
          <Line label="Game date">{prettyDate(row.date)}</Line>
          <Line label="Time">{row.time}</Line>
          <Line label={row.status === "paid" ? "Amount paid" : "Amount"}>{rs(row.amount)}</Line>
        </dl>

        <section className="space-y-2" aria-label="Inventory and goods">
          <p className="flex items-center gap-2 text-sm font-bold"><ShoppingBag size={16} /> Inventory &amp; goods taken from the venue</p>
          {!row.phone && <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">This payment has no phone number, so goods cannot be matched to the customer.</p>}
          {row.phone && !goods && !error && <p className="text-sm text-muted">Loading…</p>}
          {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
          {goods && goods.due.length === 0 && goods.paid.length === 0 && <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">No goods taken from the venue by this customer.</p>}
          {goods && goods.due.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-bold uppercase tracking-wide text-red-600">Still to pay · {rs(goods.dueTotal)}</p>
              <ul className="space-y-1.5">{goods.due.map((g) => <Goods key={g.id} g={g} />)}</ul>
            </div>
          )}
          {goods && goods.paid.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Already paid (latest {goods.paid.length})</p>
              <ul className="space-y-1.5">{goods.paid.map((g) => <Goods key={g.id} g={g} />)}</ul>
            </div>
          )}
        </section>

        {collectHere && <Dues bookingId={row.ref} onPaid={() => { onChanged(); setAgain((n) => n + 1); }} />}
      </div>
    </div>
  );
}
