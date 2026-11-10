"use client";

import { useState } from "react";
import WheelchairPage from "./WheelchairPage";
import InsurancePage from "@/components/insurance/InsurancePage";
import { canSeePage } from "@/lib/access";

// Wheelchair requests and health insurance claims on one page: a switch at the top, then the page for the one chosen.
// /wheelchair?tab=insurance opens the claims.
type View = "wheelchair" | "insurance";
export default function WheelchairHub() {
  const [view, setView] = useState<View>(() => {
    const t = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null;
    return t === "insurance" ? "insurance" : "wheelchair";
  });
  const views = ([["wheelchair", "Wheelchair Requests"], ["insurance", "Insurance Claims"]] as const).filter(([id]) => canSeePage(id === "wheelchair" ? "wheelchair-requests" : "insurance"));
  const shown: View = views.some(([id]) => id === view) ? view : (views[0]?.[0] ?? "wheelchair");
  return (
    <div className="w-full space-y-4">
      {views.length > 1 && (
        <div className="flex gap-1 rounded-2xl bg-surface p-1 shadow-sm" role="tablist" aria-label="Wheelchair requests or insurance claims">
          {views.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={shown === id} onClick={() => setView(id)} className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold ${shown === id ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}>{label}</button>
          ))}
        </div>
      )}
      {shown === "insurance" ? <InsurancePage /> : <WheelchairPage />}
    </div>
  );
}
