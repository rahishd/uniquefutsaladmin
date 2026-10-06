"use client";

import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import Switch from "../Switch";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { Ad, DAYS, Freq, PLACES, Place, addAd, addMinutes, clock, editAd, picUrl, shrink, spanText } from "@/lib/content";

const field = "rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");
const LENGTHS = [{ label: "30 min", m: 30 }, { label: "1 hour", m: 60 }, { label: "2 hours", m: 120 }, { label: "3 hours", m: 180 }, { label: "6 hours", m: 360 }];

export default function AdForm({ ad, onClose, onSaved }: { ad: Ad | null; onClose: () => void; onSaved: (m: string) => void }) {
  const [title, setTitle] = useState(ad?.title ?? "");
  const [place, setPlace] = useState<Place>(ad?.placement ?? "header");
  const [image, setImage] = useState<string | null>(null); // a new picture, already shrunk
  const [link, setLink] = useState(ad?.linkUrl ?? "");
  const [seconds, setSeconds] = useState(String(ad?.displaySeconds ?? 6));
  const [delay, setDelay] = useState(String(ad?.popupDelaySeconds ?? 3));
  const [freq, setFreq] = useState<Freq>(ad?.popupFrequency ?? "day");
  const [allDay, setAllDay] = useState(!(ad?.dailyStart && ad?.dailyEnd));
  const [from, setFrom] = useState(ad?.dailyStart ?? "06:00");
  const [to, setTo] = useState(ad?.dailyEnd ?? "07:00");
  const [start, setStart] = useState(ad?.startDate ?? "");
  const [end, setEnd] = useState(ad?.endDate ?? "");
  const [days, setDays] = useState<number[]>(ad?.days ?? []);
  const [priority, setPriority] = useState(String(ad?.priority ?? 0));
  const [active, setActive] = useState(ad?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [pic, setPic] = useState(false);
  const [error, setError] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  const info = PLACES.find((p) => p.id === place)!;
  const popup = place === "popup";

  async function choose(f: File | undefined) {
    if (!f) return;
    setError(""); setPic(true);
    try { setImage(await shrink(f)); } catch (e) { setError(msg(e)); } finally { setPic(false); if (picker.current) picker.current.value = ""; }
  }

  async function save() {
    if (!guard("content.ads")) return;
    if (!ad && !image) return setError("Choose a picture for the ad.");
    if (!allDay && from === to) return setError("The start and end time must be different.");
    setBusy(true); setError("");
    const body = {
      title: title.trim(), placement: place, linkUrl: link.trim() || null, displaySeconds: Number(seconds), popupDelaySeconds: Number(delay), popupFrequency: freq,
      startDate: start || null, endDate: end || null, dailyStart: allDay ? null : from, dailyEnd: allDay ? null : to, days, priority: Number(priority) || 0, active,
    };
    try {
      if (ad) await editAd(ad.id, { ...body, ...(image ? { image } : {}) });
      else await addAd({ ...body, image: image! });
      onSaved(ad ? "Ad saved." : "Ad added. It shows in the app when its time comes.");
      onClose();
    } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  }

  const lab = "block space-y-1 text-sm font-medium";
  const shown = image ?? (ad ? picUrl(ad.imageUrl) : null);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label={ad ? "Edit ad" : "New ad"} onClick={(e) => e.stopPropagation()} className="max-h-[94vh] w-full max-w-2xl space-y-5 overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold">{ad ? "Edit ad" : "New ad"}</h2><button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-surface-2"><X size={22} /></button></div>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Where should it show?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {PLACES.map((p) => (
              <button type="button" key={p.id} aria-pressed={place === p.id} onClick={() => { setPlace(p.id); if (p.id !== "popup" && Number(seconds) < 3) setSeconds("6"); }} className={`rounded-xl border p-3 text-left ${place === p.id ? "border-brand bg-brand/10" : "border-line"}`}>
                <p className="text-sm font-semibold">{p.label}</p><p className="text-xs text-muted">{p.hint}</p>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-semibold">Picture</p>
            <button type="button" onClick={() => picker.current?.click()} className="grid min-h-32 w-full place-items-center overflow-hidden rounded-xl border-2 border-dashed border-line bg-surface-2 text-sm text-muted">
              {shown ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shown} alt="Ad preview" className="max-h-52 w-full object-contain" />
              ) : <span className="flex flex-col items-center gap-1 p-4"><ImagePlus size={26} /> {pic ? "Preparing…" : "Choose a picture"}</span>}
            </button>
            <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Choose the ad picture" onChange={(e) => choose(e.target.files?.[0])} />
            <p className="text-xs text-muted">Best size for {info.label.toLowerCase()}: {info.size}. {shown ? "Tap the picture to replace it." : ""}</p>
          </div>
          <div className="space-y-3">
            <label className={lab}>Ad name <span className="font-normal text-muted">(only you see it)</span><input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Coca-Cola morning offer" className={`${field} w-full`} /></label>
            <label className={lab}>Link <span className="font-normal text-muted">(optional)</span><input value={link} maxLength={300} onChange={(e) => setLink(e.target.value)} placeholder="/book or https://..." className={`${field} w-full`} /></label>
          </div>
        </div>

        <fieldset className="space-y-3 rounded-xl bg-surface-2 p-3">
          <legend className="px-1 text-sm font-semibold">{popup ? "Pop-up behaviour" : "Loop"}</legend>
          {popup ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <label className={lab}>Opens after (seconds)<input inputMode="numeric" value={delay} onChange={(e) => setDelay(e.target.value.replace(/\D/g, "").slice(0, 2))} className={`${field} w-full`} /></label>
              <label className={lab}>Closes by itself after (seconds, 0 = stays)<input inputMode="numeric" value={seconds} onChange={(e) => setSeconds(e.target.value.replace(/\D/g, "").slice(0, 2))} className={`${field} w-full`} /></label>
              <label className={lab}>Shown to the same person<select value={freq} onChange={(e) => setFreq(e.target.value as Freq)} className={`${field} w-full`}><option value="session">Once per visit</option><option value="day">Once a day</option><option value="always">Every time the app opens</option></select></label>
            </div>
          ) : (
            <label className={lab}>Seconds on screen before the next ad (3 to 60)<input inputMode="numeric" value={seconds} onChange={(e) => setSeconds(e.target.value.replace(/\D/g, "").slice(0, 2))} className={`${field} w-full sm:w-40`} /></label>
          )}
          <p className="text-xs text-muted">{popup ? "If several pop-ups are live, a customer sees them one after the other." : "When several ads are live in the same place they loop, each for its own seconds. Higher priority goes first."}</p>
          <label className={lab}>Priority (0 to 100, higher first)<input inputMode="numeric" value={priority} onChange={(e) => setPriority(e.target.value.replace(/\D/g, "").slice(0, 3))} className={`${field} w-full sm:w-40`} /></label>
        </fieldset>

        <fieldset className="space-y-3 rounded-xl bg-surface-2 p-3">
          <legend className="px-1 text-sm font-semibold">When should it run? (Nepal time)</legend>
          <div className="flex gap-2">
            {([[true, "All day"], [false, "Only certain hours"]] as const).map(([v, l]) => (
              <button type="button" key={l} aria-pressed={allDay === v} onClick={() => setAllDay(v)} className={`rounded-full px-4 py-2 text-sm font-semibold ${allDay === v ? "bg-brand text-white" : "bg-surface text-muted"}`}>{l}</button>
            ))}
          </div>
          {!allDay && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3 sm:w-80">
                <label className={lab}>From<input type="time" value={from} onChange={(e) => setFrom(e.target.value)} className={`${field} w-full`} /></label>
                <label className={lab}>Until<input type="time" value={to} onChange={(e) => setTo(e.target.value)} className={`${field} w-full`} /></label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted">Run for:</span>
                {LENGTHS.map((l) => <button type="button" key={l.m} onClick={() => setTo(addMinutes(from, l.m))} className="rounded-full bg-surface px-3 py-1 text-xs font-semibold">{l.label}</button>)}
              </div>
              {from !== to && <p className="text-xs text-muted">Shows from {clock(from)} to {clock(to)} ({spanText(from, to)}){from > to ? ", past midnight" : ""}.</p>}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={lab}>First day <span className="font-normal text-muted">(optional)</span><input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={`${field} w-full`} /></label>
            <label className={lab}>Last day <span className="font-normal text-muted">(optional)</span><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={`${field} w-full`} /></label>
          </div>
          <div>
            <p className="mb-1 text-sm font-medium">Days <span className="font-normal text-muted">(none ticked = every day)</span></p>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d, i) => (
                <button type="button" key={d} aria-pressed={days.includes(i)} onClick={() => setDays((x) => (x.includes(i) ? x.filter((n) => n !== i) : [...x, i]))} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${days.includes(i) ? "bg-brand text-white" : "bg-surface text-muted"}`}>{d}</button>
              ))}
            </div>
          </div>
        </fieldset>

        <label className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 p-3 text-sm font-medium">Ad is on<Switch on={active} onChange={() => setActive((a) => !a)} label="Ad is on" /></label>
        {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
        <button onClick={save} disabled={busy || pic || title.trim().length < 2} className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : ad ? "Save ad" : "Add ad"}</button>
      </div>
    </div>
  );
}
