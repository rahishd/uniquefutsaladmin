"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Download, Loader2, X } from "lucide-react";
import { Badge } from "../bookings/Badge";
import LetterPreview from "./LetterPreview";
import { ApiError } from "@/lib/api";
import { Company, HistoryYear, IssuedLetter, Letter, buildLetter, historyMonth, historySummary, letterFileName, longDate, saveLetter } from "@/lib/letterhead";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const FIRST_YEAR = 2026; // the list of years starts here (and grows by itself each year)
const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");

// History of the letters made: pick a year, then a month, then see who each letter was for and what it was about. Tapping one opens that exact letter.
export default function LetterHistory({ company, panNo, website }: { company: Company | null; panNo: string; website: string }) {
  const [years, setYears] = useState<HistoryYear[] | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [letters, setLetters] = useState<IssuedLetter[] | null>(null);
  const [open, setOpen] = useState<IssuedLetter | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    historySummary().then((y) => { if (live) setYears(y); }).catch((e) => { if (live) setError(msg(e)); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (year === null || month === null) return;
    let live = true;
    historyMonth(year, month)
      .then((l) => { if (live) { setLetters(l); setError(""); } })
      .catch((e) => { if (live) setError(msg(e)); });
    return () => { live = false; };
  }, [year, month]);

  const chosen = years?.find((y) => y.year === year) ?? null;
  // every year from 2026 to this year, whether or not it has letters yet (an earlier year with letters is kept too, so nothing is hidden)
  const first = Math.min(FIRST_YEAR, ...(years ?? []).map((y) => y.year));
  const last = Math.max(new Date().getFullYear(), ...(years ?? []).map((y) => y.year));
  const yearList = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const pickYear = (y: number) => { setYear(y); setMonth(null); setLetters(null); setError(""); };
  const pickMonth = (m: number) => { setMonth(m); setLetters(null); setError(""); };

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-4" aria-label="History">
      <div>
        <h2 className="font-semibold">History</h2>
        <p className="text-xs text-muted">Pick a year, then a month, to see the letters made then. Tap a letter to open it exactly as it was written.</p>
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {years === null && !error && <p className="text-sm text-muted">Loading…</p>}
      {years && years.length === 0 && <p className="rounded-xl bg-surface-2 px-3 py-6 text-center text-sm text-muted">No letters made yet. Letters you make will be listed here by year and month.</p>}

      {years && years.length > 0 && (
        <>
          <label className="block max-w-xs text-xs font-semibold uppercase tracking-wide text-muted">Year
            <select value={year ?? ""} onChange={(e) => { const v = Number(e.target.value); if (v) pickYear(v); else { setYear(null); setMonth(null); setLetters(null); } }}
              className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-foreground outline-none focus:border-brand">
              <option value="">Select year</option>
              {yearList.map((y) => {
                const n = years.find((x) => x.year === y)?.total ?? 0;
                return <option key={y} value={y}>{y}{n > 0 ? ` (${n} ${n === 1 ? "letter" : "letters"})` : ""}</option>;
              })}
            </select>
          </label>

          {chosen && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Month</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="group" aria-label="Month">
                {MONTHS.map((label, i) => {
                  const n = chosen.months[i];
                  const on = month === i + 1;
                  return (
                    <button key={label} type="button" disabled={n === 0} aria-pressed={on} onClick={() => pickMonth(i + 1)}
                      className={`rounded-xl border px-2 py-2.5 text-sm font-semibold ${on ? "border-brand bg-brand text-white" : n === 0 ? "border-line bg-surface-2/50 text-muted/50" : "border-line bg-surface text-foreground hover:bg-surface-2"}`}>
                      {label}{n > 0 && <span className={`ml-1.5 rounded-full px-1.5 text-xs ${on ? "bg-white/25" : "bg-brand/10 text-brand"}`}>{n}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {year !== null && month !== null && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{MONTH_NAMES[month - 1]} {year}{letters ? ` · ${letters.length} ${letters.length === 1 ? "letter" : "letters"}` : ""}</p>
              {letters === null && !error && <p className="text-sm text-muted">Loading…</p>}
              {letters && letters.length === 0 && <p className="rounded-xl bg-surface-2 px-3 py-4 text-center text-sm text-muted">No letters this month.</p>}
              {letters && letters.length > 0 && (
                <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                  {letters.map((l) => (
                    <li key={l.id}>
                      <button type="button" onClick={() => setOpen(l)} className="flex w-full items-center gap-3 bg-surface px-4 py-3 text-left hover:bg-surface-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{l.receiver || "Receiver not noted"}</span>
                          <span className="block truncate text-sm text-muted">Subject: {l.subject}</span>
                          <span className="mt-0.5 block text-xs text-muted">{l.date ? longDate(l.date) : "-"}{l.ref ? ` · Ref ${l.ref}` : ""}</span>
                        </span>
                        {l.revoked && <Badge tone="bg-red-100 text-red-700">Withdrawn</Badge>}
                        <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {open && <LetterPopup l={open} company={company} panNo={panNo} website={website} onClose={() => setOpen(null)} />}
    </section>
  );
}

// one letter, exactly as it was written, on the letter head
function LetterPopup({ l, company, panNo, website, onClose }: { l: IssuedLetter; company: Company | null; panNo: string; website: string; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const letter: Letter | null = l.letter ? { date: l.date, subject: l.subject, dear: l.letter.dear, body: l.letter.body, sender: l.letter.sender } : null;

  async function pdf() {
    if (!company || !letter) return;
    setBusy(true);
    setError("");
    try {
      saveLetter(await buildLetter({ ...company, panNo: panNo.trim(), website: website.trim() }, letter, l.code, l.ref), letterFileName(letter));
    } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-black/50 p-3 sm:p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Letter: ${l.subject}`} onClick={(e) => e.stopPropagation()} className="my-auto w-full max-w-2xl space-y-3 rounded-2xl bg-surface p-4 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 text-sm">
            <p><span className="text-muted">Reference no. </span><span className="font-bold">{l.ref || "-"}</span><span className="ml-3 text-muted">Verification no. </span><span className="font-mono font-bold">{l.code}</span></p>
            <p className="text-xs text-muted">Made by {l.issuedBy ?? "-"} on {new Date(l.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</p>
          </div>
          <div className="flex items-center gap-2">
            {l.revoked ? <Badge tone="bg-red-100 text-red-700">Withdrawn</Badge> : <Badge tone="bg-emerald-100 text-emerald-700">Genuine</Badge>}
            <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full border border-line text-muted"><X size={16} /></button>
          </div>
        </div>

        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {letter ? (
          <LetterPreview company={company} panNo={panNo} website={website} letter={letter} refNo={l.ref} />
        ) : (
          <p className="rounded-xl bg-surface-2 px-3 py-8 text-center text-sm text-muted">The text of this letter was not saved (it was made before letters were kept). Its subject was: {l.subject}</p>
        )}

        <div className="flex justify-end gap-2">
          {letter && (
            <button type="button" onClick={pdf} disabled={busy || !company} className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Download PDF
            </button>
          )}
          <button type="button" onClick={onClose} className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold">Close</button>
        </div>
      </div>
    </div>
  );
}
