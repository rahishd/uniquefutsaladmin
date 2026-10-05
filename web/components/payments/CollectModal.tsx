"use client";

import { useState } from "react";
import { Banknote, Smartphone, X } from "lucide-react";
import { rs } from "@/lib/bookings";
import { ApiError } from "@/lib/api";
import { CollectTarget, METHOD_LABEL, collect } from "@/lib/payments";

// Record that an unpaid booking or session was paid (cash at the venue, eSewa or Fonepay).
export default function CollectModal({ target: row, onClose, onDone }: { target: CollectTarget; onClose: () => void; onDone: () => void }) {
  const [method, setMethod] = useState<"venue" | "esewa" | "fonepay">(row.method === "esewa" || row.method === "fonepay" ? row.method : "venue");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      await collect(row, method);
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the payment");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label="Collect payment" onClick={(e) => e.stopPropagation()} className="w-full max-w-sm space-y-4 rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">Collect payment</h2>
            <p className="text-sm text-muted">{row.customer || "Guest"} · {row.code}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-surface-2"><X size={20} /></button>
        </div>
        <p className="text-3xl font-bold">{rs(row.amount)}</p>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">How was it paid?</legend>
          {(row.kind === "court" ? (["venue", "esewa", "fonepay"] as const) : ([row.method as "venue" | "esewa" | "fonepay"])).map((m) => (
            <label key={m} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${method === m ? "border-brand bg-brand/5" : "border-line"}`}>
              <input type="radio" name="how" checked={method === m} onChange={() => setMethod(m)} className="accent-[var(--brand)]" />
              {m === "venue" ? <Banknote size={18} /> : <Smartphone size={18} />}
              {METHOD_LABEL[m] ?? m}
            </label>
          ))}
        </fieldset>
        {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
        <button disabled={busy} onClick={save} className="w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-60">{busy ? "Saving…" : "Mark as paid"}</button>
      </div>
    </div>
  );
}

