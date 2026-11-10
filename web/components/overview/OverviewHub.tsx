"use client";

import { useState } from "react";
import OverviewPage from "./OverviewPage";
import ReportsPage from "@/components/reports/ReportsPage";
import { canSeePage } from "@/lib/access";

// Overview and Reports on one page: a switch at the top, then the page for the one chosen. /overview?tab=reports opens the reports.
type View = "overview" | "reports";
export default function OverviewHub() {
  const [view, setView] = useState<View>(() => {
    const t = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null;
    return t === "reports" ? "reports" : "overview";
  });
  const views = ([["overview", "Overview"], ["reports", "Reports"]] as const).filter(([id]) => canSeePage(id === "overview" ? "dashboard" : "reports"));
  const shown: View = views.some(([id]) => id === view) ? view : (views[0]?.[0] ?? "overview");
  return (
    <div className="w-full space-y-4">
      {views.length > 1 && (
        <div className="flex gap-1 rounded-2xl bg-surface p-1 shadow-sm" role="tablist" aria-label="Overview or Reports">
          {views.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={shown === id} onClick={() => setView(id)} className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold ${shown === id ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}>{label}</button>
          ))}
        </div>
      )}
      {shown === "reports" ? <ReportsPage /> : <OverviewPage />}
    </div>
  );
}
