import { api } from "./api";
import { rs } from "./bookings";

type Money = { cash: number; fonepay: number; total: number };
export type Summary = {
  from: string; to: string; days: number;
  totals: Money & { games: number; goods: number; gamezone: number }; previous: Money & { games: number; goods: number; gamezone: number };
  byDay: (Money & { date: string; games: number; goods: number; gamezone: number })[];
  games: { count: number; paid: number; unpaid: number; unpaidAmount: number; averageRate: number; cancelled: number; noShows: number; source: { app: number; staff: number; challenge: number } };
  occupancy: { bookedHours: number; perDay: number; peakHours: { hour: number; games: number }[]; weekdays: { day: string; hours: number }[] };
  promos: { code: string; uses: number; discount: number }[];
  topCustomers: { name: string; phone: string | null; games: number; spent: number }[];
  loyalty: { unexpiredEarnedPoints: number; spentPoints: number; unusedVouchers: number };
  memberships: { active: number; expiringSoon: number; waitingForPayment: number; activeValue: number };
};
export const getSummary = (from: string, to: string) => api<Summary>(`/admin/reports/summary?from=${from}&to=${to}`);

export const nepalToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" }).format(new Date());
export const shiftDay = (key: string, days: number) => new Date(new Date(`${key}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
export const fmtDay = (k: string) => new Date(`${k}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const shortDay = (k: string) => new Date(`${k}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
export const h12 = (h: number) => `${h % 12 || 12}:00 ${h < 12 ? "AM" : "PM"}`;
export const periodLabel = (r: { from: string; to: string }) => (r.from === r.to ? fmtDay(r.from) : `${fmtDay(r.from)} to ${fmtDay(r.to)}`);
export const change = (now: number, before: number) => (before === 0 ? (now === 0 ? 0 : null) : Math.round(((now - before) / before) * 100));

// A message for WhatsApp: totals and the main numbers
export function reportsText(r: Summary): string {
  const pct = change(r.totals.total, r.previous.total);
  return [
    "*Unique Futsal: Business report*", periodLabel(r), "",
    `Fonepay: ${rs(r.totals.fonepay)}`, `Cash: ${rs(r.totals.cash)}`, `*Total sales: ${rs(r.totals.total)}*${pct === null ? "" : ` (${pct >= 0 ? "+" : ""}${pct}% vs the ${r.days} days before)`}`,
    `Games ${rs(r.totals.games)} · Goods ${rs(r.totals.goods)} · Gamezone ${rs(r.totals.gamezone)}`, "",
    `*Games:* ${r.games.count} (${r.games.paid} paid, ${r.games.unpaid} unpaid ${rs(r.games.unpaidAmount)}), average ${rs(r.games.averageRate)}`,
    `Cancelled ${r.games.cancelled} · No-shows ${r.games.noShows}`,
    `Booked: app ${r.games.source.app}, staff ${r.games.source.staff}, challenges ${r.games.source.challenge}`,
    `Busiest hours: ${r.occupancy.peakHours.slice(0, 3).map((p) => `${h12(p.hour)} (${p.games})`).join(", ") || "none"}`,
    `Promo codes: ${r.promos.length ? r.promos.map((p) => `${p.code} x${p.uses}`).join(", ") : "none used"}`,
    `Members: ${r.memberships.active} active, ${r.memberships.expiringSoon} expiring soon, ${r.memberships.waitingForPayment} waiting for payment`,
  ].join("\n");
}
export const reportsLink = (r: Summary) => `https://wa.me/?text=${encodeURIComponent(reportsText(r))}`;

// The whole report as an A4 PDF (jsPDF is loaded only when the button is pressed)
export async function downloadReportsPdf(r: Summary) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const M = 14, RIGHT = 196;
  let y = 16;
  const money = (n: number) => rs(n).replace(/ /g, " ");
  const room = (h: number) => { if (y + h > 285) { doc.addPage(); y = 16; } };
  const heading = (t: string) => { room(14); y += 3; doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(20, 120, 40).text(t, M, y); doc.setDrawColor(200).line(M, y + 1.5, RIGHT, y + 1.5); y += 7; doc.setTextColor(0); };
  const row = (left: string, right = "") => { doc.setFont("helvetica", "normal").setFontSize(10); const lines = doc.splitTextToSize(left, RIGHT - M - 32) as string[]; room(lines.length * 5 + 1); doc.text(lines, M, y); if (right) { doc.setFont("helvetica", "bold").text(right, RIGHT, y, { align: "right" }); } y += lines.length * 5 + 1; };
  const none = (t: string) => { room(6); doc.setFont("helvetica", "italic").setFontSize(10).setTextColor(120).text(t, M, y); doc.setTextColor(0); y += 6; };

  doc.setFont("helvetica", "bold").setFontSize(18).text("UNIQUE FUTSAL", M, y);
  doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(90).text("Business report", RIGHT, y, { align: "right" });
  y += 7; doc.setFontSize(10).text(periodLabel(r), M, y); doc.setTextColor(0); y += 6;

  const box = (x: number, w: number, label: string, value: string, strong = false) => {
    doc.setFillColor(strong ? 230 : 245, 245, strong ? 232 : 245).roundedRect(x, y, w, 17, 2, 2, "F");
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(100).text(label, x + 3, y + 6);
    doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(strong ? 20 : 0, strong ? 120 : 0, strong ? 40 : 0).text(value, x + 3, y + 13); doc.setTextColor(0);
  };
  const bw = (RIGHT - M - 8) / 3;
  box(M, bw, "Fonepay", money(r.totals.fonepay)); box(M + bw + 4, bw, "Cash", money(r.totals.cash)); box(M + 2 * (bw + 4), bw, "Total sales", money(r.totals.total), true);
  y += 22;
  const pct = change(r.totals.total, r.previous.total);
  row(`Compared with the ${r.days} days before (${money(r.previous.total)})`, pct === null ? "new" : `${pct >= 0 ? "+" : ""}${pct}%`);

  heading("1. Sales by source");
  row("Games", money(r.totals.games)); row("Goods", money(r.totals.goods)); row("Gamezone", money(r.totals.gamezone));

  heading("2. Sales by day");
  r.byDay.forEach((d) => row(`${shortDay(d.date)}   cash ${money(d.cash)}   Fonepay ${money(d.fonepay)}`, money(d.total)));

  heading("3. Games");
  row("Games played or booked", String(r.games.count)); row("Paid", String(r.games.paid)); row(`Unpaid (${money(r.games.unpaidAmount)})`, String(r.games.unpaid));
  row("Average rate", money(r.games.averageRate)); row("Cancelled", String(r.games.cancelled)); row("No-shows", String(r.games.noShows));
  row("Booked in the app", String(r.games.source.app)); row("Booked by staff", String(r.games.source.staff)); row("Challenge games", String(r.games.source.challenge));

  heading("4. Busy times");
  row("Booked hours", `${r.occupancy.bookedHours} (${r.occupancy.perDay} per day)`);
  r.occupancy.peakHours.forEach((p) => row(`Busy hour ${h12(p.hour)}`, `${p.games} games`));
  r.occupancy.weekdays.forEach((w) => row(w.day, `${w.hours} h`));

  heading("5. Promo codes");
  if (!r.promos.length) none("No promo codes were used.");
  r.promos.forEach((p) => row(`${p.code} used ${p.uses} time${p.uses === 1 ? "" : "s"}`, `saved ${money(p.discount)}`));

  heading("6. Best customers");
  if (!r.topCustomers.length) none("No games in this period.");
  r.topCustomers.forEach((c, i) => row(`${i + 1}. ${c.name}${c.phone ? ` (${c.phone})` : ""} - ${c.games} games`, money(c.spent)));

  heading("7. Memberships and loyalty (now)");
  row("Active members", String(r.memberships.active)); row("Expiring in 15 days", String(r.memberships.expiringSoon)); row("Waiting for payment", String(r.memberships.waitingForPayment));
  row("Value of active memberships", money(r.memberships.activeValue)); row("Loyalty points owed (upper estimate)", String(Math.round(r.loyalty.unexpiredEarnedPoints + r.loyalty.spentPoints))); row("Unused free-game vouchers", String(r.loyalty.unusedVouchers));

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) { doc.setPage(p); doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(130).text(`Page ${p} of ${pages}`, RIGHT, 292, { align: "right" }); }
  doc.save(`business-report-${r.from}${r.from === r.to ? "" : `-to-${r.to}`}.pdf`);
}
