"use client";

/* eslint-disable @next/next/no-img-element -- pictures come from the venue's own server, so next/image is not used */

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Clock, ImagePlus, Loader2, Lock, Pencil, Plus, ScanSearch, Store, Trash2, Users, X } from "lucide-react";
import { ApiError } from "@/lib/api";
import { fileToDataUrl, picUrl } from "@/lib/content";
import { CARD_STATUS, Offer, PartnerDash, Redemption, STATUS, fmtDay, partnerAddOffer, partnerBanner, partnerDeleteOffer, partnerEditOffer, partnerMarkUsed, partnerVerify, partnerView, when } from "@/lib/marketplace";

// The partner's own dashboard (opened from the private link, no sign-in): the customers who used a loyalty-points discount here, a box to
// check a card code, the partner's banner, and its discounts. The partner writes which items get which discount; only Unique Futsal sets the points.
const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");
const field = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const card = "space-y-3 rounded-2xl bg-surface p-4 shadow-sm";

type Draft = { id: string | null; title: string; discountText: string; maxPerCustomer: string };
const blank: Draft = { id: null, title: "", discountText: "", maxPerCustomer: "" };

export default function PartnerDashboard({ token }: { token: string }) {
  const [d, setD] = useState<PartnerDash | null>(null);
  const [dead, setDead] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [code, setCode] = useState("");
  const [found, setFound] = useState<Redemption | null>(null);
  const [busy, setBusy] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const pick = useRef<HTMLInputElement>(null);

  const load = useCallback(() => partnerView(token).then((x) => { setD(x); setDead(""); }).catch((e) => { if (e instanceof ApiError && (e.status === 404 || e.status === 410)) setDead(msg(e)); }), [token]);
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 20_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [load]);

  async function run(key: string, fn: () => Promise<PartnerDash>, done: string) {
    setBusy(key); setErr(""); setOk("");
    try { setD(await fn()); setOk(done); return true; } catch (e) { setErr(msg(e)); return false; } finally { setBusy(""); }
  }
  async function verify(ev: React.FormEvent) {
    ev.preventDefault();
    if (code.trim().length < 3) return;
    setBusy("verify"); setErr(""); setOk(""); setFound(null);
    try { setFound(await partnerVerify(token, code)); } catch (e) { setErr(msg(e)); } finally { setBusy(""); }
  }
  async function used(r: Redemption) {
    if (await run("u" + r.id, () => partnerMarkUsed(token, r.id), "Marked as used.")) setFound((f) => (f && f.id === r.id ? { ...f, status: "used" } : f));
  }
  async function banner(file?: File) {
    if (!file) return;
    await run("banner", async () => partnerBanner(token, await fileToDataUrl(file)), "Your banner is updated. Customers see it in the app.");
  }
  async function saveDraft(ev: React.FormEvent) {
    ev.preventDefault();
    if (!draft) return;
    const body = { title: draft.title.trim(), discountText: draft.discountText.trim(), maxPerCustomer: draft.maxPerCustomer ? Number(draft.maxPerCustomer) : null };
    const id = draft.id;
    if (await run("offer", () => (id ? partnerEditOffer(token, id, body) : partnerAddOffer(token, body)), id ? "Saved." : "Added. Unique Futsal will set its loyalty points, then customers can use it.")) setDraft(null);
  }

  if (dead) return (
    <main className="grid min-h-dvh place-items-center bg-background p-6">
      <div role="alert" className="max-w-sm space-y-3 rounded-3xl bg-surface p-8 text-center shadow-lg"><Lock size={30} className="mx-auto text-muted" /><p className="font-bold">This link does not work</p><p className="text-sm text-muted">{dead}</p></div>
    </main>
  );
  if (!d) return <main className="grid min-h-dvh place-items-center bg-background text-sm text-muted"><Loader2 className="animate-spin" /></main>;

  const p = d.partner;
  const draftOk = !!draft && draft.title.trim().length >= 2 && draft.discountText.trim().length >= 2;
  const offerBadge = (o: Offer) => o.pointsCost <= 0
    ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-700"><Clock size={12} /> Waiting for points</span>
    : <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold tabular-nums">{o.pointsCost} points</span>;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 bg-background p-4 pb-12">
      <header className="flex items-center gap-3 rounded-2xl bg-header p-4 text-white">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-header"><Store size={22} /></span>
        <div className="min-w-0 flex-1"><p className="text-xs text-white/70">UNIQUE FUTSAL · Partner dashboard</p><h1 className="truncate text-lg font-bold">{p.name}</h1><p className="text-xs text-white/70">{p.category} · agreement {fmtDay(p.agreementStart)} to {fmtDay(p.agreementEnd)}</p></div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS[p.status].tone}`}>{STATUS[p.status].label}</span>
      </header>

      <p className="rounded-xl bg-surface p-3 text-sm text-muted shadow-sm">
        Choose which items get a discount, check a customer&apos;s card and mark it used. Unique Futsal sets how many loyalty points each discount costs. This page updates by itself. Please do not share the link.
      </p>

      {err && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{err}</p>}
      {ok && <p role="status" className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-700">{ok}</p>}

      <div className="grid grid-cols-3 gap-2 text-center">
        {([["Customers", d.stats.total], ["Waiting to use", d.stats.active], ["Used", d.stats.used]] as const).map(([l, n]) => (
          <div key={l} className="rounded-2xl bg-surface p-3 shadow-sm"><p className="text-2xl font-extrabold tabular-nums">{n}</p><p className="text-[11px] text-muted">{l}</p></div>
        ))}
      </div>

      <form onSubmit={verify} className={card}>
        <h2 className="flex items-center gap-2 text-sm font-bold"><ScanSearch size={16} /> Check a customer&apos;s card</h2>
        <p className="text-xs text-muted">The customer shows a code like UFM-AB12CD on their phone. Type it here to see who it belongs to and what discount they get.</p>
        <div className="flex gap-2">
          <input value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setFound(null); }} placeholder="UFM-XXXXXX" aria-label="Card code" maxLength={30} className={`${field} font-mono`} />
          <button type="submit" disabled={busy === "verify" || code.trim().length < 3} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60">{busy === "verify" && <Loader2 size={14} className="animate-spin" />} Check</button>
        </div>
        {found && (
          <div className="space-y-2 rounded-xl bg-surface-2 p-3 text-sm">
            <p className="font-bold">{found.customerName ?? "Customer"} <span className="font-normal text-muted">{found.phone}</span></p>
            <p>{found.discountText} <span className="text-muted">({found.offerTitle}, code {found.discountCode})</span></p>
            <div className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${CARD_STATUS[found.status].tone}`}>{CARD_STATUS[found.status].label}</span>
              {found.status === "active" && <button type="button" disabled={busy === "u" + found.id} onClick={() => used(found)} className="flex items-center gap-1 rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white"><Check size={13} /> Give the discount, mark used</button>}</div>
          </div>
        )}
      </form>

      <section className={card}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold">Your discounts</h2>
          {!draft && <button type="button" onClick={() => { setDraft(blank); setErr(""); setOk(""); }} className="flex items-center gap-1 rounded-full bg-brand px-3.5 py-1.5 text-xs font-semibold text-white"><Plus size={14} /> Add a discount</button>}
        </div>
        <p className="text-xs text-muted">Say which item or offer gets a discount and how much. Unique Futsal then sets the loyalty points it costs, and it goes live for customers.</p>

        {draft && (
          <form onSubmit={saveDraft} className="space-y-2.5 rounded-xl bg-surface-2 p-3">
            <p className="text-xs font-bold">{draft.id ? "Edit the discount" : "New discount"}</p>
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Item, for example Momo set" aria-label="Item or offer" maxLength={60} className={field} />
            <input value={draft.discountText} onChange={(e) => setDraft({ ...draft, discountText: e.target.value })} placeholder="Discount, for example 10% off or Rs 100 off" aria-label="Discount amount" maxLength={80} className={field} />
            <label className="flex items-center gap-2 text-xs text-muted">Most uses per customer (optional)
              <input inputMode="numeric" value={draft.maxPerCustomer} onChange={(e) => setDraft({ ...draft, maxPerCustomer: e.target.value.replace(/\D/g, "").slice(0, 3) })} placeholder="No limit" aria-label="Most uses per customer" className={`${field} w-28`} />
            </label>
            <div className="flex gap-2">
              <button type="submit" disabled={!draftOk || busy === "offer"} className="flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white disabled:opacity-60">{busy === "offer" && <Loader2 size={13} className="animate-spin" />} {draft.id ? "Save" : "Add"}</button>
              <button type="button" onClick={() => setDraft(null)} className="flex items-center gap-1 rounded-full border border-line px-4 py-2 text-xs font-semibold"><X size={13} /> Cancel</button>
            </div>
          </form>
        )}

        {d.offers.length === 0 && !draft ? <p className="py-6 text-center text-sm text-muted">No discounts yet. Add the first one.</p> : (
          <ul className="divide-y divide-line">
            {d.offers.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 text-sm">
                <span className={`min-w-0 flex-1 ${o.active ? "" : "opacity-70"}`}>
                  <span className="block font-semibold">{o.title}</span>
                  <span className="block text-xs text-muted">{o.discountText}{o.maxPerCustomer ? ` · ${o.maxPerCustomer} per customer` : ""}{o.active ? "" : o.pointsCost > 0 ? " · switched off" : ""}</span>
                </span>
                {offerBadge(o)}
                <span className="flex shrink-0 items-center gap-1">
                  {o.pointsCost > 0 && <button type="button" role="switch" aria-checked={o.active} aria-label={`${o.title} is ${o.active ? "on" : "off"}`} disabled={busy === "t" + o.id} onClick={() => run("t" + o.id, () => partnerEditOffer(token, o.id, { active: !o.active }), o.active ? "Switched off." : "Switched on.")} className={`relative h-6 w-11 rounded-full transition ${o.active ? "bg-emerald-500" : "bg-slate-300"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${o.active ? "left-[22px]" : "left-0.5"}`} /></button>}
                  <button type="button" aria-label={`Edit ${o.title}`} onClick={() => { setDraft({ id: o.id, title: o.title, discountText: o.discountText, maxPerCustomer: o.maxPerCustomer ? String(o.maxPerCustomer) : "" }); setErr(""); setOk(""); }} className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface-2"><Pencil size={15} /></button>
                  <button type="button" aria-label={`Remove ${o.title}`} disabled={busy === "x" + o.id} onClick={() => { if (confirm(`Remove "${o.title}"?`)) void run("x" + o.id, () => partnerDeleteOffer(token, o.id), "Removed."); }} className="grid h-8 w-8 place-items-center rounded-full text-red-500 hover:bg-red-500/10"><Trash2 size={15} /></button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <h2 className="text-sm font-bold">Your banner</h2>
        <div className="grid aspect-[16/7] w-full place-items-center overflow-hidden rounded-xl bg-surface-2 text-sm text-muted">
          {p.bannerUrl ? <img src={picUrl(p.bannerUrl)} alt="Your banner" className="h-full w-full object-cover" /> : "No banner yet"}
        </div>
        <button type="button" disabled={busy === "banner"} onClick={() => pick.current?.click()} className="flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm font-semibold">{busy === "banner" ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={15} />} {p.bannerUrl ? "Change the banner" : "Upload a banner"}</button>
        <input ref={pick} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Choose your banner picture" onChange={(e) => { void banner(e.target.files?.[0]); e.target.value = ""; }} />
        <p className="text-xs text-muted">A wide picture, about 1280 x 560 px. It shows in the Unique Futsal app next to your offers.</p>
      </section>

      <section className={card}>
        <h2 className="flex items-center gap-2 text-sm font-bold"><Users size={16} /> Customers who used a discount</h2>
        {d.redemptions.length === 0 ? <p className="py-6 text-center text-sm text-muted">No customer has used a discount yet.</p> : (
          <ul className="divide-y divide-line">
            {d.redemptions.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm">
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{r.customerName ?? "Customer"} <span className="font-normal text-muted">{r.phone}</span></span><span className="block text-xs text-muted">{r.discountText} · {r.points} points · {when(r.createdAt)} · <span className="font-mono">{r.code}</span></span></span>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${CARD_STATUS[r.status].tone}`}>{CARD_STATUS[r.status].label}</span>
                {r.status === "active" && <button type="button" disabled={busy === "u" + r.id} onClick={() => used(r)} className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">Mark used</button>}
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-center text-xs text-muted">This page is private to {p.name}. Please do not share the link.</p>
    </div>
  );
}
