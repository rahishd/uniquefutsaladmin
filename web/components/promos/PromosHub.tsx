"use client";

import { useState } from "react";
import PromosPage from "./PromosPage";
import VipPage from "@/components/vip/VipPage";
import { canSeePage } from "@/lib/access";

// Promo codes and VIP Privilege on one page: a switch at the top, then the page for the one chosen. /promos?tab=vip opens the VIP side.
type View = "promos" | "vip";
export default function PromosHub() {
  const [view, setView] = useState<View>(() => {
    const t = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null;
    return t === "vip" ? "vip" : "promos";
  });
  const views = ([["promos", "Promo Codes"], ["vip", "VIP Privilege"]] as const).filter(([id]) => canSeePage(id === "promos" ? "promo-codes" : "vip"));
  const shown: View = views.some(([id]) => id === view) ? view : (views[0]?.[0] ?? "promos");
  return (
    <div className="w-full space-y-4">
      {views.length > 1 && (
        <div className="flex gap-1 rounded-2xl bg-surface p-1 shadow-sm" role="tablist" aria-label="Promo codes or VIP Privilege">
          {views.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={shown === id} onClick={() => setView(id)} className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold ${shown === id ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}>{label}</button>
          ))}
        </div>
      )}
      {shown === "vip" ? <VipPage /> : <PromosPage />}
    </div>
  );
}
