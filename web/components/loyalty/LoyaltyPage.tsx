"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Phone, Search, Star, X } from "lucide-react";
import { Badge } from "../bookings/Badge";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import {
  CustomerLedger, Holder, KINDS, Kind, LedgerRow, LoyaltyOverview, PAGE_SIZE, Paged, VoucherRow, adjustPoints, fmtDay, getCustomer, getOverview, kindOf, listHolders, listLedger, listVouchers, pts, voidVoucher,
} from "@/lib/loyalty";

type Tab = "customers" | "activity" | "vouchers" | "rules";
const input = "rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");
const nepalToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" }).format(new Date());
const shift = (key: string, days: number) => new Date(new Date(`${key}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
const num = (n: number) => String(Math.round(n * 10) / 10);

function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between">
      <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="flex items-center gap-1 rounded-full border border-line px-4 py-2 text-sm disabled:opacity-40"><ChevronLeft size={16} /> Back</button>
      <span className="text-sm text-muted">Page {page} of {pages}</span>
      <button disabled={page >= pages} onClick={() => onPage(page + 1)} className="flex items-center gap-1 rounded-full border border-line px-4 py-2 text-sm disabled:opacity-40">Next <ChevronRight size={16} /></button>
    </div>
  );
}

function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    load().then((d) => { if (live) { setData(d); setError(""); } }).catch((e) => { if (live) { setData(null); setError(msg(e)); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, clear: () => setData(null) };
}

const Status = ({ error, loading, empty }: { error: string; loading: boolean; empty?: string }) => (
  <>
    {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
    {loading && !error && <p className="py-10 text-center text-sm text-muted">Loading…</p>}
    {empty && <p className="rounded-2xl bg-surface p-8 text-center text-sm text-muted">{empty}</p>}
  </>
);

// ---------- one customer: balance, ledger, vouchers and an adjustment ----------
function CustomerSheet({ h, onClose, onChanged }: { h: Holder; onClose: () => void; onChanged: () => void }) {
  const [tick, setTick] = useState(0);
  const { data, error } = useLoad<CustomerLedger>(() => getCustomer(h.phone), [h.phone, tick]);
  const [sign, setSign] = useState<1 | -1>(1);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const value = Number(amount);
  const ok = amount !== "" && value > 0 && value <= 200 && reason.trim().length >= 5;

  async function save() {
    if (!guard("loyalty.adjust")) return;
    setBusy(true); setErr("");
    try { await adjustPoints({ phone: h.phone, points: sign * value, reason: reason.trim() }); setAmount(""); setReason(""); setTick((t) => t + 1); onChanged(); } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }
  async function voidIt(id: string) {
    if (!guard("loyalty.void")) return;
    if (!window.confirm("Void this free-game voucher? The customer cannot use it, and the points are not given back.")) return;
    try { await voidVoucher(id); setTick((t) => t + 1); onChanged(); } catch (e) { setErr(msg(e)); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label="Customer points" onClick={(e) => e.stopPropagation()} className="max-h-[94vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="text-lg font-bold">{h.name ?? "Customer"}</h2><p className="text-sm text-muted">{h.phone}</p></div>
          <div className="flex items-center gap-1"><a href={`tel:${h.phone}`} aria-label="Call" className="grid h-9 w-9 place-items-center rounded-full bg-brand/10 text-brand"><Phone size={16} /></a><button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-surface-2"><X size={20} /></button></div>
        </div>
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        {!data && !error && <p className="text-sm text-muted">Loading…</p>}
        {data && (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-brand/10 p-3"><p className="text-2xl font-bold text-brand">{num(data.approxBalance)}</p><p className="text-[11px] text-muted">Points now</p></div>
              <div className="rounded-xl bg-surface-2 p-3"><p className="text-2xl font-bold">{num(h.expiringSoon)}</p><p className="text-[11px] text-muted">Expire in 30 days</p></div>
              <div className="rounded-xl bg-surface-2 p-3"><p className="text-2xl font-bold">{data.vouchers.filter((v) => v.status === "unused").length}</p><p className="text-[11px] text-muted">Free-game vouchers</p></div>
            </div>
            <p className="text-xs text-muted">This is a close estimate. The customer app decides exactly which points can be spent on a given day.</p>

            <div className="space-y-2 rounded-xl border border-line p-3">
              <h3 className="text-sm font-bold">Adjust points</h3>
              <div className="flex gap-2">
                <div className="flex gap-1 rounded-xl bg-surface-2 p-1" role="group" aria-label="Add or take away">
                  {([[1, "Add"], [-1, "Take away"]] as const).map(([v, l]) => <button key={l} type="button" aria-pressed={sign === v} onClick={() => setSign(v)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${sign === v ? "bg-brand text-white" : "text-muted"}`}>{l}</button>)}
                </div>
                <input inputMode="decimal" className={`${input} w-24`} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))} placeholder="Points" aria-label="Points" />
              </div>
              <input className={`${input} w-full`} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="Reason (the customer is told), at least 5 letters" />
              {err && <p className="text-xs text-red-600" role="alert">{err}</p>}
              <button onClick={save} disabled={busy || !ok} className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : `${sign > 0 ? "Add" : "Take away"} ${amount || "…"} points`}</button>
              <p className="text-[11px] text-muted">Between 0.1 and 200 points at a time. Added points last 3 months, like game points.</p>
            </div>

            {data.vouchers.length > 0 && (
              <div>
                <h3 className="mb-1 text-sm font-bold">Free-game vouchers</h3>
                <ul className="divide-y divide-line text-sm">{data.vouchers.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2 py-2">
                    <span>{v.period} game <span className="text-xs text-muted">· cost {num(Number(v.cost))} · {fmtDay(v.claimedAt.slice(0, 10))}</span></span>
                    <span className="flex items-center gap-2"><Badge tone={v.status === "unused" ? "bg-green-500/15 text-green-700" : v.status === "used" ? "bg-surface-2 text-muted" : "bg-red-500/15 text-red-700"}>{v.status === "unused" ? "Unused" : v.status === "used" ? "Used" : "Voided"}</Badge>{v.status === "unused" && <button onClick={() => voidIt(v.id)} className="text-xs font-semibold text-red-600">Void</button>}</span>
                  </li>
                ))}</ul>
              </div>
            )}

            <div>
              <h3 className="mb-1 text-sm font-bold">Points history</h3>
              {data.rows.length === 0 ? <p className="text-sm text-muted">No points yet.</p> : (
                <ul className="divide-y divide-line text-sm">{data.rows.map((r) => {
                  const p = Number(r.points);
                  const expired = p > 0 && !!r.expiresOn && r.expiresOn < nepalToday();
                  return (
                    <li key={r.id} className="flex items-start justify-between gap-3 py-2">
                      <span className="min-w-0"><span className="block">{r.detail}</span><span className="block text-xs text-muted">{fmtDay(r.earnedOn)}{p > 0 ? (r.expiresOn ? ` · ${expired ? "expired" : "valid until"} ${fmtDay(r.expiresOn)}` : " · never expires") : ""}</span></span>
                      <span className={`shrink-0 font-bold ${p < 0 ? "text-red-600" : expired ? "text-muted line-through" : "text-green-700"}`}>{pts(p)}</span>
                    </li>
                  );
                })}</ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- tabs ----------
function CustomersTab({ onChanged, tick }: { onChanged: () => void; tick: number }) {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"balance" | "expiring" | "name">("balance");
  const [pageNo, setPageNo] = useState(1);
  const [open, setOpen] = useState<Holder | null>(null);
  useEffect(() => { const t = setTimeout(() => { setQ(search.trim()); setPageNo(1); }, 300); return () => clearTimeout(t); }, [search]);
  const { data, error } = useLoad(() => listHolders(q, sort, pageNo), [q, sort, pageNo, tick]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <label className="relative block min-w-0 flex-1"><Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a name or phone" className={`${input} w-full pl-10`} /></label>
        <select aria-label="Sort" className={input} value={sort} onChange={(e) => { setSort(e.target.value as typeof sort); setPageNo(1); }}>
          <option value="balance">Most points first</option><option value="expiring">Expiring soonest first</option><option value="name">By name</option>
        </select>
      </div>
      <Status error={error} loading={!data} empty={data && data.items.length === 0 ? (q ? "No customer matches." : "No customer has any points yet.") : undefined} />
      <ul className="grid gap-2 xl:grid-cols-2">
        {data?.items.map((h) => (
          <li key={h.phone}>
            <button onClick={() => setOpen(h)} className="flex w-full items-center justify-between gap-3 rounded-2xl bg-surface p-3.5 text-left shadow-sm hover:ring-2 hover:ring-brand/30">
              <span className="min-w-0"><span className="block truncate font-bold">{h.name ?? "Customer"}</span><span className="block text-xs text-muted">{h.phone}{h.unusedVouchers > 0 ? ` · ${h.unusedVouchers} free-game voucher${h.unusedVouchers === 1 ? "" : "s"}` : ""}</span></span>
              <span className="shrink-0 text-right"><span className="block text-lg font-bold text-brand">{num(h.balance)}</span>{h.expiringSoon > 0 && <span className="block text-[11px] font-semibold text-amber-700">{num(h.expiringSoon)} expire soon</span>}</span>
            </button>
          </li>
        ))}
      </ul>
      {data && <Pager page={pageNo} total={data.total} onPage={setPageNo} />}
      {open && <CustomerSheet h={open} onClose={() => setOpen(null)} onChanged={onChanged} />}
    </div>
  );
}

function ActivityTab({ tick }: { tick: number }) {
  const [kind, setKind] = useState<"" | Kind>("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [pageNo, setPageNo] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setQ(search.trim()); setPageNo(1); }, 300); return () => clearTimeout(t); }, [search]);
  const bad = !!from && !!to && from > to;
  const { data, error } = useLoad<Paged<LedgerRow> | null>(() => (bad ? Promise.resolve(null) : listLedger({ kind, q, from, to, page: pageNo })), [kind, q, from, to, pageNo, tick]);
  return (
    <div className="space-y-3">
      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-surface p-1 shadow-sm" role="tablist" aria-label="Kind of points">
        {([{ id: "" as const, label: "All" }, ...KINDS]).map((k) => <button key={k.label} role="tab" aria-selected={kind === k.id} onClick={() => { setKind(k.id); setPageNo(1); }} className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold ${kind === k.id ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}>{k.label}</button>)}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative block min-w-0 flex-1"><Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a name, phone or note" className={`${input} w-full pl-10`} /></label>
        <label className="flex items-center gap-1.5 text-sm">From <input type="date" className={input} value={from} max={nepalToday()} onChange={(e) => { setFrom(e.target.value); setPageNo(1); }} /></label>
        <label className="flex items-center gap-1.5 text-sm">Till <input type="date" className={input} value={to} max={nepalToday()} onChange={(e) => { setTo(e.target.value); setPageNo(1); }} /></label>
      </div>
      {bad && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">The From date must not be after the Till date.</p>}
      <Status error={error} loading={!data && !bad && !error} empty={data && data.items.length === 0 ? "Nothing matches these filters." : undefined} />
      <ul className="space-y-2">
        {data?.items.map((r) => {
          const k = kindOf(r.kind);
          return (
            <li key={r.id} className="flex items-start justify-between gap-3 rounded-2xl bg-surface p-3.5 shadow-sm">
              <span className="min-w-0"><span className="block"><strong>{r.name ?? r.phone}</strong> <Badge tone={k.tone}>{k.label}</Badge></span><span className="block text-sm">{r.detail}</span><span className="block text-xs text-muted">{fmtDay(r.earnedOn)}{r.points > 0 ? (r.expiresOn ? ` · ${r.expired ? "expired" : "valid until"} ${fmtDay(r.expiresOn)}` : " · never expires") : ""} · {r.phone}</span></span>
              <span className={`shrink-0 text-lg font-bold ${r.points < 0 ? "text-red-600" : r.expired ? "text-muted line-through" : "text-green-700"}`}>{pts(r.points)}</span>
            </li>
          );
        })}
      </ul>
      {data && <Pager page={pageNo} total={data.total} onPage={setPageNo} />}
    </div>
  );
}

function VouchersTab({ tick, onChanged }: { tick: number; onChanged: () => void }) {
  const [status, setStatus] = useState<"" | "unused" | "used" | "void">("unused");
  const [pageNo, setPageNo] = useState(1);
  const [n, setN] = useState(0);
  const [err, setErr] = useState("");
  const { data, error } = useLoad<Paged<VoucherRow>>(() => listVouchers(status, pageNo), [status, pageNo, tick, n]);
  async function voidIt(v: VoucherRow) {
    if (!guard("loyalty.void")) return;
    if (!window.confirm(`Void ${v.name ?? v.phone}'s ${v.period} free-game voucher? The points are not given back.`)) return;
    try { await voidVoucher(v.id); setN((x) => x + 1); onChanged(); setErr(""); } catch (e) { setErr(msg(e)); }
  }
  return (
    <div className="space-y-3">
      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-surface p-1 shadow-sm" role="tablist" aria-label="Voucher status">
        {([["unused", "Unused"], ["used", "Used"], ["void", "Voided"], ["", "All"]] as const).map(([id, l]) => <button key={l} role="tab" aria-selected={status === id} onClick={() => { setStatus(id); setPageNo(1); }} className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold ${status === id ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}>{l}</button>)}
      </div>
      <p className="text-sm text-muted">A customer spends points to claim a free game for a shift (10 games = 1 free game). The voucher is used when they book with it.</p>
      {err && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{err}</p>}
      <Status error={error} loading={!data} empty={data && data.items.length === 0 ? "No vouchers here." : undefined} />
      <ul className="grid gap-2 xl:grid-cols-2">
        {data?.items.map((v) => (
          <li key={v.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-3.5 shadow-sm">
            <span className="min-w-0"><span className="block font-bold">{v.name ?? v.phone} <span className="text-xs font-normal text-muted">{v.phone}</span></span><span className="block text-sm">{v.period} game · cost {num(v.cost)} points</span><span className="block text-xs text-muted">Claimed {fmtDay(v.claimedAt.slice(0, 10))}{v.usedAt ? ` · used ${fmtDay(v.usedAt.slice(0, 10))}${v.bookingCode ? ` (${v.bookingCode})` : ""}` : ""}</span></span>
            <span className="flex shrink-0 flex-col items-end gap-1"><Badge tone={v.status === "unused" ? "bg-green-500/15 text-green-700" : v.status === "used" ? "bg-surface-2 text-muted" : "bg-red-500/15 text-red-700"}>{v.status === "unused" ? "Unused" : v.status === "used" ? "Used" : "Voided"}</Badge>{v.status === "unused" && <button onClick={() => voidIt(v)} className="text-xs font-semibold text-red-600">Void</button>}</span>
          </li>
        ))}
      </ul>
      {data && <Pager page={pageNo} total={data.total} onPage={setPageNo} />}
    </div>
  );
}

function RulesTab() {
  const rows: [string, string][] = [
    ["A paid game", "Price ÷ 100 points (Rs. 1,250 = 12.5 points), added when the game is completed and paid. Free-game and challenge games earn none."],
    ["Goods", "Every Rs. 100 = 1 point, added when the goods are paid. Goods taken on credit earn when they are paid."],
    ["Membership", "3 months = 30 points, 6 months = 70 points, one month = 0. Added once when the payment is verified, and again for each renewal."],
    ["Winning a challenge game", "5 points to the winning captain, once, when the result is approved."],
    ["Refer & Earn", "Points for both people when staff approve a referral. The amounts are set on the Refer & Earn page."],
    ["Free game", "10 games' worth of points = 1 free game of that shift (cost = price ÷ 10). The customer claims it in the app and uses the voucher when booking."],
    ["How long points last", "Game and challenge points: 3 months from the game. Goods: 1 year. Referral: 12 months. Membership: never. Spending uses the points that expire soonest first."],
    ["Adjustments", "Staff can add or take away up to 200 points with a reason. The customer is told. Adjusting is limited to people with that permission."],
  ];
  return (
    <section className="rounded-2xl bg-surface p-4 shadow-sm lg:p-5">
      <h2 className="mb-1 text-lg font-bold">How points work</h2>
      <p className="mb-3 text-sm text-muted">These rules are fixed in the customer system and enforced by the server. This page only shows them.</p>
      <dl className="divide-y divide-line">{rows.map(([t, d]) => <div key={t} className="grid gap-1 py-3 sm:grid-cols-[220px_1fr]"><dt className="font-semibold">{t}</dt><dd className="text-sm text-muted">{d}</dd></div>)}</dl>
    </section>
  );
}

// ---------- the page ----------
type Range = "7" | "30" | "month";
export default function LoyaltyPage() {
  const [tab, setTab] = useState<Tab>("customers");
  const [range, setRange] = useState<Range>("30");
  const [tick, setTick] = useState(0);
  const today = nepalToday();
  const [from, to] = range === "7" ? [shift(today, -6), today] : range === "30" ? [shift(today, -29), today] : [`${today.slice(0, 8)}01`, today];
  const { data: ov, error } = useLoad<LoyaltyOverview>(() => getOverview(from, to), [from, to, tick]);
  const changed = () => setTick((t) => t + 1);
  const tabs: { id: Tab; label: string }[] = [{ id: "customers", label: "Customers" }, { id: "activity", label: "Activity" }, { id: "vouchers", label: "Free-game vouchers" }, { id: "rules", label: "How it works" }];
  const given = ov?.period.byKind.filter((k) => k.points > 0) ?? [];

  return (
    <div className="w-full space-y-4 lg:space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Star className="text-brand" /> Loyalty Points</h1>
          <p className="text-sm text-muted">What customers have earned, what they hold now, what is about to expire, and their free-game vouchers.</p>
        </div>
        <div className="flex gap-1 rounded-2xl bg-surface p-1 shadow-sm" role="tablist" aria-label="Period for the numbers">
          {([["7", "7 days"], ["30", "30 days"], ["month", "This month"]] as const).map(([id, l]) => <button key={id} role="tab" aria-selected={range === id} onClick={() => setRange(id)} className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-sm font-semibold ${range === id ? "bg-brand text-white" : "text-muted"}`}>{l}</button>)}
        </div>
      </div>

      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {([
          ["Points owed now", ov ? num(ov.now.owedPoints) : "—", ov ? `${ov.now.customersWithPoints} customers` : "", ""],
          ["Given in the period", ov ? num(ov.period.earned) : "—", given.map((k) => `${kindOf(k.kind).label} ${num(k.points)}`).join(" · "), ""],
          ["Spent in the period", ov ? num(ov.period.spent) : "—", ov ? `${ov.period.claims} free game${ov.period.claims === 1 ? "" : "s"} claimed` : "", ""],
          ["Expiring in 30 days", ov ? num(ov.now.expiringSoon.points) : "—", ov ? `${ov.now.expiringSoon.customers} customers` : "", ov && ov.now.expiringSoon.points > 0 ? "ring-2 ring-amber-500/40" : ""],
          ["Unused vouchers", ov ? String(ov.now.vouchers.unused) : "—", ov ? `${ov.now.vouchers.used} used · ${ov.now.vouchers.void} voided` : "", ""],
        ] as const).map(([l, v, h, ring]) => (
          <div key={l} className={`rounded-2xl bg-surface p-3 shadow-sm ${ring}`}><p className="text-xs text-muted">{l}</p><p className="text-xl font-bold">{v}</p>{h && <p className="truncate text-[11px] text-muted" title={h}>{h}</p>}</div>
        ))}
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-surface p-1 shadow-sm" role="tablist">
        {tabs.map((x) => <button key={x.id} role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)} className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold ${tab === x.id ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}>{x.label}</button>)}
      </div>
      {tab === "customers" && <CustomersTab tick={tick} onChanged={changed} />}
      {tab === "activity" && <ActivityTab tick={tick} />}
      {tab === "vouchers" && <VouchersTab tick={tick} onChanged={changed} />}
      {tab === "rules" && <RulesTab />}
    </div>
  );
}
