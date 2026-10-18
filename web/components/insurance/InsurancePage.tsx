"use client";

import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, HeartPulse, Phone, Search, ShieldPlus, Siren, X } from "lucide-react";
import { Badge } from "../bookings/Badge";
import { guard } from "@/lib/access";
import { useHighlight } from "@/lib/highlight";
import { PAGE_SIZE, QUICK_REPLIES, STATUS, ago, photoUrl, claimCounts, listClaims, updateClaim, type Claim, type ICounts, type IList, type IStatus } from "@/lib/insurance";

const TABS: { id: IStatus | ""; label: string; key: keyof ICounts }[] = [
  { id: "submitted", label: "New", key: "submitted" },
  { id: "in_review", label: "In review", key: "in_review" },
  { id: "approved", label: "Approved", key: "approved" },
  { id: "rejected", label: "Rejected", key: "rejected" },
  { id: "closed", label: "Closed", key: "closed" },
  { id: "", label: "All", key: "all" },
];

function Card({ c, onSaved }: { c: Claim; onSaved: () => void }) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [zoom, setZoom] = useState<string | null>(null);
  const st = STATUS[c.status];
  const emergency = c.severity === "emergency";

  async function save(status?: IStatus) {
    if (!guard("insurance.reply")) return;
    setBusy(true);
    setMsg("");
    try {
      await updateClaim(c.id, { ...(status ? { status } : {}), ...(reply.trim() ? { reply: reply.trim() } : {}) });
      setReply("");
      onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li data-hl={`ic-${c.id}`} className={`space-y-3 rounded-2xl bg-surface p-4 shadow-sm ${emergency ? "border-l-4 border-red-500" : c.status === "submitted" ? "border-l-4 border-amber-500" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 font-semibold">
            {emergency ? <Siren size={16} className="text-red-600" /> : <ShieldPlus size={16} className="text-brand" />}
            {c.patientName} <span className="text-xs font-normal text-muted">{emergency ? "Emergency" : "Minor"}</span>
          </p>
          <p className="text-xs text-muted">injury on {c.incidentDate} · filed {ago(c.createdAt)} · <span className="font-mono">{c.code}</span></p>
        </div>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>

      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-xl bg-surface-2 p-3">
          <p className="text-xs font-semibold text-muted">Patient</p>
          <a href={`tel:${c.patientPhone}`} className="flex items-center gap-1 text-brand"><Phone size={12} /> {c.patientPhone}</a>
          {c.emergency
            ? <a href={`tel:${c.emergency.phone}`} className="mt-1 flex items-center gap-1 text-red-600"><HeartPulse size={12} /> {c.emergency.name ?? "Emergency contact"}{c.emergency.relation ? ` (${c.emergency.relation})` : ""} · {c.emergency.phone}</a>
            : <p className="mt-1 text-xs text-muted">No emergency contact saved</p>}
        </div>
        <div className="rounded-xl bg-surface-2 p-3">
          <p className="text-xs font-semibold text-muted">Witness</p>
          <p>{c.witnessName} / <span lang="ne">{c.witnessNameNe}</span></p>
          {c.witnessPhone && <a href={`tel:${c.witnessPhone}`} className="flex items-center gap-1 text-brand"><Phone size={12} /> {c.witnessPhone}</a>}
        </div>
      </div>
      <p className="text-xs text-muted">Filed by <span className="font-semibold text-foreground">{c.filerName || "Customer"}</span> · {c.filerPhone}</p>
      {c.description && <p className="whitespace-pre-line rounded-xl bg-surface-2 p-3 text-sm">{c.description}</p>}

      {c.photos.length > 0 && (
        <div className="flex gap-2">
          {c.photos.map((p, i) => (
            <button key={p} onClick={() => setZoom(photoUrl(p))} aria-label={`Open photo ${i + 1}`} className="h-20 w-20 overflow-hidden rounded-xl bg-surface-2">
              {/* photos come from the customer backend, so next/image is not used */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl(p)} alt={`Claim photo ${i + 1}`} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      {zoom && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="Claim photo" className="max-h-full max-w-full rounded-xl" />
        </div>
      )}

      {c.staffReply && <p className="rounded-xl bg-brand/10 p-3 text-sm"><span className="block text-xs font-semibold text-brand">Your reply</span>{c.staffReply}</p>}

      <div className="space-y-2 border-t border-line pt-3">
        <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} maxLength={1000} placeholder="Reply to the customer (optional)"
          className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
        <div className="flex flex-wrap gap-1.5">
          {QUICK_REPLIES.map((q) => (
            <button key={q} type="button" onClick={() => setReply(q)} className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] text-muted hover:text-foreground">{q.slice(0, 34)}…</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {c.status !== "in_review" && <button disabled={busy} onClick={() => save("in_review")} className="rounded-full bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Start review</button>}
          {c.status !== "approved" && <button disabled={busy} onClick={() => save("approved")} className="flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"><Check size={14} /> Approve</button>}
          {c.status !== "rejected" && <button disabled={busy} onClick={() => save("rejected")} className="flex items-center gap-1 rounded-full border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-600 disabled:opacity-50"><X size={14} /> Reject</button>}
          {c.status !== "closed" && <button disabled={busy} onClick={() => save("closed")} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-50">Close</button>}
          <button disabled={busy || !reply.trim()} onClick={() => save()} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-40">Send reply only</button>
        </div>
        {msg && <p className="text-xs text-red-600" role="alert">{msg}</p>}
      </div>
    </li>
  );
}

export default function InsurancePage() {
  useHighlight();
  const [status, setStatus] = useState<IStatus | "">("submitted");
  const [severity, setSeverity] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [pageNo, setPageNo] = useState(1);
  const [data, setData] = useState<IList | null>(null);
  const [counts, setCounts] = useState<ICounts | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => { setQ(search); setPageNo(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let live = true;
    listClaims({ status, severity, q, page: pageNo })
      .then((d) => { if (live) { setData(d); setError(""); } })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load claims"); });
    claimCounts().then((c) => { if (live) setCounts(c); }).catch(() => {});
    return () => { live = false; };
  }, [status, severity, q, pageNo, tick]);

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const input = "rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Insurance Claims</h1>
        <p className="text-sm text-muted">Injury claims from the app, with photos, the witness and the patient&apos;s emergency contact. Decide or reply and the customer is told in their app.</p>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-surface p-1 shadow-sm" role="tablist" aria-label="Claim status">
        {TABS.map((t) => (
          <button key={t.label} role="tab" aria-selected={status === t.id} onClick={() => { setStatus(t.id); setPageNo(1); setData(null); }}
            className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold ${status === t.id ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}>
            {t.label}{counts ? <span className={`ml-1.5 rounded-full px-1.5 text-xs ${status === t.id ? "bg-white/25" : t.id === "submitted" && counts.submitted > 0 ? "bg-amber-500 text-white" : "bg-surface-2"}`}>{counts[t.key]}</span> : null}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <label className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setData(null); }} placeholder="Search patient, phone, witness or code" className={`${input} w-full pl-10`} />
        </label>
        <select value={severity} onChange={(e) => { setSeverity(e.target.value); setPageNo(1); setData(null); }} aria-label="Injury case" className={`${input} max-w-[9rem]`}>
          <option value="">All cases</option>
          <option value="emergency">Emergency</option>
          <option value="minor">Minor</option>
        </select>
      </div>

      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!data && !error && <p className="py-10 text-center text-sm text-muted">Loading claims…</p>}
      {data && data.items.length === 0 && (
        <div className="grid place-items-center gap-2 rounded-2xl bg-surface py-14 text-center text-muted shadow-sm">
          <ShieldPlus size={32} strokeWidth={1.5} />
          <p>{q || severity || status ? "No claims match." : "No insurance claims yet."}</p>
        </div>
      )}

      <ul className="grid items-start gap-2 xl:grid-cols-2">
        {data?.items.map((c) => <Card key={c.id} c={c} onSaved={() => setTick((t) => t + 1)} />)}
      </ul>

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-2 text-sm">
          <button disabled={pageNo <= 1} onClick={() => { setPageNo(pageNo - 1); setData(null); }} className="flex items-center gap-1 rounded-xl bg-surface px-3 py-2 shadow-sm disabled:opacity-40"><ChevronLeft size={16} /> Previous</button>
          <span className="text-muted">Page {pageNo} of {pages} · {data.total} claims</span>
          <button disabled={pageNo >= pages} onClick={() => { setPageNo(pageNo + 1); setData(null); }} className="flex items-center gap-1 rounded-xl bg-surface px-3 py-2 shadow-sm disabled:opacity-40">Next <ChevronRight size={16} /></button>
        </div>
      )}
    </div>
  );
}
