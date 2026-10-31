"use client";

import { MapPin } from "lucide-react";
import { withBase } from "@/lib/base";
import { Company, Letter, longDate } from "@/lib/letterhead";

// A look at one letter on the Unique Futsal letter head, as an A4 page. It is measured in widths of the page (cqw) so it keeps its shape
// at any size; the PDF itself is drawn in lib/letterhead.ts. Used by the History popup.
export default function LetterPreview({ company, panNo, website, letter, refNo, footerExtra }: { company: Company | null; panNo: string; website: string; letter: Letter; refNo: string; footerExtra?: string }) {
  const s = letter.sender;
  const from = [s.address, s.phone, s.website, s.regNo && `Registration No: ${s.regNo}`].filter(Boolean);
  return (
    <div className="relative flex aspect-[210/297] w-full flex-col overflow-hidden rounded-lg border border-line bg-white text-slate-900 shadow-sm [container-type:inline-size]">
      <div className="relative h-[19cqw] shrink-0 bg-[#0c0b5d]">
        <div className="absolute inset-x-[6.7cqw] top-[14.3cqw] bottom-0 flex items-center justify-between border-t border-white/25 text-[1.4cqw] text-white">
          {[["T", company?.phone], ["pin", company?.address], ["@", company?.email], ["W", website]].map(([k, v]) => (
            <p key={k} className="flex items-center gap-[0.5cqw] whitespace-nowrap">
              {k === "pin" ? <MapPin className="h-[2cqw] w-[2cqw]" /> : <span className="grid h-[2cqw] w-[2cqw] place-items-center rounded-full bg-white text-[1.1cqw] font-bold text-[#0c0b5d]">{k}</span>}
              {v}
            </p>
          ))}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={withBase("/letterhead-logo-white.png")} alt="Unique Futsal logo" className="absolute left-[6.7cqw] top-[2.4cqw] w-[10.5cqw]" />
        <div className="absolute right-[6.7cqw] top-[7.6cqw] -translate-y-1/2 text-right leading-none">
          <p className="text-[1.3cqw] font-bold tracking-wide text-[#bec8f5]">REGD NO</p>
          <p className="mt-[0.8cqw] text-[2.3cqw] font-bold text-white">{panNo || "-"}</p>
          <p className="mt-[1cqw] text-[1.55cqw] text-[#e1e6ff]">Reference No: {refNo || "-"}</p>
        </div>
        <p className="absolute left-[19.5cqw] top-[7.6cqw] -translate-y-1/2 whitespace-nowrap text-[2.6cqw] font-bold leading-none text-white">{(company?.name ?? "Unique Futsal").toUpperCase()}</p>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={withBase("/letterhead-logo.png")} alt="" aria-hidden className="pointer-events-none absolute left-[23.8cqw] top-[33cqw] w-[52.4cqw] opacity-[0.07]" />
      <div className="relative min-h-0 flex-1 overflow-hidden px-[8.6cqw] pt-[5cqw] text-[1.75cqw] leading-[1.5]">
        <p className="text-right text-[2.1cqw] leading-none text-slate-800">{longDate(letter.date)}</p>
        {(s.name || s.org || s.designation || from.length > 0) && (
          <div className="mt-[5.7cqw] text-[1.45cqw]">
            <p className="text-[1.6cqw]">To,</p>
            {(s.name || s.org) && <p className="text-[2cqw] font-bold text-[#0c0b5d]">{s.name || s.org}</p>}
            {s.designation && <p className="text-slate-500">{s.designation}</p>}
            {s.name && s.org && <p className="font-bold">{s.org}</p>}
            {from.map((l) => <p key={l}>{l}</p>)}
          </div>
        )}
        {letter.subject && <p className="mt-[3cqw] font-bold text-[#0c0b5d]">Subject: {letter.subject}</p>}
        {letter.dear && <p className="mt-[1.5cqw] font-bold">Dear {letter.dear},</p>}
        <p className="mt-[1.5cqw] whitespace-pre-wrap">{letter.body}</p>
        <div className="mt-[3cqw]"><p>Sincerely,</p><div className="mt-[7cqw] w-[26cqw] border-t border-slate-400 pt-[0.8cqw]"><p className="font-bold text-[#0c0b5d]">Authorized Signatory</p><p className="text-[1.5cqw]">{company?.name ?? "Unique Futsal"}</p></div></div>
      </div>
      <div className="flex h-[7.6cqw] shrink-0 items-center justify-center bg-[#0c0b5d] text-[1.75cqw] font-bold text-white">Verify this document at www.uniquefutsal.com{footerExtra ? `   |   ${footerExtra}` : ""}</div>
    </div>
  );
}
