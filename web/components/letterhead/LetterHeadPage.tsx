"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FilePlus2, Search } from "lucide-react";
import { Badge } from "../bookings/Badge";
import LetterHistory from "./LetterHistory";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { askConfirm } from "@/lib/confirm";
import { Company, IssuedLetter, Letter, buildLetter, getCompany, letterFileName, listLetters, longDate, saveLetter } from "@/lib/letterhead";
import { setRevoked } from "@/lib/verify";

const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");
const field = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";

// Letter Head: the history of the letters made (by year and month), and a search for one letter.
// "Custom Letter Head" opens its own page (/letter-head/new) where a letter is written and shown on the letter head.
export default function LetterHeadPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [busy, setBusy] = useState<"" | "download">("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [letters, setLetters] = useState<IssuedLetter[] | null>(null);
  const [search, setSearch] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    getCompany().then((c) => { if (live) setCompany(c); }).catch((e) => { if (live) setError(msg(e)); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    let live = true;
    if (!search.trim()) return;
    const h = setTimeout(() => {
      listLetters(search.trim()).then((l) => { if (live) setLetters(l); }).catch((e) => { if (live) setError(msg(e)); });
    }, 300);
    return () => { live = false; clearTimeout(h); };
  }, [search, tick]);

  async function reprint(l: IssuedLetter) {
    if (!company || !l.letter) return;
    setBusy("download"); setError(""); setNote("");
    try {
      const lt: Letter = { date: l.date, subject: l.subject, dear: l.letter.dear, body: l.letter.body, sender: l.letter.sender };
      saveLetter(await buildLetter(company, lt, l.code, l.ref), letterFileName(lt));
    } catch (e) { setError(msg(e)); } finally { setBusy(""); }
  }

  async function toggle(l: IssuedLetter) {
    if (!guard("verify.manage")) return;
    if (!l.revoked && !(await askConfirm(`Withdraw letter ${l.ref || l.code}? Its verification number ${l.code} will show as not genuine on the website.`, { confirmLabel: "Withdraw", danger: true }))) return;
    try { await setRevoked(l.id, !l.revoked); setTick((n) => n + 1); } catch (e) { setError(msg(e)); }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Letter Head</h1>
          <p className="text-sm text-muted">Write a letter on the Unique Futsal letter head. Every letter gets its own verification number.</p>
        </div>
        <Link href="/letter-head/new" className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white">
          <FilePlus2 size={16} /> Custom Letter Head
        </Link>
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {note && <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{note}</p>}

      <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Letters made</h2>
            <p className="text-xs text-muted">Every letter gets a reference number (like 2026-123) and a verification number. Search either one.</p>
          </div>
          <label className="relative block w-full sm:w-72">
            <span className="sr-only">Search letters</span>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Reference no., verification no., subject…" className={`${field} pl-9`} />
          </label>
        </div>
        {!search.trim() ? (
          <p className="rounded-xl bg-surface-2 px-3 py-6 text-center text-sm text-muted">Type a reference number or verification number to see that letter.</p>
        ) : letters === null ? <p className="text-sm text-muted">Loading…</p> : letters.length === 0 ? (
          <p className="rounded-xl bg-surface-2 px-3 py-6 text-center text-sm text-muted">No letter matches that.</p>
        ) : (
          <div className="space-y-4">
            {letters.map((l) => <LetterCard key={l.id} l={l} busy={busy === "download"} onPdf={() => reprint(l)} onToggle={() => toggle(l)} />)}
          </div>
        )}
      </section>

      <LetterHistory company={company} panNo={company?.panNo ?? ""} website={company?.website ?? ""} />
    </div>
  );
}

// one letter found by its reference or verification number: its details and its text
function LetterCard({ l, busy, onPdf, onToggle }: { l: IssuedLetter; busy: boolean; onPdf: () => void; onToggle: () => void }) {
  const t = l.letter, r = t?.sender;
  const to = r ? [r.name, r.designation, r.org, r.address, r.phone, r.website, r.regNo && `Registration No: ${r.regNo}`].filter(Boolean) : [];
  return (
    <article className="overflow-hidden rounded-2xl border border-line">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0c0b5d] px-4 py-3 text-white">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <p><span className="text-xs text-white/70">Reference no. </span><span className="font-bold">{l.ref || "-"}</span></p>
          <p><span className="text-xs text-white/70">Verification no. </span><span className="font-mono font-bold">{l.code}</span></p>
        </div>
        {l.revoked ? <Badge tone="bg-red-100 text-red-700">Withdrawn</Badge> : <Badge tone="bg-emerald-100 text-emerald-700">Genuine</Badge>}
      </div>
      <div className="grid gap-4 p-4 md:grid-cols-[14rem_1fr]">
        <dl className="space-y-2 text-sm">
          <div><dt className="text-xs text-muted">Letter date</dt><dd>{l.date ? longDate(l.date) : "-"}</dd></div>
          <div><dt className="text-xs text-muted">Made by</dt><dd>{l.issuedBy ?? "-"}</dd></div>
          <div><dt className="text-xs text-muted">Made on</dt><dd>{new Date(l.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</dd></div>
          <div className="flex flex-wrap gap-2 pt-1">
            {t && <button type="button" disabled={busy} onClick={onPdf} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Download PDF</button>}
            <button type="button" onClick={onToggle} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold">{l.revoked ? "Restore" : "Withdraw"}</button>
          </div>
        </dl>
        <div className="rounded-xl bg-surface-2 p-4 text-sm leading-relaxed">
          {to.length > 0 && <div className="mb-3"><p>To,</p>{to.map((x, i) => <p key={x} className={i === 0 ? "font-bold text-[#0c0b5d]" : "text-muted"}>{x}</p>)}</div>}
          <p className="font-bold text-[#0c0b5d]">Subject: {l.subject}</p>
          {t ? (
            <>
              {t.dear && <p className="mt-2 font-semibold">Dear {t.dear},</p>}
              <p className="mt-2 whitespace-pre-wrap">{t.body}</p>
              <p className="mt-3 font-semibold text-[#0c0b5d]">Authorized Signatory</p>
            </>
          ) : <p className="mt-2 text-muted">The text of this letter was not saved (it was made before letters were kept).</p>}
        </div>
      </div>
    </article>
  );
}
