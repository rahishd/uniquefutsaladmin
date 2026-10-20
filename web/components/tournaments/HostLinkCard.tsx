"use client";

import { useState } from "react";
import { Copy, ExternalLink, Link2, RefreshCw, ShieldOff } from "lucide-react";
import { Badge } from "../bookings/Badge";
import { guard } from "@/lib/access";
import { ApiError } from "@/lib/api";
import { copyText } from "@/lib/vip";
import SendPdfButton from "../SendPdfButton";
import { pdfFileName } from "@/lib/branded-pdf";
import { linkPdf } from "@/lib/report-pdfs";
import { HostLink, createHostLink, hostUrl, nepalTime, revokeHostLink } from "@/lib/tournaments";

import { askConfirm } from "@/lib/confirm";
// The private match-day link. Whoever has it can follow every goal and change scores and the tie-sheet of THIS tournament, without
// signing in. Making a new link switches the old one off at once.
export default function HostLinkCard({ tournamentId, name, link, onChanged }: { tournamentId: string; name: string; link: HostLink | null; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const working = !!link && link.active && !link.expired;
  const url = link ? hostUrl(link.token) : "";

  async function run(job: () => Promise<unknown>) {
    if (!guard("tournaments.share")) return;
    setBusy(true); setError("");
    try { await job(); onChanged(); } catch (e) { setError(e instanceof ApiError ? e.message : "Could not do that"); } finally { setBusy(false); }
  }

  return (
    <section aria-label="Host link" className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand/10 text-brand"><Link2 size={18} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Share with the match-day host</h2>
          <p className="text-sm text-muted">A private link, no sign-in needed. The host sees every goal and can add goals, kick off, finish matches and edit the tie-sheet. They never see registrations, contacts or money.</p>
        </div>
        {link && <Badge tone={working ? "bg-brand/15 text-brand" : "bg-red-500/15 text-red-600"}>{working ? "On" : link.expired ? "Expired" : "Off"}</Badge>}
      </div>

      {working && (
        <>
          <div className="flex items-center gap-2 rounded-xl bg-surface-2 p-3">
            <p className="min-w-0 flex-1 break-all font-mono text-xs" aria-label="Host link address">{url}</p>
            <button type="button" onClick={async () => { if (await copyText(url)) { setCopied(true); setTimeout(() => setCopied(false), 1500); } }} className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs font-semibold"><Copy size={13} /> {copied ? "Copied" : "Copy"}</button>
          </div>
          <div className="flex flex-wrap gap-2">
            <SendPdfButton label="Send on WhatsApp (PDF)" build={() => linkPdf({ purpose: "MATCH-DAY LINK", title: `Match-day link for ${name}`, subtitle: "For the tournament host only.", ref: "HOST LINK", labelName: "Tournament", name, url, steps: ["Open the link, or scan the QR code.", "Follow every goal live.", "Update scores and the tie-sheet during the matches."], qrLabel: "Scan to open the match-day page", note: "Anyone with this link can change scores. Send it only to the host." })} filename={pdfFileName("match-day-link", name)} message={`Match-day link for ${name}. The details and a QR code are in the attached PDF.`} className="flex items-center gap-1.5 rounded-full bg-[#25D366] px-4 py-2 text-sm font-semibold text-white" />
            <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold"><ExternalLink size={14} /> Open</a>
          </div>
          <p className="text-xs text-muted">Works until {link!.expiresAt ? nepalTime(link!.expiresAt) : "you switch it off"}. {link!.lastUsedAt ? `Last opened ${nepalTime(link!.lastUsedAt)}.` : "Not opened yet."} Anyone who gets this link can change scores, so send it only to the host.</p>
        </>
      )}

      {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        {!working && <button type="button" disabled={busy} onClick={() => run(() => createHostLink(tournamentId))} className="flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"><Link2 size={15} /> {link ? "Make a new link" : "Create host link"}</button>}
        {working && <button type="button" disabled={busy} onClick={async () => (await askConfirm("Make a new link? The old link stops working at once, so send the new one to the host.")) && run(() => createHostLink(tournamentId))} className="flex items-center gap-1.5 rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold disabled:opacity-60"><RefreshCw size={14} /> Make a new link</button>}
        {working && <button type="button" disabled={busy} onClick={async () => (await askConfirm("Switch the host link off? Whoever has it can no longer open it.")) && run(() => revokeHostLink(tournamentId))} className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-red-600 disabled:opacity-60"><ShieldOff size={14} /> Switch off</button>}
      </div>
    </section>
  );
}
