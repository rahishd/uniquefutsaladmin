"use client";

/* eslint-disable @next/next/no-img-element -- pictures come from the venue's own server, so next/image is not used */

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, BadgePercent, Building2, Check, ChevronRight, Copy, ExternalLink, ImagePlus, Images, Link2, Loader2, Plus, Store, Trash2, X } from "lucide-react";
import { Badge } from "../bookings/Badge";
import Switch from "../Switch";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { askConfirm } from "@/lib/confirm";
import { fileToDataUrl, picUrl } from "@/lib/content";
import { copyText } from "@/lib/vip";
import {
  BANNER_STATUS, CARD_STATUS, Offer, OfferInput, Partner, PartnerInput, Redemption, STATUS, addOffer, cancelRedemption, createPartner, dashboardUrl, deleteOffer, deletePartner, editOffer, editPartner,
  type BannerInput, fmtDay, linkOff, listPartners, listRedemptions, newLink, when,
} from "@/lib/marketplace";

// Partner Marketplace (Operations): register a business that gives our customers a discount for loyalty points, set the agreement, the
// discount codes and what each costs in points, and give the partner its own dashboard link.
const field = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand disabled:opacity-60";
const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" }).format(new Date());
const plusYear = (k: string) => `${Number(k.slice(0, 4)) + 1}${k.slice(4)}`;

function Sheet({ title, sub, onClose, children }: { title: string; sub?: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()} className="max-h-[94vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><h2 className="truncate text-lg font-bold">{title}</h2>{sub && <div className="mt-0.5 text-sm text-muted">{sub}</div>}</div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-surface-2"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

type OfferDraft = { title: string; code: string; discountText: string; pointsCost: string; maxPerCustomer: string };
const blankOffer = (): OfferDraft => ({ title: "", code: "", discountText: "", pointsCost: "", maxPerCustomer: "" });
const toOffer = (d: OfferDraft): OfferInput => ({ title: d.title.trim(), code: d.code.trim().toUpperCase(), discountText: d.discountText.trim(), pointsCost: Number(d.pointsCost), maxPerCustomer: d.maxPerCustomer.trim() ? Number(d.maxPerCustomer) : null });
const offerProblem = (d: OfferDraft) =>
  d.title.trim().length < 2 ? "Give the offer a title." : !/^[A-Za-z0-9-]{3,20}$/.test(d.code.trim()) ? "The discount code is 3 to 20 letters, digits or dashes." : d.discountText.trim().length < 2 ? "Say what the customer gets, for example 10% off the bill."
    : !(Number(d.pointsCost) >= 0.5) ? "Enter how many loyalty points this discount costs." : "";

function OfferFields({ d, set }: { d: OfferDraft; set: (p: Partial<OfferDraft>) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <input aria-label="Offer title" placeholder="Title, e.g. 10% off the bill" value={d.title} maxLength={60} onChange={(e) => set({ title: e.target.value })} className={field} />
      <input aria-label="Discount code" placeholder="Discount code, e.g. UF10" value={d.code} maxLength={20} onChange={(e) => set({ code: e.target.value.toUpperCase() })} className={`${field} font-mono`} />
      <input aria-label="What the customer gets" placeholder="What they get, e.g. 10% off your bill" value={d.discountText} maxLength={80} onChange={(e) => set({ discountText: e.target.value })} className={`${field} sm:col-span-2`} />
      <label className="flex items-center gap-2 text-xs text-muted">Loyalty points <input inputMode="decimal" aria-label="Loyalty points this discount costs" placeholder="20" value={d.pointsCost} onChange={(e) => set({ pointsCost: e.target.value.replace(/[^\d.]/g, "").slice(0, 7) })} className={field} /></label>
      <label className="flex items-center gap-2 text-xs text-muted">Max per customer <input inputMode="numeric" aria-label="Most times one customer can use it" placeholder="no limit" value={d.maxPerCustomer} onChange={(e) => set({ maxPerCustomer: e.target.value.replace(/\D/g, "").slice(0, 3) })} className={field} /></label>
    </div>
  );
}

/* ---------------- register a new partner ---------------- */
function RegisterSheet({ categories, onClose, onCreated }: { categories: string[]; onClose: () => void; onCreated: (p: Partner) => void }) {
  const [f, setF] = useState({ name: "", category: "Cafe", contactName: "", contactPhone: "", about: "", agreementStart: today(), agreementEnd: plusYear(today()) });
  const [image, setImage] = useState<string | null>(null);
  const [offers, setOffers] = useState<OfferDraft[]>([blankOffer()]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const pick = useRef<HTMLInputElement>(null);
  const up = (p: Partial<typeof f>) => { setF((x) => ({ ...x, ...p })); setErr(""); };

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (busy || !guard("marketplace.manage")) return;
    if (f.name.trim().length < 2) return setErr("Enter the business name.");
    if (f.category.trim().length < 2) return setErr("Choose or type a category.");
    if (f.agreementEnd < f.agreementStart) return setErr("The agreement cannot end before it starts.");
    const used = offers.filter((o) => o.title || o.code || o.discountText || o.pointsCost);
    for (const o of used) { const p = offerProblem(o); if (p) return setErr(p); }
    setBusy(true); setErr("");
    try {
      const body: PartnerInput & { offers: OfferInput[] } = { ...f, contactName: f.contactName.trim() || null, contactPhone: f.contactPhone.trim() || null, about: f.about.trim() || null, image, offers: used.map(toOffer) };
      onCreated(await createPartner(body));
    } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }

  return (
    <Sheet title="Register a partner" sub="A business that gives our customers a discount for loyalty points." onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">Business name<input value={f.name} maxLength={80} onChange={(e) => up({ name: e.target.value })} placeholder="Himalayan Cafe" className={`${field} mt-1`} /></label>
          <label className="block text-sm font-medium">Category<input list="partner-cats" value={f.category} maxLength={40} onChange={(e) => up({ category: e.target.value })} className={`${field} mt-1`} /><datalist id="partner-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist></label>
          <label className="block text-sm font-medium">Contact person<input value={f.contactName} maxLength={60} onChange={(e) => up({ contactName: e.target.value })} className={`${field} mt-1`} /></label>
          <label className="block text-sm font-medium">Their phone<input inputMode="tel" value={f.contactPhone} maxLength={20} onChange={(e) => up({ contactPhone: e.target.value.replace(/[^\d+\s-]/g, "") })} className={`${field} mt-1`} /></label>
        </div>
        <label className="block text-sm font-medium">About them (shown to customers, optional)<textarea value={f.about} rows={2} maxLength={400} onChange={(e) => up({ about: e.target.value })} className={`${field} mt-1`} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">Agreement starts<input type="date" value={f.agreementStart} onChange={(e) => up({ agreementStart: e.target.value })} className={`${field} mt-1`} /></label>
          <label className="block text-sm font-medium">Agreement ends<input type="date" value={f.agreementEnd} min={f.agreementStart} onChange={(e) => up({ agreementEnd: e.target.value })} className={`${field} mt-1`} /></label>
        </div>

        <div>
          <p className="mb-1 text-sm font-medium">Banner (optional)</p>
          <button type="button" onClick={() => pick.current?.click()} className="grid aspect-[16/7] w-full place-items-center overflow-hidden rounded-xl border border-dashed border-line bg-surface-2 text-sm text-muted">
            {image ? <img src={image} alt="Banner preview" className="h-full w-full object-cover" /> : <span className="flex items-center gap-2"><ImagePlus size={18} /> Choose a picture, 1280 x 560 px works best</span>}
          </button>
          <input ref={pick} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Choose the banner picture" onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) { try { setImage(await fileToDataUrl(file)); } catch (x) { setErr(msg(x)); } } }} />
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium">Discounts for loyalty points</p>
          {offers.map((o, i) => (
            <div key={i} className="space-y-2 rounded-2xl border border-line p-3">
              <OfferFields d={o} set={(p) => { setOffers((x) => x.map((y, k) => (k === i ? { ...y, ...p } : y))); setErr(""); }} />
              {offers.length > 1 && <button type="button" onClick={() => setOffers((x) => x.filter((_, k) => k !== i))} className="flex items-center gap-1 text-xs font-semibold text-red-600"><Trash2 size={13} /> Remove this offer</button>}
            </div>
          ))}
          <button type="button" onClick={() => setOffers((x) => [...x, blankOffer()])} className="flex items-center gap-1.5 text-sm font-semibold text-brand"><Plus size={15} /> Add another discount</button>
        </div>

        {err && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{err}</p>}
        <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy && <Loader2 size={16} className="animate-spin" />} Register partner</button>
      </form>
    </Sheet>
  );
}

/* ---------------- the banner's schedule: the same controls as an ad ---------------- */
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function BannerSchedule({ p, onChange }: { p: Partner; onChange: (x: Partner) => void }) {
  const b = p.banner;
  const [seconds, setSeconds] = useState(String(b.seconds));
  const [priority, setPriority] = useState(String(b.priority));
  const [allDay, setAllDay] = useState(!(b.dailyStart && b.dailyEnd));
  const [from, setFrom] = useState(b.dailyStart ?? "09:00");
  const [to, setTo] = useState(b.dailyEnd ?? "18:00");
  const [start, setStart] = useState(b.startDate ?? "");
  const [end, setEnd] = useState(b.endDate ?? "");
  const [days, setDays] = useState<number[]>(b.days);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const mark = () => { setErr(""); setOk(""); };

  const now = { seconds: Number(seconds), priority: Number(priority) || 0, dailyStart: allDay ? null : from, dailyEnd: allDay ? null : to, startDate: start || null, endDate: end || null, days: [...days].sort() };
  const dirty = now.seconds !== b.seconds || now.priority !== b.priority || now.dailyStart !== b.dailyStart || now.dailyEnd !== b.dailyEnd || now.startDate !== b.startDate || now.endDate !== b.endDate || now.days.join() !== [...b.days].sort().join();

  async function save(patch: Partial<BannerInput> = {}) {
    if (!guard("marketplace.manage")) return;
    if (!(now.seconds >= 3 && now.seconds <= 60)) return setErr("Seconds on screen: 3 to 60.");
    if (!(now.priority >= 0 && now.priority <= 100)) return setErr("Priority: 0 to 100.");
    if (!allDay && from === to) return setErr("The start and end time must be different.");
    if (start && end && end < start) return setErr("The last day cannot be before the first day.");
    setBusy(true); mark();
    try {
      onChange(await editPartner(p.id, { bannerSeconds: now.seconds, bannerPriority: now.priority, bannerStart: now.startDate, bannerEnd: now.endDate, bannerDailyStart: now.dailyStart, bannerDailyEnd: now.dailyEnd, bannerDays: now.days, ...patch }));
      setOk("Banner schedule saved.");
    } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }
  const chip = "rounded-full px-4 py-2 text-sm font-semibold";
  return (
    <div className="space-y-3 rounded-2xl bg-surface-2 p-4">
      <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-bold">Banner schedule</h4><Badge tone={BANNER_STATUS[b.status].tone}>{BANNER_STATUS[b.status].label}</Badge></div>

      <fieldset className="space-y-2"><legend className="text-xs font-bold uppercase tracking-wide text-muted">Loop</legend>
        <label className="flex flex-wrap items-center gap-2 text-sm">Seconds on screen before the next banner (3 to 60)<input inputMode="numeric" value={seconds} onChange={(e) => { setSeconds(e.target.value.replace(/\D/g, "").slice(0, 2)); mark(); }} className={`${field} !w-24`} /></label>
        <label className="flex flex-wrap items-center gap-2 text-sm">Priority (0 to 100, higher first)<input inputMode="numeric" value={priority} onChange={(e) => { setPriority(e.target.value.replace(/\D/g, "").slice(0, 3)); mark(); }} className={`${field} !w-24`} /></label>
        <p className="text-xs text-muted">When several partner banners are live they loop, each for its own seconds. Higher priority goes first.</p>
      </fieldset>

      <fieldset className="space-y-3"><legend className="text-xs font-bold uppercase tracking-wide text-muted">When should it run? (Nepal time)</legend>
        <div className="flex flex-wrap gap-2">
          {([[true, "All day"], [false, "Only certain hours"]] as const).map(([v, l]) => (
            <button type="button" key={l} aria-pressed={allDay === v} onClick={() => { setAllDay(v); mark(); }} className={`${chip} ${allDay === v ? "bg-brand text-white" : "bg-surface text-muted"}`}>{l}</button>
          ))}
        </div>
        {!allDay && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-muted">From<input type="time" value={from} onChange={(e) => { setFrom(e.target.value); mark(); }} className={`${field} mt-1`} /></label>
            <label className="block text-xs text-muted">Until<input type="time" value={to} onChange={(e) => { setTo(e.target.value); mark(); }} className={`${field} mt-1`} /></label>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium">First day <span className="font-normal text-muted">(optional)</span><input type="date" value={start} onChange={(e) => { setStart(e.target.value); mark(); }} className={`${field} mt-1`} /></label>
          <label className="block text-sm font-medium">Last day <span className="font-normal text-muted">(optional)</span><input type="date" value={end} min={start || undefined} onChange={(e) => { setEnd(e.target.value); mark(); }} className={`${field} mt-1`} /></label>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium">Days <span className="font-normal text-muted">(none ticked = every day)</span></p>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((n, i) => { const on = days.includes(i); return <button type="button" key={n} aria-pressed={on} onClick={() => { setDays((d) => (on ? d.filter((x) => x !== i) : [...d, i])); mark(); }} className={`${chip} !px-3.5 ${on ? "bg-brand text-white" : "bg-surface text-muted"}`}>{n}</button>; })}
          </div>
        </div>
      </fieldset>

      <div className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3">
        <span className="text-sm font-semibold">{b.on ? "Banner is on" : "Banner is off"}</span>
        <Switch on={b.on} label="Banner on or off" disabled={busy} onChange={() => save({ bannerOn: !b.on })} />
      </div>
      {err && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{err}</p>}
      {ok && <p role="status" className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-700">{ok}</p>}
      {dirty && <button type="button" disabled={busy} onClick={() => save()} className="flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white">{busy && <Loader2 size={15} className="animate-spin" />} Save the banner schedule</button>}
    </div>
  );
}

/* ---------------- manage one partner ---------------- */
function OfferRow({ pid, o, onPartner }: { pid: string; o: Offer; onPartner: (p: Partner) => void }) {
  const [d, setD] = useState<OfferDraft>({ title: o.title, code: o.code, discountText: o.discountText, pointsCost: String(o.pointsCost), maxPerCustomer: o.maxPerCustomer ? String(o.maxPerCustomer) : "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const dirty = d.title !== o.title || d.code !== o.code || d.discountText !== o.discountText || Number(d.pointsCost) !== o.pointsCost || (d.maxPerCustomer ? Number(d.maxPerCustomer) : null) !== o.maxPerCustomer;
  async function run(job: () => Promise<Partner>) { setBusy(true); setErr(""); try { onPartner(await job()); } catch (e) { setErr(msg(e)); } finally { setBusy(false); } }
  async function save() { const p = offerProblem(d); if (p) return setErr(p); if (guard("marketplace.manage")) await run(() => editOffer(pid, o.id, toOffer(d))); }
  async function remove() { if (guard("marketplace.manage") && (await askConfirm(`Delete the offer "${o.title}"?`))) await run(() => deleteOffer(pid, o.id)); }
  return (
    <li className={`space-y-2 rounded-2xl border p-3 ${o.pointsCost <= 0 ? "border-amber-400 bg-amber-500/5" : `border-line ${o.active ? "" : "opacity-70"}`}`}>
      {o.pointsCost <= 0 && <p className="text-xs font-semibold text-amber-700">Added by the partner. Set the loyalty points and Save to put it live.</p>}
      <OfferFields d={d} set={(p) => { setD((x) => ({ ...x, ...p })); setErr(""); }} />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs font-semibold"><Switch on={o.active} label={`Offer ${o.title} on or off`} disabled={busy} onChange={() => guard("marketplace.manage") && run(() => editOffer(pid, o.id, { active: !o.active }))} /> {o.active ? "On" : "Off"}</label>
        {dirty && <button type="button" disabled={busy} onClick={save} className="flex items-center gap-1 rounded-full bg-brand px-4 py-1.5 text-xs font-semibold text-white">{busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save</button>}
        <button type="button" disabled={busy} onClick={remove} className="ml-auto flex items-center gap-1 text-xs font-semibold text-red-600"><Trash2 size={13} /> Delete</button>
      </div>
      {err && <p role="alert" className="text-xs font-medium text-red-600">{err}</p>}
    </li>
  );
}

function ManageSheet({ partner, categories, onClose, onChange, onDeleted }: { partner: Partner; categories: string[]; onClose: () => void; onChange: (p: Partner) => void; onDeleted: () => void }) {
  const p = partner;
  const [f, setF] = useState({ name: p.name, category: p.category, contactName: p.contactName ?? "", contactPhone: p.contactPhone ?? "", about: p.about ?? "", agreementStart: p.agreementStart, agreementEnd: p.agreementEnd });
  const [add, setAdd] = useState<OfferDraft | null>(null);
  const [cards, setCards] = useState<Redemption[] | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<"details" | "banners" | "banner" | "add" | "link">("details"); // the sub-page that is open
  const pick = useRef<HTMLInputElement>(null);
  const url = dashboardUrl(p.link.token);
  const tabs = [
    { id: "details", label: "Company Details", hint: p.category, Icon: Building2 },
    { id: "banners", label: "Banners", hint: p.bannerUrl ? "1 banner" : "None yet", Icon: Images },
    { id: "add", label: "Add new", hint: `${p.offers.length} discount${p.offers.length === 1 ? "" : "s"}`, Icon: BadgePercent },
    { id: "link", label: "Dashboard Link", hint: p.link.active ? "On" : "Off", Icon: Link2 },
  ] as const;
  const on = (id: string) => view === id || (id === "banners" && view === "banner");
  const dirty = f.name !== p.name || f.category !== p.category || f.contactName !== (p.contactName ?? "") || f.contactPhone !== (p.contactPhone ?? "") || f.about !== (p.about ?? "") || f.agreementStart !== p.agreementStart || f.agreementEnd !== p.agreementEnd;

  const loadCards = useCallback(() => { listRedemptions(p.id).then(setCards).catch(() => setCards([])); }, [p.id]);
  useEffect(() => { const t = setTimeout(loadCards, 0); return () => clearTimeout(t); }, [loadCards]);

  async function run(key: string, job: () => Promise<Partner>, done = "Saved.") {
    if (!guard("marketplace.manage")) return;
    setBusy(key); setErr(""); setOk("");
    try { onChange(await job()); setOk(done); } catch (e) { setErr(msg(e)); } finally { setBusy(""); }
  }
  const saveDetails = () => run("details", () => editPartner(p.id, { ...f, contactName: f.contactName.trim() || null, contactPhone: f.contactPhone.trim() || null, about: f.about.trim() || null }));
  async function banner(file?: File) { if (!file) return; await run("banner", async () => editPartner(p.id, { image: await fileToDataUrl(file) }), "Banner updated."); }
  async function addNew() {
    if (!add) return;
    const pr = offerProblem(add); if (pr) return setErr(pr);
    await run("offer", () => addOffer(p.id, toOffer(add)), "Offer added.");
    setAdd(null);
  }
  async function cancelCard(r: Redemption) {
    if (!guard("marketplace.manage") || !(await askConfirm(`Cancel the card ${r.code}? ${r.points} points go back to ${r.customerName ?? "the customer"}.`))) return;
    setBusy("c" + r.id); setErr("");
    try { await cancelRedemption(r.id); loadCards(); const fresh = (await listPartners()).items.find((x) => x.id === p.id); if (fresh) onChange(fresh); setOk("Card cancelled and the points returned."); } catch (e) { setErr(msg(e)); } finally { setBusy(""); }
  }
  async function remove() {
    if (!guard("marketplace.manage") || !(await askConfirm(`Delete ${p.name}? This cannot be undone.`))) return;
    try { await deletePartner(p.id); onDeleted(); } catch (e) { setErr(msg(e)); }
  }

  return (
    <Sheet title={p.name} sub={<span className="flex flex-wrap items-center gap-2"><Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge><span>{p.category} · agreement {fmtDay(p.agreementStart)} to {fmtDay(p.agreementEnd)}</span>{p.link.active && (
    <span className="flex w-full max-w-full items-center gap-1.5 rounded-full border border-line bg-surface-2 py-1 pl-3 pr-1 text-xs">
      <Link2 size={13} className="shrink-0 text-muted" /><span className="min-w-0 flex-1 truncate font-mono" title={url}>{url}</span>
      <button type="button" onClick={async (e) => { e.stopPropagation(); await copyText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }} aria-label="Copy the partner link" className="flex shrink-0 items-center gap-1 rounded-full bg-brand px-2.5 py-1 font-semibold text-white">{copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}</button>
      <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Open the partner link" className="grid shrink-0 place-items-center rounded-full p-1.5 hover:bg-surface"><ExternalLink size={13} /></a>
    </span>
  )}</span>} onClose={onClose}>
      {err && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{err}</p>}
      {ok && <p role="status" className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-700">{ok}</p>}

      <nav aria-label="Partner sections" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tabs.map(({ id, label, hint, Icon }) => (
          <button key={id} type="button" aria-current={on(id) ? "page" : undefined} onClick={() => { setView(id); setErr(""); setOk(""); }}
            className={`flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition ${on(id) ? "border-brand bg-brand text-white shadow-md" : "border-line bg-surface hover:shadow-sm"}`}>
            <Icon size={18} className={on(id) ? "text-white" : "text-brand"} />
            <span className="text-sm font-bold leading-tight">{label}</span>
            <span className={`text-[11px] ${on(id) ? "text-white/80" : "text-muted"}`}>{hint}</span>
          </button>
        ))}
      </nav>

      <section className={view === "details" ? "space-y-3" : "hidden"}>
        <div className="flex items-center justify-between"><h3 className="text-sm font-bold">Business and agreement</h3>
          <label className="flex items-center gap-2 text-xs font-semibold"><Switch on={p.active} label="Partner on or off" disabled={!!busy} onChange={() => run("active", () => editPartner(p.id, { active: !p.active }), p.active ? "Paused. Customers no longer see it." : "Switched on.")} /> {p.active ? "On" : "Paused"}</label></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-muted">Business name<input value={f.name} maxLength={80} onChange={(e) => setF({ ...f, name: e.target.value })} className={`${field} mt-1`} /></label>
          <label className="block text-xs text-muted">Category<input list="partner-cats2" value={f.category} maxLength={40} onChange={(e) => setF({ ...f, category: e.target.value })} className={`${field} mt-1`} /><datalist id="partner-cats2">{categories.map((c) => <option key={c} value={c} />)}</datalist></label>
          <label className="block text-xs text-muted">Contact person<input value={f.contactName} maxLength={60} onChange={(e) => setF({ ...f, contactName: e.target.value })} className={`${field} mt-1`} /></label>
          <label className="block text-xs text-muted">Their phone<input inputMode="tel" value={f.contactPhone} maxLength={20} onChange={(e) => setF({ ...f, contactPhone: e.target.value.replace(/[^\d+\s-]/g, "") })} className={`${field} mt-1`} /></label>
          <label className="block text-xs text-muted">Agreement starts<input type="date" value={f.agreementStart} onChange={(e) => setF({ ...f, agreementStart: e.target.value })} className={`${field} mt-1`} /></label>
          <label className="block text-xs text-muted">Agreement ends<input type="date" value={f.agreementEnd} min={f.agreementStart} onChange={(e) => setF({ ...f, agreementEnd: e.target.value })} className={`${field} mt-1`} /></label>
        </div>
        <label className="block text-xs text-muted">About them (shown to customers)<textarea rows={2} value={f.about} maxLength={400} onChange={(e) => setF({ ...f, about: e.target.value })} className={`${field} mt-1`} /></label>
        {dirty && <button type="button" disabled={busy === "details"} onClick={saveDetails} className="flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white">{busy === "details" && <Loader2 size={15} className="animate-spin" />} Save changes</button>}
      </section>

      <section className={view === "banners" ? "space-y-3" : "hidden"}>
        <h3 className="text-sm font-bold">Banners</h3>
        {p.bannerUrl ? (
          <button type="button" onClick={() => setView("banner")} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-2 text-left transition hover:shadow-md">
            <img src={picUrl(p.bannerUrl)} alt={`${p.name} banner`} className="aspect-[16/7] w-32 shrink-0 rounded-xl object-cover sm:w-44" />
            <span className="min-w-0 flex-1 space-y-1">
              <span className="block truncate text-sm font-bold">{p.name} banner</span>
              <Badge tone={BANNER_STATUS[p.banner.status].tone}>{BANNER_STATUS[p.banner.status].label}</Badge>
              <span className="block text-xs text-muted">{p.banner.seconds} seconds · priority {p.banner.priority}</span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-muted" />
          </button>
        ) : (
          <div className="grid place-items-center gap-2 rounded-2xl bg-surface-2 p-8 text-center text-sm text-muted">
            <ImagePlus size={26} /><p>No banner yet. Upload one here, or the partner can upload it from its dashboard.</p>
            <button type="button" disabled={busy === "banner"} onClick={() => pick.current?.click()} className="flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white">{busy === "banner" ? <Loader2 size={14} className="animate-spin" /> : <Plus size={15} />} Upload a banner</button>
          </div>
        )}
      </section>

      <section className={view === "banner" ? "space-y-2" : "hidden"}>
        <button type="button" onClick={() => setView("banners")} className="flex items-center gap-1 text-xs font-semibold text-brand"><ArrowLeft size={14} /> All banners</button>
        <h3 className="text-sm font-bold">Banner</h3>
        <div className="grid aspect-[16/7] w-full place-items-center overflow-hidden rounded-xl bg-surface-2 text-sm text-muted">
          {p.bannerUrl ? <img src={picUrl(p.bannerUrl)} alt={`${p.name} banner`} className="h-full w-full object-cover" /> : "No banner yet. The partner can upload one from its dashboard."}
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={busy === "banner"} onClick={() => pick.current?.click()} className="flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm font-semibold">{busy === "banner" ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={15} />} {p.bannerUrl ? "Replace" : "Upload"}</button>
          {p.bannerUrl && <button type="button" onClick={() => run("banner", () => editPartner(p.id, { removeBanner: true }), "Banner removed.")} className="rounded-full px-3 py-2 text-sm font-semibold text-red-600">Remove</button>}
          <input ref={pick} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Choose the banner picture" onChange={(e) => { void banner(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        <BannerSchedule key={JSON.stringify(p.banner)} p={p} onChange={onChange} />
      </section>

      <section className={view === "add" ? "space-y-3" : "hidden"}>
        <h3 className="text-sm font-bold">Discounts for loyalty points</h3>
        {p.offers.length === 0 && <p className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-800">No discount yet. Customers see this partner only once it has at least one offer that is on.</p>}
        <ul className="space-y-3">{p.offers.map((o) => <OfferRow key={`${o.id}-${o.code}-${o.pointsCost}-${o.active}`} pid={p.id} o={o} onPartner={onChange} />)}</ul>
        {add ? (
          <div className="space-y-2 rounded-2xl border border-dashed border-line p-3">
            <OfferFields d={add} set={(x) => { setAdd({ ...add, ...x }); setErr(""); }} />
            <div className="flex gap-2"><button type="button" disabled={busy === "offer"} onClick={addNew} className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white">Add offer</button><button type="button" onClick={() => setAdd(null)} className="rounded-full px-3 py-2 text-sm font-semibold text-muted">Cancel</button></div>
          </div>
        ) : <button type="button" onClick={() => setAdd(blankOffer())} className="flex items-center gap-1.5 text-sm font-semibold text-brand"><Plus size={15} /> Add a discount</button>}
      </section>

      <section className={view === "link" ? "space-y-2" : "hidden"}>
        <h3 className="flex items-center gap-2 text-sm font-bold"><Link2 size={15} /> Partner dashboard link</h3>
        <p className="text-xs text-muted">Send this to {p.contactName || "the partner"}. They open it without signing in to see the customers who used a discount, check a card code, mark it used and change their banner.{p.link.lastSeenAt ? ` Last opened ${when(p.link.lastSeenAt)}.` : " Not opened yet."}</p>
        {p.link.active ? (
          <div className="flex gap-2">
            <input readOnly value={url} aria-label="Dashboard link" onFocus={(e) => e.currentTarget.select()} className={`${field} font-mono text-xs`} />
            <button type="button" onClick={async () => { await copyText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }} aria-label="Copy the link" className="flex shrink-0 items-center gap-1 rounded-xl border border-line px-3 text-sm font-semibold">{copied ? <Check size={15} /> : <Copy size={15} />}</button>
            <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Open the link" className="grid shrink-0 place-items-center rounded-xl border border-line px-3"><ExternalLink size={15} /></a>
          </div>
        ) : <p className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-800">The link is switched off.</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!!busy} onClick={async () => { if (!p.link.active || (await askConfirm("Make a new link? The old one stops working."))) await run("link", () => newLink(p.id), "New link made."); }} className="rounded-full border border-line px-4 py-2 text-xs font-semibold">{p.link.active ? "Make a new link" : "Switch the link on"}</button>
          {p.link.active && <button type="button" disabled={!!busy} onClick={() => run("link", () => linkOff(p.id), "Link switched off.")} className="rounded-full px-3 py-2 text-xs font-semibold text-red-600">Switch the link off</button>}
        </div>
      </section>

      <section className={view === "link" ? "space-y-2 border-t border-line pt-4" : "hidden"}>
        <h3 className="text-sm font-bold">Customers who used a discount <span className="font-normal text-muted">({p.stats.active} waiting, {p.stats.used} used)</span></h3>
        {!cards ? <p className="text-sm text-muted">Loading…</p> : cards.length === 0 ? <p className="rounded-xl bg-surface-2 p-3 text-center text-sm text-muted">No customer has used a discount yet.</p> : (
          <ul className="divide-y divide-line">
            {cards.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{r.customerName ?? "Customer"} <span className="font-normal text-muted">{r.phone}</span></span><span className="block text-xs text-muted">{r.discountText} · {r.points} points · {when(r.createdAt)} · <span className="font-mono">{r.code}</span></span></span>
                <Badge tone={CARD_STATUS[r.status].tone}>{CARD_STATUS[r.status].label}</Badge>
                {r.status === "active" && <button type="button" disabled={busy === "c" + r.id} onClick={() => cancelCard(r)} className="text-xs font-semibold text-red-600">Cancel</button>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <button type="button" onClick={remove} className={`items-center gap-1.5 text-xs font-semibold text-red-600 ${view === "details" ? "flex" : "hidden"}`}><Trash2 size={13} /> Delete this partner</button>
    </Sheet>
  );
}

/* ---------------- the page ---------------- */
export default function MarketplacePage() {
  const [items, setItems] = useState<Partner[] | null>(null);
  const [cats, setCats] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [register, setRegister] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => listPartners().then((r) => { setItems(r.items); setCats(r.categories); setError(""); }).catch((e) => setError(msg(e))), []);
  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t); }, [load]);
  const replace = (p: Partner) => setItems((l) => (l ? l.map((x) => (x.id === p.id ? p : x)) : l));
  const open = items?.find((x) => x.id === openId) ?? null;

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Store className="text-brand" /> Partner Marketplace</h1>
          <p className="text-sm text-muted">Cafes, swimming pools and other businesses that give our customers a discount for loyalty points. Set the agreement, the discount codes and the points, and share their own dashboard link.</p>
        </div>
        <button type="button" onClick={() => guard("marketplace.manage") && setRegister(true)} className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16} /> Register partner</button>
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
      {!items && !error && <p className="py-10 text-center text-sm text-muted">Loading…</p>}
      {items && items.length === 0 && <div className="rounded-2xl bg-surface p-10 text-center shadow-sm"><Store size={32} className="mx-auto text-muted" /><p className="mt-2 font-semibold">No partner yet</p><p className="text-sm text-muted">Register the first business to start the marketplace.</p></div>}

      <ul className="grid gap-3 md:grid-cols-2">
        {items?.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => setOpenId(p.id)} className="flex h-full w-full flex-col overflow-hidden rounded-2xl bg-surface text-left shadow-sm transition hover:shadow-md">
              <span className="flex flex-1 flex-col gap-1.5 p-4">
                <span className="flex items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-header text-white"><Store size={22} /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-base font-bold">{p.name}</span><span className="block truncate text-xs text-muted">{p.category}{p.contactName ? ` · ${p.contactName}` : ""}</span></span>
                  <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
                </span>
                <span className="text-xs text-muted">Agreement {fmtDay(p.agreementStart)} to {fmtDay(p.agreementEnd)}</span>
                <span className="mt-1 flex flex-wrap gap-1.5 text-xs">
                  <span className="rounded-full bg-surface-2 px-2.5 py-1 font-semibold">{p.offers.filter((o) => o.active).length} offer{p.offers.filter((o) => o.active).length === 1 ? "" : "s"} on</span>
                  <span className="rounded-full bg-surface-2 px-2.5 py-1 font-semibold">{p.stats.active + p.stats.used} customers</span>
                  {p.stats.active > 0 && <span className="rounded-full bg-blue-500/15 px-2.5 py-1 font-semibold text-blue-700">{p.stats.active} waiting to use</span>}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {register && <RegisterSheet categories={cats} onClose={() => setRegister(false)} onCreated={(p) => { setRegister(false); void load().then(() => setOpenId(p.id)); }} />}
      {open && <ManageSheet key={open.id} partner={open} categories={cats} onClose={() => setOpenId(null)} onChange={replace} onDeleted={() => { setOpenId(null); void load(); }} />}
    </div>
  );
}
