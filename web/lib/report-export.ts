import { rs } from "./bookings";
import type { Report } from "./inventory";

const day = (k: string) => new Date(`${k}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const hhmm = (t: string) => { const h = Number(t.slice(0, 2)); return `${h % 12 || 12}${t.slice(2, 5)} ${h < 12 ? "AM" : "PM"}`; };
const h12 = (h: number) => `${h % 12 || 12}:00 ${h < 12 ? "AM" : "PM"}`;
const period = (r: Report) => (r.from === r.to ? day(r.from) : `${day(r.from)} to ${day(r.to)}`);

// A short message for WhatsApp: the totals, then one line per section (the full detail is in the download).
export function reportText(r: Report): string {
  const s = r.totals.bySource;
  const sum = (x: { cash: number; fonepay: number }) => x.cash + x.fonepay;
  const lines = [
    `*Unique Futsal: Sales report*`, period(r), "",
    `Fonepay: ${rs(r.totals.fonepay)}`, `Cash: ${rs(r.totals.cash)}`, `*Total: ${rs(r.totals.total)}*`, "",
    `Games: ${r.games.count} (${r.games.paidCount} paid), ${rs(sum(s.games))} collected`,
    `Goods: ${r.purchases.customers.length} customers, ${rs(sum(s.goods))} collected`,
    `Gamezone: ${r.gamezone.count} sessions, ${rs(sum(s.gamezone))} collected`,
    `Memberships: ${r.memberships.count}, ${rs(r.memberships.amount)} (not in the total)`,
  ];
  if (r.itemsSold.length) lines.push("", "*Items sold*", ...r.itemsSold.slice(0, 12).map((i) => `${i.qty} x ${i.name}: ${rs(i.amount)}`));
  return lines.join("\n");
}

export const whatsappLink = (r: Report) => `https://wa.me/?text=${encodeURIComponent(reportText(r))}`;

const cell = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;

// A spreadsheet file (opens in Excel or Google Sheets): totals, then every section with its rows.
export function reportCsv(r: Report): string {
  const out: (string | number | null)[][] = [
    ["Unique Futsal sales report"], ["Period", period(r)], [],
    ["Totals"], ["Fonepay", r.totals.fonepay], ["Cash", r.totals.cash], ["Total", r.totals.total], [],
    ["Games"], ["Date", "Time", "Code", "Team", "Rate", "Promo code", "Discount", "Payment"],
    ...r.games.items.map((g) => [day(g.date), hhmm(g.startTime), g.code, g.team, g.rate, g.promoCode, g.discount, g.payment]), [],
    ["Customer purchases"], ["Customer", "Phone", "Item", "Quantity", "Price", "Amount", "Payment"],
    ...r.purchases.customers.flatMap((c) => c.sales.flatMap((s) => s.items.map((i) => [c.name, c.phone, i.name, i.qty, i.price, i.amount, s.payment]))), [],
    ["Gamezone"], ["Date", "Start", "Customer", "Console", "Game", "Players", "Hours", "Extra hours", "Total bill", "Payment"],
    ...r.gamezone.items.map((g) => [day(g.date), h12(g.startHour), g.customer, g.console, g.game, g.players, g.hours, g.extraHours, g.total, g.payment]), [],
    ["Memberships"], ["Membership ID", "Member", "Phone", "Plan", "Length", "Hour", "Days", "From", "Until", "Amount", "Status"],
    ...r.memberships.items.map((m) => [m.memberCode, m.customer, m.phone, m.plan, m.length, m.timeSlot, m.days.join(" "), day(m.startDate), day(m.endDate), m.amount, m.paymentStatus === "verified" ? "Paid" : "Waiting for payment"]), [],
    ["Items sold"], ["Item", "Quantity", "Worth"], ...r.itemsSold.map((i) => [i.name, i.qty, i.amount]),
  ];
  return "﻿" + out.map((row) => row.map(cell).join(",")).join("\r\n");
}

export function downloadReport(r: Report) {
  const url = URL.createObjectURL(new Blob([reportCsv(r)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `sales-report-${r.from}${r.from === r.to ? "" : `-to-${r.to}`}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
