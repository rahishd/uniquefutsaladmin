"use client";

import SendPdfButton from "@/components/SendPdfButton";
import { pdfFileName, type PdfSpec } from "@/lib/branded-pdf";
import { rs } from "@/lib/bookings";
import { CHARITY_PERCENT, charityOf, charityText } from "@/lib/charity";

export type InvoiceLine = { label: string; quantity?: number; amount: number; clubDiscount?: number };
type Invoice = { code: string | null; name?: string | null; lines: InvoiceLine[]; total: number; paidBy?: string; points?: number; verifyCode?: string | null };

// The invoice as a branded Unique Futsal PDF (a receipt page with the logo, the lines, the total and a PAID stamp).
export function invoicePdf(i: Invoice & { phone?: string | null }): PdfSpec {
  const club = i.lines.reduce((n, l) => n + (l.clubDiscount ?? 0), 0);
  const after = [
    ...(club > 0 ? [{ label: "Unique Club member discount (10%)", value: `${rs(club)} already taken off` }] : []),
    ...(i.paidBy ? [{ label: "Paid by", value: i.paidBy }] : []),
    ...(i.points ? [{ label: "Loyalty points added", value: `${i.points} points` }] : []),
    ...(charityOf(i.total) > 0 ? [{ label: `${CHARITY_PERCENT}% Charity Fund`, value: `${charityText(i.total)} (from our profit, not added to your bill)` }] : []),
  ];
  return {
    purpose: "INVOICE", title: "Payment receipt", subtitle: "Thank you for playing with us.",
    ref: i.code ? `INV-${i.code}` : undefined,
    to: { name: i.name || "Customer", phone: i.phone ?? undefined },
    table: { head: ["Item", "Qty", "Amount"], rows: i.lines.map((l) => [l.label, l.quantity && l.quantity > 1 ? String(l.quantity) : "1", rs(l.amount)]) },
    total: { label: "Total paid", value: rs(i.total) },
    after, stamp: "PAID",
    note: i.verifyCode
      ? `Verification number ${i.verifyCode}. To check that this bill is genuine, open Verify Documents in the Unique Futsal app and type this number.`
      : "Keep this PDF as your receipt.",
  };
}

// Sends the invoice to the customer's WhatsApp as a PDF: the phone's share sheet, or on a computer a download plus the chat opened with a note.
export default function WhatsAppInvoice({ phone, ...invoice }: { phone?: string | null } & Invoice) {
  return (
    <SendPdfButton
      label="Send invoice on WhatsApp (PDF)"
      build={() => invoicePdf({ ...invoice, phone })}
      filename={pdfFileName("invoice", invoice.code)}
      phone={phone}
      message={`Unique Futsal invoice${invoice.code ? ` ${invoice.code}` : ""}: ${rs(invoice.total)} paid. The invoice is in the attached PDF.`}
      className="inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] px-6 py-2.5 text-sm font-semibold text-white"
    />
  );
}
