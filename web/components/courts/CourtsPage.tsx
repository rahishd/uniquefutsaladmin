"use client";

import { useState } from "react";
import BlocksTab from "./BlocksTab";
import PricesTab from "./PricesTab";

const TABS = [
  { id: "prices", label: "Hourly prices" },
  { id: "blocks", label: "Blocked hours" },
] as const;

export default function CourtsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("prices");
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Courts &amp; Pricing</h1>
        <p className="text-sm text-muted">What each hour costs, and which hours are closed for booking.</p>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-surface p-1 shadow-sm" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`rounded-xl py-2.5 text-sm font-semibold ${tab === t.id ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}>{t.label}</button>
        ))}
      </div>

      {tab === "prices" ? <PricesTab /> : <BlocksTab />}
    </div>
  );
}
