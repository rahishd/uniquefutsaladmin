"use client";

import { useEffect, useState } from "react";
import { Check, Copy, MessageCircle, Pencil, Plus, Search, Tag, Trash2, X } from "lucide-react";
import { Badge } from "../bookings/Badge";
import Switch from "../Switch";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { rs } from "@/lib/bookings";
import {
  APPLIES, AppliesTo, DAYS, Day, Promo, PromoInput, PromoState, autoLabel, conditions, createPromo, fmtDay, listPromos, removePromo, savePromo, setPromoActive,
} from "@/lib/promos";
import { copyText } from "@/lib/vip";

type Filter = "all" | "active" | "paused" | "expired";
const input = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" }).format(new Date());
const TONE = { active: "bg-green-500/15 text-green-700", paused: "bg-amber-500/15 text-amber-700", expired: "bg-surface-2 text-muted" } as const;
const WORD = { active: "Live", paused: "Paused", expired: "Expired" } as const;

const shareText = (p: PromoInput) => `Unique Futsal: use code ${p.code} for ${p.label}${p.title ? ` (${p.title})` : ""}. ${conditions(p).join(". ")}.`;

// ---------- add or change a code ----------
type Draft = { code: string; type: "percent" | "flat"; value: string; label: string; labelEdited: boolean; title: string; description: string; appliedTo: AppliesTo; expiryDate: string; validDays: Day[]; startTime: string; endTime: string; isActive: boolean };
const blank: Draft = { code: "", type: "percent", value: "", label: "", labelEdited: false, title: "", description: "", appliedTo: "booking", expiryDate: "", validDays: [], startTime: "", endTime: "", isActive: true };
const toDraft = (p: Promo): Draft => ({ code: p.code, type: p.type, value: String(p.value), label: p.label, labelEdited: true, title: p.title ?? "", description: p.description ?? "", appliedTo: p.appliedTo, expiryDate: p.expiryDate?.slice(0, 10) ?? "", validDays: (p.validDays ?? []) as Day[], startTime: p.startTime ?? "", endTime: p.endTime ?? "", isActive: p.isActive !== false });

function PromoSheet({ edit, onClose, onSaved }: { edit: Promo | null; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<Draft>(edit ? toDraft(edit) : blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<Draft>) => { setD((x) => { const n = { ...x, ...patch }; if (!n.labelEdited && ("type" in patch || "value" in patch)) n.label = autoLabel(n.type, Number(n.value)); return n; }); setError(""); };
  const value = Number(d.value);
  const toggleDay = (day: Day) => set({ validDays: d.validDays.includes(day) ? d.validDays.filter((x) => x !== day) : [...d.validDays, day] });
  const body: PromoInput = {
    code: d.code.trim().toUpperCase(), type: d.type, value, label: d.label.trim(), appliedTo: d.appliedTo, isActive: d.isActive,
    ...(d.title.trim() ? { title: d.title.trim() } : {}), ...(d.description.trim() ? { description: d.description.trim() } : {}), ...(d.expiryDate ? { expiryDate: d.expiryDate } : {}),
    ...(d.validDays.length ? { validDays: d.validDays } : {}), ...(d.startTime && d.endTime ? { startTime: d.startTime, endTime: d.endTime } : {}),
  };
  const problem = !/^[A-Za-z0-9]{3,20}$/.test(d.code.trim()) ? "The code needs 3 to 20 letters or numbers." : !(value > 0) ? "Enter the discount." : d.type === "percent" && value > 100 ? "A percent discount cannot be more than 100." : d.label.trim().length < 2 ? "Write what the customer sees, like 15% OFF." : !!d.startTime !== !!d.endTime ? "Give both times of the window, or neither." : d.startTime && d.endTime && d.startTime >= d.endTime ? "The window must start before it ends." : "";

  async function save() {
    if (!guard(edit ? "promos.edit" : "promos.create")) return;
    if (problem) return setError(problem);
    setBusy(true); setError("");
    try { await (edit ? savePromo(body) : createPromo(body)); onSaved(); onClose(); } catch (e) { setError(msg(e)); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label={edit ? "Edit promo code" : "New promo code"} onClick={(e) => e.stopPropagation()} className="max-h-[94vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="flex items-start justify-between"><h2 className="text-lg font-bold">{edit ? `Edit ${edit.code}` : "New promo code"}</h2><button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-surface-2"><X size={20} /></button></div>

        {!edit && <label className="block text-sm font-medium">Code (what the customer types)<input className={`${input} mt-1 font-mono uppercase`} value={d.code} maxLength={20} onChange={(e) => set({ code: e.target.value.replace(/[^A-Za-z0-9]/g, "") })} placeholder="TIHAR20" /></label>}

        <div>
          <p className="mb-1 text-sm font-medium">Discount</p>
          <div className="flex gap-2">
            <div className="flex gap-1 rounded-xl bg-surface-2 p-1" role="group" aria-label="Type of discount">
              {([["percent", "Percent"], ["flat", "Rupees"]] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={d.type === v} onClick={() => set({ type: v })} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${d.type === v ? "bg-brand text-white" : "text-muted"}`}>{l}</button>)}
            </div>
            <input inputMode="numeric" className={`${input} w-28`} value={d.value} onChange={(e) => set({ value: e.target.value.replace(/\D/g, "").slice(0, 6) })} placeholder={d.type === "percent" ? "20" : "200"} aria-label="Discount amount" />
            <span className="self-center text-sm text-muted">{d.type === "percent" ? "% off" : "Rs. off"}</span>
          </div>
        </div>

        <label className="block text-sm font-medium">Shown to the customer as<input className={`${input} mt-1`} value={d.label} maxLength={40} onChange={(e) => set({ label: e.target.value, labelEdited: true })} placeholder="20% OFF" /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">Title (optional)<input className={`${input} mt-1`} value={d.title} maxLength={60} onChange={(e) => set({ title: e.target.value })} placeholder="Tihar special" /></label>
          <label className="block text-sm font-medium">Works for
            <select className={`${input} mt-1`} value={d.appliedTo} onChange={(e) => set({ appliedTo: e.target.value as AppliesTo })}>{(Object.keys(APPLIES) as AppliesTo[]).map((k) => <option key={k} value={k}>{APPLIES[k]}</option>)}</select>
          </label>
        </div>
        <label className="block text-sm font-medium">Description (optional)<input className={`${input} mt-1`} value={d.description} maxLength={200} onChange={(e) => set({ description: e.target.value })} placeholder="20% off every evening game this week" /></label>

        <div className="space-y-3 rounded-xl border border-line p-3">
          <p className="text-sm font-bold">When it works <span className="font-normal text-muted">(leave empty for no limit)</span></p>
          <label className="block text-sm font-medium">Last day<input type="date" className={`${input} mt-1`} value={d.expiryDate} min={edit ? undefined : today()} onChange={(e) => set({ expiryDate: e.target.value })} /></label>
          <div>
            <p className="mb-1 text-sm font-medium">Only on these days</p>
            <div className="flex flex-wrap gap-1.5">{DAYS.map((day) => <button key={day} type="button" aria-pressed={d.validDays.includes(day)} onClick={() => toggleDay(day)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${d.validDays.includes(day) ? "bg-brand text-white" : "border border-line"}`}>{day.slice(0, 3)}</button>)}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">Slots from<input type="time" className={`${input} mt-1`} value={d.startTime} onChange={(e) => set({ startTime: e.target.value })} /></label>
            <label className="block text-sm font-medium">Slots until<input type="time" className={`${input} mt-1`} value={d.endTime} onChange={(e) => set({ endTime: e.target.value })} /></label>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-surface-2 p-3 text-sm"><span><strong>Live</strong><span className="block text-xs text-muted">Turn off to keep the code but stop customers using it.</span></span><Switch on={d.isActive} onChange={() => set({ isActive: !d.isActive })} label="Code is live" /></div>

        {!problem && <div className="rounded-xl border border-dashed border-brand/40 p-3 text-sm"><p className="text-xs font-semibold uppercase tracking-wide text-muted">What customers see</p><p className="mt-1 font-bold">{body.code} · {body.label}{body.title ? ` · ${body.title}` : ""}</p><p className="text-xs text-muted">{conditions(body).join(" · ")}</p></div>}
        {(error || problem) && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error || problem}</p>}
        <button onClick={save} disabled={busy || !!problem} className="w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : edit ? "Save changes" : "Create code"}</button>
      </div>
    </div>
  );
}

// ---------- the page ----------
export default function PromosPage() {
  const [items, setItems] = useState<Promo[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [sheet, setSheet] = useState<"new" | Promo | null>(null);
  const [tick, setTick] = useState(0);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    let live = true;
    listPromos().then((d) => { if (live) { setItems(d); setError(""); } }).catch((e) => { if (live) setError(msg(e)); });
    return () => { live = false; };
  }, [tick]);

  const reload = () => setTick((t) => t + 1);
  const count = (s: PromoState | "all") => (items ?? []).filter((p) => s === "all" || p.status === s).length;
  const shown = (items ?? []).filter((p) => (filter === "all" || p.status === filter) && (!search.trim() || [p.code, p.title ?? "", p.label].some((x) => x.toLowerCase().includes(search.trim().toLowerCase()))));
  const given = (items ?? []).reduce((t, p) => t + p.discountGiven, 0);
  const used = (items ?? []).reduce((t, p) => t + p.uses, 0);

  async function toggle(p: Promo) {
    if (!guard("promos.edit")) return;
    setError("");
    try { await setPromoActive(p.code, p.isActive === false); reload(); } catch (e) { setError(msg(e)); }
  }
  async function remove(p: Promo) {
    if (!guard("promos.delete")) return;
    if (!window.confirm(`Delete the code ${p.code}? Customers can no longer use it. Games that already used it keep their discount. To stop it for now, pause it instead.`)) return;
    try { await removePromo(p.code); reload(); } catch (e) { setError(msg(e)); }
  }
  async function copy(code: string) { setCopied((await copyText(code)) ? code : ""); setTimeout(() => setCopied(""), 1800); }

  return (
    <div className="w-full space-y-4 lg:space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Tag className="text-brand" /> Promo Codes</h1>
          <p className="text-sm text-muted">Discount codes customers type when they book or join. The customer app shows the live ones and the server checks each code again at payment.</p>
        </div>
        <button onClick={() => guard("promos.create") && setSheet("new")} className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16} /> New code</button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([["Live codes", items ? String(count("active")) : "—"], ["Paused", items ? String(count("paused")) : "—"], ["Times used", items ? String(used) : "—"], ["Discount given", items ? rs(given) : "—"]] as const).map(([l, v]) => <div key={l} className="rounded-2xl bg-surface p-3 shadow-sm"><p className="text-xs text-muted">{l}</p><p className="text-lg font-bold">{v}</p></div>)}
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-surface p-1 shadow-sm" role="tablist" aria-label="Code state">
        {([["all", "All"], ["active", "Live"], ["paused", "Paused"], ["expired", "Expired"]] as const).map(([id, l]) => <button key={id} role="tab" aria-selected={filter === id} onClick={() => setFilter(id)} className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold ${filter === id ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}>{l}{items ? ` (${count(id)})` : ""}</button>)}
      </div>
      <label className="relative block"><Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a code or title" className={`${input} pl-10`} /></label>

      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!items && !error && <p className="py-10 text-center text-sm text-muted">Loading…</p>}
      {items && shown.length === 0 && <p className="rounded-2xl bg-surface p-8 text-center text-sm text-muted">{items.length === 0 ? "No promo codes yet. Press New code to make the first one." : "No code matches."}</p>}

      <ul className="grid gap-3 xl:grid-cols-2">
        {shown.map((p) => (
          <li key={p.code} className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2"><span className="font-mono text-lg font-bold">{p.code}</span><Badge tone={TONE[p.status]}>{WORD[p.status]}</Badge></p>
                <p className="font-semibold text-brand">{p.label}{p.title ? <span className="font-normal text-foreground"> · {p.title}</span> : null}</p>
              </div>
              {p.status !== "expired" && <Switch on={p.isActive !== false} onChange={() => toggle(p)} label={p.isActive === false ? `Make ${p.code} live` : `Pause ${p.code}`} />}
            </div>
            {p.description && <p className="text-sm text-muted">{p.description}</p>}
            <p className="flex flex-wrap gap-1.5">{conditions(p).map((c) => <span key={c} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium">{c}</span>)}</p>
            <p className="text-sm"><strong>{p.uses}</strong> time{p.uses === 1 ? "" : "s"} used · <strong>{rs(p.discountGiven)}</strong> given{p.lastUsedAt ? <span className="text-xs text-muted"> · last used {fmtDay(p.lastUsedAt)}</span> : null}</p>
            <div className="flex flex-wrap gap-2 border-t border-line pt-3">
              <button onClick={() => copy(p.code)} className="flex items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-xs font-semibold">{copied === p.code ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy code</>}</button>
              <a href={`https://wa.me/?text=${encodeURIComponent(shareText(p))}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-full bg-[#25D366] px-3.5 py-1.5 text-xs font-semibold text-white"><MessageCircle size={13} /> Share</a>
              <button onClick={() => guard("promos.edit") && setSheet(p)} className="flex items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-xs font-semibold"><Pencil size={13} /> Edit</button>
              <button onClick={() => remove(p)} className="ml-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-red-600"><Trash2 size={13} /> Delete</button>
            </div>
          </li>
        ))}
      </ul>
      {sheet && <PromoSheet edit={sheet === "new" ? null : sheet} onClose={() => setSheet(null)} onSaved={reload} />}
    </div>
  );
}
