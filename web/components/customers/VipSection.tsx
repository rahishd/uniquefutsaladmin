"use client";

import { useState } from "react";
import { Crown } from "lucide-react";
import { Badge } from "../bookings/Badge";
import Switch from "../Switch";
import { ApiError } from "@/lib/api";
import { prettyDate, rs } from "@/lib/bookings";
import { Profile, VipInput, removeVip, saveVip } from "@/lib/customers";

const field = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const describe = (v: { type: "percent" | "flat"; value: number }) => (v.type === "percent" ? `${v.value}% off` : `${rs(v.value)} off`);

// A special code (for example ADMINVIP) staff give to ONE customer. They type it once when booking; after that it is
// applied to every game they book, until you pause or remove it.
export default function VipSection({ p, canWrite, onChanged }: { p: Profile; canWrite: boolean; onChanged: () => Promise<void> }) {
  const vip = p.vip;
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState(vip?.code ?? "");
  const [type, setType] = useState<"percent" | "flat">(vip?.type ?? "percent");
  const [value, setValue] = useState(vip ? String(vip.value) : "10");
  const [note, setNote] = useState(vip?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const phone = p.user.phoneNumber;

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      await fn();
      await onChanged();
      setMsg(ok);
      setEditing(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const n = Number(value);
    if (!/^[A-Za-z0-9]{3,20}$/.test(code.trim())) return setError("The code needs 3 to 20 letters or numbers, for example ADMINVIP.");
    if (!Number.isInteger(n) || n < 1) return setError("Enter the discount as a whole number.");
    if (type === "percent" && n > 100) return setError("A percent cannot be more than 100.");
    const body: VipInput = { code: code.trim().toUpperCase(), type, value: n, active: vip?.active ?? true, note: note.trim() || null };
    return run(() => saveVip(phone, body), vip ? "Saved." : "VIP code given. Tell the customer to type it when they book.");
  }

  const showForm = canWrite && (!vip || editing);

  return (
    <section className="space-y-3 rounded-2xl border border-line p-4">
      <div>
        <h3 className="flex items-center gap-2 font-bold"><Crown size={17} className="text-amber-500" /> VIP discount code</h3>
        <p className="text-xs text-muted">A special code only this customer can use. They type it once when booking, and then it is applied to every game they book, automatically.</p>
      </div>

      {vip && !editing && (
        <div className="space-y-3 rounded-xl bg-surface-2 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-mono text-xl font-bold tracking-wide">{vip.code}</p>
              <p className="text-sm font-semibold text-brand">{describe(vip)} on every game</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={vip.active ? "bg-brand/15 text-brand" : "bg-slate-500/15 text-slate-500"}>{vip.active ? "Active" : "Paused"}</Badge>
              {canWrite && <Switch on={vip.active} disabled={busy} label={vip.active ? "Pause the VIP code" : "Resume the VIP code"} onChange={() => run(() => saveVip(phone, { code: vip.code, type: vip.type, value: vip.value, active: !vip.active, note: vip.note }), vip.active ? "Paused. It stops applying to new bookings." : "Resumed.")} />}
            </div>
          </div>
          <p className="text-sm">
            {vip.claimedAt
              ? <>Customer entered it on <strong>{prettyDate(vip.claimedAt.slice(0, 10))}</strong>. It now applies to every booking.</>
              : <span className="text-amber-700">Not entered yet. Tell the customer to type <strong>{vip.code}</strong> in the promo box when they book.</span>}
          </p>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl bg-surface p-2"><p className="text-lg font-bold">{vip.usage.games}</p><p className="text-[11px] text-muted">games discounted</p></div>
            <div className="rounded-xl bg-surface p-2"><p className="text-lg font-bold">{rs(vip.usage.discountGiven)}</p><p className="text-[11px] text-muted">discount given</p></div>
          </div>
          {vip.note && <p className="text-xs text-muted">Note: {vip.note}</p>}
          {canWrite && (
            <div className="flex gap-2">
              <button onClick={() => { setEditing(true); setCode(vip.code); setType(vip.type); setValue(String(vip.value)); setNote(vip.note ?? ""); setError(""); setMsg(""); }} className="flex-1 rounded-xl bg-surface py-2 text-sm font-semibold">Change</button>
              <button disabled={busy} onClick={() => { if (window.confirm(`Remove the VIP code ${vip.code}? This customer will pay the normal price again.`)) run(() => removeVip(phone), "VIP code removed."); }} className="flex-1 rounded-xl border border-red-500/40 py-2 text-sm font-semibold text-red-600">Remove</button>
            </div>
          )}
        </div>
      )}

      {!vip && !canWrite && <p className="rounded-xl bg-surface-2 p-3 text-center text-sm text-muted">No VIP code. Only a manager or owner can give one.</p>}

      {showForm && (
        <form onSubmit={submit} className="space-y-3 rounded-xl bg-surface-2 p-3">
          <label className="block text-sm font-medium">Code
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase())} maxLength={20} placeholder="ADMINVIP" className={`${field} mt-1 font-mono uppercase`} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm font-medium">Discount type
              <select value={type} onChange={(e) => setType(e.target.value as "percent" | "flat")} className={`${field} mt-1`}>
                <option value="percent">Percent (%)</option>
                <option value="flat">Rupees (Rs.)</option>
              </select>
            </label>
            <label className="block text-sm font-medium">{type === "percent" ? "Percent off" : "Rupees off"}
              <input value={value} inputMode="numeric" onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))} className={`${field} mt-1`} />
            </label>
          </div>
          <label className="block text-sm font-medium">Note <span className="font-normal text-muted">(optional, for staff)</span>
            <input value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Friend of the owner" className={`${field} mt-1`} />
          </label>
          <div className="flex gap-2">
            {editing && <button type="button" onClick={() => { setEditing(false); setError(""); }} className="rounded-xl bg-surface px-4 py-2.5 text-sm font-semibold">Cancel</button>}
            <button disabled={busy} className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Saving…" : vip ? "Save changes" : "Give VIP code"}</button>
          </div>
          {vip && vip.code !== code.trim().toUpperCase() && <p className="text-xs text-amber-700">A new code has to be typed by the customer again.</p>}
        </form>
      )}

      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {msg && <p className="rounded-xl bg-brand/10 p-3 text-sm text-brand" role="status">{msg}</p>}
      <p className="text-xs text-muted">If the customer also types a normal promo code, the bigger discount is used. The code cannot be the same as a normal promo code.</p>
    </section>
  );
}
