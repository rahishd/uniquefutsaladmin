"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, HandCoins, HeartHandshake, Plus, Search, Wrench, X } from "lucide-react";
import { Badge } from "../bookings/Badge";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { prettyDate, rs } from "@/lib/bookings";
import { todayKey } from "@/lib/slots";
import { Deposit, DepositList, Fund, FundsView, PAGE_SIZE, addFund, depositAmount, editFund, loadDeposits, loadFunds } from "@/lib/service-funds";

const money = (n: number) => `Rs. ${n.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");
const input = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";

// Collect Service Payment: what each service (the 3% Charity Fund, maintenance, balls ...) has collected, what is still to be
// set aside, the Deposit Amount button and the history of every deposit.
export default function ServiceFundsPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [view, setView] = useState<FundsView | null>(null);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [depositFor, setDepositFor] = useState<Fund | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Fund | null>(null);

  // history
  const [fundId, setFundId] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [pageNo, setPageNo] = useState(1);
  const [hist, setHist] = useState<DepositList | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setQ(search); setPageNo(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let live = true;
    loadFunds(from, to).then((v) => { if (live) { setView(v); setError(""); } }).catch((e) => { if (live) setError(msg(e)); });
    loadDeposits({ fundId, from, to, q, page: pageNo }).then((h) => { if (live) setHist(h); }).catch(() => {});
    return () => { live = false; };
  }, [from, to, fundId, q, pageNo, tick]);

  const reload = () => setTick((n) => n + 1);
  const pages = hist ? Math.max(1, Math.ceil(hist.total / PAGE_SIZE)) : 1;

  async function toggle(f: Fund) {
    if (!guard("servicefunds.manage")) return;
    try { await editFund(f.id, { active: !f.active }); setNote(`${f.name} is now ${f.active ? "switched off" : "on"}.`); reload(); } catch (e) { setError(msg(e)); }
  }

  return (
    <div className="w-full space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><HandCoins size={24} className="text-brand" /> Collect Service Payment</h1>
        <p className="text-sm text-muted">Money set aside for a purpose, kept apart from the day&apos;s takings. The 3% Charity Fund grows with every payment; Maintenance, Ball amounts or any service you add are recorded when you deposit. Every deposit is kept for ever and cannot be changed.</p>
      </header>

      <div className="flex flex-wrap items-end gap-2 text-sm">
        <label className="space-y-1"><span className="block text-xs text-muted">From</span><input type="date" value={from} max={to || todayKey()} onChange={(e) => { setFrom(e.target.value); setPageNo(1); }} className={input} /></label>
        <label className="space-y-1"><span className="block text-xs text-muted">To</span><input type="date" value={to} min={from || undefined} max={todayKey()} onChange={(e) => { setTo(e.target.value); setPageNo(1); }} className={input} /></label>
        {(from || to) && <button onClick={() => { setFrom(""); setTo(""); setPageNo(1); }} className="rounded-xl px-3 py-2.5 text-sm font-semibold text-brand">All time</button>}
        <button onClick={() => guard("servicefunds.manage") && setAdding(true)} className="ml-auto flex items-center gap-1.5 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16} /> Add service</button>
      </div>

      {note && <p className="rounded-xl bg-brand/10 p-3 text-sm text-brand" role="status">{note}</p>}
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!view && !error && <p className="py-10 text-center text-sm text-muted">Loading services…</p>}

      {view && (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Takings">
            <div className="rounded-2xl bg-surface p-3 shadow-sm"><p className="text-xs text-muted">Takings{view.from || view.to ? " in this period" : ""}</p><p className="text-lg font-bold">{rs(view.base.total)}</p></div>
            <div className="rounded-2xl bg-surface p-3 shadow-sm"><p className="text-xs text-muted">Deposited{view.from || view.to ? " in this period" : ""}</p><p className="text-lg font-bold">{money(view.totals.deposited)}</p></div>
            <div className="rounded-2xl bg-sky-500/10 p-3 shadow-sm"><p className="text-xs text-muted">Still to set aside (all time)</p><p className="text-lg font-bold text-sky-700">{money(view.totals.toDeposit)}</p></div>
            <div className="rounded-2xl bg-surface p-3 text-xs text-muted shadow-sm">Takings = courts {rs(view.base.courts)}, memberships {rs(view.base.memberships)}, Gamezone {rs(view.base.gamezone)}, club {rs(view.base.club)}, tournaments {rs(view.base.tournaments)}</div>
          </section>

          <ul className="grid gap-3 xl:grid-cols-2">
            {view.items.map((f) => (
              <li key={f.id} className={`rounded-2xl bg-surface p-4 shadow-sm ${f.active ? "" : "opacity-60"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-bold">{f.kind === "percent" ? <HeartHandshake size={18} className="text-sky-600" /> : <Wrench size={18} className="text-muted" />}{f.name}</p>
                    <p className="text-xs text-muted">{f.kind === "percent" ? `${f.rate}% of the takings, collected automatically` : "Manual: you record what is set aside"}{f.note ? ` · ${f.note}` : ""}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {!f.active && <Badge tone="bg-surface-2 text-muted">Off</Badge>}
                    <button onClick={() => guard("servicefunds.manage") && setEditing(f)} className="rounded-full border border-line px-3 py-1 text-xs font-semibold">Edit</button>
                    <button onClick={() => toggle(f)} className="rounded-full border border-line px-3 py-1 text-xs font-semibold">{f.active ? "Switch off" : "Switch on"}</button>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div><dt className="text-xs text-muted">{f.kind === "percent" ? "Collected" : "Target"}</dt><dd className="font-bold">{f.accrued !== null ? money(f.accrued) : f.defaultAmount ? money(f.defaultAmount) : "–"}</dd></div>
                  <div><dt className="text-xs text-muted">Deposited</dt><dd className="font-bold">{money(f.deposited)}</dd><dd className="text-[11px] text-muted">{f.deposits} deposit{f.deposits === 1 ? "" : "s"}{f.lastDeposit ? ` · last ${prettyDate(f.lastDeposit)}` : ""}</dd></div>
                  <div><dt className="text-xs text-muted">Still to set aside</dt><dd className={`font-bold ${f.toDeposit ? "text-sky-700" : ""}`}>{f.toDeposit !== null ? money(f.toDeposit) : "–"}</dd></div>
                </dl>
                <button disabled={!f.active} onClick={() => guard("servicefunds.deposit") && setDepositFor(f)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-50"><HandCoins size={16} /> Deposit Amount</button>
              </li>
            ))}
          </ul>
        </>
      )}

      <section className="space-y-3" aria-label="Deposit history">
        <h2 className="text-lg font-bold">Deposit history</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Service" value={fundId} onChange={(e) => { setFundId(e.target.value); setPageNo(1); }} className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm">
            <option value="">All services</option>
            {view?.items.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <label className="relative ml-auto block w-full sm:w-64">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Note or who recorded it" aria-label="Search deposits" className="w-full rounded-xl border border-line bg-surface py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand" />
          </label>
        </div>
        {hist && hist.items.length === 0 && <p className="rounded-2xl bg-surface py-10 text-center text-muted shadow-sm">No deposits yet for these filters.</p>}
        <ul className="space-y-2">
          {hist?.items.map((d: Deposit) => (
            <li key={d.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-3.5 shadow-sm">
              <div className="min-w-0">
                <p className="font-semibold">{d.fund}</p>
                <p className="text-xs text-muted">{prettyDate(d.date)} · recorded by {d.by} on {new Date(d.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</p>
                {d.note && <p className="mt-0.5 text-sm text-slate-600">{d.note}</p>}
              </div>
              <p className="shrink-0 text-lg font-bold">{money(d.amount)}</p>
            </li>
          ))}
        </ul>
        {hist && hist.total > 0 && (
          <div className="flex items-center justify-between pt-1 text-sm">
            <span className="font-semibold">Total shown: {money(hist.sum)}</span>
            {hist.total > PAGE_SIZE && (
              <span className="flex items-center gap-2">
                <button disabled={pageNo <= 1} onClick={() => setPageNo(pageNo - 1)} className="rounded-xl bg-surface p-2 shadow-sm disabled:opacity-40" aria-label="Previous page"><ChevronLeft size={16} /></button>
                <span className="text-muted">{pageNo} / {pages}</span>
                <button disabled={pageNo >= pages} onClick={() => setPageNo(pageNo + 1)} className="rounded-xl bg-surface p-2 shadow-sm disabled:opacity-40" aria-label="Next page"><ChevronRight size={16} /></button>
              </span>
            )}
          </div>
        )}
      </section>

      {depositFor && <DepositSheet fund={depositFor} onClose={() => setDepositFor(null)} onDone={(m) => { setDepositFor(null); setNote(m); reload(); }} />}
      {adding && <FundSheet onClose={() => setAdding(false)} onDone={(m) => { setAdding(false); setNote(m); reload(); }} />}
      {editing && <FundSheet fund={editing} onClose={() => setEditing(null)} onDone={(m) => { setEditing(null); setNote(m); reload(); }} />}
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-4 rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold">{title}</h2><button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-surface-2"><X size={22} /></button></div>
        {children}
      </div>
    </div>
  );
}

function DepositSheet({ fund, onClose, onDone }: { fund: Fund; onClose: () => void; onDone: (m: string) => void }) {
  const suggest = fund.kind === "percent" ? fund.toDeposit : fund.defaultAmount;
  const [amount, setAmount] = useState(suggest ? String(suggest) : "");
  const [date, setDate] = useState(todayKey());
  const [noteText, setNoteText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const n = Number(amount);

  async function save() {
    setBusy(true); setError("");
    try {
      const d = await depositAmount(fund.id, { amount: n, date, note: noteText.trim() || undefined });
      onDone(`${money(d.amount)} deposited to ${fund.name}.`);
    } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  }

  return (
    <Sheet title={`Deposit to ${fund.name}`} onClose={onClose}>
      {fund.kind === "percent" && <p className="rounded-xl bg-sky-500/10 p-3 text-sm text-sky-800">Still to set aside: <b>{money(fund.toDeposit ?? 0)}</b>. You can deposit any amount.</p>}
      <label className="block space-y-1 text-sm font-medium">Amount (Rs.)<input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, "").slice(0, 10))} className={input} autoFocus /></label>
      <label className="block space-y-1 text-sm font-medium">Date<input type="date" value={date} max={todayKey()} onChange={(e) => setDate(e.target.value)} className={input} /></label>
      <label className="block space-y-1 text-sm font-medium">Note <span className="font-normal text-muted">(optional)</span><input value={noteText} maxLength={300} onChange={(e) => setNoteText(e.target.value)} placeholder="e.g. Given to the school fund, paid for new balls" className={input} /></label>
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      <p className="text-xs text-muted">A deposit is saved with your name and the time. It cannot be changed afterwards.</p>
      <button onClick={save} disabled={busy || !(n > 0)} className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : `Deposit ${n > 0 ? money(n) : "Amount"}`}</button>
    </Sheet>
  );
}

function FundSheet({ fund, onClose, onDone }: { fund?: Fund; onClose: () => void; onDone: (m: string) => void }) {
  const [name, setName] = useState(fund?.name ?? "");
  const [kind, setKind] = useState<"percent" | "manual">(fund?.kind ?? "manual");
  const [rate, setRate] = useState(fund?.rate ? String(fund.rate) : "");
  const [amount, setAmount] = useState(fund?.defaultAmount ? String(fund.defaultAmount) : "");
  const [noteText, setNoteText] = useState(fund?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true); setError("");
    try {
      if (fund) {
        await editFund(fund.id, { name: name.trim(), ...(fund.kind === "percent" && rate ? { rate: Number(rate) } : {}), ...(amount ? { defaultAmount: Number(amount) } : {}), note: noteText.trim() });
        onDone(`${name.trim()} saved.`);
      } else {
        await addFund({ name: name.trim(), kind, ...(kind === "percent" ? { rate: Number(rate) } : {}), ...(amount ? { defaultAmount: Number(amount) } : {}), note: noteText.trim() || undefined });
        onDone(`${name.trim()} added.`);
      }
    } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  }

  return (
    <Sheet title={fund ? `Edit ${fund.name}` : "Add a service"} onClose={onClose}>
      <label className="block space-y-1 text-sm font-medium">Name<input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maintenance, Ball amounts" className={input} autoFocus /></label>
      {!fund && (
        <div role="radiogroup" aria-label="How it is collected" className="grid grid-cols-2 gap-2 text-sm">
          {([["manual", "Manual amount", "You record what is set aside"], ["percent", "% of the takings", "Collects automatically"]] as const).map(([id, label, sub]) => (
            <button key={id} type="button" role="radio" aria-checked={kind === id} onClick={() => setKind(id)} className={`rounded-xl border px-3 py-2.5 text-left ${kind === id ? "border-brand bg-brand/10" : "border-line"}`}>
              <span className="block font-semibold">{label}</span><span className="text-xs text-muted">{sub}</span>
            </button>
          ))}
        </div>
      )}
      {(fund ? fund.kind === "percent" : kind === "percent") && (
        <label className="block space-y-1 text-sm font-medium">Percentage of the takings (%)<input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))} placeholder="e.g. 2" className={input} /></label>
      )}
      <label className="block space-y-1 text-sm font-medium">Usual amount (Rs.) <span className="font-normal text-muted">(optional, suggested when you deposit)</span><input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 8))} className={input} /></label>
      <label className="block space-y-1 text-sm font-medium">Note <span className="font-normal text-muted">(optional)</span><input value={noteText} maxLength={200} onChange={(e) => setNoteText(e.target.value)} className={input} /></label>
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      <button onClick={save} disabled={busy || name.trim().length < 2 || ((fund ? fund.kind : kind) === "percent" && !(Number(rate) > 0))} className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : fund ? "Save" : "Add service"}</button>
    </Sheet>
  );
}
