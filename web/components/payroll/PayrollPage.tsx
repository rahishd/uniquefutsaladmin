"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Trash2, X } from "lucide-react";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { askConfirm } from "@/lib/confirm";
import { when } from "@/lib/marketplace";
import {
  PayrollHistory, PayrollPage as PayrollData, PayrollRow, getPayroll, getPayrollHistory, monthLabel, npr, payStaff, removePayment, roleLabel, setSalary, shiftMonth,
} from "@/lib/payroll";

// Payroll (Admin): a month at a time. Set each person's monthly salary, pay any amount any time, and see what is still owed:
// whatever is left unpaid carries over to the next month. Click a row to change a salary or see the month-by-month history.
const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");
const field = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const COLS = "md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1.1fr)_minmax(0,1.6fr)_auto]";

function Sheet({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><h2 className="truncate text-lg font-bold">{title}</h2>{sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}</div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-surface-2"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const amountOnly = (v: string) => v.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1").replace(/^(\d*\.\d{0,2}).*$/, "$1");

function SalarySheet({ row, month, onClose, onDone }: { row: PayrollRow; month: string; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(row.salary !== null ? String(row.salary) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const n = Number(amount);
  async function save() {
    if (!guard("payroll.manage")) return;
    setBusy(true); setErr("");
    try { await setSalary(row.staffId, month, n); onDone(); } catch (e) { setErr(msg(e)); setBusy(false); }
  }
  return (
    <Sheet title={`Salary of ${row.name}`} sub={`The monthly salary from ${monthLabel(month)} on. Earlier months keep the salary they had.`} onClose={onClose}>
      <label className="block text-xs text-muted">Monthly salary (NPR)
        <input inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(amountOnly(e.target.value))} placeholder="9000" className={`${field} mt-1`} />
      </label>
      {err && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{err}</p>}
      <button type="button" disabled={busy || !(n >= 0) || amount === ""} onClick={save} className="flex w-full items-center justify-center gap-2 rounded-full bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50">{busy && <Loader2 size={15} className="animate-spin" />} Save salary</button>
    </Sheet>
  );
}

function PaySheet({ row, month, onClose, onDone }: { row: PayrollRow; month: string; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(row.remaining > 0 ? String(row.remaining) : "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const n = Number(amount);
  async function save() {
    if (!guard("payroll.manage")) return;
    setBusy(true); setErr("");
    try { await payStaff(row.staffId, month, n, note.trim()); onDone(); } catch (e) { setErr(msg(e)); setBusy(false); }
  }
  return (
    <Sheet title={`Pay ${row.name}`} sub={`Counts toward ${monthLabel(month)}. Any amount, any time.`} onClose={onClose}>
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-xl bg-surface-2 p-2"><p className="text-muted">Salary</p><p className="font-bold">{row.salary !== null ? npr(row.salary) : "–"}</p></div>
        <div className="rounded-xl bg-surface-2 p-2"><p className="text-muted">Paid</p><p className="font-bold">{npr(row.paid)}</p></div>
        <div className="rounded-xl bg-surface-2 p-2"><p className="text-muted">Remaining</p><p className={`font-bold ${row.remaining > 0 ? "text-red-600" : "text-emerald-600"}`}>{npr(Math.max(0, row.remaining))}</p></div>
      </div>
      <label className="block text-xs text-muted">Amount to pay now (NPR)
        <input inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(amountOnly(e.target.value))} placeholder="0.00" className={`${field} mt-1`} />
      </label>
      {row.remaining > 0 && <button type="button" onClick={() => setAmount(String(row.remaining))} className="text-xs font-semibold text-brand">Pay everything that is left ({npr(row.remaining)})</button>}
      <label className="block text-xs text-muted">Note (optional)
        <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. advance, cash" className={`${field} mt-1`} />
      </label>
      {err && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{err}</p>}
      <button type="button" disabled={busy || !(n > 0)} onClick={save} className="flex w-full items-center justify-center gap-2 rounded-full bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50">{busy && <Loader2 size={15} className="animate-spin" />} Pay {n > 0 ? npr(n) : ""}</button>
    </Sheet>
  );
}

function HistorySheet({ row, canManage, month, onClose, onChanged, onSalary }: { row: PayrollRow; canManage: boolean; month: string; onClose: () => void; onChanged: () => void; onSalary: () => void }) {
  const [h, setH] = useState<PayrollHistory | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => { getPayrollHistory(row.staffId).then(setH).catch((e) => setErr(msg(e))); }, [row.staffId]);
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);
  async function undo(id: string, amount: number) {
    if (!guard("payroll.manage") || !(await askConfirm(`Remove this payment of ${npr(amount)}? Use it only for a payment entered by mistake.`))) return;
    try { await removePayment(id); load(); onChanged(); } catch (e) { setErr(msg(e)); }
  }
  return (
    <Sheet title={row.name} sub={`${row.email} · ${roleLabel(row.role)}`} onClose={onClose}>
      {canManage && <button type="button" onClick={onSalary} className="rounded-full border border-line px-4 py-2 text-sm font-semibold">Change salary from {monthLabel(month)}</button>}
      {err && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{err}</p>}
      {!h && !err && <p className="py-6 text-center text-sm text-muted">Loading…</p>}
      {h && (
        <>
          <section>
            <h3 className="mb-1.5 text-sm font-bold">Month by month</h3>
            <div className="overflow-hidden rounded-xl border border-line text-sm">
              <div className="grid grid-cols-[1.3fr_1fr_1fr_1fr] gap-2 bg-surface-2 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-muted"><span>Month</span><span className="text-right">Salary</span><span className="text-right">Paid</span><span className="text-right">Left</span></div>
              {h.months.length === 0 && <p className="p-4 text-center text-muted">No salary set yet.</p>}
              {h.months.map((m) => (
                <div key={m.month} className="grid grid-cols-[1.3fr_1fr_1fr_1fr] gap-2 border-t border-line px-3 py-2 tabular-nums">
                  <span className="font-medium">{monthLabel(m.month)}</span>
                  <span className="text-right">{m.salary !== null ? npr(m.salary) : "–"}</span>
                  <span className="text-right">{npr(m.paid)}</span>
                  <span className={`text-right font-semibold ${m.remaining > 0 ? "text-red-600" : "text-emerald-600"}`}>{npr(Math.max(0, m.remaining))}</span>
                </div>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted">&ldquo;Left&rdquo; includes what was carried over from earlier months.</p>
          </section>
          <section>
            <h3 className="mb-1.5 text-sm font-bold">Payments</h3>
            {h.payments.length === 0 ? <p className="rounded-xl bg-surface-2 p-3 text-center text-sm text-muted">Nothing paid yet.</p> : (
              <ul className="divide-y divide-line rounded-xl border border-line text-sm">
                {h.payments.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1"><span className="block font-semibold tabular-nums">{npr(p.amount)} <span className="font-normal text-muted">for {monthLabel(p.month)}</span></span><span className="block truncate text-xs text-muted">{when(p.createdAt)} · by {p.paidByName}{p.note ? ` · ${p.note}` : ""}</span></span>
                    {canManage && <button type="button" onClick={() => void undo(p.id, p.amount)} aria-label="Remove this payment" className="rounded-full p-1.5 text-red-600 hover:bg-red-500/10"><Trash2 size={15} /></button>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </Sheet>
  );
}

export default function PayrollPage() {
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [data, setData] = useState<PayrollData | null>(null);
  const [error, setError] = useState("");
  const [owedOnly, setOwedOnly] = useState(false);
  const [sheet, setSheet] = useState<{ kind: "salary" | "pay" | "history"; staffId: string } | null>(null);

  const load = useCallback(() => { getPayroll(month).then((d) => { setData(d); setError(""); }).catch((e) => setError(msg(e))); }, [month]);
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);

  const shown = data?.month ?? month ?? "";
  const row = data?.rows.find((r) => r.staffId === sheet?.staffId) ?? null;
  const rows = (data?.rows ?? []).filter((r) => !owedOnly || r.remaining > 0);
  const close = () => setSheet(null);
  const done = () => { close(); load(); };

  const remainingCell = (r: PayrollRow) => {
    if (r.salary === null && r.previousDues === 0 && r.paid === 0) return <span className="text-muted">Salary not set yet</span>;
    if (r.remaining > 0) return <span className="font-semibold text-red-600">{npr(r.remaining)} due</span>;
    if (r.remaining < 0) return <span className="font-semibold text-emerald-600">{npr(-r.remaining)} paid ahead</span>;
    return <span className="font-semibold text-emerald-600">Paid up</span>;
  };

  return (
    <div className="w-full space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Payroll</h1>
        <p className="text-sm text-muted">Set each person&apos;s monthly salary and see what has been paid. Pay any amount, any time. Whatever is left unpaid carries over to next month.</p>
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-2">
        <button type="button" onClick={() => shown && setMonth(shiftMonth(shown, -1))} aria-label="Previous month" className="grid h-12 w-12 place-items-center rounded-2xl border border-line bg-surface hover:bg-surface-2"><ChevronLeft size={18} /></button>
        <div className="grid h-12 min-w-44 place-items-center rounded-2xl border border-line bg-surface px-5 text-base font-bold sm:min-w-56">{shown ? monthLabel(shown) : "…"}</div>
        <button type="button" onClick={() => shown && setMonth(shiftMonth(shown, 1))} disabled={!data || shown >= data.currentMonth} aria-label="Next month" className="grid h-12 w-12 place-items-center rounded-2xl border border-line bg-surface hover:bg-surface-2 disabled:opacity-40"><ChevronRight size={18} /></button>
      </div>

      {!data && !error && <p className="py-10 text-center text-sm text-muted">Loading…</p>}

      {data && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-line bg-surface p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Salaries this month</p><p className="mt-2 text-2xl font-bold tabular-nums">{npr(data.totals.salaries)}</p><p className="mt-1 text-sm text-muted">Total monthly salary of everyone</p></div>
            <div className="rounded-2xl border border-line bg-surface p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Paid this month</p><p className="mt-2 text-2xl font-bold tabular-nums text-emerald-600">{npr(data.totals.paid)}</p><p className="mt-1 text-sm text-muted">Given to staff in this month</p></div>
            <div className="rounded-2xl border border-line bg-surface p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Still to pay</p><p className="mt-2 text-2xl font-bold tabular-nums text-red-600">{npr(data.totals.stillToPay)}</p><p className="mt-1 text-sm text-muted">Includes dues from earlier months</p>
              {data.totals.owed > 0 && <button type="button" onClick={() => setOwedOnly((v) => !v)} className="mt-1 text-sm font-semibold text-brand">{owedOnly ? "Show everyone ›" : "See who is owed ›"}</button>}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            <div className={`hidden gap-3 border-b border-line bg-surface-2 px-5 py-3.5 text-xs font-bold uppercase tracking-wide text-muted md:grid ${COLS}`}>
              <span>Staff</span><span>Monthly salary</span><span>Previous dues</span><span>Paid</span><span>Remaining</span><span className="w-20" />
            </div>
            {rows.length === 0 && <p className="p-8 text-center text-sm text-muted">{owedOnly ? "Nobody is owed anything." : "No staff yet."}</p>}
            {rows.map((r) => (
              <div key={r.staffId} role="button" tabIndex={0} onClick={() => setSheet({ kind: "history", staffId: r.staffId })} onKeyDown={(e) => { if (e.key === "Enter") setSheet({ kind: "history", staffId: r.staffId }); }}
                className={`grid cursor-pointer items-center gap-x-3 gap-y-1 border-b border-line px-5 py-4 last:border-b-0 hover:bg-surface-2/60 ${COLS}`}>
                <div className="min-w-0"><p className="truncate font-bold">{r.name}</p><p className="truncate text-sm text-muted">{r.email} · {roleLabel(r.role)}{r.isActive ? "" : " · disabled"}</p></div>
                <p className="text-sm tabular-nums"><span className="mr-2 text-xs text-muted md:hidden">Salary</span>{r.salary !== null ? npr(r.salary) : ""}</p>
                <p className="text-sm tabular-nums text-muted"><span className="mr-2 text-xs md:hidden">Previous dues</span>{r.previousDues > 0 ? npr(r.previousDues) : r.salary !== null || r.previousDues !== 0 ? "—" : ""}</p>
                <p className="text-sm tabular-nums"><span className="mr-2 text-xs text-muted md:hidden">Paid</span>{r.salary !== null || r.paid > 0 ? npr(r.paid) : ""}</p>
                <p className="text-sm tabular-nums">{remainingCell(r)}</p>
                {data.canManage ? (
                  <div className="flex md:w-20 md:justify-end" onClick={(e) => e.stopPropagation()}>
                    {r.salary === null
                      ? <button type="button" onClick={() => setSheet({ kind: "salary", staffId: r.staffId })} className="rounded-xl border border-line bg-surface-2 px-4 py-2 text-sm font-semibold">Set salary</button>
                      : <button type="button" onClick={() => setSheet({ kind: "pay", staffId: r.staffId })} className="rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white">Pay</button>}
                  </div>
                ) : <span className="md:w-20" />}
              </div>
            ))}
          </div>

          <p className="text-sm text-muted">Pay any amount, any time: what is left carries over to next month. Click a row to change a salary or see the month-by-month history.</p>
        </>
      )}

      {data && row && sheet?.kind === "salary" && <SalarySheet row={row} month={data.month} onClose={close} onDone={done} />}
      {data && row && sheet?.kind === "pay" && <PaySheet row={row} month={data.month} onClose={close} onDone={done} />}
      {data && row && sheet?.kind === "history" && <HistorySheet row={row} canManage={data.canManage} month={data.month} onClose={close} onChanged={load} onSalary={() => setSheet({ kind: "salary", staffId: row.staffId })} />}
    </div>
  );
}
