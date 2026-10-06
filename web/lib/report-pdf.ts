import { rs } from "./bookings";
import type { Report } from "./inventory";

const day = (k: string) => new Date(`${k}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const clock = (t: string) => `${Number(t.slice(0, 2)) % 12 || 12}${t.slice(2, 5)}`;
const ap = (t: string) => (Number(t.slice(0, 2)) % 24 < 12 ? "AM" : "PM");
const span = (a: string, b: string) => (ap(a) === ap(b) ? `${clock(a)}-${clock(b)} ${ap(b)}` : `${clock(a)} ${ap(a)}-${clock(b)} ${ap(b)}`);
const pcs = (n: number) => `${n} pc${n === 1 ? "" : "s"}`;
const money = (n: number) => rs(n).replace(/ /g, " ");

// The sales report as a PDF (A4), in the same order as the Overview page. jsPDF is loaded only when the button is pressed.
export async function downloadReportPdf(r: Report) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 14, RIGHT = W - M;
  let y = 16;
  const room = (h: number) => { if (y + h > 285) { doc.addPage(); y = 16; } };

  const heading = (text: string) => { room(14); y += 3; doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(20, 120, 40); doc.text(text, M, y); doc.setDrawColor(200).line(M, y + 1.5, RIGHT, y + 1.5); y += 7; doc.setTextColor(0); };
  const row = (n: number | null, left: string, right = "", note = "") => {
    doc.setFont("helvetica", "normal").setFontSize(10);
    const lines = doc.splitTextToSize(left, RIGHT - M - 30 - (n ? 8 : 0)) as string[];
    room(lines.length * 5 + (note ? 4 : 1));
    if (n) doc.text(`${n}.`, M, y);
    doc.text(lines, M + (n ? 8 : 0), y);
    if (right) { doc.setFont("helvetica", "bold"); doc.text(right, RIGHT, y, { align: "right" }); }
    y += lines.length * 5;
    if (note) { doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(110); doc.text(note, M + (n ? 8 : 0), y - 1); doc.setTextColor(0); y += 3.5; }
    y += 1;
  };
  const total = (left: string, right: string) => { room(8); doc.setDrawColor(220).line(M, y - 1, RIGHT, y - 1); y += 3; doc.setFont("helvetica", "bold").setFontSize(10.5); doc.text(left, M, y); doc.text(right, RIGHT, y, { align: "right" }); y += 6; };
  const none = (t: string) => { room(6); doc.setFont("helvetica", "italic").setFontSize(10).setTextColor(120); doc.text(t, M, y); doc.setTextColor(0); y += 6; };

  // title
  doc.setFont("helvetica", "bold").setFontSize(18).text("UNIQUE FUTSAL", M, y);
  doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(90).text("Sales report", RIGHT, y, { align: "right" });
  y += 7;
  doc.setFontSize(10).text(r.from === r.to ? day(r.from) : `${day(r.from)} to ${day(r.to)}`, M, y);
  doc.text(`Made on ${day(new Date().toISOString().slice(0, 10))}`, RIGHT, y, { align: "right" });
  doc.setTextColor(0);
  y += 6;

  // totals
  const box = (x: number, w: number, label: string, value: string, strong = false) => {
    doc.setFillColor(strong ? 230 : 245, strong ? 245 : 245, strong ? 232 : 245).roundedRect(x, y, w, 17, 2, 2, "F");
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(100).text(label, x + 3, y + 6);
    doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(strong ? 20 : 0, strong ? 120 : 0, strong ? 40 : 0).text(value, x + 3, y + 13);
    doc.setTextColor(0);
  };
  const bw = (RIGHT - M - 8) / 3;
  box(M, bw, "Fonepay", money(r.totals.fonepay));
  box(M + bw + 4, bw, "Cash", money(r.totals.cash));
  box(M + 2 * (bw + 4), bw, "Total sales", money(r.totals.total), true);
  y += 22;

  heading("1. Futsal games");
  if (!r.games.items.length) none("No games in this period.");
  r.games.items.forEach((g, i) => row(i + 1, `${g.team} - ${span(g.startTime, g.endTime)} - Promocode: ${g.promoCode ?? "none"}${g.paid ? "" : " (Unpaid)"}`, money(g.rate), r.from === r.to ? "" : day(g.date)));
  total("Total", money(r.games.items.reduce((t, g) => t + g.rate, 0)));

  heading("2. Items sold");
  if (!r.itemsSold.length) none("No items were sold in this period.");
  r.itemsSold.forEach((x, i) => row(i + 1, `${x.name} - ${pcs(x.qty)}`, money(x.amount)));
  total("Total", money(r.itemsSold.reduce((t, x) => t + x.amount, 0)));

  heading("3. Gamezone");
  if (!r.gamezone.items.length) none("No Gamezone sessions in this period.");
  r.gamezone.items.forEach((g, i) => row(i + 1, `${g.customer} - ${g.hours} Hour${g.hours === 1 ? "" : "s"} - ${g.players === 1 ? "Solo" : `${g.players} Players`}${g.extraHours ? ` (+${g.extraHours} h extra)` : ""}${g.paid ? "" : " (Unpaid)"}`, money(g.total)));
  total("Total", money(r.gamezone.amount));

  heading("4. Membership");
  if (!r.memberships.items.length) none("No memberships were made, paid or are waiting for payment.");
  r.memberships.items.forEach((m, i) => row(i + 1, `${m.customer} - Paid: ${money(m.paid)}${m.due ? `  Due: ${money(m.due)}` : ""} - Duration left: ${m.daysLeft > 0 ? `${m.daysLeft} days` : "ended"}`, "", m.memberCode ?? ""));
  total("Total Received", money(r.memberships.received));
  total("Due Remaining", money(r.memberships.due));

  heading("5. Tournament");
  if (!r.tournaments.items.length) none("No tournaments in this period.");
  r.tournaments.items.forEach((x, i) => row(i + 1, `${x.name} - ${day(x.startDate)}${x.startDate !== x.endDate ? ` to ${day(x.endDate)}` : ""} (${x.paid ? "Paid" : "Unpaid"})`, money(x.amount)));
  total("Total", money(r.tournaments.amount));

  heading("6. Inventory stock value");
  r.stock.items.forEach((p, i) => row(i + 1, `${p.name} - ${pcs(p.left)}${p.state === "low" ? " (Low Stock): restock soon" : p.state === "out" ? " (Out of stock): restock now" : " left"}`));
  row(null, `Items added: ${r.stock.added.length ? r.stock.added.map((a) => `Added ${a.qty} ${a.name}`).join(", ") : "none"}`);
  total("Stock value (at cost)", money(r.stock.costValue));

  heading("7. Remaining dues (before today)");
  if (!r.dues.items.length) none("No dues. Everyone has paid.");
  r.dues.items.forEach((d, i) => row(i + 1, `${d.team} - ${day(d.date)}`, money(d.amount), d.kind === "Goods" ? `Goods: ${d.detail}` : `Game ${d.detail}`));
  total("Total dues", money(r.dues.amount));

  // page numbers
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) { doc.setPage(p); doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(130).text(`Page ${p} of ${pages}`, RIGHT, 292, { align: "right" }); }

  doc.save(`sales-report-${r.from}${r.from === r.to ? "" : `-to-${r.to}`}.pdf`);
}
