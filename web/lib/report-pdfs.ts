// Branded PDF pages for reports, tournament bills, promo codes, membership reminders and links the admin portal sends on WhatsApp.
import { rs } from "@/lib/bookings";
import type { PdfBlock, PdfRow, PdfSpec } from "@/lib/branded-pdf";
import { CHARITY_PERCENT, charityText } from "@/lib/charity";
import type { Report } from "@/lib/inventory";
import { change, periodLabel, shortDay, type Summary } from "@/lib/reports";
import { fmtDay as hostDay, range as hostRange, type Bill } from "@/lib/hosted-tournaments";
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

/** The business report (Reports page). */
export function businessReportPdf(r: Summary, code?: string | null): PdfSpec {
  const pct = change(r.totals.total, r.previous.total);
  return {
    purpose: "BUSINESS REPORT", title: "Business report", subtitle: periodLabel(r), ref: code ?? undefined,
    rows: [{ label: "Fonepay", value: rs(r.totals.fonepay) }, { label: "Cash", value: rs(r.totals.cash) }, ...(pct === null ? [] : [{ label: `Against the ${r.days} days before`, value: `${pct >= 0 ? "+" : ""}${pct}%` }])],
    total: { label: "Total sales", value: rs(r.totals.total) },
    blocks: [
      { heading: "Sales by source", rows: [{ label: "Games", value: rs(r.totals.games) }, { label: "Goods", value: rs(r.totals.goods) }, { label: "Gamezone", value: rs(r.totals.gamezone) }] },
      { heading: "Sales by day", table: { head: ["Day", "Cash", "Fonepay", "Total"], rows: r.byDay.map((d) => [shortDay(d.date), rs(d.cash), rs(d.fonepay), rs(d.total)]) } },
      { heading: "Games", rows: [
        { label: "Played or booked", value: String(r.games.count) }, { label: "Paid", value: String(r.games.paid) }, { label: `Unpaid (${rs(r.games.unpaidAmount)})`, value: String(r.games.unpaid) },
        { label: "Average rate", value: rs(r.games.averageRate) }, { label: "Cancelled", value: String(r.games.cancelled) }, { label: "No-shows", value: String(r.games.noShows) },
        { label: "Booked: app / staff / challenges", value: `${r.games.source.app} / ${r.games.source.staff} / ${r.games.source.challenge}` },
      ] },
      ...(r.occupancy.peakHours.length ? [{ heading: "Busiest hours", table: { head: ["Hour", "Games"], rows: r.occupancy.peakHours.slice(0, 5).map((p) => [hour12(p.hour), String(p.games)]) } }] : []),
      ...(r.promos.length ? [{ heading: "Promo codes", table: { head: ["Code", "Uses", "Discount"], rows: r.promos.map((p) => [p.code, String(p.uses), rs(p.discount)]) } }] : []),
      ...(r.topCustomers.length ? [{ heading: "Top customers", table: { head: ["Customer", "Games", "Spent"], rows: r.topCustomers.slice(0, 8).map((c) => [c.name, String(c.games), rs(c.spent)]) } }] : []),
      { heading: "Members", rows: [{ label: "Active", value: String(r.memberships.active) }, { label: "Expiring soon", value: String(r.memberships.expiringSoon) }, { label: "Waiting for payment", value: String(r.memberships.waitingForPayment) }] },
    ],
    note: verifyNote(code),
  };
}

/** The tournament bill for the host. */
export function tournamentBillPdf(b: Bill, code?: string | null): PdfSpec {
  const goods = b.lines.filter((l) => l.kind === "goods");
  const other = b.lines.filter((l) => l.kind !== "goods");
  const blocks: PdfBlock[] = [
    ...((b.clubDiscount ?? 0) > 0 ? [{ rows: [{ label: "Unique Club member discount (10%)", value: `-${rs(b.clubDiscount!)}` }] }] : []),
    ...(goods.length ? [{ heading: "Goods taken", table: { head: ["Item", "Qty", "Amount"], rows: goods.map((l) => [l.label, String(l.quantity), rs(l.amount)]) } }] : []),
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
