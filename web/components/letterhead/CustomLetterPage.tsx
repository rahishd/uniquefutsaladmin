"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Loader2, MessageCircle } from "lucide-react";
import LetterPreview from "./LetterPreview";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { pdfSafe } from "@/lib/branded-pdf";
import { Company, Letter, MAX_WORDS, Sender, buildLetter, countWords, getCompany, issueLetter, letterFileName, letterMessage, limitWords, saveLetter, sendLetterToWhatsApp } from "@/lib/letterhead";
import { nepalToday } from "@/lib/reports";

const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");
const field = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const NO_SENDER: Sender = { org: "", regNo: "", phone: "", address: "", website: "", name: "", designation: "" };

const SENDER_FIELDS: { key: keyof Sender; label: string; wide?: boolean }[] = [
  { key: "org", label: "Organization name", wide: true }, { key: "regNo", label: "Registration no." }, { key: "phone", label: "Office contact no." },
  { key: "address", label: "Address", wide: true }, { key: "website", label: "Website", wide: true }, { key: "name", label: "Their name" }, { key: "designation", label: "Designation" },
];

// Custom Letter Head: its own page. The form to write a letter is on the left and the letter on the Unique Futsal letter head, as it will print, is on the right.
// A verification number is issued once per letter: downloading and then sending the same text prints the same number.
export default function CustomLetterPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [letter, setLetter] = useState<Letter>({ date: nepalToday(), subject: "", dear: "", body: "", sender: NO_SENDER });
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState<"" | "download" | "whatsapp">("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const issued = useRef<{ key: string; code: string; ref: string } | null>(null);

  useEffect(() => {
    let live = true;
    getCompany().then((c) => { if (live) setCompany(c); }).catch((e) => { if (live) setError(msg(e)); });
    return () => { live = false; };
  }, []);

  // the company as it prints: the venue details from Settings and the Regd no. and website kept with the letter head
  const printed = company;

  const set = (patch: Partial<Letter>) => setLetter((l) => ({ ...l, ...patch }));
  const setSender = (key: keyof Sender, value: string) => setLetter((l) => ({ ...l, sender: { ...l.sender, [key]: value } }));
  const words = countWords(letter.body);
  const ready = !!printed && letter.subject.trim().length >= 3 && letter.body.trim().length > 0 && words <= MAX_WORDS;
  // the PDF fonts have Latin letters only (lib/branded-pdf.ts pdfSafe removes the rest), so warn before Nepali text goes missing
  const lost = [letter.subject, letter.dear, letter.body, ...Object.values(letter.sender)].some((s) => pdfSafe(s) !== s.replace(/[‘’“”–—…×•₹]/g, ""));

  async function make(how: "download" | "whatsapp") {
    if (!guard("letterhead.make") || busy || !printed || !ready) return;
    setBusy(how); setError(""); setNote("");
    try {
      const key = JSON.stringify(letter);
      let rec = issued.current?.key === key ? issued.current : null;
      if (!rec) {
        const r = letter.sender;
        // what the public Verify Documents page shows under the letter: only who it is for (no phone, address or registration number)
        const who = [r.name, r.designation, r.org].map((l) => l.trim()).filter(Boolean).join(", ");
        const details = who ? `Receiver: ${who}` : "";
        const made = await issueLetter({ subject: letter.subject.trim().slice(0, 100), receiver: (r.name || r.org).trim(), details, date: letter.date, letter: { dear: letter.dear, body: letter.body, sender: letter.sender } });
        rec = { key, ...made };
        issued.current = rec;
      }
      const { code, ref } = rec;
      const blob = await buildLetter(printed, letter, code, ref);
      const filename = letterFileName(letter);
      if (how === "download") { saveLetter(blob, filename); setNote(`PDF saved. Reference No ${ref}, verification number ${code}.`); }
      else setNote(await sendLetterToWhatsApp(blob, { filename, message: letterMessage(letter, code, ref), phone }));
    } catch (e) { setError(msg(e)); } finally { setBusy(""); }
  }

  return (
    <div className="space-y-5">
      <div>
        <Link href="/letter-head" className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brand"><ArrowLeft size={16} /> Letter Head</Link>
        <h1 className="text-2xl font-bold">Custom Letter Head</h1>
        <p className="text-sm text-muted">Write a letter on the Unique Futsal letter head. Every letter gets its own verification number.</p>
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {note && <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{note}</p>}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-5">
        <section className="space-y-4 rounded-2xl border border-line bg-surface p-4">
          <h2 className="font-semibold">Write the letter</h2>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px]">
            <label className="text-sm font-medium">Subject<input value={letter.subject} onChange={(e) => set({ subject: e.target.value })} maxLength={200} className={`${field} mt-1`} /></label>
            <label className="text-sm font-medium">Date<input type="date" value={letter.date} onChange={(e) => set({ date: e.target.value || nepalToday() })} className={`${field} mt-1`} /></label>
          </div>
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">Receiver</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {SENDER_FIELDS.map((f) => (
                <label key={f.key} className={`text-sm font-medium ${f.wide ? "sm:col-span-2" : ""}`}>{f.label}<input value={letter.sender[f.key]} onChange={(e) => setSender(f.key, e.target.value)} maxLength={120} className={`${field} mt-1`} /></label>
              ))}
            </div>
          </fieldset>
          <label className="block text-sm font-medium">Dear<input value={letter.dear} onChange={(e) => set({ dear: e.target.value })} maxLength={120} placeholder="Name of the person (optional)" className={`${field} mt-1`} /></label>
          <label className="block text-sm font-medium">Letter<textarea value={letter.body} onChange={(e) => set({ body: limitWords(e.target.value) })} rows={9} className={`${field} mt-1`} />
            <span className={`mt-1 block text-right text-xs ${words >= MAX_WORDS ? "font-semibold text-amber-700" : "text-muted"}`}>{words} / {MAX_WORDS} words{words >= MAX_WORDS ? " (the limit)" : ""}</span>
          </label>
          {lost && <p className="text-xs font-medium text-amber-700">Nepali letters cannot be printed in the PDF and will be left out. Please write in English.</p>}
          <label className="block text-sm font-medium">WhatsApp number (optional)<input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={20} placeholder="98XXXXXXXX" className={`${field} mt-1`} /></label>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => make("whatsapp")} disabled={!ready || !!busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {busy === "whatsapp" ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />} Send to WhatsApp
            </button>
            <button type="button" onClick={() => make("download")} disabled={!ready || !!busy} className="inline-flex items-center justify-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold disabled:opacity-50">
              {busy === "download" ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Download PDF
            </button>
          </div>
          {!ready && <p className="text-xs text-muted">Write the subject and the letter to continue.</p>}
        </section>
        </div>

        {/* a look at the page; the PDF itself is drawn in lib/letterhead.ts */}
        <LetterPreview company={company} panNo={company?.panNo ?? ""} website={company?.website ?? ""} letter={letter} refNo={`${letter.date.slice(0, 4)}-###`} footerExtra="Verification No: added to the PDF" />
      </div>
    </div>
  );
}
