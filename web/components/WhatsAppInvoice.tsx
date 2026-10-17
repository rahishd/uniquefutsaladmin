"use client";

import { MessageCircle } from "lucide-react";
import { rs } from "@/lib/bookings";
import { CHARITY_PERCENT, charityOf, charityText } from "@/lib/charity";

export type InvoiceLine = { label: string; quantity?: number; amount: number; clubDiscount?: number };

// Opens WhatsApp (app or web) with the invoice typed out, addressed to the customer's number. Staff press Send there.
export function invoiceText(i: { code: string | null; name?: string | null; lines: InvoiceLine[]; total: number; paidBy?: string; points?: number; verifyCode?: string | null }): string {
  const day = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const out = [`*Unique Futsal: Invoice${i.code ? ` ${i.code}` : ""}*`, day, i.name ? `Customer: ${i.name}` : "", ""];
  let club = 0;
  for (const l of i.lines) {
    out.push(`${l.quantity && l.quantity > 1 ? `${l.quantity} x ` : ""}${l.label}: ${rs(l.amount)}${l.clubDiscount ? ` (after Unique Club discount -${rs(l.clubDiscount)})` : ""}`);
    club += l.clubDiscount ?? 0;
  }
  if (club > 0) out.push("", `Unique Club member discount (10%): -${rs(club)} (already taken off)`);
  out.push("", `*Total paid: ${rs(i.total)}*`);
  if (charityOf(i.total) > 0) out.push(`${CHARITY_PERCENT}% Charity Fund: ${charityText(i.total)} (from our profit, not added to your bill)`);
  if (i.paidBy) out.push(`Paid by: ${i.paidBy}`);
  if (i.points) out.push(`Loyalty points added: ${i.points}`);
  if (i.verifyCode) out.push("", `Verification code: *${i.verifyCode}*`, "To check this bill is genuine, open Verify Documents in the Unique Futsal app and type this code.");
  out.push("", "Thank you for playing with us!");
  return out.filter((x, k, a) => x !== "" || a[k - 1] !== "").join("\n");
}

export default function WhatsAppInvoice({ phone, ...invoice }: { phone?: string | null } & Parameters<typeof invoiceText>[0]) {
  const digits = (phone ?? "").replace(/\D/g, "");
  const to = digits.length === 10 ? `977${digits}` : digits; // Nepal numbers are saved without the country code
  const href = `https://wa.me/${to}?text=${encodeURIComponent(invoiceText(invoice))}`;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] px-6 py-2.5 text-sm font-semibold text-white">
      <MessageCircle size={16} /> Send invoice on WhatsApp
    </a>
  );
}
