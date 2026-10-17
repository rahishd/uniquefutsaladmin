"use client";

import { useEffect, useMemo, useState } from "react";
import { Cake, Gift, Loader2, Send } from "lucide-react";
import { Badge } from "../bookings/Badge";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { askConfirm } from "@/lib/confirm";
import { BirthdayList, DEFAULT_WISH, listBirthdays, sendWishes } from "@/lib/content";

const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");
const field = "rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const first = (name: string) => name.trim().split(/\s+/)[0] || name;

// Site Content > Birthdays: customers whose birthday is today. Staff tick some or all, write (or keep) the message, optionally
// attach a promo code as a gift, and send. Each customer can be wished once a year.
export default function BirthdaysPanel({ onCount }: { onCount?: (n: number) => void }) {
  const [data, setData] = useState<BirthdayList | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState(DEFAULT_WISH);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    listBirthdays()
      .then((d) => {
        if (!live) return;
        setData(d);
        setError("");
        onCount?.(d.people.filter((p) => !p.wished).length);
        // keep only people who can still be wished (a sent wish is ticked off)
        setPicked((p) => new Set([...p].filter((phone) => d.people.some((x) => x.phone === phone && !x.wished))));
      })
      .catch((e) => live && setError(msg(e)));
    return () => { live = false; };
  }, [tick, onCount]);

  const open = useMemo(() => (data?.people ?? []).filter((p) => !p.wished), [data]);
  const allPicked = open.length > 0 && open.every((p) => picked.has(p.phone));
  const chosen = data?.promoCodes.find((c) => c.code === code) ?? null;
  const sample = open.find((p) => picked.has(p.phone)) ?? open[0];
  const preview = sample
    ? `${message.split("{name}").join(first(sample.name))}${chosen ? ` A birthday gift: use code ${chosen.code} (${chosen.label}) on your next booking.` : ""}`
    : "";

  function toggle(phone: string) {
    setPicked((p) => { const n = new Set(p); if (n.has(phone)) n.delete(phone); else n.add(phone); return n; });
  }

  async function send() {
    if (!guard("content.birthdays") || busy || picked.size === 0) return;
    const n = picked.size;
    const gift = chosen ? ` with the code ${chosen.code}` : "";
    if (!(await askConfirm(`Send a birthday wish${gift} to ${n} ${n === 1 ? "customer" : "customers"}?`, { title: "Send birthday wishes?", confirmLabel: "Send wishes" }))) return;
    setBusy(true);
    setError("");
    setNote("");
    try {
      const r = await sendWishes({ phones: [...picked], message: message.trim() || undefined, promoCode: code || undefined });
      const parts = [`Sent to ${r.sent} ${r.sent === 1 ? "customer" : "customers"}.`];
      if (r.alreadyWished) parts.push(`${r.alreadyWished} already wished this year.`);
      if (r.skippedOptOut) parts.push(`${r.skippedOptOut} skipped (promotional notices are off).`);
      setNote(parts.join(" "));
      setPicked(new Set());
      setTick((t) => t + 1);
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-surface p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-amber-500/15 text-amber-600"><Cake size={20} /></span>
          <div>
            <p className="font-semibold">Birthdays today{data ? ` (${data.people.length})` : ""}</p>
            <p className="text-xs text-muted">Customers add their date of birth when they sign up. Wish them, with a promo code as a gift if you like.</p>
          </div>
        </div>
        {open.length > 0 && (
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(open.map((p) => p.phone)))} />
            Select all ({open.length})
          </label>
        )}
      </div>

      {note && <p className="rounded-xl bg-brand/10 p-3 text-sm text-brand" role="status">{note}</p>}
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!data && !error && <p className="py-8 text-center text-sm text-muted">Loading birthdays…</p>}

      {data && data.people.length === 0 && (
        <div className="grid place-items-center gap-2 rounded-2xl bg-surface py-12 text-center text-muted shadow-sm"><Cake size={32} strokeWidth={1.5} /><p>No customer has a birthday today.</p></div>
      )}

      {data && data.people.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {data.people.map((p) => (
            <li key={p.phone}>
              <label className={`flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-sm ${p.wished ? "opacity-60" : "cursor-pointer"}`}>
                <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={picked.has(p.phone)} disabled={p.wished} onChange={() => toggle(p.phone)} aria-label={`Select ${p.name}`} />
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand/10 text-sm font-bold text-brand">{p.name.trim().charAt(0).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{p.name}</span>
                  <span className="block text-xs text-muted">{p.phone}{p.age !== null ? ` · turns ${p.age}` : ""}</span>
                </span>
                {p.wished && <Badge tone="bg-emerald-500/15 text-emerald-600">Wished</Badge>}
              </label>
            </li>
          ))}
        </ul>
      )}

      {data && open.length > 0 && (
        <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
          <label className="block text-sm font-medium">
            Message <span className="font-normal text-muted">({"{name}"} becomes the customer&apos;s first name)</span>
            <textarea className={`${field} mt-1 w-full`} rows={3} maxLength={200} value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>

          <label className="block text-sm font-medium">
            <span className="flex items-center gap-1.5"><Gift size={15} /> Gift promo code <span className="font-normal text-muted">(optional)</span></span>
            <select className={`${field} mt-1 w-full`} value={code} onChange={(e) => setCode(e.target.value)}>
              <option value="">No code, just the wish</option>
              {data.promoCodes.map((c) => (
                <option key={c.code} value={c.code}>{c.code} · {c.label}{c.expiryDate ? ` · until ${c.expiryDate}` : ""}</option>
              ))}
            </select>
            {data.promoCodes.length === 0 && <span className="mt-1 block text-xs font-normal text-muted">No active promo codes. Create one under Promos to offer a gift.</span>}
            {chosen && <span className="mt-1 block text-xs font-normal text-muted">Customers who turned promotional notices off will not get a wish that carries a code.</span>}
          </label>

          {preview && (
            <div className="rounded-xl bg-surface-2 p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">What the customer sees</p>
              <p className="mt-1 font-semibold">Happy Birthday!</p>
              <p className="text-muted">{preview}</p>
            </div>
          )}

          <button onClick={send} disabled={busy || picked.size === 0 || message.trim().length < 2} className="flex w-full items-center justify-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {picked.size === 0 ? "Select customers to wish" : `Send wish to ${picked.size} ${picked.size === 1 ? "customer" : "customers"}`}
          </button>
        </div>
      )}
    </div>
  );
}
