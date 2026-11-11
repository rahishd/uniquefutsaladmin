"use client";

import { useState } from "react";
import BookingsPage from "./BookingsPage";
import PaymentsPage from "@/components/payments/PaymentsPage";
import { canSeePage } from "@/lib/access";

// Bookings and Payments on one page: a switch at the top, then the page for the one chosen. /bookings?tab=payments opens Payments
// (the Payments page keeps its own filters in the address, for example ?kind=...&status=unpaid, so those links keep working).
type View = "bookings" | "payments";
export default function BookingsHub() {
  const [view, setView] = useState<View>(() => {
    const t = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null;
    return t === "payments" ? "payments" : "bookings";
  });
  const views = ([["bookings", "Bookings"], ["payments", "Payments"]] as const).filter(([id]) => canSeePage(id));
  const shown: View = views.some(([id]) => id === view) ? view : (views[0]?.[0] ?? "bookings");
  return (
    <div className="w-full space-y-4">
      {views.length > 1 && (
        <div className="flex gap-1 rounded-2xl bg-surface p-1 shadow-sm" role="tablist" aria-label="Bookings or Payments">
          {views.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={shown === id} onClick={() => setView(id)} className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold ${shown === id ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}>{label}</button>
          ))}
        </div>
      )}
      {shown === "payments" ? <PaymentsPage /> : <BookingsPage />}
    </div>
  );
}
