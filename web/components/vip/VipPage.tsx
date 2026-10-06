"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Crown, MessageCircle, Pencil, Phone, Plus, Search, Trash2 } from "lucide-react";
import { Badge } from "../bookings/Badge";
import Switch from "../Switch";
import GiveVipSheet from "./GiveVipSheet";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { prettyDate, rs } from "@/lib/bookings";
import { removeVip, saveVip } from "@/lib/customers";
import { PAGE_SIZE, VipItem, VipList, VipStatus, copyText, describe, listVip, shareLink } from "@/lib/vip";

const TABS: { id: VipStatus; label: string }[] = [
  { id: "", label: "All" }, { id: "active", label: "Active" }, { id: "unclaimed", label: "Not typed yet" }, { id: "paused", label: "Paused" },
];

export default function VipPage() {
  const [status, setStatus] = useState<VipStatus>("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [pageNo, setPageNo] = useState(1);
  const [data, setData] = useState<VipList | null>(null);
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState<"new" | VipItem | null>(null);
  const [tick, setTick] = useState(0);
  const [copied, setCopied] = useState("");
  const canWrite = true;

  useEffect(() => {
    const t = setTimeout(() => { setQ(search); setPageNo(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let live = true;
    listVip({ status, q, page: pageNo })
      .then((d) => { if (live) { setData(d); setError(""); } })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load VIP customers"); });
    return () => { live = false; };
  }, [status, q, pageNo, tick]);

  const pick = (fn: () => void) => { fn(); setPageNo(1); setData(null); setError(""); };
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const input = "rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";

  async function toggle(v: VipItem) {
    if (!guard("vip.manage")) return;
    setError("");
    try {
      await saveVip(v.phone, { code: v.code, type: v.type, value: v.value, active: !v.active, note: v.note });
      setTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save");
    }
  }

  async function remove(v: VipItem) {
    if (!guard("vip.manage")) return;
    if (!window.confirm(`Remove the VIP code ${v.code} from ${v.customerName ?? v.phone}? They will pay the normal price again.`)) return;
    try {
      await removeVip(v.phone);
      setTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not remove it");
    }
  }

  const t = data?.totals;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Crown className="text-amber-500" /> VIP Privilege</h1>
          <p className="text-sm text-muted">Give a customer a special code. They type it once when booking and get a discount on every game.</p>
        </div>
        {canWrite && <button onClick={() => guard("vip.manage") && setSheet("new")} className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16} /> Give VIP</button>}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([["VIP customers", t ? String(t.customers) : "—"], ["Typed their code", t ? `${t.entered} of ${t.customers}` : "—"], ["Games discounted", t ? String(t.games) : "—"], ["Discount given", t ? rs(t.discountGiven) : "—"]] as const).map(([l, v]) => (
          <div key={l} className="rounded-2xl bg-surface p-3 shadow-sm"><p className="text-xs text-muted">{l}</p><p className="text-lg font-bold">{v}</p></div>
        ))}
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-surface p-1 shadow-sm" role="tablist" aria-label="VIP status">
        {TABS.map((x) => (
          <button key={x.label} role="tab" aria-selected={status === x.id} onClick={() => pick(() => setStatus(x.id))}
            className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold ${status === x.id ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}>{x.label}</button>
        ))}
      </div>

      <label className="relative block">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input value={search} onChange={(e) => { setSearch(e.target.value); setData(null); }} placeholder="Search name, phone, code or note" className={`${input} w-full pl-10`} />
      </label>

      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!data && !error && <p className="py-10 text-center text-sm text-muted">Loading…</p>}
      {data && data.items.length === 0 && (
        <div className="grid place-items-center gap-3 rounded-2xl bg-surface py-14 text-center text-muted shadow-sm">
          <Crown size={34} strokeWidth={1.5} />
          <p>{q || status ? "No VIP customers match." : "No VIP customers yet."}</p>
          {canWrite && !q && !status && <button onClick={() => guard("vip.manage") && setSheet("new")} className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white">Give the first VIP code</button>}
        </div>
      )}

      <ul className="space-y-3">
        {data?.items.map((v) => (
          <li key={v.phone} className={`space-y-3 rounded-2xl bg-surface p-4 shadow-sm ${v.active ? "" : "opacity-75"}`}>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{v.customerName || "No name"}</p>
                <p className="text-sm text-muted">{v.phone}</p>
              </div>
              <a href={`tel:${v.phone}`} aria-label={`Call ${v.customerName ?? v.phone}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-white"><Phone size={17} /></a>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 p-3">
              <div>
                <p className="font-mono text-xl font-bold tracking-wide">{v.code}</p>
                <p className="text-sm font-semibold text-brand">{describe(v)} on every game</p>
              </div>
              <button onClick={async () => { if (await copyText(v.code)) { setCopied(v.phone); setTimeout(() => setCopied(""), 1500); } }} className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs font-semibold"><Copy size={13} /> {copied === v.phone ? "Copied" : "Copy"}</button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <Badge tone={v.active ? "bg-brand/15 text-brand" : "bg-slate-500/15 text-slate-500"}>{v.active ? "Active" : "Paused"}</Badge>
              <Badge tone={v.claimedAt ? "bg-blue-500/15 text-blue-600" : "bg-amber-500/15 text-amber-700"}>{v.claimedAt ? `Typed on ${prettyDate(v.claimedAt.slice(0, 10))}` : "Customer has not typed it yet"}</Badge>
              {!v.accountActive && <Badge tone="bg-red-500/15 text-red-600">Account suspended</Badge>}
            </div>

            <p className="text-sm text-muted"><strong className="text-foreground">{v.usage.games}</strong> games discounted · saved the customer <strong className="text-foreground">{rs(v.usage.discountGiven)}</strong></p>
            {v.note && <p className="text-xs text-muted">Note: {v.note}</p>}

            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <a href={shareLink(v.phone, v.customerName, v)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold"><MessageCircle size={13} /> Send code</a>
              {canWrite && (
                <>
                  <button onClick={() => guard("vip.manage") && setSheet(v)} className="flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold"><Pencil size={13} /> Change</button>
                  <button onClick={() => remove(v)} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-red-600"><Trash2 size={13} /> Remove</button>
                  <span className="ml-auto flex items-center gap-2 text-xs text-muted">{v.active ? "On" : "Paused"}<Switch on={v.active} label={v.active ? `Pause ${v.code}` : `Resume ${v.code}`} onChange={() => toggle(v)} /></span>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-2 text-sm">
          <button disabled={pageNo <= 1} onClick={() => { setPageNo(pageNo - 1); setData(null); }} className="flex items-center gap-1 rounded-xl bg-surface px-3 py-2 shadow-sm disabled:opacity-40"><ChevronLeft size={16} /> Previous</button>
          <span className="text-muted">Page {pageNo} of {pages}</span>
          <button disabled={pageNo >= pages} onClick={() => { setPageNo(pageNo + 1); setData(null); }} className="flex items-center gap-1 rounded-xl bg-surface px-3 py-2 shadow-sm disabled:opacity-40">Next <ChevronRight size={16} /></button>
        </div>
      )}

      <p className="rounded-xl bg-surface p-3 text-xs text-muted shadow-sm">If a VIP customer also types a normal promo code, they get whichever discount is bigger. Only the customer a code was given to can use it.</p>

      {sheet && <GiveVipSheet edit={sheet === "new" ? null : sheet} onClose={() => setSheet(null)} onSaved={() => setTick((x) => x + 1)} />}
    </div>
  );
}
