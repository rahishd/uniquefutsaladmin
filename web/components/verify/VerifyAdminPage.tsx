"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, FileText, ImagePlus, Loader2, Plus, Search, ShieldCheck, ShieldOff, X } from "lucide-react";
import { Badge } from "../bookings/Badge";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { askConfirm } from "@/lib/confirm";
import { shrink } from "@/lib/content";
import { photoUrl } from "@/lib/complaints";
import { ORGS, Lookup, OrgType, VerifyBill, VerifyDoc, createDocument, listVerify, lookupCode, setRevoked } from "@/lib/verify";

const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");
const field = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const rs = (n: number | null) => (n === null ? "" : `Rs. ${n.toLocaleString("en-IN")}`);
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const MAX_PHOTOS = 6;

const SOURCE: Record<string, string> = { checkout: "Final bill", booking: "Court booking", gamezone: "Gamezone" };

// Verify Document: the codes that prove a bill or document is genuine. The customer site checks a code (Quick Access >
// Verify Documents). Here staff make a code for a document they give to a school, bank or college, look a code up, and
// withdraw one. Every bill gets its code automatically; the codes of recent bills are listed below.
export default function VerifyAdminPage() {
  const [docs, setDocs] = useState<VerifyDoc[] | null>(null);
  const [bills, setBills] = useState<VerifyBill[]>([]);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [tick, setTick] = useState(0);

  // lookup
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Lookup | null>(null);
  const [looking, setLooking] = useState(false);

  // new document
  const [title, setTitle] = useState("");
  const [issuedTo, setIssuedTo] = useState("");
  const [orgType, setOrgType] = useState<OrgType>("school");
  const [details, setDetails] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [made, setMade] = useState<VerifyDoc | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    listVerify().then((d) => { if (live) { setDocs(d.documents); setBills(d.bills); setError(""); } }).catch((e) => { if (live) setError(msg(e)); });
    return () => { live = false; };
  }, [tick]);

  async function look(e: React.FormEvent) {
    e.preventDefault();
    if (q.length < 4 || looking) return;
    setLooking(true);
    setFound(null);
    try { setFound(await lookupCode(q)); } catch (err) { setError(msg(err)); } finally { setLooking(false); }
  }

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    setError("");
    try {
      const next = [...photos];
      for (const f of Array.from(files)) {
        if (next.length >= MAX_PHOTOS) break;
        next.push(await shrink(f));
      }
      setPhotos(next);
    } catch (err) { setError(msg(err)); }
    if (picker.current) picker.current.value = "";
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!guard("verify.manage") || saving) return;
    setSaving(true);
    setError("");
    setMade(null);
    try {
      const d = await createDocument({ title: title.trim(), issuedTo: issuedTo.trim(), orgType, details: details.trim() || undefined, photos });
      setMade(d);
      setTitle(""); setIssuedTo(""); setDetails(""); setPhotos([]);
      setTick((t) => t + 1);
    } catch (err) { setError(msg(err)); } finally { setSaving(false); }
  }

  async function toggle(d: VerifyDoc) {
    if (!guard("verify.manage")) return;
    if (!d.revoked && !(await askConfirm(`Withdraw code ${d.code}? It will show as not genuine on the customer site.`, { confirmLabel: "Withdraw", danger: true }))) return;
    try {
      await setRevoked(d.id, !d.revoked);
      setNote(d.revoked ? `Code ${d.code} restored.` : `Code ${d.code} withdrawn.`);
      setTick((t) => t + 1);
    } catch (err) { setError(msg(err)); }
  }

  const copy = (text: string) => { try { void navigator.clipboard.writeText(text); setNote("Copied."); } catch { /* clipboard not available */ } };

  return (
    <div className="w-full space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><ShieldCheck className="text-brand" size={24} /> Verify Document</h1>
        <p className="text-sm text-muted">Verification codes for bills and for documents you give to schools, banks and colleges. Anyone can check a code in the customer app under Quick Access &gt; Verify Documents.</p>
      </div>

      {note && <p className="rounded-xl bg-brand/10 p-3 text-sm text-brand" role="status">{note}</p>}
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}

      <div className="grid items-start gap-5 xl:grid-cols-2">
        {/* new document */}
        <form onSubmit={create} className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
          <h2 className="flex items-center gap-2 font-semibold"><Plus size={16} /> New verification code for a document</h2>
          <label className="block text-sm font-medium">Document title
            <input className={`${field} mt-1`} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Corporate partnership letter" />
          </label>
          <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
            <label className="block text-sm font-medium">Issued to
              <input className={`${field} mt-1`} value={issuedTo} maxLength={120} onChange={(e) => setIssuedTo(e.target.value)} placeholder="e.g. Everest Bank, Kathmandu" />
            </label>
            <label className="block text-sm font-medium">Type
              <select className={`${field} mt-1`} value={orgType} onChange={(e) => setOrgType(e.target.value as OrgType)}>
                {ORGS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
          </div>
          <label className="block text-sm font-medium">Notes shown when the code is checked <span className="font-normal text-muted">(optional)</span>
            <textarea className={`${field} mt-1`} rows={3} maxLength={1500} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="What the document is for, the dates it covers, who signed it…" />
          </label>

          <div>
            <p className="text-sm font-medium">Photos <span className="font-normal text-muted">(up to {MAX_PHOTOS}: the letter, the stamp, the agreement)</span></p>
            <div className="mt-2 flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <span key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p} alt={`Photo ${i + 1}`} className="h-20 w-24 rounded-xl border border-line object-cover" />
                  <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => setPhotos((l) => l.filter((_, k) => k !== i))} className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-red-500 text-white"><X size={14} /></button>
                </span>
              ))}
              {photos.length < MAX_PHOTOS && (
                <button type="button" onClick={() => picker.current?.click()} className="grid h-20 w-24 place-items-center rounded-xl border border-dashed border-line text-muted hover:border-brand hover:text-brand"><ImagePlus size={22} /></button>
              )}
              <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => addPhotos(e.target.files)} />
            </div>
          </div>

          <button disabled={saving || title.trim().length < 3 || issuedTo.trim().length < 2} className="flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Generate verification code
          </button>

          {made && (
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-center" role="status">
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Verification code</p>
              <p className="mt-1 font-mono text-4xl font-extrabold tracking-[0.3em] text-emerald-800">{made.code}</p>
              <p className="mt-1 text-xs text-muted">Print it on the document. {made.issuedTo} can check it in the Unique Futsal app: Quick Access &gt; Verify Documents.</p>
              <button type="button" onClick={() => copy(made.code)} className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold"><Copy size={13} /> Copy code</button>
            </div>
          )}
        </form>

        {/* look up */}
        <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
          <h2 className="flex items-center gap-2 font-semibold"><Search size={16} /> Check a code</h2>
          <form onSubmit={look} className="flex gap-2">
            <input className={`${field} font-mono text-lg tracking-[0.3em]`} autoCapitalize="characters" maxLength={6} value={q} onChange={(e) => { setQ(e.target.value.replace(/[^0-9a-z]/gi, "").toUpperCase()); setFound(null); }} placeholder="1234A" aria-label="Verification code" />
            <button disabled={q.length < 4 || looking} className="shrink-0 rounded-full bg-brand px-5 text-sm font-semibold text-white disabled:opacity-50">{looking ? <Loader2 size={16} className="animate-spin" /> : "Check"}</button>
          </form>
          {found && (found.found ? (
            <p className={`rounded-xl p-3 text-sm ${found.genuine ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"}`} role="status">
              <b>{found.genuine ? "Genuine" : "Withdrawn (shows as not genuine)"}</b>{" "}
              {found.kind === "document" ? `· Document: ${found.title}${found.issuedTo ? `, for ${found.issuedTo}` : ""}` : `· ${SOURCE[found.sourceType ?? ""] ?? "Bill"}`} · made {day(found.issuedAt)}
            </p>
          ) : (
            <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="status"><b>No such code.</b> Nothing issued by Unique Futsal has this code: it would show as fake to customers.</p>
          ))}

          <h2 className="pt-2 font-semibold">Recent bill codes</h2>
          {bills.length === 0 ? <p className="text-sm text-muted">No bill codes yet. A code is made when a bill is saved or a customer opens their receipt.</p> : (
            <ul className="divide-y divide-line text-sm">
              {bills.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0"><span className="block truncate font-medium">{b.reference} <span className="text-xs font-normal text-muted">· {SOURCE[b.sourceType ?? ""] ?? "Bill"}</span></span><span className="block truncate text-xs text-muted">{b.customer ?? "Guest"} · {rs(b.total)} · {day(b.createdAt)}</span></span>
                  <span className="shrink-0 font-mono text-base font-bold tracking-widest">{b.code}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* documents */}
      <section aria-label="Document codes" className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-bold"><FileText size={18} /> Document codes</h2>
        {!docs && !error && <p className="py-6 text-center text-sm text-muted">Loading…</p>}
        {docs && docs.length === 0 && <p className="rounded-2xl bg-surface p-6 text-center text-sm text-muted shadow-sm">No document codes yet. Make one above for a school, bank or college.</p>}
        <ul className="grid gap-3 lg:grid-cols-2">
          {(docs ?? []).map((d) => (
            <li key={d.id} className={`space-y-3 rounded-2xl bg-surface p-4 shadow-sm ${d.revoked ? "opacity-70" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{d.title}</p>
                  <p className="text-xs text-muted">{d.issuedTo}{d.orgType ? ` · ${ORGS.find((o) => o.id === d.orgType)?.label}` : ""} · {day(d.createdAt)}{d.issuedBy ? ` · by ${d.issuedBy}` : ""}</p>
                </div>
                <span className="shrink-0 font-mono text-2xl font-extrabold tracking-widest text-brand">{d.code}</span>
              </div>
              {d.details && <p className="whitespace-pre-line text-sm text-muted">{d.details}</p>}
              {d.photos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {d.photos.map((p) => (
                    <a key={p} href={photoUrl(p)} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoUrl(p)} alt="Document photo" className="h-16 w-20 rounded-lg border border-line object-cover" />
                    </a>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between">
                {d.revoked ? <Badge tone="bg-amber-500/15 text-amber-600">Withdrawn</Badge> : <Badge tone="bg-emerald-500/15 text-emerald-600">Genuine</Badge>}
                <div className="flex gap-2">
                  <button onClick={() => copy(d.code)} className="flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs font-semibold"><Copy size={13} /> Copy</button>
                  <button onClick={() => toggle(d)} className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold ${d.revoked ? "border-line" : "border-red-500/40 text-red-600"}`}>
                    {d.revoked ? <ShieldCheck size={13} /> : <ShieldOff size={13} />} {d.revoked ? "Restore" : "Withdraw"}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
