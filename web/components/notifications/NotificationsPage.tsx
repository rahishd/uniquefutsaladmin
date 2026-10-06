"use client";

import { useEffect, useState } from "react";
import { Bell, CheckCircle2, Loader2, Megaphone, Send, Users } from "lucide-react";
import { Badge } from "../bookings/Badge";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { AUDIENCES, Audience, Draft, LINKS, NoticeType, Sent, TYPES, history, reach, sendNotice } from "@/lib/notifications";

const EMPTY: Draft = { type: "general", audience: "all", phone: "", title: "", message: "", href: "" };
const TONE: Record<NoticeType, string> = { general: "bg-slate-500/15 text-slate-600", promo: "bg-pink-500/15 text-pink-600", tournament: "bg-amber-500/15 text-amber-700" };
const input = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const who = (s: { audience: Audience; phone: string | null }) => (s.audience === "customer" ? `Customer ${s.phone}` : s.audience === "captains" ? "Team captains" : "All customers");

export default function NotificationsPage() {
  const [d, setD] = useState<Draft>(EMPTY);
  const [list, setList] = useState<Sent[] | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [count, setCount] = useState<{ reach: number; skippedOptOut: number } | null>(null);

  useEffect(() => {
    let live = true;
    history().then((r) => live && setList(r)).catch((e) => live && setError(e instanceof Error ? e.message : "Could not load sent notices"));
    return () => { live = false; };
  }, [tick]);

  // how many customers this would reach, refreshed as the audience or type changes
  useEffect(() => {
    if (d.audience === "customer" && !/^\d{10}$/.test(d.phone)) return;
    let live = true;
    const t = setTimeout(() => {
      reach(d).then((r) => live && setCount(r)).catch(() => live && setCount(null));
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [d.type, d.audience, d.phone]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => { setD((x) => ({ ...x, [k]: v })); setDone(""); setError(""); setCount(null); };
  const shown = d.audience === "customer" && !/^\d{10}$/.test(d.phone) ? null : count;
  const valid = d.title.trim().length >= 2 && d.message.trim().length >= 2 && (d.audience !== "customer" || /^\d{10}$/.test(d.phone));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!guard("notifications.send") || !valid) return;
    const n = shown?.reach;
    if (d.audience !== "customer" && !window.confirm(`Send "${d.title.trim()}" to ${n ?? "all"} ${d.audience === "captains" ? "team captains" : "customers"}? It cannot be taken back.`)) return;
    setBusy(true); setError(""); setDone("");
    try {
      const r = await sendNotice(d);
      setDone(`Sent to ${r.sent} ${r.sent === 1 ? "customer" : "customers"}${r.skippedOptOut ? ` (${r.skippedOptOut} skipped: promo notices off)` : ""}. ${r.pushEnabled ? `Phone alert delivered to ${r.pushed}.` : "Phone alerts are not set up on the server yet, so it shows in the bell only."}`);
      setD((x) => ({ ...EMPTY, type: x.type, audience: x.audience }));
      setTick((t) => t + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send the notice");
    } finally {
      setBusy(false);
    }
  }

  const left = (s: string, max: number) => `${s.length}/${max}`;
  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Megaphone className="text-brand" /> Notifications</h1>
        <p className="text-sm text-muted">Send a notice to customers. It shows in their bell in the app, and as a push alert if they allowed it.</p>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form onSubmit={submit} className="space-y-4 rounded-2xl bg-surface p-4 shadow-sm">
          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold">Kind of notice</legend>
            <div className="flex gap-1 rounded-2xl bg-surface-2 p-1" role="radiogroup">
              {TYPES.map((t) => (
                <button key={t.id} type="button" role="radio" aria-checked={d.type === t.id} onClick={() => set("type", t.id)}
                  className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${d.type === t.id ? "bg-brand text-white" : "text-muted"}`}>{t.label}</button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted">{TYPES.find((t) => t.id === d.type)?.hint}</p>
          </fieldset>

          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold">Send to</legend>
            <div className="flex gap-1 rounded-2xl bg-surface-2 p-1" role="radiogroup">
              {AUDIENCES.map((a) => (
                <button key={a.id} type="button" role="radio" aria-checked={d.audience === a.id} onClick={() => set("audience", a.id)}
                  className={`flex-1 rounded-xl px-2 py-2 text-sm font-semibold ${d.audience === a.id ? "bg-brand text-white" : "text-muted"}`}>{a.label}</button>
              ))}
            </div>
            {d.audience === "customer" && (
              <input value={d.phone} onChange={(e) => set("phone", e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" placeholder="Customer mobile number (10 digits)" aria-label="Customer mobile number" className={`${input} mt-2`} />
            )}
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted" aria-live="polite">
              <Users size={13} />
              {shown ? `Will reach ${shown.reach} ${shown.reach === 1 ? "customer" : "customers"}${shown.skippedOptOut ? `, ${shown.skippedOptOut} skipped (promo off)` : ""}` : d.audience === "customer" ? "Enter the number to check it" : "Counting…"}
            </p>
          </fieldset>

          <label className="block">
            <span className="mb-1.5 flex justify-between text-sm font-semibold">Title <span className="font-normal text-muted">{left(d.title, 60)}</span></span>
            <input value={d.title} maxLength={60} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Closed on Friday" className={input} />
          </label>
          <label className="block">
            <span className="mb-1.5 flex justify-between text-sm font-semibold">Message <span className="font-normal text-muted">{left(d.message, 240)}</span></span>
            <textarea value={d.message} maxLength={240} rows={4} onChange={(e) => set("message", e.target.value)} placeholder="Keep it short and clear." className={input} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">When tapped, open</span>
            <select value={d.href} onChange={(e) => set("href", e.target.value)} className={input}>
              {LINKS.map((l) => <option key={l.href} value={l.href}>{l.label}</option>)}
            </select>
          </label>

          {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
          {done && <p role="status" className="flex items-center gap-2 rounded-xl bg-brand/10 p-3 text-sm text-brand"><CheckCircle2 size={16} /> {done}</p>}

          <button type="submit" disabled={!valid || busy} className="flex w-full items-center justify-center gap-2 rounded-full bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Send notice
          </button>
        </form>

        <div className="space-y-4">
          <div className="rounded-2xl bg-surface p-4 shadow-sm">
            <p className="mb-2 text-sm font-semibold">What the customer sees</p>
            <div className="flex gap-3 rounded-2xl bg-surface-2 p-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand/15 text-brand"><Bell size={18} /></span>
              <div className="min-w-0">
                <p className="break-words font-semibold">{d.title.trim() || "Your title"}</p>
                <p className="break-words text-sm text-muted">{d.message.trim() || "Your message appears here."}</p>
                <p className="mt-1 text-xs text-muted">Just now</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-surface p-4 shadow-sm">
            <p className="mb-2 text-sm font-semibold">Sent notices</p>
            {!list && !error && <p className="py-6 text-center text-sm text-muted">Loading…</p>}
            {list && list.length === 0 && <p className="py-6 text-center text-sm text-muted">Nothing sent yet.</p>}
            <ul className="space-y-2">
              {list?.map((s) => (
                <li key={s.id} className="space-y-1.5 rounded-xl bg-surface-2 p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={TONE[s.type] ?? TONE.general}>{s.type}</Badge>
                    <span className="text-xs text-muted">{when(s.at)} · {s.by}</span>
                  </div>
                  <p className="break-words font-semibold">{s.title}</p>
                  <p className="break-words text-sm text-muted">{s.message}</p>
                  <p className="text-xs text-muted">{who(s)} · sent to <strong className="text-foreground">{s.sent}</strong> · phone alert to <strong className="text-foreground">{s.pushed}</strong> · opened by <strong className="text-foreground">{s.read}</strong>{s.sent ? ` (${Math.round((s.read / s.sent) * 100)}%)` : ""}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
