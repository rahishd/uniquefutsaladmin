"use client";

/* eslint-disable @next/next/no-img-element -- pictures come from the venue's own server, so next/image is not used */

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ImagePlus, Loader2, Lock, ScanSearch, Store } from "lucide-react";
import { ApiError } from "@/lib/api";
import { fileToDataUrl, picUrl } from "@/lib/content";
import { CARD_STATUS, PartnerDash, Redemption, STATUS, fmtDay, partnerBanner, partnerMarkUsed, partnerVerify, partnerView, when } from "@/lib/marketplace";

// The partner's own dashboard (opened from the private link, no sign-in): the customers who used a loyalty-points discount here, a box to
// check a card code, the discounts, and the partner's banner.
const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");
const field = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";

export default function PartnerDashboard({ token }: { token: string }) {
  const [d, setD] = useState<PartnerDash | null>(null);
  const [dead, setDead] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [code, setCode] = useState("");
  const [found, setFound] = useState<Redemption | null>(null);
  const [busy, setBusy] = useState("");
  const pick = useRef<HTMLInputElement>(null);

  const load = useCallback(() => partnerView(token).then((x) => { setD(x); setDead(""); }).catch((e) => { if (e instanceof ApiError && (e.status === 404 || e.status === 410)) setDead(msg(e)); }), [token]);
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 20_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [load]);

  async function verify(ev: React.FormEvent) {
    ev.preventDefault();
    if (code.trim().length < 3) return;
    setBusy("verify"); setErr(""); setOk(""); setFound(null);
    try { setFound(await partnerVerify(token, code)); } catch (e) { setErr(msg(e)); } finally { setBusy(""); }
  }
  async function used(r: Redemption) {
    setBusy("u" + r.id); setErr(""); setOk("");
    try { setD(await partnerMarkUsed(token, r.id)); setFound((f) => (f && f.id === r.id ? { ...f, status: "used" } : f)); setOk("Marked as used."); } catch (e) { setErr(msg(e)); } finally { setBusy(""); }
  }
  async function banner(file?: File) {
    if (!file) return;
    setBusy("banner"); setErr(""); setOk("");
    try { setD(await partnerBanner(token, await fileToDataUrl(file))); setOk("Your banner is updated. Customers see it in the app."); } catch (e) { setErr(msg(e)); } finally { setBusy(""); }
  }

  if (dead) return (
    <main className="grid min-h-dvh place-items-center bg-background p-6">
      <div role="alert" className="max-w-sm space-y-3 rounded-3xl bg-surface p-8 text-center shadow-lg"><Lock size={30} className="mx-auto text-muted" /><p className="font-bold">This link does not work</p><p className="text-sm text-muted">{dead}</p></div>
    </main>
  );
  if (!d) return <main className="grid min-h-dvh place-items-center bg-background text-sm text-muted"><Loader2 className="animate-spin" /></main>;

  const p = d.partner;
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 bg-background p-4 pb-12">
      <header className="flex items-center gap-3 rounded-2xl bg-header p-4 text-white">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-header"><Store size={22} /></span>
        <div className="min-w-0 flex-1"><p className="text-xs text-white/70">UNIQUE FUTSAL · Partner dashboard</p><h1 className="truncate text-lg font-bold">{p.name}</h1><p className="text-xs text-white/70">{p.category} · agreement {fmtDay(p.agreementStart)} to {fmtDay(p.agreementEnd)}</p></div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS[p.status].tone}`}>{STATUS[p.status].label}</span>
      </header>

      {err && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{err}</p>}
      {ok && <p role="status" className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-700">{ok}</p>}

      <div className="grid grid-cols-3 gap-2 text-center">
        {([["Customers", d.stats.total], ["Waiting to use", d.stats.active], ["Used", d.stats.used]] as const).map(([l, n]) => (
          <div key={l} className="rounded-2xl bg-surface p-3 shadow-sm"><p className="text-2xl font-extrabold tabular-nums">{n}</p><p className="text-[11px] text-muted">{l}</p></div>
        ))}
      </div>

      <form onSubmit={verify} className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
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

      <section className="space-y-2 rounded-2xl bg-surface p-4 shadow-sm">
        <h2 className="text-sm font-bold">Your banner</h2>
        <div className="grid aspect-[16/7] w-full place-items-center overflow-hidden rounded-xl bg-surface-2 text-sm text-muted">
          {p.bannerUrl ? <img src={picUrl(p.bannerUrl)} alt="Your banner" className="h-full w-full object-cover" /> : "No banner yet"}
        </div>
        <button type="button" disabled={busy === "banner"} onClick={() => pick.current?.click()} className="flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm font-semibold">{busy === "banner" ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={15} />} {p.bannerUrl ? "Change the banner" : "Upload a banner"}</button>
        <input ref={pick} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Choose your banner picture" onChange={(e) => { void banner(e.target.files?.[0]); e.target.value = ""; }} />
        <p className="text-xs text-muted">A wide picture, about 1280 x 560 px. It shows in the Unique Futsal app next to your offers.</p>
      </section>

      <section className="space-y-1 rounded-2xl bg-surface p-4 shadow-sm">
        <h2 className="text-sm font-bold">Discounts customers can get</h2>
        <ul className="divide-y divide-line">
          {d.offers.map((o) => <li key={o.id} className={`flex items-center justify-between gap-3 py-2.5 text-sm ${o.active ? "" : "opacity-60"}`}><span className="min-w-0"><span className="block font-semibold">{o.discountText}</span><span className="block text-xs text-muted">{o.title} · code <span className="font-mono">{o.code}</span>{o.maxPerCustomer ? ` · ${o.maxPerCustomer} per customer` : ""}</span></span><span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold tabular-nums">{o.pointsCost} points</span></li>)}
        </ul>
      </section>

      <section className="space-y-1 rounded-2xl bg-surface p-4 shadow-sm">
        <h2 className="text-sm font-bold">Customers who used a discount</h2>
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
