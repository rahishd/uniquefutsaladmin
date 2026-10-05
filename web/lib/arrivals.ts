import { api } from "./api";

export type ArrivalItem = {
  kind: "court" | "gamezone";
  id: string;
  ref: string;
  code: string;
  time: string;
  endTime: string;
  name: string | null;
  phone: string | null;
  amount: number;
  paid: boolean;
  method: string;
  status: string;
  checkedInAt: string | null;
};

export type ArrivalsDay = { date: string; nowMinutes: number; items: ArrivalItem[] };

export const getArrivals = () => api<ArrivalsDay>("/admin/arrivals");

const mins = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export type Group = "onTheWay" | "waiting" | "finished";

// Finished: done, no-show, or the hour is over. On the way: tapped "I'm coming". Waiting: not confirmed yet.
export function groupOf(i: ArrivalItem, now: number): Group {
  if (i.status === "completed" || i.status === "no_show" || mins(i.endTime) <= now) return "finished";
  return i.checkedInAt ? "onTheWay" : "waiting";
}

export const span = (m: number) => {
  const a = Math.abs(Math.round(m));
  return a >= 60 ? `${Math.floor(a / 60)} h${a % 60 ? ` ${a % 60} min` : ""}` : `${a} min`;
};

// "starts in 25 min" / "started 10 min ago"
export function startText(i: ArrivalItem, now: number) {
  const d = mins(i.time) - now;
  return d > 0 ? { text: `starts in ${span(d)}`, late: false } : { text: `started ${span(d)} ago`, late: true };
}
