import { api } from "./api";

export type Reminder = {
  id: string;
  title: string;
  note: string | null;
  dueAt: string;
  repeat: "none" | "daily";
  status: "open" | "done";
  forStaffId: string | null;
  forName: string;
  createdByName: string;
  doneAt: string | null;
  doneByName: string | null;
  snoozedUntil: string | null;
  overdue: boolean;
};

export type RemindersList = { open: Reminder[]; done: Reminder[]; canManage: boolean };
export type ReminderInput = { title: string; note?: string; date: string; time: string; repeat: "none" | "daily"; forStaffId: string | null };

export const SNOOZE_MINUTES = [5, 10, 30, 60] as const;

export const listReminders = () => api<RemindersList>("/admin/reminders");
export const dueReminders = () => api<Reminder[]>("/admin/reminders/due");
export const reminderStaff = () => api<{ id: string; name: string; role: string }[]>("/admin/reminders/staff");
export const addReminder = (b: ReminderInput) => api<Reminder>("/admin/reminders", { method: "POST", body: JSON.stringify(b) });
export const editReminder = (id: string, b: Partial<ReminderInput>) => api<Reminder>(`/admin/reminders/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteReminder = (id: string) => api<{ id: string }>(`/admin/reminders/${id}`, { method: "DELETE" });
export const markReminderDone = (id: string) => api<Reminder>(`/admin/reminders/${id}/done`, { method: "POST" });
export const snoozeReminder = (id: string, minutes: number) => api<Reminder>(`/admin/reminders/${id}/snooze`, { method: "POST", body: JSON.stringify({ minutes }) });

// Nepal date and clock for a stored time, so a reminder shows (and is edited) in the same time zone the server uses
const NEPAL = { timeZone: "Asia/Kathmandu" } as const;
export const nepalDate = (iso: string | Date) => new Intl.DateTimeFormat("en-CA", { ...NEPAL, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
export const nepalClock = (iso: string | Date) => new Intl.DateTimeFormat("en-GB", { ...NEPAL, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
export const nowParts = () => ({ date: nepalDate(new Date()), time: nepalClock(new Date()) });

/** "Today, 6:30 PM" / "Tomorrow, 9:00 AM" / "25 Oct, 9:00 AM" (Nepal time) */
export function when(iso: string): string {
  const d = nepalDate(iso);
  const today = nepalDate(new Date());
  const tomorrow = nepalDate(new Date(Date.now() + 86_400_000));
  const time = new Intl.DateTimeFormat("en-US", { ...NEPAL, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  const day = d === today ? "Today" : d === tomorrow ? "Tomorrow" : new Intl.DateTimeFormat("en-GB", { ...NEPAL, day: "numeric", month: "short" }).format(new Date(iso));
  return `${day}, ${time}`;
}
