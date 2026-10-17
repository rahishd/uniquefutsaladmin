"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, HandCoins, HeartHandshake, Plus, Search, Wallet, Wrench, X, Zap } from "lucide-react";
import { Badge } from "../bookings/Badge";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { prettyDate, rs } from "@/lib/bookings";
import { todayKey } from "@/lib/slots";
import { Collections, Entry, Fund, FundsView, Ledger, PAGE_SIZE, addFund, depositAmount, editFund, loadCollections, loadFunds, loadLedger, withdrawAmount } from "@/lib/service-funds";

const money = (n: number) => `Rs. ${n.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");
const input = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";

const shift = (key: string, days: number) => { const d = new Date(`${key}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
type Preset = { id: string; label: string; range: () => [string, string] };
const PRESETS: Preset[] = [
  { id: "today", label: "Today", range: () => [todayKey(), todayKey()] },
  { id: "yesterday", label: "Yesterday", range: () => [shift(todayKey(), -1), shift(todayKey(), -1)] },
  { id: "week", label: "Last 7 days", range: () => [shift(todayKey(), -6), todayKey()] },
  { id: "month", label: "This month", range: () => [`${todayKey().slice(0, 8)}01`, todayKey()] },
  { id: "all", label: "All time", range: () => ["", ""] },
];

// Collect Service Payment. Every paid futsal game feeds the percent services by itself (the court price only: add-ons and
// Gamezone are not included), and each day's share is deposited automatically. Here staff see what came in today and in any
// period, what is in each service now, withdraw money, deposit by hand to manual services, and read the whole history.
export default function ServiceFundsPage() {
  const [preset, setPreset] = useState("month");
  const [from, setFrom] = useState(PRESETS[3].range()[0]);
  const [to, setTo] = useState(PRESETS[3].range()[1]);
  const [view, setView] = useState<FundsView | null>(null);
  const [coll, setColl] = useState<Collections | null>(null);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [depositFor, setDepositFor] = useState<Fund | null>(null);
  const [withdrawFor, setWithdrawFor] = useState<Fund | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Fund | null>(null);

  // history
  const [fundId, setFundId] = useState("");
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [pageNo, setPageNo] = useState(1);
  const [hist, setHist] = useState<Ledger | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setQ(search); setPageNo(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let live = true;
    loadFunds(from, to).then((v) => { if (live) { setView(v); setError(""); } }).catch((e) => { if (live) setError(msg(e)); });
    loadCollections(from, to).then((c) => { if (live) setColl(c); }).catch(() => {});
    loadLedger({ fundId, type, from, to, q, page: pageNo }).then((h) => { if (live) setHist(h); }).catch(() => {});
    return () => { live = false; };
  }, [from, to, fundId, type, q, pageNo, tick]);

  const reload = () => setTick((n) => n + 1);
  const pages = hist ? Math.max(1, Math.ceil(hist.total / PAGE_SIZE)) : 1;
  const periodText = useMemo(() => {
    const p = PRESETS.find((x) => x.id === preset);
    if (p && preset !== "custom") return p.label.toLowerCase();
    return from || to ? `${from ? prettyDate(from) : "the start"} to ${to ? prettyDate(to) : "today"}` : "all time";
  }, [preset, from, to]);

  function pick(p: Preset) {
    const [a, b] = p.range();
    setPreset(p.id); setFrom(a); setTo(b); setPageNo(1);
  }
  function custom(a: string, b: string) { setPreset("custom"); setFrom(a); setTo(b); setPageNo(1); }

  async function toggle(f: Fund) {
    if (!guard("servicefunds.manage")) return;
    try { await editFund(f.id, { active: !f.active }); setNote(`${f.name} is now ${f.active ? "switched off" : "on"}.`); reload(); } catch (e) { setError(msg(e)); }
  }

  return (
    <div className="w-full space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><HandCoins size={24} className="text-brand" /> Collect Service Payment</h1>
        <p className="text-sm text-muted">Every paid futsal game feeds the services by itself. Add-ons and Gamezone are not counted, only the court price. Each day&apos;s share is deposited automatically; withdraw it when you need to use it.</p>
      </header>

      {/* date filter */}
      <section aria-label="Date filter" className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 overflow-x-auto rounded-xl bg-surface p-1 shadow-sm" role="group" aria-label="Quick dates">
            {PRESETS.map((p) => (
              <button key={p.id} aria-pressed={preset === p.id} onClick={() => pick(p)} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold ${preset === p.id ? "bg-brand text-white" : "text-muted"}`}>{p.label}</button>
            ))}
          </div>
          <button onClick={() => guard("servicefunds.manage") && setAdding(true)} className="ml-auto flex items-center gap-1.5 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16} /> Add service</button>
        </div>
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <label className="space-y-1"><span className="flex items-center gap-1 text-xs text-muted"><CalendarDays size={12} /> From</span><input type="date" value={from} max={to || todayKey()} onChange={(e) => custom(e.target.value, to)} className="rounded-xl border border-line bg-surface px-3 py-2 text-sm" /></label>
          <label className="space-y-1"><span className="block text-xs text-muted">To</span><input type="date" value={to} min={from || undefined} max={todayKey()} onChange={(e) => custom(from, e.target.value)} className="rounded-xl border border-line bg-surface px-3 py-2 text-sm" /></label>
        </div>
      </section>

      {note && <p className="rounded-xl bg-brand/10 p-3 text-sm text-brand" role="status">{note}</p>}
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!view && !error && <p className="py-10 text-center text-sm text-muted">Loading services…</p>}

      {view && (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Summary">
            <div className="col-span-2 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 p-4 text-white shadow-sm lg:col-span-1">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/85"><Zap size={13} /> Received today</p>
              <p className="mt-1 text-3xl font-extrabold">{money(view.totals.receivedToday)}</p>
              <p className="mt-0.5 text-xs text-white/80">Deposited automatically from today&apos;s games</p>
            </div>
            <div className="rounded-2xl bg-surface p-4 shadow-sm"><p className="text-xs text-muted">Received ({periodText})</p><p className="text-xl font-bold">{money(view.totals.received)}</p></div>
            <div className="rounded-2xl bg-surface p-4 shadow-sm"><p className="text-xs text-muted">Withdrawn ({periodText})</p><p className="text-xl font-bold text-rose-600">{money(view.totals.withdrawn)}</p></div>
            <div className="rounded-2xl bg-sky-500/10 p-4 shadow-sm"><p className="flex items-center gap-1.5 text-xs text-muted"><Wallet size={13} /> In the services now</p><p className="text-xl font-bold text-sky-700">{money(view.totals.balance)}</p></div>
          </section>
          <p className="px-1 text-xs text-muted">
            Futsal games paid {periodText}: <b>{view.base.gamesCount}</b> worth <b>{rs(view.base.games)}</b> (court price). Not counted: add-ons, Gamezone {rs(view.base.gamezone)}, memberships {rs(view.base.memberships)}, club {rs(view.base.club)}, tournaments {rs(view.base.tournaments)}, Gift Card points {rs(view.base.giftCards)}.
          </p>

          <ul className="grid gap-3 xl:grid-cols-2">
            {view.items.map((f) => (
              <li key={f.id} className={`rounded-2xl bg-surface p-4 shadow-sm ${f.active ? "" : "opacity-60"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-bold">{f.kind === "percent" ? <HeartHandshake size={18} className="text-sky-600" /> : <Wrench size={18} className="text-muted" />}{f.name}</p>
                    <p className="text-xs text-muted">{f.kind === "percent" ? `${f.rate}% of every futsal game, collected automatically` : "Manual: you record what is set aside"}{f.note ? ` · ${f.note}` : ""}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {!f.active && <Badge tone="bg-surface-2 text-muted">Off</Badge>}
                    <button onClick={() => guard("servicefunds.manage") && setEditing(f)} className="rounded-full border border-line px-3 py-1 text-xs font-semibold">Edit</button>
                    <button onClick={() => toggle(f)} className="rounded-full border border-line px-3 py-1 text-xs font-semibold">{f.active ? "Switch off" : "Switch on"}</button>
                  </div>
                </div>

                <div className="mt-3 rounded-2xl bg-surface-2 px-4 py-3">
                  <p className="text-xs text-muted">In the fund now</p>
                  <p className="text-2xl font-extrabold">{money(f.balance)}</p>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div><dt className="text-xs text-muted">Received today</dt><dd className="font-bold text-emerald-700">{money(f.receivedToday)}</dd></div>
                  <div><dt className="text-xs text-muted">Received ({periodText})</dt><dd className="font-bold">{money(f.received)}</dd></div>
                  <div><dt className="text-xs text-muted">Withdrawn ({periodText})</dt><dd className="font-bold text-rose-600">{money(f.withdrawn)}</dd></div>
                </dl>

                {f.toDeposit ? <p className="mt-3 rounded-xl bg-sky-500/10 p-3 text-xs text-sky-800">Earlier games (before automatic collection began) still owe <b>{money(f.toDeposit)}</b>. Deposit it by hand when you set it aside.</p> : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button disabled={f.balance <= 0} onClick={() => guard("servicefunds.withdraw") && setWithdrawFor(f)} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-40"><ArrowUpRight size={16} /> Withdraw</button>
                  {(f.kind === "manual" || f.toDeposit) ? (
                    <button disabled={!f.active} onClick={() => guard("servicefunds.deposit") && setDepositFor(f)} className="flex flex-1 items-center justify-center gap-2 rounded-full border border-line py-2.5 text-sm font-semibold disabled:opacity-40"><ArrowDownLeft size={16} /> Deposit Amount</button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* daily collection */}
      {coll && (
        <section className="space-y-2" aria-label="Daily collection">
          <h2 className="text-lg font-bold">Daily collection <span className="text-sm font-normal text-muted">· {prettyDate(coll.from)} to {prettyDate(coll.to)}</span></h2>
          {coll.days.length === 0 ? (
            <p className="rounded-2xl bg-surface py-8 text-center text-sm text-muted shadow-sm">No futsal games were paid in these dates.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl bg-surface shadow-sm">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-2 py-3 text-right font-semibold">Games</th>
                    <th className="px-2 py-3 text-right font-semibold">Game amount</th>
                    {coll.funds.map((fd) => <th key={fd.id} className="px-3 py-3 text-right font-semibold">{fd.name}{fd.rate ? ` ${fd.rate}%` : ""}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {coll.days.map((d) => (
                    <tr key={d.date} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5 font-medium">{prettyDate(d.date)}{d.date === view?.today ? <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Today</span> : null}</td>
                      <td className="px-2 py-2.5 text-right">{d.games}</td>
                      <td className="px-2 py-2.5 text-right">{rs(d.base)}</td>
                      {d.funds.map((x) => <td key={x.fundId} className="px-3 py-2.5 text-right font-semibold">{money(x.amount)}</td>)}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-surface-2 font-bold">
                    <td className="px-4 py-3">Total</td>
                    <td className="px-2 py-3 text-right">{coll.totals.games}</td>
                    <td className="px-2 py-3 text-right">{rs(coll.totals.base)}</td>
                    {coll.totals.funds.map((x) => <td key={x.fundId} className="px-3 py-3 text-right">{money(x.amount)}</td>)}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="space-y-3" aria-label="History">
        <h2 className="text-lg font-bold">History <span className="text-sm font-normal text-muted">· {periodText}</span></h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-xl bg-surface p-1 shadow-sm" role="group" aria-label="Kind">
            {([["", "All"], ["deposit", "Received"], ["withdrawal", "Withdrawn"]] as const).map(([id, label]) => (
              <button key={id} aria-pressed={type === id} onClick={() => { setType(id); setPageNo(1); }} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${type === id ? "bg-brand text-white" : "text-muted"}`}>{label}</button>
            ))}
          </div>
          <select aria-label="Service" value={fundId} onChange={(e) => { setFundId(e.target.value); setPageNo(1); }} className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm">
            <option value="">All services</option>
            {view?.items.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <label className="relative ml-auto block w-full sm:w-64">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Note or who recorded it" aria-label="Search history" className="w-full rounded-xl border border-line bg-surface py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand" />
          </label>
        </div>
        {hist && hist.items.length === 0 && <p className="rounded-2xl bg-surface py-10 text-center text-muted shadow-sm">Nothing here for these filters.</p>}
        <ul className="space-y-2">
          {hist?.items.map((d: Entry) => {
            const out = d.type === "withdrawal";
            return (
              <li key={`${d.type}-${d.id}`} className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-3.5 shadow-sm">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${out ? "bg-rose-500/10 text-rose-600" : "bg-emerald-500/10 text-emerald-600"}`}>{out ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}</span>
                  <div className="min-w-0">
                    <p className="font-semibold">{d.fund} <span className="text-xs font-normal text-muted">· {out ? "Withdrawn" : d.auto ? "Received automatically" : "Deposited by hand"}</span></p>
                    <p className="text-xs text-muted">{prettyDate(d.date)} · {d.auto ? "Automatic" : `by ${d.by}`} · {new Date(d.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</p>
                    {d.note && <p className="mt-0.5 text-sm text-slate-600">{d.note}</p>}
                  </div>
                </div>
                <p className={`shrink-0 text-lg font-bold ${out ? "text-rose-600" : "text-emerald-700"}`}>{out ? "−" : "+"} {money(d.amount)}</p>
              </li>
            );
          })}
        </ul>
        {hist && hist.total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-sm">
            <span className="font-semibold">Shown: received {money(hist.received)} · withdrawn {money(hist.withdrawn)}</span>
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
      {withdrawFor && <WithdrawSheet fund={withdrawFor} onClose={() => setWithdrawFor(null)} onDone={(m) => { setWithdrawFor(null); setNote(m); reload(); }} />}
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

function WithdrawSheet({ fund, onClose, onDone }: { fund: Fund; onClose: () => void; onDone: (m: string) => void }) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayKey());
  const [noteText, setNoteText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const n = Number(amount);
  const over = n > fund.balance;

  async function save() {
    setBusy(true); setError("");
    try {
      const d = await withdrawAmount(fund.id, { amount: n, date, note: noteText.trim() });
      onDone(`${money(d.amount)} withdrawn from ${fund.name}.`);
    } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  }

  return (
    <Sheet title={`Withdraw from ${fund.name}`} onClose={onClose}>
      <p className="rounded-xl bg-sky-500/10 p-3 text-sm text-sky-800">In the fund now: <b>{money(fund.balance)}</b>. You cannot take out more than that.</p>
      <label className="block space-y-1 text-sm font-medium">
        <span className="flex items-center justify-between">Amount (Rs.)<button type="button" onClick={() => setAmount(String(fund.balance))} className="text-xs font-semibold text-brand">Withdraw all</button></span>
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, "").slice(0, 10))} className={input} autoFocus />
      </label>
      {over && <p className="-mt-2 text-xs font-medium text-red-600">That is more than is in the fund.</p>}
      <label className="block space-y-1 text-sm font-medium">What is it for?<input value={noteText} maxLength={300} onChange={(e) => setNoteText(e.target.value)} placeholder="e.g. Donated to the school, new turf layer" className={input} /></label>
      <label className="block space-y-1 text-sm font-medium">Date<input type="date" value={date} max={todayKey()} onChange={(e) => setDate(e.target.value)} className={input} /></label>
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      <p className="text-xs text-muted">A withdrawal is saved with your name and the time. It cannot be changed afterwards.</p>
      <button onClick={save} disabled={busy || !(n > 0) || over || noteText.trim().length < 3} className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : `Withdraw ${n > 0 ? money(n) : "amount"}`}</button>
    </Sheet>
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
      {fund.kind === "percent" && <p className="rounded-xl bg-sky-500/10 p-3 text-sm text-sky-800">Still owed from before automatic collection: <b>{money(fund.toDeposit ?? 0)}</b>. You can deposit any amount.</p>}
      <label className="block space-y-1 text-sm font-medium">Amount (Rs.)<input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, "").slice(0, 10))} className={input} autoFocus /></label>
      <label className="block space-y-1 text-sm font-medium">Date<input type="date" value={date} max={todayKey()} onChange={(e) => setDate(e.target.value)} className={input} /></label>
      <label className="block space-y-1 text-sm font-medium">Note <span className="font-normal text-muted">(optional)</span><input value={noteText} maxLength={300} onChange={(e) => setNoteText(e.target.value)} placeholder="e.g. Given to the owner" className={input} /></label>
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
      <label className="block space-y-1 text-sm font-medium">Name<input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="e.g. Futsal Turf, Maintenance" className={input} autoFocus /></label>
      {!fund && (
        <div role="radiogroup" aria-label="How it is collected" className="grid grid-cols-2 gap-2 text-sm">
          {([["manual", "Manual amount", "You record what is set aside"], ["percent", "% of every game", "Collects automatically every day"]] as const).map(([id, label, sub]) => (
            <button key={id} type="button" role="radio" aria-checked={kind === id} onClick={() => setKind(id)} className={`rounded-xl border px-3 py-2.5 text-left ${kind === id ? "border-brand bg-brand/10" : "border-line"}`}>
              <span className="block font-semibold">{label}</span><span className="text-xs text-muted">{sub}</span>
            </button>
          ))}
        </div>
      )}
      {(fund ? fund.kind === "percent" : kind === "percent") && (
        <label className="block space-y-1 text-sm font-medium">Percentage of every futsal game (%)<input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))} placeholder="e.g. 5" className={input} />
          <span className="block text-xs font-normal text-muted">Worked out from the court price of each paid game. Add-ons and Gamezone are not counted. A new rate applies from today; earlier days keep their amounts.</span>
        </label>
      )}
      <label className="block space-y-1 text-sm font-medium">Usual amount (Rs.) <span className="font-normal text-muted">(optional, suggested when you deposit by hand)</span><input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 8))} className={input} /></label>
      <label className="block space-y-1 text-sm font-medium">Note <span className="font-normal text-muted">(optional)</span><input value={noteText} maxLength={200} onChange={(e) => setNoteText(e.target.value)} className={input} /></label>
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      <button onClick={save} disabled={busy || name.trim().length < 2 || ((fund ? fund.kind : kind) === "percent" && !(Number(rate) > 0))} className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : fund ? "Save" : "Add service"}</button>
    </Sheet>
  );
}
