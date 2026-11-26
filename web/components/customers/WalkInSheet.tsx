"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Badge } from "../bookings/Badge";
import { prettyDate, rs } from "@/lib/bookings";
import { WalkIn, WalkInRecords, walkInRecords } from "@/lib/customers";

// The game records of one walk-in customer (booked at the desk, no app account). Only the Owner and Admins get here.
export default function WalkInSheet({ who, onClose }: { who: WalkIn; onClose: () => void }) {
  const [d, setD] = useState<WalkInRecords | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    walkInRecords({ phone: who.phone, name: who.phone ? null : who.name })
      .then((r) => { if (live) setD(r); })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load the records"); });
    return () => { live = false; };
  }, [who.phone, who.name]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label="Walk-in customer" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-5 shadow-xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-lg font-bold">{who.name || "No name"} <Badge tone="bg-violet-500/15 text-violet-700">Walk-in</Badge></p>
            <p className="text-sm text-muted">{who.phone ?? "No phone number"} · no app account</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-2 hover:bg-surface-2"><X size={18} /></button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-surface-2 p-3"><p className="text-xs text-muted">Games</p><p className="text-lg font-bold">{who.games}</p></div>
          <div className="rounded-xl bg-surface-2 p-3"><p className="text-xs text-muted">Paid</p><p className="text-lg font-bold">{rs(who.paid)}</p></div>
          <div className="rounded-xl bg-surface-2 p-3"><p className="text-xs text-muted">Owes</p><p className={`text-lg font-bold ${who.unpaid > 0 ? "text-amber-600" : ""}`}>{rs(who.unpaid)}</p></div>
        </div>

        <h3 className="mt-5 font-bold">Game records</h3>
        <p className="text-xs text-muted">Only the Owner and Admins can see these.</p>
        {error && <p role="alert" className="mt-2 rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
        {!d && !error && <p className="py-6 text-center text-sm text-muted">Loading…</p>}
        {d && d.games.length === 0 && <p className="mt-2 rounded-xl bg-surface-2 p-3 text-center text-sm text-muted">No games.</p>}
        <ul className="mt-2 space-y-2">
          {d?.games.map((g) => (
            <li key={g.code} className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block font-semibold">{prettyDate(g.date)} · {g.time}{g.hours > 1 ? ` (${g.hours} h)` : ""}</span>
                <span className="block text-xs text-muted">{g.code}</span>
              </span>
              <span className="text-right">
                <span className="block font-semibold tabular-nums">{rs(g.amount)}</span>
                <span className={`text-xs font-semibold ${g.status === "cancelled" ? "text-slate-500" : g.paid ? "text-brand" : "text-amber-600"}`}>{g.status === "cancelled" ? "Cancelled" : g.paid ? "Paid" : "Not paid"}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
