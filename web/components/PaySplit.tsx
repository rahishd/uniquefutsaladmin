"use client";

import { rs } from "@/lib/bookings";

export type PayMethod = "cash" | "esewa" | "fonepay";
export type PayMode = PayMethod | "split";
export type PayState = { mode: PayMode; split: Record<PayMethod, string> };
export const INITIAL_PAY: PayState = { mode: "cash", split: { cash: "", esewa: "", fonepay: "" } };

const LABEL: Record<PayMethod, string> = { cash: "Cash", esewa: "eSewa", fonepay: "Fonepay" };
const METHODS: PayMethod[] = ["cash", "esewa", "fonepay"];

// The payments to send, or the reason the split is not ready. A single method pays the whole total; a split must add up exactly.
export function paymentsFor(total: number, p: PayState): { payments?: { method: PayMethod; amount: number }[]; single?: PayMethod; problem?: string } {
  if (p.mode !== "split") return { single: p.mode };
  const payments = METHODS.map((m) => ({ method: m, amount: Math.round(Number(p.split[m]) || 0) })).filter((x) => x.amount > 0);
  const sum = payments.reduce((s, x) => s + x.amount, 0);
  if (payments.length < 2) return { problem: "Enter an amount for at least two methods, or choose one method for everything." };
  if (sum !== total) return { problem: sum > total ? `The amounts are Rs. ${sum - total} too much.` : `Rs. ${total - sum} is still not covered.` };
  return { payments };
}

// Cash, eSewa, Fonepay, or a split of the total across them.
export default function PaySplit({ total, value, onChange }: { total: number; value: PayState; onChange: (v: PayState) => void }) {
  const sum = METHODS.reduce((s, m) => s + (Math.round(Number(value.split[m])) || 0), 0);
  const left = total - sum;
  const set = (m: PayMethod, v: string) => onChange({ ...value, split: { ...value.split, [m]: v.replace(/\D/g, "").slice(0, 8) } });
  // put what is left into a box with one tap
  const rest = (m: PayMethod) => onChange({ ...value, split: { ...value.split, [m]: String(Math.max(0, (Math.round(Number(value.split[m])) || 0) + left)) } });
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-surface-2 p-1">
        {([...METHODS, "split"] as PayMode[]).map((m) => (
          <button key={m} type="button" aria-pressed={value.mode === m} onClick={() => onChange({ ...value, mode: m })} className={`rounded-lg px-1 py-2 text-xs font-semibold sm:text-sm ${value.mode === m ? "bg-brand text-white" : "text-muted"}`}>
            {m === "split" ? "Split" : LABEL[m]}
          </button>
        ))}
      </div>
      {value.mode === "split" && (
        <div className="space-y-2 rounded-xl border border-line p-3">
          <p className="text-xs text-muted">Enter how much was paid with each method. The amounts must add up to {rs(total)}.</p>
          {METHODS.map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm">
              <span className="w-16 shrink-0 font-medium">{LABEL[m]}</span>
              <input inputMode="numeric" value={value.split[m]} onChange={(e) => set(m, e.target.value)} placeholder="0" aria-label={`${LABEL[m]} amount`} className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
              <button type="button" onClick={() => rest(m)} disabled={left <= 0 && !value.split[m]} className="shrink-0 rounded-full border border-line px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-40">Rest</button>
            </label>
          ))}
          <p className={`text-sm font-semibold ${left === 0 ? "text-brand" : "text-red-600"}`}>{left === 0 ? "Matches the total" : left > 0 ? `Rs. ${left} left to cover` : `Rs. ${-left} too much`}</p>
        </div>
      )}
    </div>
  );
}
