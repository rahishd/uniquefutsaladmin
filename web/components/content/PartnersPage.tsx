"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Pencil, Trash2, X } from "lucide-react";
import { Badge } from "../bookings/Badge";
import Switch from "../Switch";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { Partner, addPartner, deletePartner, editPartner, fileToDataUrl, listPartners, picUrl, reorderPartners } from "@/lib/content";

const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");
const field = "rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const ACCEPT = "image/png,image/jpeg,image/webp";
const nameFromFile = (f: File) => f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 60);

// Corporate Network: the logos customers see in a moving strip on Home ("Corporate Network. We Trusted").
export default function PartnersPage() {
  const [items, setItems] = useState<Partner[] | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [local, setLocal] = useState(0);
  const [edit, setEdit] = useState<Partner | null>(null);

  useEffect(() => {
    let live = true;
    listPartners().then((p) => { if (live) { setItems(p); setError(""); } }).catch((e) => { if (live) setError(msg(e)); });
    return () => { live = false; };
  }, [local]);
  const reload = () => setLocal((n) => n + 1);

  async function move(i: number, d: -1 | 1) {
    if (!items || !guard("content.partners")) return;
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const ids = items.map((p) => p.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setItems(ids.map((id) => items.find((p) => p.id === id)!));
    try { await reorderPartners(ids); } catch (e) { setError(msg(e)); reload(); }
  }
  async function toggle(p: Partner) {
    if (!guard("content.partners")) return;
    try { await editPartner(p.id, { visible: !p.visible }); reload(); } catch (e) { setError(msg(e)); }
  }
  async function remove(p: Partner) {
    if (!guard("content.partners")) return;
    if (!window.confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    try { await deletePartner(p.id); setNote("Logo deleted."); reload(); } catch (e) { setError(msg(e)); }
  }

  return (
    <div className="w-full space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Corporate Network</h1>
        <p className="text-sm text-muted">The companies and institutions you work with. Their logos move across Home in the customer app under &ldquo;Corporate Network. We Trusted&rdquo;, in the order shown here.</p>
      </header>

      <AddForm onAdded={(n) => { setNote(`${n} added.`); reload(); }} onError={setError} />

      {note && <p className="rounded-xl bg-brand/10 p-3 text-sm text-brand" role="status">{note}</p>}
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!items && !error && <p className="py-8 text-center text-sm text-muted">Loading logos…</p>}
      {items?.length === 0 && (
        <div className="grid place-items-center gap-2 rounded-2xl bg-surface py-12 text-center text-muted shadow-sm">
          <ImagePlus size={32} strokeWidth={1.5} />
          <p>No logos yet. Add the first one above.</p>
        </div>
      )}

      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {items?.map((p, i) => (
          <li key={p.id} className={`overflow-hidden rounded-2xl bg-surface shadow-sm ${p.visible ? "" : "opacity-60"}`}>
            <div className="relative grid aspect-[5/3] place-items-center bg-white p-4">
              {/* logos are served by the customer backend, so next/image is not used */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={picUrl(p.imageUrl)} alt={p.name} className="max-h-full max-w-full object-contain" />
              {!p.visible && <span className="absolute right-2 top-2"><Badge tone="bg-amber-500 text-white">Hidden</Badge></span>}
            </div>
            <div className="space-y-2 border-t border-line p-3">
              <p className="truncate text-sm font-semibold">{p.name}</p>
              <div className="flex items-center justify-between gap-1">
                <div className="flex gap-1">
                  <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${p.name} earlier`} className="rounded-full border border-line p-1.5 disabled:opacity-30"><ArrowLeft size={14} /></button>
                  <button onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={`Move ${p.name} later`} className="rounded-full border border-line p-1.5 disabled:opacity-30"><ArrowRight size={14} /></button>
                </div>
                <Switch on={p.visible} onChange={() => toggle(p)} label={`Show ${p.name} in the app`} />
                <div className="flex gap-1">
                  <button onClick={() => { if (guard("content.partners")) setEdit(p); }} aria-label={`Edit ${p.name}`} className="rounded-full border border-line p-1.5"><Pencil size={14} /></button>
                  <button onClick={() => remove(p)} aria-label={`Delete ${p.name}`} className="rounded-full border border-red-500/40 p-1.5 text-red-600"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {edit && <EditPartner partner={edit} onClose={() => setEdit(null)} onSaved={() => { setNote("Saved."); reload(); }} />}
    </div>
  );
}

/* ---------------- add ---------------- */
function AddForm({ onAdded, onError }: { onAdded: (name: string) => void; onError: (m: string) => void }) {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function choose(f: File | null) {
    setFile(f);
    if (f && !name.trim()) setName(nameFromFile(f));
  }
  async function submit() {
    if (!file || !name.trim() || !guard("content.partners")) return;
    setBusy(true); onError("");
    try {
      const image = await fileToDataUrl(file);
      await addPartner({ name: name.trim(), image });
      onAdded(name.trim());
      setName(""); setFile(null);
      if (picker.current) picker.current.value = "";
    } catch (e) { onError(msg(e)); } finally { setBusy(false); }
  }

  return (
    <section className="rounded-2xl bg-surface p-4 shadow-sm">
      <h2 className="text-base font-bold">Add a logo</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-[10rem_1fr]">
        <button type="button" onClick={() => picker.current?.click()} aria-label="Choose a logo picture" className="grid aspect-[5/3] place-items-center overflow-hidden rounded-xl border border-dashed border-line bg-white text-muted hover:border-brand">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Selected logo" className="max-h-full max-w-full object-contain p-2" />
          ) : (
            <span className="grid place-items-center gap-1 text-xs"><ImagePlus size={24} strokeWidth={1.5} />Choose a picture</span>
          )}
        </button>
        <input ref={picker} type="file" accept={ACCEPT} className="sr-only" aria-label="Logo picture" onChange={(e) => choose(e.target.files?.[0] ?? null)} />
        <div className="space-y-3">
          <label className="block space-y-1 text-sm font-medium">Name<input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nabil Bank" className={`${field} w-full`} /></label>
          <p className="text-xs text-muted">PNG, JPG or WebP up to 8 MB. A transparent background is kept. The logo is resized for you.</p>
          <button onClick={submit} disabled={busy || !file || !name.trim()} className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Adding…" : "Add logo"}</button>
        </div>
      </div>
    </section>
  );
}

/* ---------------- edit ---------------- */
function EditPartner({ partner, onClose, onSaved }: { partner: Partner; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(partner.name);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (!guard("content.partners")) return;
    setBusy(true); setError("");
    try {
      await editPartner(partner.id, { name: name.trim(), ...(file ? { image: await fileToDataUrl(file) } : {}) });
      onSaved(); onClose();
    } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label="Edit logo" onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-4 rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Edit logo</h2><button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-surface-2"><X size={22} /></button></div>
        <label className="block space-y-1 text-sm font-medium">Name<input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className={`${field} w-full`} /></label>
        <label className="block space-y-1 text-sm font-medium">Replace the picture <span className="font-normal text-muted">(optional)</span>
          <input type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
        </label>
        {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
        <button onClick={save} disabled={busy || !name.trim()} className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}
