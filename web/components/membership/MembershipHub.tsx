"use client";

import { useState } from "react";
import AcademyPage from "@/components/academy/AcademyPage";
import ClubPage from "@/components/club/ClubPage";
import MembershipPage from "./MembershipPage";
import { canSeePage } from "@/lib/access";

// Membership, Unique Club and the Children's Academy on one page: a switch at the top, then the page for the one chosen.
// /membership?tab=club opens the club and /membership?tab=academy opens the academy.
type View = "membership" | "club" | "academy";
export default function MembershipHub() {
  const [view, setView] = useState<View>(() => {
    const t = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null;
    return t === "club" || t === "academy" ? t : "membership";
  });
  const views = ([["membership", "Membership"], ["club", "Unique Club"], ["academy", "Children's Academy"]] as const).filter(([id]) => canSeePage(id));
  const shown: View = views.some(([id]) => id === view) ? view : (views[0]?.[0] ?? "membership");
  return (
    <div className="w-full space-y-4">
      {views.length > 1 && (
        <div className="flex gap-1 rounded-2xl bg-surface p-1 shadow-sm" role="tablist" aria-label="Membership, Unique Club or Children's Academy">
          {views.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={shown === id} onClick={() => setView(id)} className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold ${shown === id ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}>{label}</button>
          ))}
        </div>
      )}
      {shown === "club" ? <ClubPage /> : shown === "academy" ? <AcademyPage /> : <MembershipPage />}
    </div>
  );
}
