"use client";

import { rs } from "@/lib/bookings";

export type PayMethod = "cash" | "fonepay";
export type PayMode = PayMethod | "split";
// fonepay: the amount staff typed as received in Fonepay when the whole bill is paid that way ("" = not touched: the bill total is shown)
export type PayState = { mode: PayMode; cash: string; fonepay: string };
export const INITIAL_PAY: PayState = { mode: "cash", cash: "", fonepay: "" };

const num = (s: string) => Math.max(0, Math.round(Number(s)) || 0);
const digits = (v: string) => v.replace(/\D/g, "").slice(0, 8);

// How the total is paid: cash only, Fonepay only, or cash + Fonepay (whatever is not cash is Fonepay, worked out automatically).
export function fonepayAmount(total: number, p: PayState): number {
  return p.mode === "fonepay" ? (p.fonepay === "" ? total : num(p.fonepay)) : p.mode === "split" ? Math.max(0, total - num(p.cash)) : 0;
}

export function paymentsFor(total: number, p: PayState): { payments?: { method: PayMethod; amount: number }[]; single?: PayMethod; problem?: string } {
  if (p.mode === "cash") return { single: "cash" };
  const fp = fonepayAmount(total, p);
  if (p.mode === "fonepay") {
    if (fp !== total) return { problem: `The Fonepay amount must be ${rs(total)}, the full amount. For part cash, choose Cash + Fonepay.` };
    return { single: "fonepay" };
  }
  const cash = num(p.cash);
  if (cash < 1 || cash >= total) return { problem: "Enter how much is paid in cash (more than 0 and less than the total), or choose one method for everything." };
  return { payments: [{ method: "cash", amount: cash }, { method: "fonepay", amount: fp }] };
}

// customerPhone is still passed by some screens; nothing needs it now that there is no QR to make
export default function PaySplit({ total, value, onChange }: { total: number; value: PayState; onChange: (v: PayState) => void; customerPhone?: string }) {
  const cash = num(value.cash);
  const fp = fonepayAmount(total, value);
  const set = (patch: Partial<PayState>) => onChange({ ...value, ...patch });
  const field = "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold outline-none focus:border-brand";

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
        {([["cash", "Cash"], ["fonepay", "Fonepay"], ["split", "Cash + Fonepay"]] as const).map(([m, l]) => (
          <button key={m} type="button" aria-pressed={value.mode === m} onClick={() => set({ mode: m })} className={`rounded-lg px-1 py-2 text-xs font-semibold sm:text-sm ${value.mode === m ? "bg-brand text-white" : "text-muted"}`}>{l}</button>
        ))}
      </div>

      {value.mode === "fonepay" && (
        <div className="space-y-1.5 rounded-xl border border-line p-3">
          <label className="block text-sm font-medium" htmlFor="fp-amount">Amount received in Fonepay (Rs.)</label>
          <input id="fp-amount" inputMode="numeric" value={value.fonepay === "" ? String(total) : value.fonepay} onChange={(e) => set({ fonepay: digits(e.target.value) })} aria-label="Amount received in Fonepay" className={field} />
          <p className="text-xs text-muted">Check it in the Fonepay app. The customer writes the booking code as the remark.</p>
          {fp !== total && <p className="text-xs font-semibold text-red-600">This is not the full {rs(total)}. For part cash, choose Cash + Fonepay.</p>}
        </div>
      )}

      {value.mode === "split" && (
        <div className="space-y-2 rounded-xl border border-line p-3">
          <p className="text-xs text-muted">Enter the cash. The rest of the {rs(total)} is paid by Fonepay, worked out for you. Check it in the Fonepay app.</p>
          <label className="flex items-center gap-2 text-sm">
            <span className="w-16 shrink-0 font-medium">Cash</span>
            <input inputMode="numeric" value={value.cash} onChange={(e) => set({ cash: digits(e.target.value) })} placeholder="0" aria-label="Cash amount" className={field} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="w-16 shrink-0 font-medium">Fonepay</span>
            <input inputMode="numeric" value={value.cash === "" ? "" : String(fp)} onChange={(e) => set({ cash: String(Math.max(0, total - num(e.target.value))) })} placeholder="0" aria-label="Fonepay amount received" className={field} />
          </label>
          {cash >= total && value.cash !== "" && <p className="text-xs font-semibold text-red-600">Cash must be less than the total. Choose Cash to pay everything in cash.</p>}
        </div>
      )}
    </div>
  );
}
