"use client";

import { Ban, ShieldCheck, ShieldOff } from "lucide-react";
import { Badge } from "../bookings/Badge";
import { prettyDate, rs } from "@/lib/bookings";
import { ago } from "@/lib/complaints";
import { Profile } from "@/lib/customers";

// Cancelled games by this customer (not ones staff cancelled), and a one-tap way to suspend the account.
export default function CancellationsSection({ p, canWrite, busy, onToggleActive }: { p: Profile; canWrite: boolean; busy: boolean; onToggleActive: () => void }) {
  const c = p.cancellations;
  const tone = c.streak >= 3 ? "bg-red-500/10 text-red-600" : c.streak >= 2 ? "bg-amber-500/10 text-amber-700" : "bg-surface-2 text-muted";
  return (
    <section className="space-y-3 rounded-2xl border border-line p-4">
      <div>
        <h3 className="font-bold">Cancellations</h3>
        <p className="text-xs text-muted">Games the customer cancelled themselves. Cancellations staff made and unpaid bookings that expired are not counted.</p>
      </div>

      <div className={`flex items-center justify-between gap-3 rounded-xl p-3 ${tone}`}>
        <p className="flex items-center gap-2 font-semibold"><Ban size={18} /> {c.streak >= 2 ? `Cancelled ${c.streak} games in a row` : c.streak === 1 ? "Last booking was cancelled" : "No cancellations in a row"}</p>
        {canWrite && p.user.isActive && c.streak >= 1 && (
          <button onClick={onToggleActive} disabled={busy} className="shrink-0 rounded-full bg-red-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"><span className="flex items-center gap-1"><ShieldOff size={13} /> Suspend now</span></button>
        )}
        {!p.user.isActive && <Badge tone="bg-red-500/15 text-red-600">Suspended</Badge>}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        {([["Total", c.total], ["Last 30 days", c.last30], ["Under 2 h notice", c.lateCount]] as const).map(([l, v]) => (
          <div key={l} className="rounded-xl bg-surface-2 p-2"><p className="text-lg font-bold">{v}</p><p className="text-[11px] text-muted">{l}</p></div>
        ))}
      </div>

      {c.recent.length === 0 ? (
        <p className="rounded-xl bg-surface-2 p-3 text-center text-sm text-muted">This customer has never cancelled a game.</p>
      ) : (
        <ul className="divide-y divide-line">
          {c.recent.map((r) => (
            <li key={`${r.kind}-${r.code}`} className="flex items-center gap-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{prettyDate(r.date)} · {r.time}</p>
                <p className="text-xs text-muted">
                  <span className="font-mono">{r.code}</span> · {r.kind === "court" ? "Court" : "Gamezone"}
                  {r.cancelledAt ? ` · cancelled ${ago(r.cancelledAt)}` : ""}
                  {r.hoursBefore !== null ? ` · ${r.hoursBefore < 1 ? "less than 1 h" : `${r.hoursBefore} h`} before the game` : ""}
                </p>
              </div>
              {r.hoursBefore !== null && r.hoursBefore < 2 && <Badge tone="bg-red-500/15 text-red-600">Late</Badge>}
              {r.wasPaid && <Badge tone="bg-brand/15 text-brand">Had paid</Badge>}
              <span className="w-16 text-right font-semibold">{rs(r.amount)}</span>
            </li>
          ))}
        </ul>
      )}

      {canWrite && !p.user.isActive && (
        <button onClick={onToggleActive} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand py-2.5 text-sm font-semibold text-brand disabled:opacity-60"><ShieldCheck size={16} /> Reactivate this account</button>
      )}
    </section>
  );
}
