import { api } from "./api";
import { rs } from "./bookings";

export type HostDay = { date: string; startHour: number; endHour: number };
export type Clash = { date: string; hour: number; reason: string };
export type HostInput = { name: string; hostName: string; hostPhone: string; minRate: number; days: HostDay[] };
export type Preview = { hours: number; court: number; clashes: Clash[] };

export type BillLine = { id: string; kind: "goods" | "extra" | "discount"; label: string; quantity: number; unitPrice: number; amount: number; createdAt: string };
export type Bill = {
  id: string; name: string; status: string; hostName: string | null; hostPhone: string | null; rate: number; closedAt: string | null;
  days: { id: string; date: string; startHour: number; endHour: number; hours: number; amount: number }[];
  hours: number; court: number; goods: number; extras: number; discount: number; total: number; paid: number; paidCash: number; paidFonepay: number; due: number;
  lines: BillLine[]; payments: { id: string; cash: number; fonepay: number; amount: number; note: string | null; createdAt: string }[];
};

export const previewHosting = (b: HostInput) => api<Preview>("/admin/tournaments", { method: "POST", body: JSON.stringify({ ...b, dryRun: true }) });
export const registerTournament = (b: HostInput) => api<Bill>("/admin/tournaments", { method: "POST", body: JSON.stringify(b) });
export const getBill = (id: string) => api<Bill>(`/admin/tournaments/${id}/billing`);
const post = (id: string, path: string, body: object = {}) => api<Bill>(`/admin/tournaments/${id}/${path}`, { method: "POST", body: JSON.stringify(body) });
export const addItems = (id: string, items: { productId: string; quantity: number }[]) => post(id, "items", { items });
export const addLine = (id: string, b: { kind: "extra" | "discount"; label: string; amount: number }) => post(id, "lines", b);
export const removeLine = (id: string, lineId: string) => api<Bill>(`/admin/tournaments/${id}/lines/${lineId}`, { method: "DELETE" });
export const setRate = (id: string, minRate: number) => api<Bill>(`/admin/tournaments/${id}/rate`, { method: "PATCH", body: JSON.stringify({ minRate }) });
export const receivePayment = (id: string, b: { amount: number; payments?: { method: "cash" | "fonepay"; amount: number }[]; single?: "cash" | "fonepay"; fonepayQrId?: string; note?: string }) => post(id, "payments", b);
export const makeFinalBill = (id: string) => post(id, "final-bill");
export const reopenBill = (id: string) => post(id, "reopen-bill");
export const cancelHosted = (id: string) => api<null>(`/admin/tournaments/${id}/cancel`, { method: "POST", body: "{}" });

export const h12 = (h: number) => `${h % 24 % 12 || 12}:00 ${h % 24 < 12 ? "AM" : "PM"}`;
export const range = (d: { startHour: number; endHour: number }) => `${h12(d.startHour)} to ${h12(d.endHour)}`;
export const fmtDay = (k: string) => new Date(`${k}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

// The invoice as a message for the host
export function billText(b: Bill): string {
  const out = [`*Unique Futsal: Tournament bill*`, b.name, b.hostName ? `Host: ${b.hostName}` : "", "", "*Court*", ...b.days.map((d) => `${fmtDay(d.date)}, ${range(d)}: ${d.hours} h x ${rs(b.rate)} = ${rs(d.amount)}`)];
  const goods = b.lines.filter((l) => l.kind === "goods");
  if (goods.length) out.push("", "*Goods*", ...goods.map((l) => `${l.quantity} x ${l.label}: ${rs(l.amount)}`));
  const extra = b.lines.filter((l) => l.kind !== "goods");
  if (extra.length) out.push("", "*Other*", ...extra.map((l) => `${l.label}: ${l.amount < 0 ? "-" : ""}${rs(Math.abs(l.amount))}`));
  out.push("", `*Total: ${rs(b.total)}*`, `Paid: ${rs(b.paid)}${b.paid ? ` (cash ${rs(b.paidCash)}, Fonepay ${rs(b.paidFonepay)})` : ""}`, `*${b.due > 0 ? `Balance due: ${rs(b.due)}` : "Paid in full. Thank you!"}*`);
  return out.filter((x, i, a) => x !== "" || a[i - 1] !== "").join("\n");
}
export const billLink = (b: Bill) => {
  const d = (b.hostPhone ?? "").replace(/\D/g, "");
  return `https://wa.me/${d.length === 10 ? `977${d}` : d}?text=${encodeURIComponent(billText(b))}`;
};

// The bill as an A4 PDF (jsPDF is loaded only when the button is pressed)
export async function downloadBillPdf(b: Bill) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const M = 14, RIGHT = 196;
  let y = 16;
  const money = (n: number) => rs(n).replace(/ /g, " ");
  const room = (h: number) => { if (y + h > 280) { doc.addPage(); y = 16; } };
  const heading = (t: string) => { room(12); y += 3; doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(20, 120, 40).text(t, M, y); doc.setDrawColor(200).line(M, y + 1.5, RIGHT, y + 1.5); y += 7; doc.setTextColor(0); };
  const row = (left: string, right = "", bold = false) => { doc.setFont("helvetica", bold ? "bold" : "normal").setFontSize(10); const lines = doc.splitTextToSize(left, RIGHT - M - 34) as string[]; room(lines.length * 5 + 1); doc.text(lines, M, y); if (right) doc.setFont("helvetica", "bold").text(right, RIGHT, y, { align: "right" }); y += lines.length * 5 + 1; };

  doc.setFont("helvetica", "bold").setFontSize(18).text("UNIQUE FUTSAL", M, y);
  doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(90).text(b.closedAt ? "Tournament final bill" : "Tournament bill (not final)", RIGHT, y, { align: "right" });
  y += 8; doc.setTextColor(0).setFont("helvetica", "bold").setFontSize(13).text(b.name, M, y);
  y += 5; doc.setFont("helvetica", "normal").setFontSize(10).text(`Host: ${b.hostName ?? ""}${b.hostPhone ? `  ·  ${b.hostPhone}` : ""}`.replace("·", "-"), M, y); y += 4;
  heading("Court");
  b.days.forEach((d) => row(`${fmtDay(d.date)}, ${range(d)}  (${d.hours} h x ${money(b.rate)})`, money(d.amount)));
  row("Court total", money(b.court), true);
  const goods = b.lines.filter((l) => l.kind === "goods");
  if (goods.length) { heading("Goods taken"); goods.forEach((l) => row(`${l.quantity} x ${l.label}  (${money(l.unitPrice)} each)`, money(l.amount))); row("Goods total", money(b.goods), true); }
  const other = b.lines.filter((l) => l.kind !== "goods");
  if (other.length) { heading("Extra charges and discounts"); other.forEach((l) => row(l.label, `${l.amount < 0 ? "-" : ""}${money(Math.abs(l.amount))}`)); }
  heading("Total");
  row("Total bill", money(b.total), true);
  b.payments.forEach((p) => row(`Received ${new Date(p.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}: cash ${money(p.cash)}, Fonepay ${money(p.fonepay)}${p.note ? ` (${p.note})` : ""}`, money(p.amount)));
  row("Paid in all", money(b.paid));
  row(b.due > 0 ? "Balance due" : "Paid in full", b.due > 0 ? money(b.due) : "", true);
  doc.save(`tournament-bill-${b.name.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}.pdf`);
}
