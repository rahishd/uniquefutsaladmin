"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Circle, RotateCcw } from "lucide-react";
import { ApiError } from "@/lib/api";
import { askConfirm } from "@/lib/confirm";
import { prettyDate, rs } from "@/lib/bookings";
import { DayCheckView, getDayCheck, markDayChecked, reopenDay } from "@/lib/dayCheck";

const field = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const SOURCES: [keyof DayCheckView["figures"]["bySource"], string][] = [["games", "Games"], ["goods", "Goods"], ["gamezone", "Gamezone"], ["tournaments", "Tournaments"]];

const diffTone = (d: number) => (d === 0 ? "text-emerald-600" : "text-red-600");
const diffText = (d: number) => (d === 0 ? "Matches" : d > 0 ? `${rs(d)} more than counted` : `${rs(-d)} short`);

// The owner's daily check: look at the day's dashboard, enter what was really received, and mark the day as checked.
export default function DayCheckPage() {
  const [date, setDate] = useState("");
  const [data, setData] = useState<DayCheckView | null>(null);
  const [error, setError] = useState("");
  const [cash, setCash] = useState("");
  const [fonepay, setFonepay] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback((d?: string) => {
    getDayCheck(d)
      .then((v) => {
        setError("");
        setData(v);
        setDate(v.date);
        // start from what the portal counted; the owner changes it to what was really received
        setCash(String(Math.round(v.figures.cash)));
        setFonepay(String(Math.round(v.figures.fonepay)));
        setNote("");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the day"));
  }, []);

  useEffect(() => { load(); }, [load]);

  const f = data?.figures;
  const recCash = Number(cash);
  const recFonepay = Number(fonepay);
  const valid = cash.trim() !== "" && fonepay.trim() !== "" && Number.isFinite(recCash) && Number.isFinite(recFonepay) && recCash >= 0 && recFonepay >= 0;
  const diff = f && valid ? recCash + recFonepay - f.total : 0;

  async function check() {
    if (!data || !valid) return;
    setSaving(true);
    setError("");
    try {
      await markDayChecked({ date: data.date, receivedCash: recCash, receivedFonepay: recFonepay, note: note.trim() || undefined });
      load(data.date);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function reopen() {
    if (!data?.check) return;
    if (!(await askConfirm(`Reopen ${prettyDate(data.date)}? The check is removed so you can enter it again. This is recorded in the audit log.`, { confirmLabel: "Reopen" }))) return;
    try {
      await reopenDay(data.date);
      load(data.date);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not reopen");
    }
  }

  const c = data?.check;
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 p-4 lg:p-8">
      <div>
        <h1 className="text-2xl font-semibold">Day Check</h1>
        <p className="mt-1 text-sm text-muted">Owner only. Look at the day, enter what you really received, and mark it checked.</p>
      </div>

      <div className="flex items-center gap-2">
        <input type="date" value={date} max={data?.history[0]?.day} onChange={(e) => { setDate(e.target.value); if (e.target.value) load(e.target.value); }} className={`${field} max-w-[11rem]`} aria-label="Day" />
        {data && date !== data.history[0]?.day && <button type="button" onClick={() => load()} className="rounded-full border border-line px-3 py-2 text-xs font-semibold text-muted">Today</button>}
        {data && <span className="text-sm text-muted">{prettyDate(data.date)}</span>}
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
      {!data && !error && <p className="py-10 text-center text-sm text-muted">Loading…</p>}

      {data && f && (
        <>
          <section aria-label="The day" className="rounded-2xl border border-line bg-surface p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">What the portal counted</h2>
            <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-surface-2 p-3"><dt className="text-xs text-muted">Cash</dt><dd className="mt-1 text-lg font-semibold">{rs(f.cash)}</dd></div>
              <div className="rounded-xl bg-surface-2 p-3"><dt className="text-xs text-muted">Fonepay</dt><dd className="mt-1 text-lg font-semibold">{rs(f.fonepay)}</dd></div>
              <div className="rounded-xl bg-brand/10 p-3"><dt className="text-xs text-muted">Total</dt><dd className="mt-1 text-lg font-bold text-brand">{rs(f.total)}</dd></div>
            </dl>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
              {SOURCES.map(([k, label]) => (
                <li key={k} className="flex justify-between gap-2 text-muted"><span>{label}</span><span className="font-medium text-foreground">{rs(f.bySource[k].cash + f.bySource[k].fonepay)}</span></li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted">
              {f.gamesPaid} of {f.games} games paid · {f.gamezone} Gamezone sessions · {f.itemsSold} items sold
              {f.dueCount > 0 && <> · <span className="font-medium text-amber-700">{rs(f.dueAmount)} still to collect ({f.dueCount})</span></>}
            </p>
          </section>

          {c ? (
            <section aria-label="Checked" className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 dark:bg-emerald-950/20">
              <p className="flex items-center gap-2 font-semibold text-emerald-700"><CheckCircle2 size={20} /> Checked by {c.checkedByName}</p>
              <p className="mt-0.5 text-xs text-muted">{new Date(c.checkedAt).toLocaleString("en-GB", { timeZone: "Asia/Kathmandu", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-muted">Cash received</dt><dd className="font-semibold">{rs(c.receivedCash)} <span className={`text-xs ${diffTone(c.differenceCash)}`}>({diffText(c.differenceCash)})</span></dd></div>
                <div><dt className="text-muted">Fonepay received</dt><dd className="font-semibold">{rs(c.receivedFonepay)} <span className={`text-xs ${diffTone(c.differenceFonepay)}`}>({diffText(c.differenceFonepay)})</span></dd></div>
              </dl>
              <p className={`mt-3 text-sm font-semibold ${diffTone(c.difference)}`}>Overall: {diffText(c.difference)}</p>
              {c.note && <p className="mt-2 rounded-xl bg-white/60 p-3 text-sm dark:bg-white/5">{c.note}</p>}
              {data.changedSinceCheck && (
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-100 p-3 text-sm text-amber-800"><AlertTriangle size={18} className="mt-0.5 shrink-0" /> The day&apos;s takings changed after you checked it (it was {rs(c.expectedCash + c.expectedFonepay)}, now {rs(f.total)}). Reopen it to check again.</p>
              )}
              <button type="button" onClick={reopen} className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-4 py-2 text-xs font-semibold text-muted"><RotateCcw size={14} /> Reopen this day</button>
            </section>
          ) : (
            <section aria-label="Received" className="space-y-3 rounded-2xl border border-line bg-surface p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">What you received</h2>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-medium text-muted">Cash (Rs.)
                  <input inputMode="numeric" value={cash} onChange={(e) => setCash(e.target.value.replace(/[^\d.]/g, ""))} className={`${field} mt-1`} />
                </label>
                <label className="block text-xs font-medium text-muted">Fonepay (Rs.)
                  <input inputMode="numeric" value={fonepay} onChange={(e) => setFonepay(e.target.value.replace(/[^\d.]/g, ""))} className={`${field} mt-1`} />
                </label>
              </div>
              {valid && <p className={`text-sm font-semibold ${diffTone(diff)}`}>{diffText(diff)}</p>}
              <label className="block text-xs font-medium text-muted">Note (optional)
                <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} placeholder="e.g. Rs. 100 given for water" className={`${field} mt-1`} />
              </label>
              <button type="button" onClick={check} disabled={!valid || saving} className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Mark day as checked"}</button>
            </section>
          )}

          <section aria-label="Last two weeks">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Last 14 days</h2>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {data.history.map((h) => (
                <li key={h.day}>
                  <button type="button" onClick={() => load(h.day)} className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm ${h.day === data.date ? "bg-brand/5" : ""}`}>
                    {h.checked ? <CheckCircle2 size={18} className="shrink-0 text-emerald-600" /> : <Circle size={18} className="shrink-0 text-muted" />}
                    <span className="flex-1">{prettyDate(h.day)}</span>
                    {h.checked
                      ? <span className={`text-xs font-medium ${diffTone(h.difference ?? 0)}`}>{diffText(h.difference ?? 0)}</span>
                      : <span className="text-xs text-muted">Not checked</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
