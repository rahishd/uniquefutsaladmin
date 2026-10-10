"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, ChevronLeft, ChevronRight, MessageCircle, Phone, Plus, Search } from "lucide-react";
import { Badge } from "../bookings/Badge";
import { BalanceSheet, NewMemberSheet, ReasonSheet, RenewSheet, VerifySheet } from "./MemberSheets";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { rs } from "@/lib/bookings";
import {
  Member, MemberList, MemberStatus, PAGE_SIZE, STATUS_LABEL, STATUS_TONE, lengthLabel, listMembers, resumeMember, shortDate, slotLabel,
} from "@/lib/membership";

const TABS: { id: "" | MemberStatus; label: string }[] = [
  { id: "", label: "All" }, { id: "pending", label: "Waiting" }, { id: "active", label: "Active" }, { id: "expiring", label: "Expiring" },
  { id: "expired", label: "Expired" }, { id: "suspended", label: "Suspended" }, { id: "cancelled", label: "Cancelled" },
];

type Sheet = { kind: "new" } | { kind: "verify" | "balance" | "renew" | "extend" | "suspend" | "cancel"; m: Member } | null;

const reminder = (m: Member) => {
  const text = m.status === "expired"
    ? `Hello ${m.customer.name ?? ""}, your Unique Futsal membership ${m.memberCode} ended on ${shortDate(m.endDate)}. Reply to renew and keep your slot.`
    : `Hello ${m.customer.name ?? ""}, your Unique Futsal membership ${m.memberCode} ends on ${shortDate(m.endDate)}. Reply to renew and keep your slot.`;
  const d = m.customer.phone.replace(/\D/g, "");
  return `https://wa.me/${d.length === 10 ? `977${d}` : d}?text=${encodeURIComponent(text)}`;
};

export default function MembershipPage() {
  const [status, setStatus] = useState<"" | MemberStatus>("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [pageNo, setPageNo] = useState(1);
  const [data, setData] = useState<MemberList | null>(null);
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => { const t = setTimeout(() => { setQ(search); setPageNo(1); }, 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => {
    let live = true;
    listMembers({ status, q, page: pageNo })
      .then((d) => { if (live) { setData(d); setError(""); } })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load memberships"); });
    return () => { live = false; };
  }, [status, q, pageNo, tick]);

  const refresh = () => setTick((t) => t + 1);
  const pick = (s: "" | MemberStatus) => { setStatus(s); setPageNo(1); setData(null); setError(""); };
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const input = "rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
  const open = (permission: string, s: Sheet) => { if (guard(permission)) setSheet(s); };

  async function resume(m: Member) {
    if (!guard("membership.edit")) return;
    setError("");
    try { await resumeMember(m.id); refresh(); } catch (e) { setError(e instanceof ApiError ? e.message : "Could not resume"); }
  }

  const c = data?.counts;
  return (
    <div className="w-full space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold"><BadgeCheck className="text-brand" /> Membership</h1>
          <p className="text-sm text-muted">Members, their fixed weekly hour, payment verification and renewals. Prices and perks are set in <Link href="/courts" className="font-semibold text-brand underline">Courts &gt; Membership</Link>.</p>
        </div>
        <button onClick={() => open("membership.create", { kind: "new" })} className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-3 py-2.5 text-sm font-semibold text-white sm:px-4"><Plus size={16} /> New<span className="hidden sm:inline">&nbsp;member</span></button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {([["Waiting for payment", c?.pending, "pending"], ["Active", c?.active, "active"], ["Expiring soon", c?.expiring, "expiring"], ["Expired", c?.expired, "expired"], ["Active membership value", data ? rs(data.activeValue) : undefined, ""]] as const).map(([l, v, s]) => (
          <button key={l} onClick={() => s && pick(s as MemberStatus)} className="rounded-2xl bg-surface p-3 text-left shadow-sm">
            <p className="text-xs text-muted">{l}</p><p className="text-lg font-bold">{v ?? "—"}</p>
          </button>
        ))}
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-surface p-1 shadow-sm" role="tablist" aria-label="Membership status">
        {TABS.map((x) => (
          <button key={x.label} role="tab" aria-selected={status === x.id} onClick={() => pick(x.id)} className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold ${status === x.id ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}>
            {x.label}{c ? ` (${x.id ? c[x.id] : c.all})` : ""}
          </button>
        ))}
      </div>

      <label className="relative block">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input value={search} onChange={(e) => { setSearch(e.target.value); setData(null); }} placeholder="Search name, phone or Membership ID (MEM-10291)" className={`${input} w-full pl-10`} />
      </label>

      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!data && !error && <p className="py-10 text-center text-sm text-muted">Loading…</p>}
      {data && data.items.length === 0 && <p className="rounded-2xl bg-surface p-8 text-center text-sm text-muted">No memberships here yet.</p>}

      <ul className="grid gap-3 xl:grid-cols-2">
        {data?.items.map((m) => (
          <li key={m.id} className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-bold">{m.customer.name ?? "Customer"}</p>
                <p className="text-xs text-muted">{m.memberCode ?? "No ID yet"} · {m.customer.phone}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Badge tone={STATUS_TONE[m.status]}>{STATUS_LABEL[m.status]}</Badge>
                <a href={`tel:${m.customer.phone}`} aria-label={`Call ${m.customer.name ?? m.customer.phone}`} className="grid h-9 w-9 place-items-center rounded-full bg-brand/10 text-brand"><Phone size={15} /></a>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-3">
              <p><span className="block text-[11px] text-muted">Plan</span><span className="font-semibold">{m.plan.name}{m.length ? `, ${lengthLabel(m.length)}` : ""}</span></p>
              <p><span className="block text-[11px] text-muted">Fixed hour</span><span className="font-semibold">{m.timeSlot ? slotLabel(m.timeSlot) : "None"}{m.shift ? ` (${m.shift})` : ""}</span></p>
              <p><span className="block text-[11px] text-muted">Paid</span><span className="font-semibold">{m.paymentStatus === "partial" ? <>{rs(m.paid ?? 0)} <span className="font-normal text-muted">of {rs(m.totalPrice)}</span></> : <>{rs(m.totalPrice)}{m.paymentStatus !== "verified" ? " (not yet)" : ""}</>}</span>{m.paymentStatus === "partial" && <span className="mt-0.5 block text-xs font-semibold text-amber-700">Balance {rs(m.balance ?? 0)} to collect</span>}</p>
              <p><span className="block text-[11px] text-muted">From</span><span className="font-semibold">{shortDate(m.startDate)}</span></p>
              <p><span className="block text-[11px] text-muted">Until</span><span className="font-semibold">{shortDate(m.endDate)}{m.daysLeft !== null && m.status !== "cancelled" ? (m.daysLeft >= 0 ? ` · ${m.daysLeft} days left` : ` · ended ${-m.daysLeft} days ago`) : ""}</span></p>
              <p><span className="block text-[11px] text-muted">Games played</span><span className="font-semibold">{m.gamesPlayed ?? 0}</span></p>
            </div>
            <div className="flex flex-wrap gap-1">
              {m.days.length === 7 ? <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold">Every day</span> : m.days.map((d) => <span key={d} className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold">{d.slice(0, 3)}</span>)}
              {m.promoCode && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">promo {m.promoCode}</span>}
            </div>
            {m.notes && <p className="whitespace-pre-line rounded-xl bg-surface-2 p-2 text-xs text-muted">{m.notes}</p>}

            <div className="flex flex-wrap gap-2 border-t border-line pt-3">
              {m.status === "pending" && <button onClick={() => open("membership.edit", { kind: "verify", m })} className="rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white">Verify payment</button>}
              {m.paymentStatus === "partial" && (m.balance ?? 0) > 0 && m.rawStatus !== "cancelled" && <button onClick={() => open("membership.edit", { kind: "balance", m })} className="rounded-full bg-amber-500 px-4 py-2 text-xs font-semibold text-white">Collect balance {rs(m.balance ?? 0)}</button>}
              {(m.status === "active" || m.status === "expiring" || m.status === "expired") && <button onClick={() => open("membership.edit", { kind: "renew", m })} className="rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white">Renew</button>}
              {m.rawStatus === "active" && <button onClick={() => open("membership.edit", { kind: "extend", m })} className="rounded-full border border-line px-4 py-2 text-xs font-semibold">Extend</button>}
              {m.rawStatus === "active" && m.status !== "expired" && <button onClick={() => open("membership.edit", { kind: "suspend", m })} className="rounded-full border border-line px-4 py-2 text-xs font-semibold">Suspend</button>}
              {m.status === "suspended" && <button onClick={() => resume(m)} className="rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white">Resume</button>}
              {(m.status === "expiring" || m.status === "expired") && <a href={reminder(m)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-full bg-[#25D366] px-4 py-2 text-xs font-semibold text-white"><MessageCircle size={13} /> Remind on WhatsApp</a>}
              {m.status !== "cancelled" && <button onClick={() => open("membership.edit", { kind: "cancel", m })} className="rounded-full px-3 py-2 text-xs font-semibold text-red-600">Cancel</button>}
            </div>
          </li>
        ))}
      </ul>

      {data && pages > 1 && (
        <div className="flex items-center justify-between">
          <button disabled={pageNo <= 1} onClick={() => setPageNo((p) => p - 1)} className="flex items-center gap-1 rounded-full border border-line px-4 py-2 text-sm disabled:opacity-40"><ChevronLeft size={16} /> Back</button>
          <span className="text-sm text-muted">Page {pageNo} of {pages}</span>
          <button disabled={pageNo >= pages} onClick={() => setPageNo((p) => p + 1)} className="flex items-center gap-1 rounded-full border border-line px-4 py-2 text-sm disabled:opacity-40">Next <ChevronRight size={16} /></button>
        </div>
      )}

      {sheet?.kind === "new" && <NewMemberSheet onClose={() => setSheet(null)} onDone={refresh} />}
      {sheet?.kind === "verify" && <VerifySheet m={sheet.m} onClose={() => setSheet(null)} onDone={refresh} />}
      {sheet?.kind === "balance" && <BalanceSheet m={sheet.m} onClose={() => setSheet(null)} onDone={refresh} />}
      {sheet?.kind === "renew" && <RenewSheet m={sheet.m} onClose={() => setSheet(null)} onDone={refresh} />}
      {(sheet?.kind === "extend" || sheet?.kind === "suspend" || sheet?.kind === "cancel") && <ReasonSheet m={sheet.m} kind={sheet.kind} onClose={() => setSheet(null)} onDone={refresh} />}
    </div>
  );
}
