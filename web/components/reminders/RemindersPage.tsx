"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, Check, Clock, Pencil, Plus, Repeat, Trash2, Users, X } from "lucide-react";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { askConfirm } from "@/lib/confirm";
import {
  RemindersList, Reminder, ReminderInput, addReminder, deleteReminder, editReminder, listReminders, markReminderDone, nepalClock, nepalDate, nowParts, reminderStaff, snoozeReminder, when,
} from "@/lib/reminders";

const field = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";

export default function RemindersPage() {
  const [data, setData] = useState<RemindersList | null>(null);
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState<"new" | Reminder | null>(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    listReminders().then((d) => { setData(d); setError(""); }).catch((e) => setError(e instanceof Error ? e.message : "Could not load reminders"));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 20_000);
    return () => clearInterval(t);
  }, [load]);

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    setError("");
    try {
      await fn();
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setBusy("");
    }
  }

  async function remove(r: Reminder) {
    if (!guard("reminders.manage")) return;
    if (!(await askConfirm(`Delete the reminder "${r.title}"?`, { confirmLabel: "Delete", danger: true }))) return;
    void run(r.id, () => deleteReminder(r.id));
  }

  const row = (r: Reminder, done = false) => (
    <li key={r.id} className={`rounded-2xl border bg-surface p-4 ${r.overdue ? "border-red-300" : "border-line"}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${done ? "bg-emerald-100 text-emerald-700" : r.overdue ? "bg-red-100 text-red-600" : "bg-brand/10 text-brand"}`}>
          {done ? <Check size={18} /> : <BellRing size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`font-semibold ${done ? "text-muted line-through" : ""}`}>{r.title}</p>
          {r.note && <p className="mt-0.5 text-sm text-muted">{r.note}</p>}
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className={`inline-flex items-center gap-1 ${r.overdue ? "font-semibold text-red-600" : ""}`}><Clock size={13} /> {done && r.doneAt ? `Done ${when(r.doneAt)} by ${r.doneByName ?? "someone"}` : `${when(r.dueAt)}${r.overdue ? " (due now)" : ""}`}</span>
            <span className="inline-flex items-center gap-1"><Users size={13} /> {r.forName}</span>
            {r.repeat === "daily" && <span className="inline-flex items-center gap-1"><Repeat size={13} /> Every day</span>}
            {r.snoozedUntil && !done && new Date(r.snoozedUntil) > new Date() && <span>Snoozed until {nepalClock(r.snoozedUntil)}</span>}
          </p>
        </div>
      </div>
      {!done && (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          {r.overdue && (
            <button type="button" disabled={busy === r.id} onClick={() => void run(r.id, () => snoozeReminder(r.id, 10))} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted disabled:opacity-50">Snooze 10 min</button>
          )}
          {data?.canManage && (
            <>
              <button type="button" onClick={() => { if (guard("reminders.manage")) setSheet(r); }} aria-label="Edit" className="grid h-8 w-8 place-items-center rounded-full border border-line text-muted"><Pencil size={14} /></button>
              <button type="button" onClick={() => void remove(r)} aria-label="Delete" className="grid h-8 w-8 place-items-center rounded-full border border-line text-red-600"><Trash2 size={14} /></button>
            </>
          )}
          <button type="button" disabled={busy === r.id} onClick={() => void run(r.id, () => markReminderDone(r.id))} className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"><Check size={14} /> Done</button>
        </div>
      )}
    </li>
  );

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 p-4 lg:p-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reminders</h1>
          <p className="mt-1 text-sm text-muted">Set a time. When it comes, a pop-up shows in the portal and a phone alert is sent, again every 10 minutes, until someone marks it done.</p>
        </div>
        {data?.canManage && (
          <button type="button" onClick={() => { if (guard("reminders.manage")) setSheet("new"); }} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16} /> Add reminder</button>
        )}
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
      {!data && !error && <p className="py-10 text-center text-sm text-muted">Loading…</p>}

      {data && (
        <>
          <section aria-label="To do">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">To do ({data.open.length})</h2>
            {data.open.length === 0 ? <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">Nothing to remember right now.</p> : <ul className="space-y-3">{data.open.map((r) => row(r))}</ul>}
          </section>
          {data.done.length > 0 && (
            <section aria-label="Done recently">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Done in the last 7 days</h2>
              <ul className="space-y-3">{data.done.map((r) => row(r, true))}</ul>
            </section>
          )}
        </>
      )}

      {sheet && <ReminderSheet reminder={sheet === "new" ? null : sheet} onClose={() => setSheet(null)} onSaved={() => { setSheet(null); load(); }} />}
    </div>
  );
}

function ReminderSheet({ reminder, onClose, onSaved }: { reminder: Reminder | null; onClose: () => void; onSaved: () => void }) {
  const start = reminder ? { date: nepalDate(reminder.dueAt), time: nepalClock(reminder.dueAt) } : nowParts();
  const [title, setTitle] = useState(reminder?.title ?? "");
  const [note, setNote] = useState(reminder?.note ?? "");
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time);
  const [repeat, setRepeat] = useState<"none" | "daily">(reminder?.repeat ?? "none");
  const [forStaffId, setForStaffId] = useState<string>(reminder?.forStaffId ?? "");
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { reminderStaff().then(setStaff).catch(() => {}); }, []);

  async function save() {
    if (!title.trim()) { setError("Write what to remember"); return; }
    setSaving(true);
    setError("");
    const body: ReminderInput = { title: title.trim(), note: note.trim() || undefined, date, time, repeat, forStaffId: forStaffId || null };
    try {
      if (reminder) await editReminder(reminder.id, { ...body, note: note.trim() });
      else await addReminder(body);
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={reminder ? "Edit reminder" : "Add reminder"} onClick={(e) => e.stopPropagation()} className="max-h-[92dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{reminder ? "Edit reminder" : "Add reminder"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted"><X size={20} /></button>
        </div>
        <label className="block text-xs font-medium text-muted">What to remember
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Count the cash drawer" className={`${field} mt-1`} autoFocus />
        </label>
        <label className="block text-xs font-medium text-muted">Note (optional)
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} className={`${field} mt-1`} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-medium text-muted">Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${field} mt-1`} />
          </label>
          <label className="block text-xs font-medium text-muted">Time (Nepal)
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={`${field} mt-1`} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-medium text-muted">Repeat
            <select value={repeat} onChange={(e) => setRepeat(e.target.value as "none" | "daily")} className={`${field} mt-1`}>
              <option value="none">Once</option>
              <option value="daily">Every day</option>
            </select>
          </label>
          <label className="block text-xs font-medium text-muted">For
            <select value={forStaffId} onChange={(e) => setForStaffId(e.target.value)} className={`${field} mt-1`}>
              <option value="">Everyone</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button type="button" onClick={save} disabled={saving} className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : reminder ? "Save changes" : "Add reminder"}</button>
      </div>
    </div>
  );
}
