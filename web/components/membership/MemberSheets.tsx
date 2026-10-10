"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import CustomerSuggest from "../CustomerSuggest";
import PaySplit, { INITIAL_PAY, PayState, paymentsFor } from "../PaySplit";
import WhatsAppInvoice from "../WhatsAppInvoice";
import { ApiError } from "@/lib/api";
import { rs } from "@/lib/bookings";
import { M_LENGTHS, MLength, MPlan, getPlans } from "@/lib/courts";
import {
  HOURS, Member, NewMember, Preview, WEEKDAYS, advanceOf, cancelMember, collectBalance, createMember, extendMember, h12, hourSlot, lengthLabel, previewMember, renewMember,
  shiftOfHour, shortDate, suspendMember, verifyMember,
} from "@/lib/membership";

const field = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");
const todayKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" }).format(new Date());

function Frame({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()} className="max-h-[94vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="text-lg font-bold">{title}</h2>{sub && <p className="text-sm text-muted">{sub}</p>}</div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-surface-2"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// How much to take now: everything, or half as an advance (the rest is collected later from the membership card).
function AmountChoice({ total, advance, onChange }: { total: number; advance: boolean; onChange: (advance: boolean) => void }) {
  const half = advanceOf(total);
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">How much is being paid now?</p>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1" role="group" aria-label="Amount to take now">
        {([[false, "Full payment", rs(total)], [true, "50% advance", rs(half)]] as const).map(([v, l, amt]) => (
          <button key={l} type="button" aria-pressed={advance === v} onClick={() => onChange(v)} className={`rounded-lg px-2 py-2 text-center text-xs font-semibold sm:text-sm ${advance === v ? "bg-brand text-white" : "text-muted"}`}>
            <span className="block">{l}</span><span className="block text-base font-bold">{amt}</span>
          </button>
        ))}
      </div>
      {advance && <p className="text-xs text-muted">The membership starts now. The remaining <strong>{rs(total - half)}</strong> is collected later with &ldquo;Collect balance&rdquo; on the membership.</p>}
    </div>
  );
}

function Done({ m, text, total, onClose }: { m: Member; text: string; total?: number; onClose: () => void }) {
  return (
    <div className="grid place-items-center gap-3 py-2 text-center">
      <CheckCircle2 size={40} className="text-brand" />
      <p className="font-bold">{text}</p>
      <p className="text-sm text-muted">{m.memberCode} · valid until {shortDate(m.endDate)}{m.pointsAdded ? ` · ${m.pointsAdded} loyalty points added` : ""}</p>
      {total ? <WhatsAppInvoice phone={m.customer.phone} code={m.memberCode} name={m.customer.name} total={total} points={m.pointsAdded}
        lines={[{ label: `${m.plan.name} membership, ${lengthLabel(m.length)} (${m.memberCode})`, amount: total }]} /> : null}
      <button onClick={onClose} className="w-full rounded-xl border border-line py-3 font-semibold">Done</button>
    </div>
  );
}

// ---------- a new membership ----------
export function NewMemberSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [plans, setPlans] = useState<MPlan[]>([]);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [planId, setPlanId] = useState("");
  const [length, setLength] = useState<MLength>("1_month");
  const [hour, setHour] = useState(7);
  const [days, setDays] = useState<string[]>([...WEEKDAYS]);
  const [start, setStart] = useState(todayKey());
  const [notes, setNotes] = useState("");
  const [payNow, setPayNow] = useState(true);
  const [advance, setAdvance] = useState(false);
  const [pay, setPay] = useState<PayState>(INITIAL_PAY);
  const [pv, setPv] = useState<{ key: string; data: Preview } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ m: Member; total: number | undefined } | null>(null);

  useEffect(() => { getPlans().then((p) => { const live = p.filter((x) => x.isActive); setPlans(live); setPlanId((cur) => cur || live.find((x) => x.featured)?.id || live[0]?.id || ""); }).catch((e) => setError(msg(e))); }, []);

  const plan = plans.find((p) => p.id === planId);
  const cell = plan?.matrix[shiftOfHour(hour)][length];
  const phoneOk = /^9\d{9}$/.test(phone);
  const ready = !!plan && phoneOk && days.length > 0 && cell?.customerPays != null;
  const key = [phone, planId, length, hour, days.join(), start].join("|");
  const preview = pv?.key === key ? pv.data : null; // a result for older choices is not shown

  // check the price and whether the hour is free on every chosen day, as the form changes
  useEffect(() => {
    if (!ready) return;
    let live = true;
    const t = setTimeout(() => {
      previewMember({ phone, planId, length, timeSlot: hourSlot(hour), days, startDate: start })
        .then((p) => { if (live) { setPv({ key, data: p }); setError(""); } })
        .catch((e) => live && setError(msg(e)));
    }, 300);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key]);

  const total = preview?.total ?? cell?.customerPays ?? 0;
  const dueNow = advance && total > 1 ? advanceOf(total) : total; // what is taken at this moment
  const paid = paymentsFor(dueNow, pay);
  const clash = !!preview?.clashes.length;
  const toggleDay = (d: string) => setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]));

  async function save() {
    if (!ready || clash) return;
    if (payNow && paid.problem) return setError(paid.problem);
    setBusy(true); setError("");
    const body: NewMember = { phone, planId, length, timeSlot: hourSlot(hour), days, startDate: start, notes: notes.trim() || undefined, ...(payNow ? { pay: { ...(paid.payments ? { payments: paid.payments, fonepayQrId: paid.fonepayQrId } : { single: paid.single, fonepayQrId: paid.fonepayQrId }), advance: advance && total > 1 } } : {}) };
    try { const m = await createMember(body); setDone({ m, total: payNow ? dueNow : undefined }); onDone(); } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  }

  if (done) return <Frame title="New membership" onClose={onClose}><Done m={done.m} total={done.total} text={done.total ? "Membership activated" : "Saved. It becomes active when the payment is verified."} onClose={onClose} /></Frame>;
  return (
    <Frame title="New membership" sub="The hour is held for the member on their days until the end date." onClose={onClose}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium">Customer name
          <CustomerSuggest by="name" className={`${field} mt-1`} value={name} onChange={(v) => { setName(v); if (phoneOk) setPhone(""); }} onPick={(c) => { setPhone(c.phoneNumber); setName(c.name ?? ""); }} placeholder="Type a name to find the customer" />
        </label>
        <label className="block text-sm font-medium">Mobile number
          <CustomerSuggest by="phone" className={`${field} mt-1`} value={phone} onChange={setPhone} onPick={(c) => { setPhone(c.phoneNumber); setName(c.name ?? ""); }} placeholder="98XXXXXXXX" />
        </label>
      </div>
      {phoneOk && name
        ? <p className="flex items-center gap-2 rounded-xl bg-brand/10 px-3 py-2 text-sm"><CheckCircle2 size={16} className="shrink-0 text-brand" /><span className="min-w-0 truncate"><strong>{name}</strong> <span className="text-muted">· {phone}</span></span></p>
        : <p className="text-xs text-muted">Search by name or mobile number and pick the registered customer. A membership needs a registered account.</p>}
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium">Plan
          <select className={`${field} mt-1`} value={planId} onChange={(e) => setPlanId(e.target.value)}>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </label>
        <label className="block text-sm font-medium">Length
          <select className={`${field} mt-1`} value={length} onChange={(e) => setLength(e.target.value as MLength)}>{M_LENGTHS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select>
        </label>
        <label className="block text-sm font-medium">Hour
          <select className={`${field} mt-1`} value={hour} onChange={(e) => setHour(Number(e.target.value))}>{HOURS.map((h) => <option key={h} value={h}>{h12(h)} – {h12(h + 1)}</option>)}</select>
        </label>
        <label className="block text-sm font-medium">Starts on
          <input type="date" className={`${field} mt-1`} value={start} min={todayKey()} onChange={(e) => setStart(e.target.value)} />
        </label>
      </div>
      <div>
        <div className="flex items-center justify-between"><p className="text-sm font-medium">Days of the week</p><button type="button" onClick={() => setDays(days.length === 7 ? [] : [...WEEKDAYS])} className="text-xs font-semibold text-brand">{days.length === 7 ? "Clear" : "Every day"}</button></div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {WEEKDAYS.map((d) => <button key={d} type="button" aria-pressed={days.includes(d)} onClick={() => toggleDay(d)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${days.includes(d) ? "bg-brand text-white" : "border border-line"}`}>{d.slice(0, 3)}</button>)}
        </div>
      </div>

      {plan && cell?.customerPays == null && <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-700">{plan.name} is not offered for this shift and length. Choose another hour or length, or set the price in Courts &gt; Membership.</p>}
      {preview && (
        <div className="rounded-xl bg-surface-2 p-3 text-sm">
          <p className="flex justify-between"><span>{plan?.name}, {lengthLabel(length)}, {preview.shift}</span><strong>{rs(preview.total)}</strong></p>
          {preview.discount > 0 && <p className="text-xs text-muted">Price {rs(preview.price)} less plan discount {rs(preview.discount)}</p>}
          <p className="text-xs text-muted">{shortDate(preview.startDate)} to {shortDate(preview.endDate)} · {preview.dates} game days</p>
          {clash && <p className="mt-2 text-xs font-semibold text-red-600">The hour is not free on {preview.clashes.length} of these days, for example {shortDate(preview.clashes[0].date)} ({preview.clashes[0].reason}). Change the hour or the days.</p>}
        </div>
      )}

      <div className="space-y-2 border-t border-line pt-3">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
          {([[true, "Collect payment now"], [false, "Pay later (pending)"]] as const).map(([v, l]) => <button key={l} type="button" aria-pressed={payNow === v} onClick={() => setPayNow(v)} className={`rounded-lg px-2 py-2 text-xs font-semibold sm:text-sm ${payNow === v ? "bg-brand text-white" : "text-muted"}`}>{l}</button>)}
        </div>
        {payNow && total > 1 && <AmountChoice total={total} advance={advance} onChange={(v) => { setAdvance(v); setError(""); }} />}
        {payNow && total > 0 && <PaySplit total={dueNow} value={pay} onChange={(v) => { setPay(v); setError(""); }} customerPhone={phoneOk ? phone : undefined} />}
        <input className={field} value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} placeholder="Note (optional)" />
      </div>
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      <button onClick={save} disabled={busy || !ready || !preview || clash || (payNow && !!paid.problem)} className="w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : payNow ? (advance && total > 1 ? `Take ${rs(dueNow)} advance and activate` : `Activate for ${rs(total)}`) : "Save as pending"}</button>
    </Frame>
  );
}

// ---------- verify the payment of a pending membership ----------
export function VerifySheet({ m, onClose, onDone }: { m: Member; onClose: () => void; onDone: () => void }) {
  const [pay, setPay] = useState<PayState>(INITIAL_PAY);
  const [advance, setAdvance] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Member | null>(null);
  const dueNow = advance && m.totalPrice > 1 ? advanceOf(m.totalPrice) : m.totalPrice;
  const paid = paymentsFor(dueNow, pay);
  async function save() {
    if (paid.problem) return setError(paid.problem);
    setBusy(true); setError("");
    try { setDone(await verifyMember(m.id, { ...(paid.payments ? { payments: paid.payments, fonepayQrId: paid.fonepayQrId } : { single: paid.single, fonepayQrId: paid.fonepayQrId }), advance: advance && m.totalPrice > 1 })); onDone(); } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  }
  return (
    <Frame title="Verify payment" sub={`${m.customer.name ?? m.customer.phone} · ${m.memberCode} · ${m.plan.name}`} onClose={onClose}>
      {done ? <Done m={done} total={dueNow} text={advance ? `Advance received, membership active. Balance ${rs(m.totalPrice - dueNow)} to collect` : "Payment verified, membership active"} onClose={onClose} /> : (
        <>
          <p className="text-3xl font-bold">{rs(m.totalPrice)}</p>
          {m.totalPrice > 1 && <AmountChoice total={m.totalPrice} advance={advance} onChange={(v) => { setAdvance(v); setError(""); }} />}
          <PaySplit total={dueNow} value={pay} onChange={(v) => { setPay(v); setError(""); }} customerPhone={m.customer.phone} />
          {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
          <button onClick={save} disabled={busy || !!paid.problem} className="w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : advance ? `Take ${rs(dueNow)} advance and activate` : "Verify and activate"}</button>
        </>
      )}
    </Frame>
  );
}

// ---------- collect the balance left after an advance ----------
export function BalanceSheet({ m, onClose, onDone }: { m: Member; onClose: () => void; onDone: () => void }) {
  const balance = m.balance ?? 0;
  const [pay, setPay] = useState<PayState>(INITIAL_PAY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Member | null>(null);
  const paid = paymentsFor(balance, pay);
  async function save() {
    if (paid.problem) return setError(paid.problem);
    setBusy(true); setError("");
    try { setDone(await collectBalance(m.id, paid.payments ? { payments: paid.payments, fonepayQrId: paid.fonepayQrId } : { single: paid.single, fonepayQrId: paid.fonepayQrId })); onDone(); } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  }
  return (
    <Frame title="Collect balance" sub={`${m.customer.name ?? m.customer.phone} · ${m.memberCode} · ${m.plan.name}`} onClose={onClose}>
      {done ? <Done m={done} total={balance} text="Balance received, membership paid in full" onClose={onClose} /> : (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-surface-2 p-2"><p className="text-[11px] text-muted">Price</p><p className="font-bold">{rs(m.totalPrice)}</p></div>
            <div className="rounded-xl bg-surface-2 p-2"><p className="text-[11px] text-muted">Paid</p><p className="font-bold text-brand">{rs(m.paid ?? 0)}</p></div>
            <div className="rounded-xl bg-amber-500/10 p-2"><p className="text-[11px] text-muted">Balance</p><p className="font-bold text-amber-700">{rs(balance)}</p></div>
          </div>
          <PaySplit total={balance} value={pay} onChange={(v) => { setPay(v); setError(""); }} customerPhone={m.customer.phone} />
          {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
          <button onClick={save} disabled={busy || balance <= 0 || !!paid.problem} className="w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : `Collect ${rs(balance)}`}</button>
        </>
      )}
    </Frame>
  );
}

// ---------- renew (paid now) ----------
export function RenewSheet({ m, onClose, onDone }: { m: Member; onClose: () => void; onDone: () => void }) {
  const [plans, setPlans] = useState<MPlan[]>([]);
  const [length, setLength] = useState<MLength>((m.length as MLength) || "1_month");
  const [pay, setPay] = useState<PayState>(INITIAL_PAY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Member | null>(null);
  useEffect(() => { getPlans().then(setPlans).catch(() => {}); }, []);
  const hour = m.timeSlot ? Number(m.timeSlot.slice(0, 2)) : 7;
  const price = plans.find((p) => p.id === m.plan.id)?.matrix[shiftOfHour(hour)][length].customerPays ?? null;
  const paid = paymentsFor(price ?? 0, pay);
  async function save() {
    if (price == null || paid.problem) return setError(paid.problem ?? "No price for this length");
    setBusy(true); setError("");
    try { setDone(await renewMember(m.id, { length, pay: paid.payments ? { payments: paid.payments, fonepayQrId: paid.fonepayQrId } : { single: paid.single, fonepayQrId: paid.fonepayQrId } })); onDone(); } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  }
  return (
    <Frame title="Renew membership" sub={`${m.customer.name ?? m.customer.phone} · ${m.memberCode} · ends ${shortDate(m.endDate)}`} onClose={onClose}>
      {done ? <Done m={done} total={price ?? undefined} text="Membership renewed" onClose={onClose} /> : (
        <>
          <label className="block text-sm font-medium">Renew for
            <select className={`${field} mt-1`} value={length} onChange={(e) => { setLength(e.target.value as MLength); setError(""); }}>{M_LENGTHS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select>
          </label>
          {price == null ? <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-700">This plan has no price for that length.</p> : (
            <>
              <p className="text-3xl font-bold">{rs(price)}</p>
              <p className="text-xs text-muted">The new period continues after the current end date (or starts today if it already ended).</p>
              <PaySplit total={price} value={pay} onChange={(v) => { setPay(v); setError(""); }} customerPhone={m.customer.phone} />
            </>
          )}
          {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
          <button onClick={save} disabled={busy || price == null || !!paid.problem} className="w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Collect and renew"}</button>
        </>
      )}
    </Frame>
  );
}

// ---------- extend, suspend, cancel: a few days or a reason ----------
export function ReasonSheet({ m, kind, onClose, onDone }: { m: Member; kind: "extend" | "suspend" | "cancel"; onClose: () => void; onDone: () => void }) {
  const [days, setDays] = useState("7");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const copy = {
    extend: ["Extend membership", "Give extra free days (a tournament week, a closure). The hour must be free on those days.", "Extend"],
    suspend: ["Suspend membership", "The member is told it is on hold, and the hour is free for others until you resume it.", "Suspend"],
    cancel: ["Cancel membership", "This ends the membership and frees the hour. Money is not refunded here: use Payments > refund if needed.", "Cancel membership"],
  }[kind];
  async function save() {
    setBusy(true); setError("");
    try {
      if (kind === "extend") await extendMember(m.id, { days: Number(days), reason });
      else if (kind === "suspend") await suspendMember(m.id, reason);
      else await cancelMember(m.id, reason);
      onDone(); onClose();
    } catch (e) { setError(msg(e)); setBusy(false); }
  }
  return (
    <Frame title={copy[0]} sub={`${m.customer.name ?? m.customer.phone} · ${m.memberCode}`} onClose={onClose}>
      <p className="text-sm text-muted">{copy[1]}</p>
      {kind === "extend" && <label className="block text-sm font-medium">Extra days<input inputMode="numeric" className={`${field} mt-1`} value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, "").slice(0, 2))} /></label>}
      <label className="block text-sm font-medium">Reason<input className={`${field} mt-1`} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="Short reason (the member may see it)" /></label>
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      <button onClick={save} disabled={busy || reason.trim().length < 3 || (kind === "extend" && !Number(days))} className={`w-full rounded-xl py-3 font-semibold text-white disabled:opacity-50 ${kind === "cancel" ? "bg-red-600" : "bg-brand"}`}>{busy ? "Saving…" : copy[2]}</button>
    </Frame>
  );
}
