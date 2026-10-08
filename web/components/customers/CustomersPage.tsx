"use client";

import { useEffect, useState } from "react";
import { Ban, ChevronLeft, ChevronRight, Phone, Search, UserPlus, Users } from "lucide-react";
import { Badge } from "../bookings/Badge";
import AddCustomerSheet from "./AddCustomerSheet";
import CustomerSheet from "./CustomerSheet";
import VipTag from "./VipTag";
import { rs } from "@/lib/bookings";
import { guard } from "@/lib/access";
import { CustomerList, CustomerRow, Mode, PAGE_SIZE, initials, listCustomers, setActive } from "@/lib/customers";

const MODES: { id: Mode | ""; label: string }[] = [{ id: "", label: "Everyone" }, { id: "captain", label: "Captains" }, { id: "player", label: "Regular players" }];

export default function CustomersPage() {
  const [mode, setMode] = useState<Mode | "">("");
  const [status, setStatus] = useState<"" | "active" | "suspended">("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [pageNo, setPageNo] = useState(1);
  const [data, setData] = useState<CustomerList | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<CustomerRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [tick, setTick] = useState(0);
  const canSuspend = true;

  async function suspend(c: CustomerRow) {
    if (!guard("customers.suspend")) return;
    if (!window.confirm(`Suspend ${c.name ?? c.phoneNumber}? They cancelled ${c.stats.cancelStreak} games in a row. They will not be able to sign in. Their records are kept and you can reactivate them later.`)) return;
    try {
      await setActive(c.phoneNumber, false);
      setTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not suspend this account");
    }
  }

  useEffect(() => {
    const t = setTimeout(() => { setQ(search); setPageNo(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let live = true;
    listCustomers({ q, mode, status, page: pageNo })
      .then((d) => { if (live) { setData(d); setError(""); } })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load customers"); });
    return () => { live = false; };
  }, [q, mode, status, pageNo, tick]);

  const pick = (fn: () => void) => { fn(); setPageNo(1); setData(null); setError(""); };
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const input = "rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";

  return (
    <div className="w-full space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-sm text-muted">Everyone who has an account in the app. Tap a customer for their full history.</p>
        </div>
        <button onClick={() => guard("customers.create") && setAdding(true)} className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white"><UserPlus size={16} /> Add customer</button>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-surface p-1 shadow-sm" role="tablist" aria-label="Customer type">
        {MODES.map((m) => (
          <button key={m.label} role="tab" aria-selected={mode === m.id} onClick={() => pick(() => setMode(m.id))}
            className={`rounded-xl px-2 py-2.5 text-sm font-semibold ${mode === m.id ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}>{m.label}</button>
        ))}
      </div>

      <div className="flex gap-2">
        <label className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setData(null); }} placeholder="Search name, phone or email" className={`${input} w-full pl-10`} />
        </label>
        <select value={status} onChange={(e) => pick(() => setStatus(e.target.value as typeof status))} aria-label="Account status" className={`${input} max-w-[9rem]`}>
          <option value="">All accounts</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!data && !error && <p className="py-10 text-center text-sm text-muted">Loading customers…</p>}
      {data && data.items.length === 0 && (
        <div className="grid place-items-center gap-2 rounded-2xl bg-surface py-14 text-center text-muted shadow-sm">
          <Users size={32} strokeWidth={1.5} />
          <p>{q || mode || status ? "No customers match these filters." : "No customers yet."}</p>
        </div>
      )}

      <ul className="grid items-start gap-2 xl:grid-cols-2">
        {data?.items.map((c) => (
          <li key={c.phoneNumber} className={`rounded-2xl p-3 shadow-sm ${c.vip ? "bg-amber-400/10 ring-2 ring-amber-400/70" : "bg-surface"}`}>
            <div className="flex items-center gap-3">
            <button onClick={() => setOpen(c)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Open ${c.name ?? c.phoneNumber}`}>
              <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand/15 font-bold text-brand">
                {initials(c.name, c.phoneNumber)}
                {c.mode === "captain" && <span title="Captain" className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-amber-400 text-[11px] font-black text-white">C</span>}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="min-w-0 break-words font-semibold">{c.name || "No name"}</span>
                  {c.vip && <VipTag />}
                  {!c.isActive && <Badge tone="bg-red-500/15 text-red-600">Suspended</Badge>}
                </span>
                <span className="block text-sm text-muted">{c.phoneNumber}</span>
                <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                  <span><strong className="text-foreground">{c.stats.gamesPlayed}</strong> games</span>
                  <span>paid <strong className="text-foreground">{rs(c.stats.paidTotal)}</strong></span>
                  {c.stats.unpaidTotal > 0 && <span className="font-semibold text-amber-600">owes {rs(c.stats.unpaidTotal)}</span>}
                  {c.stats.openComplaints > 0 && <span className="font-semibold text-red-600">{c.stats.openComplaints} open complaint{c.stats.openComplaints > 1 ? "s" : ""}</span>}
                </span>
              </span>
            </button>
            <a href={`tel:${c.phoneNumber}`} aria-label={`Call ${c.name ?? c.phoneNumber}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-white"><Phone size={18} /></a>
            </div>
            {c.stats.cancelStreak >= 2 && (
              <div className={`mt-2 flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm ${c.stats.cancelStreak >= 3 ? "bg-red-500/10 text-red-600" : "bg-amber-500/10 text-amber-700"}`}>
                <span className="flex items-center gap-1.5 font-semibold"><Ban size={15} /> Cancelled {c.stats.cancelStreak} games in a row</span>
                {canSuspend && c.isActive && <button onClick={() => suspend(c)} className="rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white">Suspend now</button>}
              </div>
            )}
          </li>
        ))}
      </ul>

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-2 text-sm">
          <button disabled={pageNo <= 1} onClick={() => { setPageNo(pageNo - 1); setData(null); }} className="flex items-center gap-1 rounded-xl bg-surface px-3 py-2 shadow-sm disabled:opacity-40"><ChevronLeft size={16} /> Previous</button>
          <span className="text-muted">Page {pageNo} of {pages} · {data.total} customers</span>
          <button disabled={pageNo >= pages} onClick={() => { setPageNo(pageNo + 1); setData(null); }} className="flex items-center gap-1 rounded-xl bg-surface px-3 py-2 shadow-sm disabled:opacity-40">Next <ChevronRight size={16} /></button>
        </div>
      )}

      {adding && <AddCustomerSheet onClose={() => setAdding(false)} onAdded={(phone) => { setSearch(phone); setMode(""); setStatus(""); setPageNo(1); setTick((t) => t + 1); }} />}
      {open && <CustomerSheet customer={open} onClose={() => setOpen(null)} onChanged={() => setTick((t) => t + 1)} />}
    </div>
  );
}
