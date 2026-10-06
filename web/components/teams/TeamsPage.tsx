"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Search, Shield, X } from "lucide-react";
import { Badge } from "../bookings/Badge";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { rs } from "@/lib/bookings";
import {
  ChallengeRow, ChallengeStatus, Dispute, PAGE_SIZE, Rec, STATUS_LABEL, STATUS_TONE, Settlement, TeamDetail, TeamRow, TeamsOverview, fmtDay, getOverview, getTeam, h12,
  listChallenges, listDisputes, listSettlements, listTeams, markVenuePaid, resolveDispute,
} from "@/lib/teams";

type Tab = "teams" | "challenges" | "results" | "venue";
const input = "rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");
const nepalToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" }).format(new Date());

const Form = ({ form }: { form: Rec["form"] }) => (
  <span className="inline-flex gap-0.5" aria-label={`Last results ${form.join(" ")}`}>
    {form.length === 0 ? <span className="text-xs text-muted">no games yet</span> : form.map((r, i) => <span key={i} className={`grid h-5 w-5 place-items-center rounded text-[10px] font-bold ${r === "W" ? "bg-green-500/20 text-green-700" : r === "L" ? "bg-red-500/20 text-red-700" : "bg-surface-2 text-muted"}`}>{r}</span>)}
  </span>
);

function Sheet({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()} className="max-h-[94vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{title}</h2>{sub && <p className="text-sm text-muted">{sub}</p>}</div><button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-surface-2"><X size={20} /></button></div>
        {children}
      </div>
    </div>
  );
}

// ---------- teams ----------
function TeamSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const [t, setT] = useState<TeamDetail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { getTeam(id).then(setT).catch((e) => setError(msg(e))); }, [id]);
  return (
    <Sheet title={t?.name ?? "Team"} sub={t ? `${t.area} · made ${fmtDay(t.createdAt.slice(0, 10))}` : undefined} onClose={onClose}>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      {!t && !error && <p className="text-sm text-muted">Loading…</p>}
      {t && (
        <>
          <div className="grid grid-cols-4 gap-2 text-center">
            {([["Played", t.record.played], ["Won", t.record.wins], ["Drawn", t.record.draws], ["Lost", t.record.losses]] as const).map(([l, v]) => <div key={l} className="rounded-xl bg-surface-2 p-2"><p className="text-lg font-bold">{v}</p><p className="text-[11px] text-muted">{l}</p></div>)}
          </div>
          <p className="text-sm">Goals {t.record.goalsFor} for, {t.record.goalsAgainst} against · <Form form={t.record.form} /></p>
          <div>
            <h3 className="mb-1 text-sm font-bold">Players ({t.members.length} of 12)</h3>
            <ul className="divide-y divide-line text-sm">
              {t.members.map((m) => (
                <li key={m.phone} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0"><span className="font-medium">{m.name ?? "Player"}</span>{m.captain && <Badge tone="bg-amber-500/15 text-amber-700"> Captain</Badge>}<span className="block text-xs text-muted">{m.position} · {m.phone}</span></span>
                  <a href={`tel:${m.phone}`} className="text-xs font-semibold text-brand">Call</a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-1 text-sm font-bold">Challenges</h3>
            {t.challenges.length === 0 ? <p className="text-sm text-muted">None yet.</p> : (
              <ul className="divide-y divide-line text-sm">
                {t.challenges.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                    <span><span className="font-medium">{c.youChallenged ? "Challenged" : "Challenged by"} {c.versus}</span><span className="block text-xs text-muted">{fmtDay(c.date)}, {h12(c.startHour)}</span></span>
                    <span className="flex items-center gap-2">{c.result && <span className="font-semibold">{c.result.goalsFor}-{c.result.goalsAgainst}</span>}<Badge tone={STATUS_TONE[c.result?.status ?? c.status] ?? ""}>{STATUS_LABEL[c.result?.status ?? c.status] ?? c.status}</Badge></span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}

function TeamsTab() {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<TeamRow[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => { let live = true; listTeams(q).then((r) => live && (setRows(r), setError(""))).catch((e) => live && setError(msg(e))); return () => { live = false; }; }, [q]);
  return (
    <div className="space-y-3">
      <label className="relative block"><Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a team, area, captain name or phone" className={`${input} w-full pl-10`} /></label>
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!rows && !error && <p className="py-10 text-center text-sm text-muted">Loading…</p>}
      {rows && rows.length === 0 && <p className="rounded-2xl bg-surface p-8 text-center text-sm text-muted">No teams {q ? "match" : "yet"}.</p>}
      <ul className="grid gap-3 xl:grid-cols-2">
        {rows?.map((t) => (
          <li key={t.id}>
            <button onClick={() => setOpen(t.id)} className="w-full space-y-2 rounded-2xl bg-surface p-4 text-left shadow-sm hover:ring-2 hover:ring-brand/30">
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate font-bold">{t.name}</p><p className="text-xs text-muted">{t.area} · {t.members} player{t.members === 1 ? "" : "s"}</p></div>{t.openChallenges > 0 && <Badge tone="bg-amber-500/15 text-amber-700">{t.openChallenges} open</Badge>}</div>
              <p className="text-sm">Captain: <strong>{t.captain.name ?? "Unknown"}</strong> <span className="text-xs text-muted">{t.captain.phone}</span></p>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"><span>{t.record.played} played · {t.record.wins}W {t.record.draws}D {t.record.losses}L</span><Form form={t.record.form} /></p>
            </button>
          </li>
        ))}
      </ul>
      {open && <TeamSheet id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

// ---------- challenges ----------
const CH_TABS: { id: ChallengeStatus; label: string }[] = [{ id: "", label: "All" }, { id: "pending", label: "Waiting" }, { id: "accepted", label: "Accepted" }, { id: "declined", label: "Declined" }, { id: "cancelled", label: "Cancelled" }, { id: "expired", label: "Expired" }];

function ChallengesTab() {
  const [status, setStatus] = useState<ChallengeStatus>("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [pageNo, setPageNo] = useState(1);
  const [data, setData] = useState<{ items: ChallengeRow[]; total: number } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { const t = setTimeout(() => { setQ(search.trim()); setPageNo(1); }, 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => { let live = true; listChallenges({ status, q, page: pageNo }).then((d) => live && (setData(d), setError(""))).catch((e) => live && setError(msg(e))); return () => { live = false; }; }, [status, q, pageNo]);
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  return (
    <div className="space-y-3">
      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-surface p-1 shadow-sm" role="tablist" aria-label="Challenge status">
        {CH_TABS.map((x) => <button key={x.label} role="tab" aria-selected={status === x.id} onClick={() => { setStatus(x.id); setPageNo(1); setData(null); }} className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold ${status === x.id ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}>{x.label}</button>)}
      </div>
      <label className="relative block"><Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a team or booking code" className={`${input} w-full pl-10`} /></label>
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!data && !error && <p className="py-10 text-center text-sm text-muted">Loading…</p>}
      {data && data.items.length === 0 && <p className="rounded-2xl bg-surface p-8 text-center text-sm text-muted">No challenges here.</p>}
      <ul className="grid gap-3 xl:grid-cols-2">
        {data?.items.map((c) => (
          <li key={c.id} className="space-y-2 rounded-2xl bg-surface p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 font-bold"><span>{c.challenger}</span> <span className="font-normal text-muted">vs</span> <span>{c.challenged}</span></p>
              <Badge tone={STATUS_TONE[c.status] ?? ""}>{c.status[0].toUpperCase() + c.status.slice(1)}</Badge>
            </div>
            <p className="text-sm">{fmtDay(c.date)}, {h12(c.startHour)} · court {rs(c.courtPrice)} · loser pays {c.loserPct}%{c.type === "competition" ? " · competition" : ""}</p>
            {c.message && <p className="rounded-xl bg-surface-2 p-2 text-xs text-muted">&quot;{c.message}&quot;</p>}
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
              {c.bookingCode && <span>Booking {c.bookingCode}</span>}
              {c.status === "accepted" && <Badge tone={c.venuePaidAt ? "bg-green-500/15 text-green-700" : "bg-red-500/15 text-red-700"}>{c.venuePaidAt ? "Venue paid" : "Not paid yet"}</Badge>}
              {c.result && <span className="flex items-center gap-1.5"><Badge tone={STATUS_TONE[c.result.status] ?? ""}>{STATUS_LABEL[c.result.status] ?? c.result.status}</Badge><strong className="text-foreground">{c.result.submittedBy} {c.result.scoreSubmitter}-{c.result.scoreOther}</strong></span>}
            </p>
          </li>
        ))}
      </ul>
      {data && pages > 1 && (
        <div className="flex items-center justify-between">
          <button disabled={pageNo <= 1} onClick={() => setPageNo((p) => p - 1)} className="flex items-center gap-1 rounded-full border border-line px-4 py-2 text-sm disabled:opacity-40"><ChevronLeft size={16} /> Back</button>
          <span className="text-sm text-muted">Page {pageNo} of {pages}</span>
          <button disabled={pageNo >= pages} onClick={() => setPageNo((p) => p + 1)} className="flex items-center gap-1 rounded-full border border-line px-4 py-2 text-sm disabled:opacity-40">Next <ChevronRight size={16} /></button>
        </div>
      )}
    </div>
  );
}

// ---------- disputed results ----------
function ResolveSheet({ d, onClose, onDone }: { d: Dispute; onClose: () => void; onDone: () => void }) {
  const [a, setA] = useState(String(d.scoreSubmitter));
  const [b, setB] = useState(String(d.scoreOther));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const changed = Number(a) !== d.scoreSubmitter || Number(b) !== d.scoreOther;
  async function run(action: "approve" | "void") {
    if (!guard("teams.resolve")) return;
    setBusy(true); setError("");
    try { await resolveDispute(d.id, action === "void" ? { action, note: note.trim() || undefined } : { action, ...(changed ? { scoreSubmitter: Number(a), scoreOther: Number(b) } : {}), note: note.trim() || undefined }); onDone(); onClose(); }
    catch (e) { setError(msg(e)); setBusy(false); }
  }
  return (
    <Sheet title="Resolve disputed result" sub={`${d.submittedBy} vs ${d.otherTeam} · ${fmtDay(d.date)}, ${h12(d.startHour)}`} onClose={onClose}>
      <p className="text-sm">{d.submittedBy} uploaded <strong>{d.scoreSubmitter}-{d.scoreOther}</strong> and {d.otherTeam} disputed it. Check with both captains (or the CCTV), then approve the real score or void it so the winner can upload again.</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium">{d.submittedBy}<input inputMode="numeric" className={`${input} mt-1 w-full`} value={a} onChange={(e) => setA(e.target.value.replace(/\D/g, "").slice(0, 2))} /></label>
        <label className="block text-sm font-medium">{d.otherTeam}<input inputMode="numeric" className={`${input} mt-1 w-full`} value={b} onChange={(e) => setB(e.target.value.replace(/\D/g, "").slice(0, 2))} /></label>
      </div>
      {Number(a) < Number(b) && <p className="text-xs text-amber-700">The uploading team must be the winner or a draw. To record a different winner, void this and ask that team to upload.</p>}
      <input className={`${input} w-full`} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Note (what you checked)" />
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button disabled={busy || a === "" || b === "" || Number(a) < Number(b)} onClick={() => run("approve")} className="flex-1 rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : changed ? "Approve corrected score" : "Approve this score"}</button>
        <button disabled={busy} onClick={() => run("void")} className="rounded-xl border border-red-300 px-4 py-3 font-semibold text-red-600 disabled:opacity-50">Void</button>
      </div>
    </Sheet>
  );
}

function ResultsTab({ onChanged }: { onChanged: () => void }) {
  const [rows, setRows] = useState<Dispute[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Dispute | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => { let live = true; listDisputes().then((r) => live && (setRows(r), setError(""))).catch((e) => live && setError(msg(e))); return () => { live = false; }; }, [tick]);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Scores the other captain disputed. A disputed result changes no team record until you decide.</p>
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!rows && !error && <p className="py-10 text-center text-sm text-muted">Loading…</p>}
      {rows && rows.length === 0 && <p className="rounded-2xl bg-surface p-8 text-center text-sm text-muted">Nothing to review. No results are disputed.</p>}
      <ul className="grid gap-3 xl:grid-cols-2">
        {rows?.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-4 shadow-sm">
            <div className="min-w-0"><p className="font-bold">{d.submittedBy} <span className="font-normal text-muted">vs</span> {d.otherTeam}</p><p className="text-xs text-muted">{fmtDay(d.date)}, {h12(d.startHour)} · uploaded <strong className="text-foreground">{d.scoreSubmitter}-{d.scoreOther}</strong></p></div>
            <button onClick={() => guard("teams.resolve") && setOpen(d)} className="shrink-0 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white">Review</button>
          </li>
        ))}
      </ul>
      {open && <ResolveSheet d={open} onClose={() => setOpen(null)} onDone={() => { setTick((t) => t + 1); onChanged(); }} />}
    </div>
  );
}

// ---------- who owes what at the venue ----------
function VenueTab({ onChanged }: { onChanged: () => void }) {
  const [date, setDate] = useState("");
  const [rows, setRows] = useState<Settlement[] | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState("");
  useEffect(() => { let live = true; listSettlements(date).then((r) => live && (setRows(r), setError(""))).catch((e) => live && setError(msg(e))); return () => { live = false; }; }, [date, tick]);
  async function pay(s: Settlement) {
    if (!guard("teams.venuepaid")) return;
    if (!window.confirm(`Mark ${s.challenger} vs ${s.challenged} as paid at the venue? Both captains get a "Did you win?" message.`)) return;
    setBusy(s.id); setError("");
    try { await markVenuePaid(s.id); setTick((t) => t + 1); onChanged(); } catch (e) { setError(msg(e)); } finally { setBusy(""); }
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted">Challenge games are paid at the venue after the game. The amounts follow the loser-pays rule once the result is approved.</p>
        <label className="ml-auto flex items-center gap-1.5 text-sm">Date <input type="date" className={input} value={date} max={nepalToday()} onChange={(e) => { setDate(e.target.value); setRows(null); }} /></label>
        {date && <button onClick={() => { setDate(""); setRows(null); }} className="text-sm font-semibold text-brand">All dates</button>}
      </div>
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!rows && !error && <p className="py-10 text-center text-sm text-muted">Loading…</p>}
      {rows && rows.length === 0 && <p className="rounded-2xl bg-surface p-8 text-center text-sm text-muted">No accepted challenge games{date ? " on this date" : ""}.</p>}
      <ul className="grid gap-3 xl:grid-cols-2">
        {rows?.map((s) => (
          <li key={s.id} className="space-y-2 rounded-2xl bg-surface p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2"><p className="min-w-0 font-bold">{s.challenger} <span className="font-normal text-muted">vs</span> {s.challenged}</p><Badge tone={s.paidAt ? "bg-green-500/15 text-green-700" : "bg-red-500/15 text-red-700"}>{s.paidAt ? "Paid" : "To collect"}</Badge></div>
            <p className="text-sm">{fmtDay(s.date)}, {h12(s.startHour)} · court {rs(s.courtPrice)}</p>
            {s.split ? (
              <p className="rounded-xl bg-surface-2 p-2 text-sm"><strong>{s.challenger}</strong> pays {rs(s.split.challenger)} · <strong>{s.challenged}</strong> pays {rs(s.split.challenged)} <span className="block text-xs text-muted">{s.split.basis}</span></p>
            ) : <p className="rounded-xl bg-surface-2 p-2 text-xs text-muted">The score is not approved yet, so the split is not known. The challenger chose that the loser pays {s.loserPct}%; a draw splits 50/50.</p>}
            {!s.paidAt && <button disabled={busy === s.id} onClick={() => pay(s)} className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy === s.id ? "Saving…" : "Mark paid at venue"}</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function TeamsPage({ initialTab = "teams" }: { initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [ov, setOv] = useState<TeamsOverview | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => { getOverview().then(setOv).catch(() => {}); }, [tick]);
  const changed = () => setTick((t) => t + 1);
  const tabs: { id: Tab; label: string; n?: number }[] = [
    { id: "teams", label: "Teams", n: ov?.teams }, { id: "challenges", label: "Challenges", n: ov?.pendingChallenges },
    { id: "results", label: "Results to review", n: ov?.disputes }, { id: "venue", label: "Venue payments", n: ov?.unpaidGames },
  ];
  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Shield className="text-brand" /> Teams &amp; Challenges</h1>
        <p className="text-sm text-muted">Captain teams, the challenges between them, disputed scores and what the teams owe the venue.</p>
      </div>
      {ov && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {([["Teams", String(ov.teams), ""], ["Waiting for an answer", String(ov.pendingChallenges), ""], ["Games coming up", String(ov.upcomingGames), ""], ["Disputed scores", String(ov.disputes), ov.disputes > 0 ? "ring-2 ring-red-500/40" : ""], ["To collect at venue", `${rs(ov.unpaidAmount)} · ${ov.unpaidGames}`, ov.unpaidGames > 0 ? "ring-2 ring-amber-500/40" : ""]] as const).map(([l, v, ring]) => (
            <div key={l} className={`rounded-2xl bg-surface p-3 shadow-sm ${ring}`}><p className="text-xs text-muted">{l}</p><p className="text-lg font-bold">{v}</p></div>
          ))}
        </div>
      )}
      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-surface p-1 shadow-sm" role="tablist">
        {tabs.map((x) => <button key={x.id} role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)} className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold ${tab === x.id ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}>{x.label}{x.n ? ` (${x.n})` : ""}</button>)}
      </div>
      {tab === "teams" && <TeamsTab />}
      {tab === "challenges" && <ChallengesTab />}
      {tab === "results" && <ResultsTab onChanged={changed} />}
      {tab === "venue" && <VenueTab onChanged={changed} />}
    </div>
  );
}
