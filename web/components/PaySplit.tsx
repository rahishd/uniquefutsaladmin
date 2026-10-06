"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, QrCode } from "lucide-react";
import { ApiError } from "@/lib/api";
import { rs } from "@/lib/bookings";
import { FonepayQr, cancelQr, createQr, getQr, simulatePaid } from "@/lib/fonepay";

export type PayMethod = "cash" | "fonepay";
export type PayMode = PayMethod | "split";
// qr: the Fonepay QR made for this bill (its amount is fixed, so a changed amount needs a new QR)
export type PayState = { mode: PayMode; cash: string; qr: FonepayQr | null };
export const INITIAL_PAY: PayState = { mode: "cash", cash: "", qr: null };

const num = (s: string) => Math.max(0, Math.round(Number(s)) || 0);

// How the total is paid: cash only, Fonepay only, or cash + Fonepay (whatever is not cash is Fonepay, worked out automatically).
export function fonepayAmount(total: number, p: PayState): number {
  return p.mode === "fonepay" ? total : p.mode === "split" ? Math.max(0, total - num(p.cash)) : 0;
}

export function paymentsFor(total: number, p: PayState): { payments?: { method: PayMethod; amount: number }[]; single?: PayMethod; fonepayQrId?: string; problem?: string } {
  if (p.mode === "cash") return { single: "cash" };
  const fp = fonepayAmount(total, p);
  if (p.mode === "split") {
    const cash = num(p.cash);
    if (cash < 1 || cash >= total) return { problem: "Enter how much is paid in cash (more than 0 and less than the total), or choose one method for everything." };
  }
  if (!p.qr || p.qr.amount !== fp) return { problem: `Make the Fonepay QR for Rs. ${fp} and wait until it is paid.` };
  if (p.qr.status !== "paid") return { problem: p.qr.status === "pending" ? "Waiting for the Fonepay payment…" : "The Fonepay QR is no longer valid. Make a new one." };
  return p.mode === "fonepay" ? { single: "fonepay", fonepayQrId: p.qr.id } : { payments: [{ method: "cash", amount: num(p.cash) }, { method: "fonepay", amount: fp }], fonepayQrId: p.qr.id };
}

const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");

export default function PaySplit({ total, value, onChange, customerPhone }: { total: number; value: PayState; onChange: (v: PayState) => void; customerPhone?: string }) {
  const cash = num(value.cash);
  const fp = fonepayAmount(total, value);
  const set = (patch: Partial<PayState>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
        {([["cash", "Cash"], ["fonepay", "Fonepay QR"], ["split", "Cash + Fonepay"]] as const).map(([m, l]) => (
          <button key={m} type="button" aria-pressed={value.mode === m} onClick={() => set({ mode: m })} className={`rounded-lg px-1 py-2 text-xs font-semibold sm:text-sm ${value.mode === m ? "bg-brand text-white" : "text-muted"}`}>{l}</button>
        ))}
      </div>

      {value.mode === "split" && (
        <div className="space-y-2 rounded-xl border border-line p-3">
          <p className="text-xs text-muted">Enter the cash. The rest of the {rs(total)} is paid by Fonepay QR, worked out for you.</p>
          <label className="flex items-center gap-2 text-sm">
            <span className="w-16 shrink-0 font-medium">Cash</span>
            <input inputMode="numeric" value={value.cash} onChange={(e) => set({ cash: e.target.value.replace(/\D/g, "").slice(0, 8) })} placeholder="0" aria-label="Cash amount" className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="w-16 shrink-0 font-medium">Fonepay</span>
            <input inputMode="numeric" value={value.cash === "" ? "" : String(fp)} onChange={(e) => set({ cash: String(Math.max(0, total - num(e.target.value))) })} placeholder="0" aria-label="Fonepay amount" className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
          </label>
          {cash >= total && value.cash !== "" && <p className="text-xs font-semibold text-red-600">Cash must be less than the total. Choose Cash to pay everything in cash.</p>}
        </div>
      )}

      {value.mode !== "cash" && fp > 0 && !(value.mode === "split" && (cash < 1 || cash >= total)) && (
        <FonepayQrPanel amount={fp} qr={value.qr} onQr={(qr) => set({ qr })} customerPhone={customerPhone} />
      )}
    </div>
  );
}

// Makes the QR for the exact Fonepay amount, shows it, and waits for the payment (checked every 3 seconds).
function FonepayQrPanel({ amount, qr, onQr, customerPhone }: { amount: number; qr: FonepayQr | null; onQr: (q: FonepayQr | null) => void; customerPhone?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);
  const current = qr && qr.amount === amount ? qr : null; // a QR for another amount is not used

  // poll while it is pending; tick a clock for the countdown
  useEffect(() => {
    if (!current || current.status !== "pending") return;
    const id = current.id;
    const poll = setInterval(() => { getQr(id).then((q) => onQr({ ...q, qrImage: current.qrImage, qrPayload: current.qrPayload })).catch(() => {}); }, 3000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(poll); clearInterval(clock); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, current?.status]);

  async function make() {
    setBusy(true); setError("");
    try {
      if (qr && qr.status === "pending") await cancelQr(qr.id).catch(() => {}); // the old one is no longer needed
      onQr(await createQr({ amount, customerPhone }));
      setNow(Date.now());
    } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  }
  async function simulate() {
    if (!current) return;
    setBusy(true); setError("");
    try { onQr({ ...(await simulatePaid(current.id)), qrImage: current.qrImage, qrPayload: current.qrPayload }); } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  }

  if (current?.status === "paid") {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-brand/10 p-3 text-sm">
        <CheckCircle2 className="shrink-0 text-brand" size={26} />
        <div><p className="font-bold text-brand">Fonepay {rs(amount)} received</p>{current.reference && <p className="text-xs text-muted">Ref {current.reference}</p>}</div>
      </div>
    );
  }
  const left = current ? Math.max(0, Math.round((new Date(current.expiresAt).getTime() - (now || new Date(current.expiresAt).getTime() - 600000)) / 1000)) : 0;
  const dead = current && (current.status === "expired" || current.status === "failed");
  return (
    <div className="space-y-2 rounded-xl border border-line p-3">
      {!current || dead ? (
        <>
          {dead && <p className="text-xs font-semibold text-red-600">That QR is no longer valid.</p>}
          <button type="button" onClick={make} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-full bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <QrCode size={16} />} Make Fonepay QR for {rs(amount)}
          </button>
        </>
      ) : (
        <div className="grid place-items-center gap-2 text-center">
          {/* the QR is a data image made by our own server */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {current.qrImage && <img src={current.qrImage} alt={`Fonepay QR for Rs. ${amount}`} className="h-44 w-44 rounded-lg border border-line bg-white p-1" />}
          <p className="text-lg font-bold">{rs(amount)}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted"><Loader2 size={12} className="animate-spin" /> Waiting for payment · {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")} left</p>
          <p className="font-mono text-[10px] text-muted">{current.prn}</p>
          {current.mode === "test" && (
            <div className="w-full space-y-1 rounded-lg bg-amber-500/10 p-2">
              <p className="text-[11px] font-semibold text-amber-700">TEST MODE: this QR is not real</p>
              <button type="button" onClick={simulate} disabled={busy} className="w-full rounded-full border border-amber-500/60 py-1.5 text-xs font-semibold text-amber-800 disabled:opacity-50">Simulate payment received</button>
            </div>
          )}
          <button type="button" onClick={make} disabled={busy} className="text-xs font-semibold text-muted underline">Make a new QR</button>
        </div>
      )}
      {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
    </div>
  );
}
