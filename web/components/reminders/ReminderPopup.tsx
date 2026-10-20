"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellRing, Check } from "lucide-react";
import { Reminder, dueReminders, markReminderDone, snoozeReminder, when } from "@/lib/reminders";

// Shown on every page of the portal: a reminder that is due for this person (or for everyone) pops up until it is marked done or snoozed.
// The server also sends a phone alert, so staff away from the portal are told as well.
export default function ReminderPopup() {
  const pathname = usePathname();
  const [due, setDue] = useState<Reminder[]>([]);
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    dueReminders().then(setDue).catch(() => {});
  }, []);

  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") load(); };
    tick();
    const t = setInterval(tick, 15_000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [load]);

  // a short buzz when something new pops up
  const first = due[0]?.id;
  useEffect(() => {
    if (!first) return;
    try { navigator.vibrate?.([300, 150, 300]); } catch { /* not supported */ }
  }, [first]);

  async function act(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    try { await fn(); } catch { /* the next check shows what is still due */ }
    setBusy("");
    load();
  }

  // on the Reminders page itself the list is right there, so no pop-up on top of it
  if (due.length === 0 || pathname.startsWith("/reminders")) return null;

  return (
    <div role="alertdialog" aria-modal="true" aria-label="Reminder" className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[88dvh] w-full max-w-sm space-y-3 overflow-y-auto rounded-3xl bg-surface p-5 shadow-2xl">
        <div className="flex items-center gap-2 text-brand">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-brand/10"><BellRing size={20} /></span>
          <p className="text-lg font-semibold">{due.length === 1 ? "Reminder" : `${due.length} reminders`}</p>
        </div>
        <ul className="space-y-3">
          {due.map((r) => (
            <li key={r.id} className="rounded-2xl border border-line p-3">
              <p className="font-semibold">{r.title}</p>
              {r.note && <p className="mt-0.5 text-sm text-muted">{r.note}</p>}
              <p className="mt-1 text-xs text-muted">Set for {when(r.dueAt)}</p>
              <div className="mt-3 flex gap-2">
                <button type="button" disabled={busy === r.id} onClick={() => void act(r.id, () => snoozeReminder(r.id, 10))} className="flex-1 rounded-full border border-line py-2 text-xs font-semibold text-muted disabled:opacity-50">Snooze 10 min</button>
                <button type="button" disabled={busy === r.id} onClick={() => void act(r.id, () => markReminderDone(r.id))} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-brand py-2 text-xs font-semibold text-white disabled:opacity-50"><Check size={14} /> Done</button>
              </div>
            </li>
          ))}
        </ul>
        <Link href="/reminders" onClick={() => setDue([])} className="block text-center text-xs font-semibold text-brand">Open all reminders</Link>
      </div>
    </div>
  );
}
