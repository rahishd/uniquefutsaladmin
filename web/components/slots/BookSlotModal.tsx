"use client";

import CustomerSuggest from "../CustomerSuggest";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Hour, WalkInInput, bookManually, findCustomer, hhmm, hourLabel, longDate } from "@/lib/slots";
import { rs } from "@/lib/bookings";
import { ApiError } from "@/lib/api";

const PAYMENT = [
  { id: "unpaid", label: "Not paid yet (collect at the venue)", method: "venue" as const, paid: false },
  { id: "cash", label: "Paid in cash at the venue", method: "venue" as const, paid: true },
  // Fonepay is not offered here: it needs a dynamic QR, made from the booking's unpaid dues after booking
];

const input = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";

export default function BookSlotModal({ date, hours, hour, past, onClose, onBooked }: {
  date: string; hours: Hour[]; hour: number; past: boolean; onClose: () => void; onBooked: () => void;
}) {
  // Longest booking from this hour: consecutive free hours, at most 4.
  let maxHours = 0;
  while (maxHours < 4 && hours.find((h) => h.hour === hour + maxHours)?.state === "free" && !hours.find((h) => h.hour === hour + maxHours)?.member) maxHours++;

  const [duration, setDuration] = useState(1);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [found, setFound] = useState<{ phone: string; name: string } | null>(null); // result of the last lookup
  const [payment, setPayment] = useState("unpaid");
  const [price, setPrice] = useState<string | null>(null); // null = use the court price
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const standard = Array.from({ length: duration }, (_, i) => hours.find((h) => h.hour === hour + i)?.price ?? 0).reduce((a, b) => a + b, 0);
  const phoneOk = /^9\d{9}$/.test(phone);
  const registered = phoneOk && found?.phone === phone ? found.name : null;

  // A registered customer's name is filled in from their account.
  useEffect(() => {
    if (!phoneOk) return;
    let live = true;
    findCustomer(phone).then((r) => {
      const c = r.items.find((x) => x.phoneNumber === phone);
      if (!live || !c) return;
      setFound({ phone, name: c.name ?? "Registered customer" });
      if (c.name) setName((n) => n || c.name!);
    }).catch(() => {});
    return () => { live = false; };
  }, [phone, phoneOk]);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setError("");
    if (name.trim().length < 2) return setError("Enter the customer's name.");
    if (phone && !phoneOk) return setError("Enter a 10-digit mobile number starting with 9, or leave it empty.");
    const pay = PAYMENT.find((p) => p.id === payment)!;
    const body: WalkInInput = { date, startTime: hhmm(hour), duration, customerName: name.trim(), paymentMethod: pay.method, paid: pay.paid };
    if (phone) body.customerPhone = phone;
    if (price !== null && price !== "") body.priceOverride = Math.max(0, Math.round(Number(price)));
    if (notes.trim()) body.notes = notes.trim();
    setBusy(true);
    try {
      await bookManually(body);
      onBooked();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the booking");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl" aria-label="Book this slot">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold">{past ? "Log a past booking" : "Book this slot"}</h2>
            <p className="text-sm text-muted">{longDate(date)} · {hourLabel(hour)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-surface-2"><X size={22} /></button>
        </div>

        <label className="block text-sm font-medium">Mobile number <span className="font-normal text-muted">(optional)</span>
          <CustomerSuggest by="phone" className={`${input} mt-1`} value={phone} onChange={setPhone} onPick={(c) => { setPhone(c.phoneNumber); if (c.name) setName(c.name); }} placeholder="98XXXXXXXX" />
          {registered && <span className="mt-1 block text-xs font-normal text-brand">Registered customer: {registered}. Points are added to their account.</span>}
          {phoneOk && !registered && found?.phone !== phone && <span className="mt-1 block text-xs font-normal text-muted">Not registered: booked as a guest.</span>}
        </label>

        <label className="block text-sm font-medium">Customer name
          <CustomerSuggest by="name" className={`${input} mt-1`} value={name} onChange={setName} onPick={(c) => { setPhone(c.phoneNumber); if (c.name) setName(c.name); }} placeholder="Full name" autoFocus />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium">Hours
            <select className={`${input} mt-1`} value={duration} onChange={(e) => { setDuration(Number(e.target.value)); setPrice(null); }}>
              {Array.from({ length: Math.max(1, maxHours) }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} hour{i ? "s" : ""}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">Price (Rs.)
            <input className={`${input} mt-1`} inputMode="numeric" value={price ?? String(standard)} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} />
          </label>
        </div>
        {price !== null && Number(price) !== standard && <p className="-mt-2 text-xs text-muted">Court price is {rs(standard)}. The changed price is recorded as a discount.</p>}

        <label className="block text-sm font-medium">Payment
          <select className={`${input} mt-1`} value={payment} onChange={(e) => setPayment(e.target.value)}>
            {PAYMENT.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>

        <label className="block text-sm font-medium">Note <span className="font-normal text-muted">(optional)</span>
          <input className={`${input} mt-1`} value={notes} maxLength={200} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. phone booking, team name" />
        </label>

        {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}

        <button disabled={busy} className="w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-60">
          {busy ? "Saving…" : past ? "Log booking" : "Confirm booking"}
        </button>
      </form>
    </div>
  );
}
