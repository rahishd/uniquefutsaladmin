// Branded PDF pages for reports, tournament bills, promo codes, membership reminders and links the admin portal sends on WhatsApp.
import { rs } from "@/lib/bookings";
import type { PdfBlock, PdfRow, PdfSpec } from "@/lib/branded-pdf";
import { CHARITY_PERCENT, charityText } from "@/lib/charity";
import type { Report } from "@/lib/inventory";
import { change, periodLabel, shortDay, type Summary } from "@/lib/reports";
import { fmtDay as hostDay, range as hostRange, serviceLabel, type Bill } from "@/lib/hosted-tournaments";
import { conditions, type PromoInput } from "@/lib/promos";

const hour12 = (h: number) => `${h % 12 || 12}:00 ${h < 12 ? "AM" : "PM"}`;
const day = (k: string) => new Date(`${k}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const clock = (t: string) => `${Number(t.slice(0, 2)) % 12 || 12}${t.slice(2, 5)}`;
const ap = (t: string) => (Number(t.slice(0, 2)) % 24 < 12 ? "AM" : "PM");
const span = (a: string, b: string) => (ap(a) === ap(b) ? `${clock(a)}-${clock(b)} ${ap(b)}` : `${clock(a)} ${ap(a)}-${clock(b)} ${ap(b)}`);
const period = (r: { from: string; to: string }) => (r.from === r.to ? day(r.from) : `${day(r.from)} to ${day(r.to)}`);
const verifyNote = (code?: string | null) => (code ? `Verification number ${code}. Check it at Verify Documents in the Unique Futsal app.` : undefined);

/** The detailed sales report (Overview and Inventory report pages). */
export function salesReportPdf(r: Report, code?: string | null): PdfSpec {
  const sec = (heading: string, head: string[], rows: string[][], blank: string, totals: PdfRow[]): PdfBlock =>
    rows.length ? { heading, table: { head, rows }, rows: totals } : { heading, rows: [{ label: blank, value: "" }, ...totals] };
  const items = r.itemsSold.reduce((t, i) => t + i.amount, 0);
  return {
    purpose: "SALES REPORT", title: "Sales report", subtitle: period(r), ref: code ?? undefined,
    rows: [{ label: "Fonepay", value: rs(r.totals.fonepay) }, { label: "Cash", value: rs(r.totals.cash) }],
    total: { label: "Total sales", value: rs(r.totals.total) },
    blocks: [
      sec("1. Futsal games", ["Team", "Time", "Rate"], r.games.items.map((g) => [`${g.team}${g.paid ? "" : " (unpaid)"}`, span(g.startTime, g.endTime), rs(g.rate)]), "No games", [{ label: "Total", value: rs(r.games.items.reduce((t, g) => t + g.rate, 0)) }]),
      sec("2. Items sold", ["Item", "Qty", "Worth"], r.itemsSold.map((i) => [i.name, String(i.qty), rs(i.amount)]), "No items sold", [{ label: "Total", value: rs(items) }]),
      sec("3. Gamezone", ["Customer", "Hours", "Total"], r.gamezone.items.map((g) => [g.customer, String(g.hours), rs(g.total)]), "No sessions", [{ label: "Total", value: rs(r.gamezone.amount) }]),
      sec("4. Membership", ["Member", "Paid", "Due"], r.memberships.items.map((m) => [m.customer, rs(m.paid), m.due ? rs(m.due) : "-"]), "None", [{ label: "Received", value: rs(r.memberships.received) }, { label: "Due remaining", value: rs(r.memberships.due) }]),
      sec("5. Tournament", ["Name", "Status", "Amount"], r.tournaments.items.map((x) => [x.name, x.paid ? "Paid" : "Unpaid", rs(x.amount)]), "None", [{ label: "Total", value: rs(r.tournaments.amount) }]),
      sec("6. Inventory stock", ["Item", "Left", "State"], r.stock.items.map((p) => [p.name, String(p.left), p.state === "low" ? "Low" : p.state === "out" ? "Out" : "OK"]), "No products", [{ label: "Stock value at cost", value: rs(r.stock.costValue) }]),
      sec("7. Remaining dues (before today)", ["Who", "Date", "Amount"], r.dues.items.map((d) => [d.team, day(d.date), rs(d.amount)]), "No dues", [{ label: "Total dues", value: rs(r.dues.amount) }]),
    ],
    note: verifyNote(code),
  };
}

/** The business report (Reports page): the summary first, then every sale of the period line by line. */
export function businessReportPdf(r: Summary, d: Report, code?: string | null): PdfSpec {
  const pct = change(r.totals.total, r.previous.total);
  const n = (v: number) => Math.round(v).toLocaleString("en-IN");
  const sec = (heading: string, head: string[], rows: string[][], blank: string, totals: PdfRow[]): PdfBlock =>
    rows.length ? { heading, table: { head, rows }, rows: totals } : { heading, rows: [{ label: blank, value: "" }, ...totals] };
  const months = new Map<string, { games: number; goods: number; gamezone: number; cash: number; fonepay: number; total: number }>();
  for (const x of r.byDay) {
    const m = months.get(x.date.slice(0, 7)) ?? { games: 0, goods: 0, gamezone: 0, cash: 0, fonepay: 0, total: 0 };
    m.games += x.games; m.goods += x.goods; m.gamezone += x.gamezone; m.cash += x.cash; m.fonepay += x.fonepay; m.total += x.total;
    months.set(x.date.slice(0, 7), m);
  }
  const monthName = (k: string) => new Date(`${k}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const bs = d.totals.bySource;
  const src: [string, { cash: number; fonepay: number }][] = [["Games", bs.games], ["Goods", bs.goods], ["Gamezone", bs.gamezone], ["Tournaments", bs.tournaments ?? { cash: 0, fonepay: 0 }]];
  const incomeRows = src.map(([l, v]) => [l, n(v.cash), n(v.fonepay), n(v.cash + v.fonepay)]);
  incomeRows.push(["TOTAL SALES", n(d.totals.cash), n(d.totals.fonepay), n(d.totals.total)]);
  const goodsSales = d.purchases.customers.flatMap((c) => c.sales);
  const discounts = d.games.items.reduce((t, g) => t + (g.discount || 0), 0);
  const unpaidGames = d.games.items.filter((g) => !g.paid);
  const creditGoods = goodsSales.filter((x) => x.credit);
  const daySum = r.byDay.reduce((t, x) => t + x.total, 0);
  const check = (ok: boolean, diff: number) => (ok ? "Agrees" : `Differs by ${rs(Math.abs(diff))}`);
  const receivables = unpaidGames.reduce((t, g) => t + g.rate, 0) + creditGoods.reduce((t, g) => t + g.amount, 0);

  return {
    purpose: "FINANCIAL REPORT", title: "Financial Activity Report", subtitle: `Statement of receipts for the period ${period(r)}`, ref: code ?? undefined,
    rows: [{ label: "Reporting entity", value: "Unique Futsal" }, { label: "Reporting period", value: period(r) }, { label: "Currency", value: "Nepalese Rupees (Rs.)" }, ...(pct === null ? [] : [{ label: `Movement against the ${r.days} days before`, value: `${pct >= 0 ? "+" : ""}${pct}%` }])],
    total: { label: "Total receipts from sales", value: rs(r.totals.total) },
    blocks: [
      { heading: "1. Statement of receipts by source and payment method (Rs.)", table: { head: ["Source", "Cash", "Fonepay", "Total"], widths: [22, 22, 24], rows: incomeRows } },
      { heading: "2. Monthly analysis of receipts (Rs.)", table: { head: ["Month", "Games", "Goods", "Gamezone", "Cash", "Fonepay", "Total"], widths: [14, 14, 15, 14, 14, 18], rows: [...months.entries()].map(([k, m]) => [monthName(k), n(m.games), n(m.goods), n(m.gamezone), n(m.cash), n(m.fonepay), n(m.total)]) } },
      { heading: "3. Other income and items excluded from sales", rows: [
        { label: "Memberships received (reported separately)", value: rs(d.memberships.received) },
        { label: "Total receipts including memberships", value: rs(d.totals.total + d.memberships.received) },
        { label: "Discounts allowed on games (promo codes)", value: rs(discounts) },
        { label: `Cancelled games (${r.games.cancelled}) and no-shows (${r.games.noShows})`, value: "Not income" },
      ] },
      { heading: "4. Receivables outstanding", rows: [
        { label: `Games played, not yet paid (${unpaidGames.length})`, value: rs(unpaidGames.reduce((t, g) => t + g.rate, 0)) },
        { label: `Goods sold on credit (${creditGoods.length})`, value: rs(creditGoods.reduce((t, g) => t + g.amount, 0)) },
        { label: "Memberships still to be paid", value: rs(d.memberships.due) },
        { label: "Receivables arising in this period", value: rs(receivables + d.memberships.due) },
      ] },
      sec("5. Schedule of dues outstanding (all periods)", ["Description", "Date", "Amount"], d.dues.items.map((x) => [`${x.kind}: ${x.detail}`, shortDay(x.date), rs(x.amount)]), "No dues outstanding", [{ label: "Total dues outstanding", value: rs(d.dues.amount) }]),
      { heading: "6. Reconciliation of figures", rows: [
        { label: "Monthly analysis agrees to total receipts", value: check(Math.round(daySum) === Math.round(r.totals.total), daySum - r.totals.total) },
        { label: "Statement of receipts agrees to summary", value: check(Math.round(d.totals.total) === Math.round(r.totals.total), d.totals.total - r.totals.total) },
        { label: "Cash plus Fonepay agrees to total receipts", value: check(Math.round(d.totals.cash + d.totals.fonepay) === Math.round(d.totals.total), d.totals.cash + d.totals.fonepay - d.totals.total) },
      ] },
      { heading: "7. Basis of preparation", rows: [
        { label: "Accounting basis", value: "Cash basis (money received)" },
        { label: "Games", value: "Paid games, by game date" },
        { label: "Goods", value: "By sale date; credit sales when paid" },
        { label: "Gamezone", value: "Paid sessions, by session date" },
        { label: "Fonepay", value: "Received in the business Fonepay account" },
        { label: "Time zone", value: "Nepal Time (NPT)" },
        { label: "Source", value: "Unique Futsal booking and payment system records" },
      ] },
      { heading: "8. Statement and sign-off", rows: [
        { label: "Status", value: "Unaudited management report" },
        { label: "Prepared by", value: "______________________" },
        { label: "Reviewed by", value: "______________________" },
        { label: "Authorised signatory", value: "______________________" },
        { label: "Date", value: "______________________" },
      ] },
    ],
    note: `This report is generated from the system records for the period shown. It is a management report and not an audit opinion or tax return; have it reviewed by your registered auditor or tax practitioner before filing. ${verifyNote(code) ?? ""}`.trim(),
  };
}

/** The tournament bill for the host. */
export function tournamentBillPdf(b: Bill, code?: string | null): PdfSpec {
  const goods = b.lines.filter((l) => l.kind === "goods");
  const other = b.lines.filter((l) => l.kind !== "goods");
  const blocks: PdfBlock[] = [
    ...(b.services?.length ? [{ rows: [{ label: "Services included", value: b.services.map(serviceLabel).join(", ") }] }] : []),
    ...((b.clubDiscount ?? 0) > 0 ? [{ rows: [{ label: "Unique Club member discount (10%)", value: `-${rs(b.clubDiscount!)}` }] }] : []),
    ...(goods.length ? [{ heading: "Goods taken", table: { head: ["Item", "Qty", "Amount"], rows: goods.map((l) => [l.label, String(l.quantity), rs(l.amount)]) } }] : []),
    ...(b.serviceLines?.length ? [{ heading: "Additional services", table: { head: ["Service", "Qty", "Amount"], rows: b.serviceLines.map((l) => [l.label, l.id === "mineral_water" ? `${l.quantity} x ${rs(l.unitPrice)}` : "1", rs(l.amount)]) } }] : []),
    ...(other.length ? [{ heading: "Extra charges and discounts", rows: other.map((l) => ({ label: l.label, value: `${l.amount < 0 ? "-" : ""}${rs(Math.abs(l.amount))}` })) }] : []),
    ...(b.payments.length ? [{ heading: "Payments received", table: { head: ["Date", "Paid by", "Amount"], widths: [66, 22], rows: b.payments.map((p) => [new Date(p.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }), [p.cash ? `Cash ${rs(p.cash)}` : "", p.fonepay ? `Fonepay ${rs(p.fonepay)}` : ""].filter(Boolean).join(" + "), rs(p.amount)]) } }] : []),
  ];
  return {
    purpose: b.closedAt ? "FINAL BILL" : "BILL", title: b.name, subtitle: b.closedAt ? "Tournament final bill" : "Tournament bill (not final yet)", ref: code ?? undefined,
    to: b.hostName ? { name: b.hostName, phone: b.hostPhone ?? undefined } : undefined,
    table: { head: ["Court day", "Hours", "Amount"], rows: b.days.map((d) => [`${hostDay(d.date)}, ${hostRange(d)}`, `${d.hours} h`, rs(d.amount)]) },
    blocks,
    total: { label: "Total bill", value: rs(b.total) },
    after: [
      ...(b.total > 0 ? [{ label: `${CHARITY_PERCENT}% Charity Fund`, value: `${charityText(b.total)} (from our profit, not added)` }] : []),
      { label: "Paid so far", value: rs(b.paid) },
      { label: b.due > 0 ? "Balance due" : "Status", value: b.due > 0 ? rs(b.due) : "Paid in full. Thank you!", big: b.due > 0 },
    ],
    stamp: b.due <= 0 && b.total > 0 ? "PAID" : undefined,
    note: verifyNote(code),
  };
}

/** A promo code for customers. */
export function promoPdf(p: PromoInput): PdfSpec {
  return {
    purpose: "PROMO CODE", title: p.title || p.label, subtitle: "A special offer from Unique Futsal.",
    rows: [{ label: "Promo code", value: p.code, big: true }, { label: "You get", value: p.label }],
    stepsTitle: "How to use it", steps: ["Open the Unique Futsal app and start a booking.", "Type the code in the promo box.", ...conditions(p).slice(0, 4)],
    note: "The conditions above apply to this code.",
  };
}

/** A membership renewal reminder for one member. */
export function membershipReminderPdf(m: { name: string | null; phone: string; memberCode: string; endDate: string; expired: boolean }): PdfSpec {
  return {
    purpose: "REMINDER", title: m.expired ? "Your membership has ended" : "Your membership ends soon", subtitle: "Renew to keep your slot.",
    ref: m.memberCode, to: { name: m.name || "Member", phone: m.phone },
    rows: [{ label: "Membership ID", value: m.memberCode }, { label: m.expired ? "Ended on" : "Ends on", value: day(m.endDate.slice(0, 10)), big: true }],
    stepsTitle: "How to renew", steps: ["Reply to the WhatsApp message, or call 9811940018.", "Pay at the venue or by Fonepay.", "Your slot stays reserved once the renewal is done."],
    note: "Thank you for being part of Unique Futsal.",
  };
}

/** A link for tournament hosts or teams (match-day link, registration link) with a QR code. */
export function linkPdf(o: { purpose: string; title: string; subtitle: string; ref: string; labelName: string; name: string; url: string; steps: string[]; qrLabel: string; note: string }): PdfSpec {
  return {
    purpose: o.purpose, title: o.title, subtitle: o.subtitle, ref: o.ref,
    rows: [{ label: o.labelName, value: o.name }, { label: "Link", value: o.url, link: o.url }],
    stepsTitle: "How to use it", steps: o.steps, qr: { data: o.url, label: o.qrLabel }, note: o.note,
  };
}
