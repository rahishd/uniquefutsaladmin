"use client";

import { useCallback, useEffect, useState } from "react";
import SendPdfButton from "../SendPdfButton";
import { pdfFileName } from "@/lib/branded-pdf";
import { linkPdf } from "@/lib/report-pdfs";
import { Check, Copy, MessageCircle, ExternalLink, Phone, UserPlus, X } from "lucide-react";
import { Badge } from "../bookings/Badge";
import { guard } from "@/lib/access";
import { ApiError } from "@/lib/api";
import { copyText } from "@/lib/vip";
import { RegStatus, TeamRegistration, listRegistrations, registrationUrl, setEntryFee, setRegistration } from "@/lib/tournaments";

import { askConfirm } from "@/lib/confirm";
const TONE: Record<RegStatus, string> = { pending: "bg-amber-500/15 text-amber-600", approved: "bg-brand/15 text-brand", rejected: "bg-slate-500/15 text-slate-500" };
const LABEL: Record<RegStatus, string> = { pending: "Waiting", approved: "Confirmed", rejected: "Rejected" };
const waNumber = (p: string) => (p.length === 10 ? `977${p}` : p);

// The registration link of this tournament (to send to teams) and the teams that signed up through it.
export default function RegistrationsCard({ tournamentId, name, finished, entryFee, onFeeSaved }: { tournamentId: string; name: string; finished: boolean; entryFee: number; onFeeSaved: () => void }) {
  const [fee, setFee] = useState<string | null>(null); // null = showing the saved fee, not being edited
  const [feeBusy, setFeeBusy] = useState(false);
  const [feeNote, setFeeNote] = useState("");
  const [data, setData] = useState<{ maxTeams: number; items: TeamRegistration[] } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState(false);
  const url = registrationUrl(tournamentId);

  const load = useCallback(() => {
    listRegistrations(tournamentId).then((d) => { setData(d); setError(""); }).catch((e) => setError(e instanceof ApiError ? e.message : "Could not load the teams"));
  }, [tournamentId]);
  useEffect(() => { load(); }, [load]);

  async function decide(r: TeamRegistration, status: RegStatus) {
    if (!guard("tournaments.registrations")) return;
    if (status === "rejected" && !(await askConfirm(`Reject ${r.teamName}? Their place is freed and they are told.`))) return;
    setBusy(r.id); setError("");
    try { await setRegistration(tournamentId, r.id, status); load(); } catch (e) { setError(e instanceof ApiError ? e.message : "Could not save"); } finally { setBusy(""); }
  }

  async function saveFee() {
    if (fee === null || !guard("tournaments.edit")) return;
    const n = Number(fee);
    if (!Number.isInteger(n) || n < 0) { setError("Enter the fee in whole rupees (0 for free entry)."); return; }
    setFeeBusy(true); setError(""); setFeeNote("");
    try { await setEntryFee(tournamentId, n); setFee(null); setFeeNote(n === 0 ? "Entry is free. Customers see that." : `Entry fee saved: Rs. ${n.toLocaleString("en-IN")} per team.`); onFeeSaved(); } catch (e) { setError(e instanceof ApiError ? e.message : "Could not save the fee"); } finally { setFeeBusy(false); }
  }

  const taken = data ? data.items.filter((r) => r.status !== "rejected").length : 0;
  const waiting = data ? data.items.filter((r) => r.status === "pending").length : 0;

  return (
    <section aria-label="Team registrations" className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand/10 text-brand"><UserPlus size={18} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Team registrations</h2>
          <p className="text-sm text-muted">Send this link to teams. They fill in the team name, captain and mobile number, with no sign-in needed. The whole team is registered, so no player list is asked for. {finished ? "This tournament has finished, so the link now says registration is closed." : "Each team arrives here as Waiting for you to confirm."}</p>
        </div>
        {data && <Badge tone="bg-surface-2 text-foreground">{taken}{data.maxTeams > 0 ? ` / ${data.maxTeams}` : ""} teams</Badge>}
      </div>

      <div className="space-y-2 rounded-xl border border-line p-3">
        <label className="block text-sm font-semibold" htmlFor="entry-fee">Entry fee per team <span className="font-normal text-muted">(customers see this; 0 = free entry)</span></label>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">Rs.</span>
          <input
            id="entry-fee"
            inputMode="numeric"
            value={fee ?? String(entryFee)}
            onChange={(e) => setFee(e.target.value.replace(/\D/g, "").slice(0, 7))}
            className="w-32 rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <button type="button" onClick={saveFee} disabled={feeBusy || fee === null || fee === String(entryFee)} className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{feeBusy ? "Saving…" : "Save fee"}</button>
          {fee !== null && fee !== String(entryFee) && <button type="button" onClick={() => setFee(null)} className="text-sm font-semibold text-muted">Cancel</button>}
        </div>
        {feeNote && <p role="status" className="text-xs font-medium text-brand">{feeNote}</p>}
      </div>

      <div className="flex items-center gap-2 rounded-xl bg-surface-2 p-3">
        <p className="min-w-0 flex-1 break-all font-mono text-xs" aria-label="Registration link address">{url}</p>
        <button type="button" onClick={async () => { if (await copyText(url)) { setCopied(true); setTimeout(() => setCopied(false), 1500); } }} className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs font-semibold">
          {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <SendPdfButton label="Send on WhatsApp (PDF)" build={() => linkPdf({ purpose: "TOURNAMENT", title: `Register your team for ${name}`, subtitle: "Open the link or scan the code to register.", ref: "TEAM REGISTRATION", labelName: "Tournament", name, url, steps: ["Open the link, or scan the QR code with your phone.", "Enter your team name and the captain details.", "Submit the form. The Unique Futsal team will confirm."], qrLabel: "Scan to register your team", note: "Questions? Call Unique Futsal on 9811940018." })} filename={pdfFileName("tournament", name)} message={`Register your team for ${name} at Unique Futsal. The details and a QR code are in the attached PDF.`} className="flex items-center gap-1.5 rounded-full bg-[#25D366] px-4 py-2 text-sm font-semibold text-white" />
        <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold"><ExternalLink size={14} /> Open the page</a>
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
      {!data && !error && <p className="py-4 text-center text-sm text-muted">Loading teams…</p>}
      {data && data.items.length === 0 && <p className="rounded-xl bg-surface-2 p-4 text-center text-sm text-muted">No team has registered yet.</p>}
      {waiting > 0 && <p className="text-sm font-semibold text-amber-600">{waiting} team{waiting === 1 ? " is" : "s are"} waiting for you.</p>}

      <ul className="space-y-2">
        {data?.items.map((r) => (
          <li key={r.id} className="rounded-xl border border-line p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold">{r.teamName}</p>
                <p className="text-xs text-muted">Captain {r.captainName}{r.players.length > 0 ? ` · ${r.players.length} players` : ""}</p>
              </div>
              <Badge tone={TONE[r.status]}>{LABEL[r.status]}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <a href={`tel:${r.contactPhone}`} className="flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5 font-semibold"><Phone size={12} /> {r.contactPhone}</a>
              <a href={`https://wa.me/${waNumber(r.contactPhone)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5 font-semibold"><MessageCircle size={12} /> WhatsApp</a>
              {r.contactEmail && <span className="text-muted">{r.contactEmail}</span>}
            </div>
            {r.players.length > 0 && (
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-xs font-semibold text-muted">Players</summary>
                <ol className="mt-1 list-decimal space-y-0.5 pl-5">{r.players.map((p, i) => <li key={i}>{p}</li>)}</ol>
              </details>
            )}
            <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
              {r.status !== "approved" && <button type="button" disabled={busy === r.id} onClick={() => decide(r, "approved")} className="flex items-center gap-1.5 rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60"><Check size={14} /> Confirm</button>}
              {r.status !== "rejected" && <button type="button" disabled={busy === r.id} onClick={() => decide(r, "rejected")} className="flex items-center gap-1.5 rounded-full border border-red-500/40 px-4 py-1.5 text-sm font-semibold text-red-600 disabled:opacity-60"><X size={14} /> Reject</button>}
              {r.status === "rejected" && <button type="button" disabled={busy === r.id} onClick={() => decide(r, "pending")} className="rounded-full bg-surface-2 px-4 py-1.5 text-sm font-semibold disabled:opacity-60">Put back to waiting</button>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
