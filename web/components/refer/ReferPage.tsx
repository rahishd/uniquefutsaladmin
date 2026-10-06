"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, HeartHandshake, Phone, Search, X } from "lucide-react";
import { Badge } from "../bookings/Badge";
import Switch from "../Switch";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { PAGE_SIZE, RCounts, RList, ROverview, RRules, RStatus, Referral, STATUS, adjust, approve, clock, counts as fetchCounts, dayLabel, list, overview as fetchOverview, reject, saveRules } from "@/lib/refer";

const field = "rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");
type Tab = "referrals" | "settings";
type Action = { kind: "approve" | "reject" | "adjust"; r: Referral };

export default function ReferPage() {
  const [tab, setTab] = useState<Tab>("referrals");
  const [ov, setOv] = useState<ROverview | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => { fetchOverview().then(setOv).catch(() => {}); }, [tick]);
  const changed = () => setTick((t) => t + 1);

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Refer &amp; Earn</h1>
        <p className="text-sm text-muted">A customer books a game for another team. You check it, and both get loyalty points.</p>
      </div>
      {ov && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([["Waiting for you", ov.pending], ["Approved", ov.approved], ["Rejected", ov.rejected], ["Points given", ov.pointsGiven]] as const).map(([l, n]) => (
            <div key={l} className={`rounded-2xl bg-surface p-3 shadow-sm ${l === "Waiting for you" && n > 0 ? "ring-2 ring-amber-500/50" : ""}`}><p className="text-2xl font-bold">{n}</p><p className="text-xs text-muted">{l}</p></div>
          ))}
        </div>
      )}
      {ov && !ov.rules.enabled && <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-700">Refer &amp; Earn is paused. Customers cannot send new referrals.</p>}
      <div className="flex gap-1 rounded-2xl bg-surface p-1 shadow-sm" role="tablist">
        {([["referrals", "Referrals"], ["settings", "Points & settings"]] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold ${tab === id ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}>{label}</button>
        ))}
      </div>
      {tab === "referrals" ? <Referrals tick={tick} onChanged={changed} /> : <Settings rules={ov?.rules ?? null} onSaved={changed} />}
    </div>
  );
}

function Referrals({ tick, onChanged }: { tick: number; onChanged: () => void }) {
  const [status, setStatus] = useState<RStatus | "">("pending");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [pageNo, setPageNo] = useState(1);
  const [data, setData] = useState<RList | null>(null);
  const [cnt, setCnt] = useState<RCounts | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [action, setAction] = useState<Action | null>(null);

  useEffect(() => { const t = setTimeout(() => { setQ(search); setPageNo(1); }, 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => {
    let live = true;
    list({ status, q, page: pageNo }).then((d) => { if (live) { setData(d); setError(""); } }).catch((e) => { if (live) setError(msg(e)); });
    fetchCounts().then((c) => { if (live) setCnt(c); }).catch(() => {});
    return () => { live = false; };
  }, [status, q, pageNo, tick]);

  const TABS: { id: RStatus | ""; label: string; key: keyof RCounts }[] = [{ id: "pending", label: "Waiting", key: "pending" }, { id: "approved", label: "Approved", key: "approved" }, { id: "rejected", label: "Rejected", key: "rejected" }, { id: "", label: "All", key: "all" }];
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const open = (kind: Action["kind"], r: Referral) => { if (guard(kind === "adjust" ? "refer.adjust" : "refer.review")) setAction({ kind, r }); };

  return (
    <div className="space-y-3">
      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-surface p-1 shadow-sm">
        {TABS.map((t) => (
          <button key={t.label} aria-pressed={status === t.id} onClick={() => { setStatus(t.id); setPageNo(1); setData(null); }}
            className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold ${status === t.id ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}>
            {t.label}{cnt ? <span className={`ml-1.5 rounded-full px-1.5 text-xs ${status === t.id ? "bg-white/25" : t.id === "pending" && cnt.pending > 0 ? "bg-amber-500 text-white" : "bg-surface-2"}`}>{cnt[t.key]}</span> : null}
          </button>
        ))}
      </div>
      <label className="relative block">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input value={search} onChange={(e) => { setSearch(e.target.value); setData(null); }} placeholder="Search name, phone, team, booking or referral code" className={`${field} w-full pl-10`} />
      </label>
      {note && <p className="rounded-xl bg-brand/10 p-3 text-sm text-brand" role="status">{note}</p>}
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!data && !error && <p className="py-8 text-center text-sm text-muted">Loading referrals…</p>}
      {data?.items.length === 0 && (
        <div className="grid place-items-center gap-2 rounded-2xl bg-surface py-12 text-center text-muted shadow-sm"><HeartHandshake size={32} strokeWidth={1.5} /><p>{status === "pending" && !q ? "Nothing is waiting for you." : "No referrals match."}</p></div>
      )}
      <ul className="grid items-start gap-2 xl:grid-cols-2">
        {data?.items.map((r) => {
          const st = STATUS[r.status];
          const cancelled = r.booking && ["cancelled", "expired", "rejected"].includes(r.booking.status);
          return (
            <li key={r.id} className={`space-y-3 rounded-2xl bg-surface p-4 shadow-sm ${r.status === "pending" ? "border-l-4 border-amber-500" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">Game for {r.teamName}</p>
                  <p className="text-xs text-muted">{dayLabel(r.gameDate)}, {clock(r.gameTime)} · booking <span className="font-mono">{r.bookingCode}</span> · <span className="font-mono">{r.code}</span></p>
                </div>
                <Badge tone={st.tone}>{st.label}</Badge>
              </div>
              {cancelled && <p className="rounded-xl bg-red-500/10 p-2 text-xs font-semibold text-red-600">The booking was cancelled. Reject this referral.</p>}
              {r.booking && !cancelled && <p className="text-xs text-muted">Booking is {r.booking.status}, payment {r.booking.paymentStatus}, Rs. {r.booking.total.toLocaleString("en-IN")}</p>}
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <Person role="Booked it" name={r.referrerName} phone={r.referrerPhone} points={r.referrerPoints} />
                <Person role="Other team's captain" name={r.friendName} phone={r.friendPhone} points={r.friendPoints} />
              </div>
              {r.staffNote && <p className="text-xs text-muted">Reason: {r.staffNote}</p>}
              <div className="flex flex-wrap gap-2">
                {r.status === "pending" && <button onClick={() => open("approve", r)} className="rounded-full bg-brand px-4 py-1.5 text-xs font-semibold text-white">Approve</button>}
                {r.status === "pending" && <button onClick={() => open("reject", r)} className="rounded-full border border-red-500/40 px-4 py-1.5 text-xs font-semibold text-red-600">Reject</button>}
                {r.status === "approved" && <button onClick={() => open("adjust", r)} className="rounded-full border border-line px-4 py-1.5 text-xs font-semibold">Adjust points</button>}
              </div>
            </li>
          );
        })}
      </ul>
      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-2 text-sm">
          <button disabled={pageNo <= 1} onClick={() => { setPageNo(pageNo - 1); setData(null); }} className="flex items-center gap-1 rounded-xl bg-surface px-3 py-2 shadow-sm disabled:opacity-40"><ChevronLeft size={16} /> Previous</button>
          <span className="text-muted">Page {pageNo} of {pages} · {data.total} referrals</span>
          <button disabled={pageNo >= pages} onClick={() => { setPageNo(pageNo + 1); setData(null); }} className="flex items-center gap-1 rounded-xl bg-surface px-3 py-2 shadow-sm disabled:opacity-40">Next <ChevronRight size={16} /></button>
        </div>
      )}
      {action && <Decide a={action} onClose={() => setAction(null)} onDone={(m) => { setNote(m); onChanged(); }} />}
    </div>
  );
}

function Person({ role, name, phone, points }: { role: string; name: string | null; phone: string; points: number }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 p-3">
      <div className="min-w-0"><p className="text-xs text-muted">{role}</p><p className="truncate font-semibold">{name || "Customer"}</p><p className="text-xs text-muted">{phone} · {points} points</p></div>
      <a href={`tel:${phone}`} aria-label={`Call ${name || phone}`} className="flex shrink-0 items-center gap-1 rounded-full bg-brand px-3 py-2 text-xs font-semibold text-white"><Phone size={14} /> Call</a>
    </div>
  );
}

function Decide({ a, onClose, onDone }: { a: Action; onClose: () => void; onDone: (m: string) => void }) {
  const [ref, setRef] = useState(String(a.r.referrerPoints));
  const [fr, setFr] = useState(String(a.r.friendPoints));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pts = (s: string) => Number(s);
  const bad = (s: string) => s.trim() === "" || !Number.isFinite(pts(s)) || pts(s) < 0 || pts(s) > 200;
  const title = a.kind === "approve" ? "Approve referral" : a.kind === "reject" ? "Reject referral" : "Adjust points";

  async function go() {
    const perm = a.kind === "adjust" ? "refer.adjust" : "refer.review";
    if (!guard(perm)) return;
    setBusy(true); setError("");
    try {
      if (a.kind === "approve") { await approve(a.r.id, { referrerPoints: pts(ref), friendPoints: pts(fr) }); onDone("Approved. Both customers got their points."); }
      else if (a.kind === "reject") { await reject(a.r.id, reason.trim()); onDone("Rejected. The customer has been told."); }
      else { await adjust(a.r.id, { referrerPoints: pts(ref), friendPoints: pts(fr), reason: reason.trim() }); onDone("Points adjusted for both customers."); }
      onClose();
    } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  }
  const showPoints = a.kind !== "reject";
  const disabled = busy || (showPoints && (bad(ref) || bad(fr))) || (a.kind !== "approve" && reason.trim().length < (a.kind === "adjust" ? 5 : 3));
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-4 rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold">{title}</h2><button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-surface-2"><X size={22} /></button></div>
        <p className="text-sm text-muted">Game for {a.r.teamName}, {dayLabel(a.r.gameDate)} · {a.r.code}</p>
        {showPoints && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1 text-sm font-medium">{a.r.referrerName || "Booked it"}<input inputMode="decimal" value={ref} onChange={(e) => setRef(e.target.value)} className={`${field} w-full`} /></label>
            <label className="block space-y-1 text-sm font-medium">{a.r.friendName || "Captain"}<input inputMode="decimal" value={fr} onChange={(e) => setFr(e.target.value)} className={`${field} w-full`} /></label>
            <p className="col-span-2 text-xs text-muted">{a.kind === "adjust" ? "Set what each person should have in total for this referral. The difference is added or taken from their points." : "Points each person gets (0 to 200). Change them if needed."}</p>
          </div>
        )}
        {a.kind !== "approve" && (
          <label className="block space-y-1 text-sm font-medium">Reason {a.kind === "reject" ? "(the customer sees it)" : ""}
            <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder={a.kind === "reject" ? "For example: the game did not happen" : "Why are you changing the points?"} className={`${field} w-full`} /></label>
        )}
        {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
        <button onClick={go} disabled={disabled} className={`w-full rounded-full py-3 text-sm font-semibold text-white disabled:opacity-50 ${a.kind === "reject" ? "bg-red-600" : "bg-brand"}`}>{busy ? "Saving…" : title}</button>
      </div>
    </div>
  );
}

function Settings({ rules, onSaved }: { rules: RRules | null; onSaved: () => void }) {
  const [form, setForm] = useState<{ enabled: boolean; ref: string; fr: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const f = form ?? (rules ? { enabled: rules.enabled, ref: String(rules.referrerPoints), fr: String(rules.friendPoints) } : null);
  if (!f) return <p className="py-8 text-center text-sm text-muted">Loading…</p>;
  const set = (p: Partial<typeof f>) => setForm({ ...f, ...p });
  const bad = (s: string) => s.trim() === "" || !Number.isFinite(Number(s)) || Number(s) < 0 || Number(s) > 200;

  async function save() {
    if (!f || !guard("refer.settings")) return;
    setBusy(true); setError(""); setNote("");
    try { const r = await saveRules({ enabled: f.enabled, referrerPoints: Number(f.ref), friendPoints: Number(f.fr) }); setForm(null); setNote(r.enabled ? "Saved. New referrals use these points." : "Saved. Refer & Earn is paused."); onSaved(); } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-4 rounded-2xl bg-surface p-4 shadow-sm">
      <h2 className="font-semibold">Points for each referral</h2>
      <p className="text-sm text-muted">These are the points shown to customers and the starting amounts when a referral arrives. You can still change them for one referral when you approve it, and customers already waiting keep the amount they were shown unless you edit it.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-sm font-medium">Person who booked the game<input inputMode="decimal" value={f.ref} onChange={(e) => set({ ref: e.target.value })} className={`${field} w-full`} /></label>
        <label className="block space-y-1 text-sm font-medium">Captain of the other team<input inputMode="decimal" value={f.fr} onChange={(e) => set({ fr: e.target.value })} className={`${field} w-full`} /></label>
      </div>
      <label className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 p-3 text-sm font-medium">Refer &amp; Earn is on for customers<Switch on={f.enabled} onChange={() => set({ enabled: !f.enabled })} label="Refer and Earn on" /></label>
      <p className="text-xs text-muted">Referral points last 12 months from the day you approve. Each booking can be referred once, and a customer can send 5 a day.</p>
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {note && <p className="rounded-xl bg-brand/10 p-3 text-sm text-brand" role="status">{note}</p>}
      <button onClick={save} disabled={busy || bad(f.ref) || bad(f.fr)} className="rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
    </div>
  );
}
