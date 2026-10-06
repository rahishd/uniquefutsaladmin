"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Megaphone, Pencil, Plus, Trash2, X } from "lucide-react";
import { Badge } from "../bookings/Badge";
import Switch from "../Switch";
import AdForm from "./AdForm";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { Ad, PLACES, Photo, STATE, addPhoto, deleteAd, deletePhoto, editAd, editPhoto, listAds, listPhotos, overview as fetchOverview, picUrl, placeLabel, reorderPhotos, scheduleText, shrink, Overview, Place } from "@/lib/content";

type Tab = "ads" | "gallery";
const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");
const field = "rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";

export default function ContentPage() {
  const [tab, setTab] = useState<Tab>("ads");
  const [ov, setOv] = useState<Overview | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => { fetchOverview().then(setOv).catch(() => {}); }, [tick]);
  const changed = () => setTick((t) => t + 1);

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Site Content</h1>
        <p className="text-sm text-muted">Gallery photos and ads shown in the customer app. Ads can run at set hours, in a loop, in the header or footer, or as a pop-up.</p>
      </div>
      {ov && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([["Gallery photos", ov.photos], ["Ads live right now", ov.liveAds], ["Ad views", ov.impressions], ["Ad clicks", ov.clicks]] as const).map(([l, n]) => (
            <div key={l} className="rounded-2xl bg-surface p-3 shadow-sm"><p className="text-2xl font-bold">{n.toLocaleString("en-IN")}</p><p className="text-xs text-muted">{l}</p></div>
          ))}
        </div>
      )}
      <div className="flex gap-1 rounded-2xl bg-surface p-1 shadow-sm" role="tablist">
        {([["ads", "Ads"], ["gallery", "Gallery"]] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold ${tab === id ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}>{label}</button>
        ))}
      </div>
      {tab === "ads" ? <Ads tick={tick} onChanged={changed} /> : <Gallery tick={tick} onChanged={changed} />}
    </div>
  );
}

/* ---------------- ads ---------------- */
function Ads({ tick, onChanged }: { tick: number; onChanged: () => void }) {
  const [ads, setAds] = useState<Ad[] | null>(null);
  const [place, setPlace] = useState<Place | "">("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [form, setForm] = useState<Ad | "new" | null>(null);
  const [local, setLocal] = useState(0);

  useEffect(() => {
    let live = true;
    listAds().then((a) => { if (live) { setAds(a); setError(""); } }).catch((e) => { if (live) setError(msg(e)); });
    return () => { live = false; };
  }, [tick, local]);
  const reload = () => { setLocal((n) => n + 1); onChanged(); };

  async function toggle(a: Ad) {
    if (!guard("content.ads")) return;
    try { await editAd(a.id, { active: !a.active }); setNote(a.active ? "Ad paused. Customers no longer see it." : "Ad is on."); reload(); } catch (e) { setError(msg(e)); }
  }
  async function remove(a: Ad) {
    if (!guard("content.ads")) return;
    if (!window.confirm(`Delete the ad "${a.title}"? This cannot be undone.`)) return;
    try { await deleteAd(a.id); setNote("Ad deleted."); reload(); } catch (e) { setError(msg(e)); }
  }

  const shown = (ads ?? []).filter((a) => !place || a.placement === place);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-surface p-1 shadow-sm">
          {[{ id: "" as const, label: "All" }, ...PLACES.map((p) => ({ id: p.id, label: p.label }))].map((p) => (
            <button key={p.label} aria-pressed={place === p.id} onClick={() => setPlace(p.id)} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold ${place === p.id ? "bg-brand text-white" : "text-muted"}`}>{p.label}</button>
          ))}
        </div>
        <button onClick={() => { if (guard("content.ads")) setForm("new"); }} className="flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"><Plus size={16} /> New ad</button>
      </div>
      {note && <p className="rounded-xl bg-brand/10 p-3 text-sm text-brand" role="status">{note}</p>}
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!ads && !error && <p className="py-8 text-center text-sm text-muted">Loading ads…</p>}
      {ads && shown.length === 0 && (
        <div className="grid place-items-center gap-2 rounded-2xl bg-surface py-12 text-center text-muted shadow-sm"><Megaphone size={32} strokeWidth={1.5} /><p>{place ? "No ads in this place yet." : "No ads yet. Add one to show it in the app."}</p></div>
      )}
      <ul className="grid items-start gap-3 xl:grid-cols-2">
        {shown.map((a) => {
          const st = STATE[a.status];
          const ctr = a.impressions > 0 ? Math.round((a.clicks / a.impressions) * 1000) / 10 : 0;
          return (
            <li key={a.id} className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
              <div className="flex gap-3">
                {/* ads live on the customer backend, so next/image is not used */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={picUrl(a.imageUrl)} alt={a.title} className={`shrink-0 rounded-xl bg-surface-2 object-cover ${a.placement === "popup" ? "h-24 w-20" : "h-16 w-28"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="truncate font-semibold">{a.title}</p><Badge tone={st.tone}>{st.label}</Badge></div>
                  <p className="text-xs text-muted">{placeLabel(a.placement)}{a.placement === "popup" ? ` · opens after ${a.popupDelaySeconds}s · ${a.popupFrequency === "always" ? "every visit" : a.popupFrequency === "day" ? "once a day" : "once per visit"}${a.displaySeconds ? ` · closes after ${a.displaySeconds}s` : ""}` : ` · ${a.displaySeconds}s each in the loop`}</p>
                  <p className="mt-1 text-xs">{scheduleText(a)}</p>
                  {a.linkUrl && <p className="truncate text-xs text-muted">Link: {a.linkUrl}</p>}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span className="text-xs text-muted">{a.impressions.toLocaleString("en-IN")} views · {a.clicks.toLocaleString("en-IN")} clicks{a.impressions ? ` (${ctr}%)` : ""}</span>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-muted">{a.active ? "On" : "Paused"}<Switch on={a.active} onChange={() => toggle(a)} label={`Ad ${a.title} on`} /></label>
                  <button onClick={() => { if (guard("content.ads")) setForm(a); }} aria-label={`Edit ${a.title}`} className="flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs font-semibold"><Pencil size={13} /> Edit</button>
                  <button onClick={() => remove(a)} aria-label={`Delete ${a.title}`} className="rounded-full border border-red-500/40 p-1.5 text-red-600"><Trash2 size={14} /></button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {form && <AdForm ad={form === "new" ? null : form} onClose={() => setForm(null)} onSaved={(m) => { setNote(m); reload(); }} />}
    </div>
  );
}

/* ---------------- gallery ---------------- */
function Gallery({ tick, onChanged }: { tick: number; onChanged: () => void }) {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [edit, setEdit] = useState<Photo | null>(null);
  const [local, setLocal] = useState(0);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    listPhotos().then((p) => { if (live) { setPhotos(p); setError(""); } }).catch((e) => { if (live) setError(msg(e)); });
    return () => { live = false; };
  }, [tick, local]);
  const reload = () => { setLocal((n) => n + 1); onChanged(); };

  async function upload(files: FileList | null) {
    if (!files?.length || !guard("content.gallery")) return;
    setError(""); setNote("");
    let done = 0;
    try {
      for (const f of Array.from(files)) {
        setBusy(`Uploading ${done + 1} of ${files.length}…`);
        const image = await shrink(f);
        await addPhoto({ title: f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 80) || "Photo", image });
        done++;
      }
      setNote(`${done} photo${done === 1 ? "" : "s"} added. Rename them or reorder below.`);
    } catch (e) { setError(`${done ? `${done} added, then stopped: ` : ""}${msg(e)}`); } finally {
      setBusy(""); reload();
      if (picker.current) picker.current.value = "";
    }
  }

  async function move(i: number, d: -1 | 1) {
    if (!photos || !guard("content.gallery")) return;
    const j = i + d;
    if (j < 0 || j >= photos.length) return;
    const ids = photos.map((p) => p.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setPhotos(ids.map((id) => photos.find((p) => p.id === id)!));
    try { await reorderPhotos(ids); onChanged(); } catch (e) { setError(msg(e)); reload(); }
  }
  async function toggle(p: Photo) {
    if (!guard("content.gallery")) return;
    try { await editPhoto(p.id, { visible: !p.visible }); reload(); } catch (e) { setError(msg(e)); }
  }
  async function remove(p: Photo) {
    if (!guard("content.gallery")) return;
    if (!window.confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
    try { await deletePhoto(p.id); setNote("Photo deleted."); reload(); } catch (e) { setError(msg(e)); }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Landscape and portrait photos both work. They are shrunk to 1600 px automatically. Customers see them in the Gallery on Home, in this order.</p>
        <button onClick={() => { if (guard("content.gallery")) picker.current?.click(); }} disabled={!!busy} className="flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"><ImagePlus size={16} /> {busy || "Add photos"}</button>
        <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" aria-label="Choose photos" onChange={(e) => upload(e.target.files)} />
      </div>
      {note && <p className="rounded-xl bg-brand/10 p-3 text-sm text-brand" role="status">{note}</p>}
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!photos && !error && <p className="py-8 text-center text-sm text-muted">Loading photos…</p>}
      {photos?.length === 0 && <div className="grid place-items-center gap-2 rounded-2xl bg-surface py-12 text-center text-muted shadow-sm"><ImagePlus size={32} strokeWidth={1.5} /><p>No photos yet. Add some to fill the Gallery in the app.</p></div>}
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {photos?.map((p, i) => (
          <li key={p.id} className={`overflow-hidden rounded-2xl bg-surface shadow-sm ${p.visible ? "" : "opacity-60"}`}>
            <div className="relative aspect-square bg-surface-2">
              {/* photos live on the customer backend, so next/image is not used */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={picUrl(p.imageUrl)} alt={p.title} className="h-full w-full object-contain" />
              <span className="absolute left-2 top-2"><Badge tone="bg-black/50 text-white">{p.orientation}</Badge></span>
              {!p.visible && <span className="absolute right-2 top-2"><Badge tone="bg-amber-500 text-white">Hidden</Badge></span>}
            </div>
            <div className="space-y-2 p-3">
              <p className="truncate text-sm font-semibold">{p.title}</p>
              <div className="flex items-center justify-between gap-1">
                <div className="flex gap-1">
                  <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${p.title} earlier`} className="rounded-full border border-line p-1.5 disabled:opacity-30"><ArrowLeft size={14} /></button>
                  <button onClick={() => move(i, 1)} disabled={i === photos.length - 1} aria-label={`Move ${p.title} later`} className="rounded-full border border-line p-1.5 disabled:opacity-30"><ArrowRight size={14} /></button>
                </div>
                <Switch on={p.visible} onChange={() => toggle(p)} label={`Show ${p.title} in the app`} />
                <div className="flex gap-1">
                  <button onClick={() => { if (guard("content.gallery")) setEdit(p); }} aria-label={`Edit ${p.title}`} className="rounded-full border border-line p-1.5"><Pencil size={14} /></button>
                  <button onClick={() => remove(p)} aria-label={`Delete ${p.title}`} className="rounded-full border border-red-500/40 p-1.5 text-red-600"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {edit && <EditPhoto photo={edit} onClose={() => setEdit(null)} onSaved={() => { setNote("Saved."); reload(); }} />}
    </div>
  );
}

function EditPhoto({ photo, onClose, onSaved }: { photo: Photo; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(photo.title);
  const [caption, setCaption] = useState(photo.caption ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (!guard("content.gallery")) return;
    setBusy(true); setError("");
    try { await editPhoto(photo.id, { title: title.trim(), caption: caption.trim() || null }); onSaved(); onClose(); } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label="Edit photo" onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-4 rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Edit photo</h2><button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-surface-2"><X size={22} /></button></div>
        <label className="block space-y-1 text-sm font-medium">Title<input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} className={`${field} w-full`} /></label>
        <label className="block space-y-1 text-sm font-medium">Caption <span className="font-normal text-muted">(optional, shown when opened)</span><input value={caption} maxLength={200} onChange={(e) => setCaption(e.target.value)} className={`${field} w-full`} /></label>
        {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
        <button onClick={save} disabled={busy || !title.trim()} className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}
