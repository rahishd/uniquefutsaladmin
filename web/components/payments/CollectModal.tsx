"use client";

import { useState } from "react";
import { X } from "lucide-react";
import PaySplit, { INITIAL_PAY, PayState, paymentsFor } from "../PaySplit";
import { collectDues, rs } from "@/lib/bookings";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { CollectTarget, collectGamezone } from "@/lib/payments";

// Record that an unpaid booking or session was paid. A court booking can be paid in cash, by Fonepay QR, or part cash and part Fonepay
// (the Fonepay part is backed by a dynamic QR that the gateway marks paid). A Gamezone session is paid in cash.
export default function CollectModal({ target: row, onClose, onDone }: { target: CollectTarget; onClose: () => void; onDone: () => void }) {
  const [pay, setPay] = useState<PayState>(INITIAL_PAY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const court = row.kind === "court";
  const ready = paymentsFor(row.amount, pay);

  async function save() {
    if (!guard("payments.collect")) return;
    if (court && ready.problem) return setError(ready.problem);
    setBusy(true);
    setError("");
    try {
      if (court) await collectDues({ anchorId: row.ref, bookingIds: [row.ref], goodsDueIds: [], ...(ready.payments ? { payments: ready.payments, fonepayQrId: ready.fonepayQrId } : { method: ready.single === "fonepay" ? "fonepay" : "venue", fonepayQrId: ready.fonepayQrId }) });
      else await collectGamezone(row);
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the payment");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label="Collect payment" onClick={(e) => e.stopPropagation()} className="max-h-[94vh] w-full max-w-sm space-y-4 overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">Collect payment</h2>
            <p className="text-sm text-muted">{row.customer || "Guest"} · {row.code}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-surface-2"><X size={20} /></button>
        </div>
        <p className="text-3xl font-bold">{rs(row.amount)}</p>
        {court ? <PaySplit total={row.amount} value={pay} onChange={(v) => { setPay(v); setError(""); }} /> : <p className="rounded-xl bg-surface-2 p-3 text-sm">Gamezone sessions are collected in cash at the venue.</p>}
        {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
        <button disabled={busy || (court && !!ready.problem)} onClick={save} className="w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-60">{busy ? "Saving…" : "Mark as paid"}</button>
      </div>
    </div>
  );
}
