"use client";

import { useEffect, useState } from "react";
import { Phone, X } from "lucide-react";
import { Badge } from "../bookings/Badge";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { CStatus, Complaint, QUICK_REPLIES, STATUS, ago, getComplaint, photoUrl, updateComplaint } from "@/lib/complaints";

const ORDER: CStatus[] = ["open", "in_review", "resolved", "closed"];

export default function ComplaintSheet({ complaint, onClose, onSaved }: { complaint: Complaint; onClose: () => void; onSaved: () => void }) {
  const [c, setC] = useState<Complaint>(complaint);
  const [status, setStatus] = useState<CStatus>(complaint.status);
  const [reply, setReply] = useState(complaint.staffReply ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [zoom, setZoom] = useState<string | null>(null);
  const editable = true;

  useEffect(() => {
    let live = true;
    getComplaint(complaint.id).then((d) => live && setC(d)).catch(() => {});
    return () => { live = false; };
  }, [complaint.id]);

  const changed = status !== c.status || (reply.trim() !== (c.staffReply ?? "") && reply.trim() !== "");

  async function save() {
    if (!guard("complaints.reply")) return;
    setBusy(true);
    setError("");
    setNote("");
    try {
      const body: { status?: CStatus; reply?: string } = {};
      if (status !== c.status) body.status = status;
      if (reply.trim() && reply.trim() !== (c.staffReply ?? "")) body.reply = reply.trim();
      const saved = await updateComplaint(c.id, body);
      setC((x) => ({ ...x, ...saved }));
      setNote("Saved. The customer has been notified.");
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const st = STATUS[c.status];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label="Complaint" onClick={(e) => e.stopPropagation()} className="max-h-[94vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-sm text-muted">{c.code}</p>
            <h2 className="text-lg font-bold">{c.categoryLabel}</h2>
            <p className="text-xs text-muted">{ago(c.createdAt)}{c.bookingCode ? ` · booking ${c.bookingCode}` : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={st.tone}>{st.label}</Badge>
            <button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-surface-2"><X size={22} /></button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 p-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">{c.customerName || "Customer"}</p>
            <p className="text-xs text-muted">{c.customerPhone}{c.customerComplaints && c.customerComplaints > 1 ? ` · ${c.customerComplaints} complaints in total` : ""}</p>
          </div>
          <a href={`tel:${c.customerPhone}`} className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-3 py-2 text-xs font-semibold text-white"><Phone size={14} /> Call</a>
        </div>

        <p className="whitespace-pre-line rounded-xl border border-line p-3 text-sm">{c.message}</p>

        {c.photos.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-semibold">Photos ({c.photos.length})</p>
            <div className="grid grid-cols-3 gap-2">
              {c.photos.map((p, i) => (
                <button key={p} onClick={() => setZoom(photoUrl(p))} aria-label={`Open photo ${i + 1}`} className="aspect-square overflow-hidden rounded-xl bg-surface-2">
                  {/* photos come from the customer backend, so next/image is not used */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoUrl(p)} alt={`Complaint photo ${i + 1}`} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}

        {editable ? (
          <div className="space-y-3 border-t border-line pt-4">
            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold">Status</legend>
              <div className="grid grid-cols-4 gap-1 rounded-xl bg-surface-2 p-1">
                {ORDER.map((s) => (
                  <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}
                    className={`rounded-lg px-1 py-2 text-xs font-semibold ${status === s ? "bg-brand text-white" : "text-muted"}`}>{STATUS[s].label}</button>
                ))}
              </div>
            </fieldset>

            <label className="block text-sm font-semibold">Reply to the customer
              <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={4} maxLength={1000} placeholder="Write what you did or what happens next. The customer sees this in the app."
                className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm font-normal outline-none focus:border-brand" />
            </label>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_REPLIES.map((q) => (
                <button key={q} type="button" onClick={() => setReply(q)} className="rounded-full bg-surface-2 px-3 py-1.5 text-left text-xs text-muted hover:bg-brand/10">{q.length > 42 ? q.slice(0, 40) + "…" : q}</button>
              ))}
            </div>

            {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
            {note && <p className="rounded-xl bg-brand/10 p-3 text-sm text-brand" role="status">{note}</p>}
            <button disabled={busy || !changed} onClick={save} className="w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save and notify customer"}</button>
          </div>
        ) : (
          c.staffReply && <p className="rounded-xl bg-brand/10 p-3 text-sm"><span className="block text-xs font-semibold text-brand">Reply sent</span>{c.staffReply}</p>
        )}
      </div>

      {zoom && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4" onClick={(e) => { e.stopPropagation(); setZoom(null); }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="Complaint photo, large" className="max-h-full max-w-full rounded-xl object-contain" />
          <button aria-label="Close photo" className="absolute right-4 top-4 rounded-full bg-white/20 p-2 text-white"><X size={22} /></button>
        </div>
      )}
    </div>
  );
}
