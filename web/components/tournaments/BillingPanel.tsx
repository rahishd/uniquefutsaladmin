"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Download, Lock, LockOpen, MessageCircle, Minus, Plus, Search, Trash2, X } from "lucide-react";
import { Badge } from "../bookings/Badge";
import PaySplit, { INITIAL_PAY, PayState, paymentsFor } from "../PaySplit";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { rs } from "@/lib/bookings";
import { Bill, addItems, addLine, billLink, downloadBillPdf, fmtDay, getBill, makeFinalBill, range, receivePayment, removeLine, reopenBill, setRate } from "@/lib/hosted-tournaments";
import { Product, listProducts } from "@/lib/inventory";

const input = "rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");

function Sheet({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()} className="max-h-[94vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{title}</h2>{sub && <p className="text-sm text-muted">{sub}</p>}</div><button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-surface-2"><X size={20} /></button></div>
        {children}
      </div>
    </div>
  );
}

// ---------- add goods from the shop ----------
function ItemsSheet({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: (b: Bill) => void }) {
  const [q, setQ] = useState("");
  const [products, setProducts] = useState<Product[] | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => { listProducts({ q }).then((p) => live && setProducts(p)).catch((e) => live && setError(msg(e))); }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [q]);
  const chosen = Object.entries(qty).filter(([, n]) => n > 0);
  const worth = chosen.reduce((t, [pid, n]) => t + n * (products?.find((p) => p.id === pid)?.price ?? 0), 0);
  const set = (p: Product, n: number | ((now: number) => number)) => setQty((x) => ({ ...x, [p.id]: Math.max(0, Math.min(p.stock, typeof n === "function" ? n(x[p.id] ?? 0) : n)) }));
  async function save() {
    setBusy(true); setError("");
    try { onDone(await addItems(id, chosen.map(([productId, quantity]) => ({ productId, quantity })))); onClose(); } catch (e) { setError(msg(e)); setBusy(false); }
  }
  return (
    <Sheet title="Add goods to the bill" sub="Taken from the shop stock now. Prices come from the product." onClose={onClose}>
      <label className="relative block"><Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a product" className={`${input} w-full pl-10`} /></label>
      {!products && !error && <p className="text-sm text-muted">Loading…</p>}
      {products && products.length === 0 && <p className="text-sm text-muted">No product found.</p>}
      <ul className="divide-y divide-line">
        {products?.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
            <span className="min-w-0"><span className="block truncate font-medium">{p.name}</span><span className="block text-xs text-muted">{rs(p.price)} · {p.stock} in stock</span></span>
            {p.stock === 0 ? <Badge tone="bg-red-500/15 text-red-700">Out of stock</Badge> : (
              <span className="flex shrink-0 items-center gap-1.5">
                <button type="button" onClick={() => set(p, (v) => v - 1)} aria-label={`Less ${p.name}`} className="grid h-8 w-8 place-items-center rounded-full border border-line"><Minus size={14} /></button>
                <input inputMode="numeric" aria-label={`${p.name} quantity`} className={`${input} !w-14 !px-1 text-center`} value={qty[p.id] ?? 0} onChange={(e) => set(p, Number(e.target.value.replace(/\D/g, "")) || 0)} />
                <button type="button" onClick={() => set(p, (v) => v + 1)} aria-label={`More ${p.name}`} className="grid h-8 w-8 place-items-center rounded-full border border-line"><Plus size={14} /></button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      <button onClick={save} disabled={busy || chosen.length === 0} className="w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-50">{busy ? "Adding…" : chosen.length ? `Add ${chosen.reduce((t, [, n]) => t + n, 0)} items · ${rs(worth)}` : "Choose how many"}</button>
    </Sheet>
  );
}

// ---------- extra charge or discount ----------
function LineSheet({ id, kind, onClose, onDone }: { id: string; kind: "extra" | "discount"; onClose: () => void; onDone: (b: Bill) => void }) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true); setError("");
    try { onDone(await addLine(id, { kind, label: label.trim(), amount: Number(amount) })); onClose(); } catch (e) { setError(msg(e)); setBusy(false); }
  }
  return (
    <Sheet title={kind === "extra" ? "Add an extra charge" : "Give a discount"} sub={kind === "extra" ? "For example a referee, a trophy, lights or cleaning." : "Taken off the total."} onClose={onClose}>
      <input className={`${input} w-full`} value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder={kind === "extra" ? "What is it for" : "Why (for example regular host)"} />
      <input inputMode="numeric" className={`${input} w-full`} value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="Amount in Rs." />
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      <button onClick={save} disabled={busy || label.trim().length < 2 || !Number(amount)} className="w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : kind === "extra" ? "Add charge" : "Give discount"}</button>
    </Sheet>
  );
}

// ---------- receive a payment ----------
function PaySheet({ b, onClose, onDone }: { b: Bill; onClose: () => void; onDone: (b: Bill) => void }) {
  const [amount, setAmount] = useState(String(b.due));
  const [note, setNote] = useState("");
  const [pay, setPay] = useState<PayState>(INITIAL_PAY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const n = Number(amount);
  const ready = paymentsFor(n, pay);
  async function save() {
    if (!guard("tournaments.bill")) return;
    if (ready.problem) return setError(ready.problem);
    setBusy(true); setError("");
    try { onDone(await receivePayment(b.id, { amount: n, ...(ready.payments ? { payments: ready.payments } : { single: ready.single }), fonepayQrId: ready.fonepayQrId, note: note.trim() || undefined })); onClose(); } catch (e) { setError(msg(e)); setBusy(false); }
  }
  return (
    <Sheet title="Receive a payment" sub={`${b.name} · due ${rs(b.due)}`} onClose={onClose}>
      <label className="block text-sm font-medium">Amount received now (Rs.)
        <input inputMode="numeric" className={`${input} mt-1 w-full text-lg font-bold`} value={amount} onChange={(e) => { setAmount(e.target.value.replace(/\D/g, "").slice(0, 8)); setPay({ ...pay, qr: null }); setError(""); }} />
      </label>
      <div className="flex gap-2 text-xs">{[Math.round(b.due / 2), b.due].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map((v) => <button key={v} type="button" onClick={() => { setAmount(String(v)); setPay({ ...pay, qr: null }); }} className="rounded-full border border-line px-3 py-1 font-semibold">{v === b.due ? "All due" : "Half"} {rs(v)}</button>)}</div>
      {n > 0 && n <= b.due && <PaySplit total={n} value={pay} onChange={(v) => { setPay(v); setError(""); }} customerPhone={b.hostPhone ?? undefined} />}
      <input className={`${input} w-full`} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Note (for example advance, final settlement)" />
      {n > b.due && <p className="text-xs font-semibold text-red-600">More than is due ({rs(b.due)}).</p>}
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      <button onClick={save} disabled={busy || !(n > 0) || n > b.due || !!ready.problem} className="w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : `Receive ${rs(n || 0)}`}</button>
    </Sheet>
  );
}

// ---------- the panel ----------
export default function BillingPanel({ id, canBill, onChanged }: { id: string; canBill: boolean; onChanged?: () => void }) {
  const [b, setB] = useState<Bill | null>(null);
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState<"items" | "extra" | "discount" | "pay" | null>(null);
  const [rate, setRateText] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { getBill(id).then((x) => { setB(x); setRateText(String(x.rate)); setError(""); }).catch((e) => setError(msg(e))); }, [id]);
  useEffect(() => { load(); }, [load]);
  const apply = (x: Bill) => { setB(x); setRateText(String(x.rate)); setError(""); onChanged?.(); };
  async function run(fn: () => Promise<Bill>) { setBusy(true); setError(""); try { apply(await fn()); } catch (e) { setError(msg(e)); } finally { setBusy(false); } }

  if (error && !b) return <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>;
  if (!b) return <p className="py-6 text-center text-sm text-muted">Loading the bill…</p>;
  const closed = !!b.closedAt;
  const edit = canBill && !closed;
  const goods = b.lines.filter((l) => l.kind === "goods");
  const other = b.lines.filter((l) => l.kind !== "goods");

  return (
    <section aria-label="Billing" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="text-lg font-bold">Billing and payments</h2><p className="text-sm text-muted">Host: <strong className="text-foreground">{b.hostName}</strong>{b.hostPhone ? ` · ${b.hostPhone}` : ""}</p></div>
        <Badge tone={closed ? "bg-slate-500/15 text-slate-600" : "bg-green-500/15 text-green-700"}>{closed ? "Final bill made" : "Bill open"}</Badge>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-surface p-3 shadow-sm"><p className="text-xs text-muted">Total bill</p><p className="text-lg font-bold">{rs(b.total)}</p></div>
        <div className="rounded-2xl bg-surface p-3 shadow-sm"><p className="text-xs text-muted">Received</p><p className="text-lg font-bold text-green-700">{rs(b.paid)}</p></div>
        <div className={`rounded-2xl p-3 shadow-sm ${b.due > 0 ? "bg-red-500/10" : "bg-surface"}`}><p className="text-xs text-muted">Still to pay</p><p className={`text-lg font-bold ${b.due > 0 ? "text-red-600" : ""}`}>{rs(b.due)}</p></div>
      </div>
      {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}

      <div className="space-y-4 rounded-2xl bg-surface p-4 shadow-sm">
        <div>
          <h3 className="mb-1 text-sm font-bold">Court hours</h3>
          <ul className="divide-y divide-line text-sm">
            {b.days.map((d) => <li key={d.id} className="flex justify-between gap-3 py-2"><span>{fmtDay(d.date)}, {range(d)} <span className="text-xs text-muted">· {d.hours} h</span></span><strong>{rs(d.amount)}</strong></li>)}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">{b.hours} hours at Rs.</span>
            <input inputMode="numeric" aria-label="Rate per hour" className={`${input} !w-24 !py-1.5`} value={rate} disabled={!edit} onChange={(e) => setRateText(e.target.value.replace(/\D/g, "").slice(0, 6))} />
            <span className="text-muted">an hour</span>
            {edit && Number(rate) >= 100 && Number(rate) !== b.rate && <button onClick={() => run(() => setRate(id, Number(rate)))} disabled={busy} className="rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white">Change rate</button>}
            <strong className="ml-auto">{rs(b.court)}</strong>
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between"><h3 className="text-sm font-bold">Goods taken during the tournament</h3>{edit && <button onClick={() => guard("tournaments.bill") && setSheet("items")} className="flex items-center gap-1 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white"><Plus size={13} /> Add inventory</button>}</div>
          {goods.length === 0 ? <p className="text-sm text-muted">Nothing taken yet.</p> : (
            <ul className="divide-y divide-line text-sm">{goods.map((l) => <li key={l.id} className="flex items-center justify-between gap-3 py-2"><span>{l.quantity} x {l.label} <span className="text-xs text-muted">@ {rs(l.unitPrice)}</span></span><span className="flex items-center gap-2"><strong>{rs(l.amount)}</strong>{edit && <button onClick={() => run(() => removeLine(id, l.id))} aria-label={`Remove ${l.label}`} className="text-red-600"><Trash2 size={15} /></button>}</span></li>)}</ul>
          )}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between"><h3 className="text-sm font-bold">Extra charges and discounts</h3>{edit && <span className="flex gap-1.5"><button onClick={() => setSheet("extra")} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold">+ Charge</button><button onClick={() => setSheet("discount")} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold">- Discount</button></span>}</div>
          {other.length === 0 ? <p className="text-sm text-muted">None.</p> : (
            <ul className="divide-y divide-line text-sm">{other.map((l) => <li key={l.id} className="flex items-center justify-between gap-3 py-2"><span>{l.label}</span><span className="flex items-center gap-2"><strong className={l.amount < 0 ? "text-green-700" : ""}>{l.amount < 0 ? "-" : ""}{rs(Math.abs(l.amount))}</strong>{edit && <button onClick={() => run(() => removeLine(id, l.id))} aria-label={`Remove ${l.label}`} className="text-red-600"><Trash2 size={15} /></button>}</span></li>)}</ul>
          )}
        </div>

        <div className="flex justify-between border-t border-line pt-3 text-base font-bold"><span>Total</span><span>{rs(b.total)}</span></div>
      </div>

      <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
        <div className="flex items-center justify-between"><h3 className="text-sm font-bold">Payments received</h3>{canBill && b.due > 0 && <button onClick={() => guard("tournaments.bill") && setSheet("pay")} className="rounded-full bg-brand px-4 py-1.5 text-xs font-semibold text-white">Receive payment</button>}</div>
        {b.payments.length === 0 ? <p className="text-sm text-muted">No payment yet.</p> : (
          <ul className="divide-y divide-line text-sm">{b.payments.map((p) => <li key={p.id} className="flex items-start justify-between gap-3 py-2"><span>{new Date(p.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kathmandu" })}<span className="block text-xs text-muted">{p.cash ? `Cash ${rs(p.cash)}` : ""}{p.cash && p.fonepay ? " + " : ""}{p.fonepay ? `Fonepay ${rs(p.fonepay)}` : ""}{p.note ? ` · ${p.note}` : ""}</span></span><strong className="text-green-700">{rs(p.amount)}</strong></li>)}</ul>
        )}
        {b.due <= 0 && b.total > 0 && <p className="flex items-center gap-1.5 text-sm font-semibold text-green-700"><CheckCircle2 size={16} /> Paid in full</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        {canBill && !closed && <button onClick={() => guard("tournaments.bill") && window.confirm("Make the final bill? Goods and charges can no longer be changed (you can reopen it).") && run(() => makeFinalBill(id))} disabled={busy} className="flex items-center gap-1.5 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white"><Lock size={15} /> Make the final bill</button>}
        {canBill && closed && <button onClick={() => run(() => reopenBill(id))} disabled={busy} className="flex items-center gap-1.5 rounded-full border border-line px-4 py-2.5 text-sm font-semibold"><LockOpen size={15} /> Reopen the bill</button>}
        <button onClick={() => downloadBillPdf(b)} className="flex items-center gap-1.5 rounded-full border border-line px-4 py-2.5 text-sm font-semibold"><Download size={15} /> Download PDF</button>
        <a href={billLink(b)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-full bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white"><MessageCircle size={15} /> Send to the host on WhatsApp</a>
      </div>

      {sheet === "items" && <ItemsSheet id={id} onClose={() => setSheet(null)} onDone={apply} />}
      {(sheet === "extra" || sheet === "discount") && <LineSheet id={id} kind={sheet} onClose={() => setSheet(null)} onDone={apply} />}
      {sheet === "pay" && <PaySheet b={b} onClose={() => setSheet(null)} onDone={apply} />}
    </section>
  );
}
