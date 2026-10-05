"use client";

import { useState } from "react";
import BlocksTab from "./BlocksTab";
import GamezoneTab from "./GamezoneTab";
import MembershipTab from "./MembershipTab";
import PricesTab from "./PricesTab";

const TABS = [
  { id: "prices", label: "Court prices" },
  { id: "gamezone", label: "Gamezone" },
  { id: "membership", label: "Membership" },
  { id: "blocks", label: "Blocked hours" },
] as const;

export default function CourtsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("prices");
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Courts &amp; Pricing</h1>
        <p className="text-sm text-muted">Court prices, Gamezone rates, membership plans, and hours closed for booking.</p>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-surface p-1 shadow-sm" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold ${tab === t.id ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}>{t.label}</button>
        ))}
      </div>

      {tab === "prices" && <PricesTab />}
      {tab === "gamezone" && <GamezoneTab />}
      {tab === "membership" && <MembershipTab />}
      {tab === "blocks" && <BlocksTab />}
    </div>
  );
}
