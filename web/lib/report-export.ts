import { rs } from "./bookings";
import type { Report } from "./inventory";

const day = (k: string) => new Date(`${k}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const clock = (t: string) => `${Number(t.slice(0, 2)) % 12 || 12}${t.slice(2, 5)}`;
const ap = (t: string) => (Number(t.slice(0, 2)) % 24 < 12 ? "AM" : "PM");
const span = (a: string, b: string) => (ap(a) === ap(b) ? `${clock(a)}-${clock(b)} ${ap(b)}` : `${clock(a)} ${ap(a)}-${clock(b)} ${ap(b)}`);
const h12 = (h: number) => `${h % 12 || 12}:00 ${h < 12 ? "AM" : "PM"}`;
const period = (r: Report) => (r.from === r.to ? day(r.from) : `${day(r.from)} to ${day(r.to)}`);
const pcs = (n: number) => `${n} pc${n === 1 ? "" : "s"}`;
const who = (n: number) => (n === 1 ? "Solo" : `${n} Players`);
const list = (rows: string[], none: string) => (rows.length ? rows.map((x, i) => `${i + 1}. ${x}`) : [none]);

// The whole detailed report as a message (same order as the Overview page): totals, then numbered sections with their totals.
export function reportText(r: Report): string {
  const items = r.itemsSold.reduce((t, i) => t + i.amount, 0);
  return [
    `*Unique Futsal: Sales report*`, period(r), "",
    `Fonepay: ${rs(r.totals.fonepay)}`, `Cash: ${rs(r.totals.cash)}`, `*Total: ${rs(r.totals.total)}*`, "",
    `*1. Futsal games*`, ...list(r.games.items.map((g) => `${g.team} - ${span(g.startTime, g.endTime)} - ${rs(g.rate)} - Promocode: ${g.promoCode ?? "none"}${g.paid ? "" : " (Unpaid)"}`), "No games"),
    `Total: ${rs(r.games.items.reduce((t, g) => t + g.rate, 0))}`, "",
    `*2. Items sold*`, ...list(r.itemsSold.map((i) => `${i.name} - ${pcs(i.qty)} - ${rs(i.amount)}`), "No items sold"), `Total: ${rs(items)}`, "",
    `*3. Gamezone*`, ...list(r.gamezone.items.map((g) => `${g.customer} - ${g.hours} Hour${g.hours === 1 ? "" : "s"} - ${who(g.players)} - ${rs(g.total)}${g.extraHours ? ` (+${g.extraHours} h extra)` : ""}`), "No sessions"), `Total: ${rs(r.gamezone.amount)}`, "",
    `*4. Membership*`, ...list(r.memberships.items.map((m) => `${m.customer} - Paid: ${rs(m.paid)}${m.due ? ` Due: ${rs(m.due)}` : ""} - Duration left: ${m.daysLeft > 0 ? `${m.daysLeft} days` : "ended"}`), "None"),
    `Total Received: ${rs(r.memberships.received)}`, `Due Remaining: ${rs(r.memberships.due)}`, "",
    `*5. Tournament*`, ...list(r.tournaments.items.map((x) => `${x.name} - ${day(x.startDate)}${x.startDate !== x.endDate ? ` to ${day(x.endDate)}` : ""} - ${rs(x.amount)} ${x.paid ? "(Paid)" : "(Unpaid)"}`), "None"), `Total: ${rs(r.tournaments.amount)}`, "",
    `*6. Inventory stock*`, ...list(r.stock.items.map((p) => `${p.name} - ${pcs(p.left)}${p.state === "low" ? " (Low Stock): restock soon" : p.state === "out" ? " (Out of stock)" : " left"}`), "No products"),
    `Items added: ${r.stock.added.length ? r.stock.added.map((a) => `Added ${a.qty} ${a.name}`).join(", ") : "none"}`, `Stock value: ${rs(r.stock.costValue)} at cost`, "",
    `*7. Remaining dues (before today)*`, ...list(r.dues.items.map((d) => `${d.team} - ${rs(d.amount)} - ${day(d.date)}`), "No dues"), `Total dues: ${rs(r.dues.amount)}`,
  ].join("\n");
}

export const whatsappLink = (r: Report) => `https://wa.me/?text=${encodeURIComponent(reportText(r))}`;

const cell = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;

// A spreadsheet file (opens in Excel or Google Sheets): totals, then every section with its rows.
export function reportCsv(r: Report): string {
  const out: (string | number | null)[][] = [
    ["Unique Futsal sales report"], ["Period", period(r)], [],
    ["Totals"], ["Fonepay", r.totals.fonepay], ["Cash", r.totals.cash], ["Total", r.totals.total], [],
    ["1. Futsal games"], ["Date", "Time", "Code", "Team", "Rate", "Promo code", "Discount", "Payment"],
    ...r.games.items.map((g) => [day(g.date), span(g.startTime, g.endTime), g.code, g.team, g.rate, g.promoCode, g.discount, g.payment]), [],
    ["Customer purchases"], ["Customer", "Phone", "Item", "Quantity", "Price", "Amount", "Payment"],
    ...r.purchases.customers.flatMap((c) => c.sales.flatMap((s) => s.items.map((i) => [c.name, c.phone, i.name, i.qty, i.price, i.amount, s.payment]))), [],
    ["2. Items sold"], ["Item", "Quantity", "Worth"], ...r.itemsSold.map((i) => [i.name, i.qty, i.amount]), [],
    ["3. Gamezone"], ["Date", "Start", "Customer", "Console", "Game", "Players", "Hours", "Extra hours", "Total bill", "Payment"],
    ...r.gamezone.items.map((g) => [day(g.date), h12(g.startHour), g.customer, g.console, g.game, g.players, g.hours, g.extraHours, g.total, g.payment]), [],
    ["4. Membership"], ["Membership ID", "Member", "Phone", "Plan", "Length", "Hour", "Days", "From", "Until", "Days left", "Amount", "Paid", "Due"],
    ...r.memberships.items.map((m) => [m.memberCode, m.customer, m.phone, m.plan, m.length, m.timeSlot, m.days.join(" "), day(m.startDate), day(m.endDate), m.daysLeft, m.amount, m.paid, m.due]),
    ["Total received", r.memberships.received], ["Due remaining", r.memberships.due], [],
    ["5. Tournament"], ["Name", "From", "Until", "Amount", "Paid"], ...r.tournaments.items.map((x) => [x.name, day(x.startDate), day(x.endDate), x.amount, x.paid ? "Paid" : "Unpaid"]), [],
    ["6. Inventory stock"], ["Item", "Left", "State"], ...r.stock.items.map((p) => [p.name, p.left, p.state]), ["Items added"], ...r.stock.added.map((a) => [a.name, a.qty]), ["Stock value at cost", r.stock.costValue], [],
    ["7. Remaining dues (before today)"], ["Who", "Phone", "Amount", "Date", "What"], ...r.dues.items.map((d) => [d.team, d.phone, d.amount, day(d.date), d.detail]), ["Total dues", r.dues.amount],
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
