// Nepal time (Asia/Kathmandu), whatever time zone the host uses. Dates are "YYYY-MM-DD".
const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu", year: "numeric", month: "2-digit", day: "2-digit" });

export const todayKey = (now: Date = new Date()): string => fmt.format(now);

const utc = (k: string) => new Date(`${k}T00:00:00Z`);
const key = (d: Date) => d.toISOString().slice(0, 10);

export function addDaysKey(k: string, days: number): string {
  const d = utc(k);
  d.setUTCDate(d.getUTCDate() + days);
  return key(d);
}

// Keeps end-of-month dates valid (31 Jan + 1 month = 28/29 Feb)
export function addMonthsKey(k: string, months: number): string {
  const d = utc(k);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return key(target);
}

const hourFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kathmandu", hour: "2-digit", hourCycle: "h23" });
export const currentHour = (now: Date = new Date()): number => Number(hourFmt.format(now));

const clockFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kathmandu", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
// Minutes since midnight in Nepal
export const nowMinutes = (now: Date = new Date()): number => {
  const [h, m] = clockFmt.format(now).split(":").map(Number);
  return h * 60 + m;
};
