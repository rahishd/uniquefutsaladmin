"use client";

import { useEffect, useState } from "react";
import { Plug, Search, X } from "lucide-react";
import PaySplit, { INITIAL_PAY, PayState, paymentsFor } from "../PaySplit";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { rs } from "@/lib/bookings";
import { EvCharge, EvList, listEv, recordEv } from "@/lib/ev";

const field = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function Card({ title, value, sub, tone }: { title: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="rounded-2xl bg-surface p-4 shadow-sm">
      <p className="text-xs text-muted">{title}</p>
      <p className={`text-xl font-bold ${tone ?? ""}`}>{value}</p>
      <p className="text-xs text-muted">{sub}</p>
    </div>
  );
}

// Paid AC EV charging at the venue. Staff record each session; the money is counted here and shows with the other payments.
export default function EvCharging({ tick, onChanged }: { tick: number; onChanged: () => void }) {
  const [q, setQ] = useState("");
  const [data, setData] = useState<EvList | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      listEv(q).then((d) => { if (live) { setData(d); setError(""); } }).catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load"); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [q, tick]);

  const s = data?.summary;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Card title="Today" value={s ? rs(s.today.amount) : "—"} sub={s ? `${s.today.count} session${s.today.count === 1 ? "" : "s"} · ${s.today.hours} h` : " "} tone="text-brand" />
        <Card title="Last 30 days" value={s ? rs(s.last30.amount) : "—"} sub={s ? `${s.last30.count} sessions · ${s.last30.hours} h` : " "} />
        <Card title="Cash (30 days)" value={s ? rs(s.last30.cash) : "—"} sub=" " />
        <Card title="Online (30 days)" value={s ? rs(s.last30.online) : "—"} sub={s ? `All time ${rs(s.all.amount)}` : " "} />
      </div>

      <div className="flex gap-2">
        <label className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone or vehicle" className={`${field} pl-10`} />
        </label>
        <button onClick={() => guard("payments.collect") && setOpen(true)} className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white">
          <Plug size={16} /> Record charging
        </button>
      </div>
      {data && <p className="text-xs text-muted">AC EV charging is {rs(data.rate)} per hour.</p>}

      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!data && !error && <p className="py-10 text-center text-sm text-muted">Loading…</p>}
      {data && data.items.length === 0 && <p className="rounded-2xl bg-surface py-14 text-center text-muted shadow-sm">No charging sessions yet.</p>}
      <ul className="grid items-start gap-2 xl:grid-cols-2">
        {data?.items.map((r: EvCharge) => (
          <li key={r.id} className="flex items-center gap-3 rounded-2xl bg-surface p-4 shadow-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{r.customerName || "Walk-in"}</p>
              <p className="truncate text-sm text-muted">{[r.phone, r.vehicle].filter(Boolean).join(" · ") || "No details"}</p>
              <p className="text-xs text-muted">{when(r.createdAt)} · {r.hours} hour{r.hours === 1 ? "" : "s"} · {r.cashAmount > 0 && r.onlineAmount > 0 ? "Cash + Online" : r.onlineAmount > 0 ? "Online" : "Cash"}</p>
            </div>
            <p className="shrink-0 font-bold">{rs(r.amount)}</p>
          </li>
        ))}
      </ul>

      {open && data && <RecordSheet rate={data.rate} onClose={() => setOpen(false)} onDone={onChanged} />}
    </div>
  );
}

export function RecordSheet({ rate, onClose, onDone }: { rate: number; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [hours, setHours] = useState(1);
  const [pay, setPay] = useState<PayState>(INITIAL_PAY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<number | null>(null);
  const total = rate * hours;
  const ready = paymentsFor(total, pay);

  async function save() {
    if (!guard("payments.collect")) return;
    if (phone && !/^9\d{9}$/.test(phone)) return setError("Enter a 10-digit mobile number starting with 9, or leave it empty.");
    if (ready.problem) return setError(ready.problem);
    setBusy(true);
    setError("");
    const how = ready.payments ? { payments: ready.payments, fonepayQrId: ready.fonepayQrId } : { payment: ready.single === "cash" ? ("cash" as const) : ("online" as const), fonepayQrId: ready.fonepayQrId };
    try {
      await recordEv({ ...how, hours, customerName: name.trim() || undefined, phone: phone || undefined, vehicle: vehicle.trim() || undefined });
      setSaved(total);
      onDone();
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label="Record EV charging" onClick={(e) => e.stopPropagation()} className="max-h-[94vh] w-full max-w-sm space-y-4 overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="flex items-start justify-between">
          <div><h2 className="text-lg font-bold">Record EV charging</h2><p className="text-sm text-muted">{rs(rate)} per hour</p></div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-surface-2"><X size={20} /></button>
        </div>
        {saved !== null ? (
          <div className="grid place-items-center gap-3 text-center">
            <p className="font-bold text-brand">Saved: {rs(saved)}</p>
            <button onClick={onClose} className="w-full rounded-xl border border-line py-3 font-semibold">Done</button>
          </div>
        ) : (
          <>
            <label className="block text-sm font-medium">Customer name <span className="font-normal text-muted">(optional)</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={`${field} mt-1`} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">Mobile <span className="font-normal text-muted">(optional)</span>
                <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" placeholder="98XXXXXXXX" className={`${field} mt-1`} />
              </label>
              <label className="block text-sm font-medium">Vehicle <span className="font-normal text-muted">(optional)</span>
                <input value={vehicle} onChange={(e) => setVehicle(e.target.value)} maxLength={40} placeholder="e.g. Tata Nexon" className={`${field} mt-1`} />
              </label>
            </div>
            <label className="block text-sm font-medium">Hours
              <select value={hours} onChange={(e) => { setHours(Number(e.target.value)); setPay((p) => ({ ...p, qr: null })); }} className={`${field} mt-1`}>
                {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} hour{i ? "s" : ""}</option>)}
              </select>
            </label>
            <p className="text-3xl font-bold">{rs(total)}</p>
            <PaySplit total={total} value={pay} onChange={(v) => { setPay(v); setError(""); }} />
            {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
            <button disabled={busy || !!ready.problem} onClick={save} className="w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-60">{busy ? "Saving…" : "Save payment"}</button>
          </>
        )}
      </div>
    </div>
  );
}
