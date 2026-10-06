"use client";

import Link from "next/link";
import { Crown } from "lucide-react";
import { Profile } from "@/lib/customers";

// Read-only: the Customers page only shows that a VIP privilege was given, and its code.
// Giving, changing, pausing and removing a VIP code is done on the VIP Privilege page.
export default function VipSection({ p }: { p: Profile }) {
  const vip = p.vip;
  return (
    <section className={`space-y-2 rounded-2xl border p-4 ${vip ? "border-amber-400/60 bg-amber-400/10" : "border-line"}`}>
      <h3 className="flex items-center gap-2 font-bold"><Crown size={17} className="text-amber-500" /> VIP privilege</h3>
      {vip ? (
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-xl font-bold tracking-widest">{vip.code}</p>
          {!vip.active && <span className="rounded-full bg-slate-500/15 px-2.5 py-0.5 text-xs font-medium text-slate-500">Paused</span>}
        </div>
      ) : (
        <p className="text-sm text-muted">No VIP privilege given.</p>
      )}
      <Link href="/vip" className="inline-block text-sm font-semibold text-brand">{vip ? "Manage on the VIP Privilege page" : "Give VIP privilege on the VIP Privilege page"}</Link>
    </section>
  );
}
