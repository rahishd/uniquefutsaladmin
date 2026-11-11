"use client";

import { useEffect, useState } from "react";
import { Award, CalendarDays, ChevronLeft, ChevronRight, Loader2, Medal, Minus, Plus, Receipt, ScrollText, Trash2, Trophy, UserCog, Users } from "lucide-react";
import { BillingTab, AccountPanel } from "./SimpleTabs";
import { ApiError } from "@/lib/api";
import { rs } from "@/lib/bookings";
import { Bill, SERVICES, fmtDay, h12 } from "@/lib/hosted-tournaments";
import { OrgMe, OrgPrize, OrgTeam, OrgTournament, orgBilling, orgSaveMaxTeams, orgSavePrizes, orgSaveRules } from "@/lib/organizer";

export type DashView = "" | "tournament" | "prizes" | "rules" | "billing" | "profile";
type View = DashView;
const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");
const field = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const STATE = { upcoming: "Upcoming", live: "Live now", completed: "Finished" } as const;
const TILES: { id: Exclude<View, "">; label: string; hint: string; icon: React.ElementType; tone: string }[] = [
  { id: "tournament", label: "Tournament", hint: "Dates, hours, teams", icon: Trophy, tone: "bg-(--nav-ink)/8 text-(--nav-ink)" },
  { id: "prizes", label: "Prize Pool", hint: "1st, 2nd, trophies", icon: Medal, tone: "bg-(--nav-ink)/8 text-(--nav-ink)" },
  { id: "rules", label: "Rules & Regulations", hint: "Rules for your teams", icon: ScrollText, tone: "bg-(--nav-ink)/8 text-(--nav-ink)" },
  { id: "billing", label: "Billings", hint: "Bill and goods taken", icon: Receipt, tone: "bg-(--nav-ink)/8 text-(--nav-ink)" },
  { id: "profile", label: "Profile", hint: "Password and sign out", icon: UserCog, tone: "bg-(--nav-ink)/8 text-(--nav-ink)" },
];

// The Organizer's Dashboard: five icons. Each opens its page with a way back.
// `view` and `setView` are kept by the app, so the Back button in its footer can return here.
export default function DashboardTab({ me, t, teams, maxTeams, onMaxTeams, onMe, onSignOut, view, setView }: { me: OrgMe; t: OrgTournament | undefined; teams: OrgTeam[] | null; maxTeams: number; onMaxTeams: (n: number) => void; onMe: (m: OrgMe) => void; onSignOut: () => void; view: DashView; setView: (v: DashView) => void }) {

  if (view === "") {
    return (
      <div className="space-y-3">
        <div><h2 className="text-lg font-bold">Dashboard</h2><p className="text-xs text-muted">Everything about your tournament in one place.</p></div>
        <ul className="grid grid-cols-2 gap-2.5">
          {TILES.map(({ id, label, hint, icon: Icon, tone }) => (
            <li key={id}>
              <button type="button" onClick={() => setView(id)} className="flex h-full w-full flex-col items-center gap-1.5 rounded-2xl bg-surface p-3.5 text-center shadow-sm transition active:scale-[0.98]">
                <span className={`grid h-11 w-11 place-items-center rounded-xl ${tone}`}><Icon size={22} /></span>
                <span className="text-sm font-bold leading-tight">{label}</span>
                <span className="text-[11px] leading-tight text-muted">{hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const tile = TILES.find((x) => x.id === view)!;
  return (
    <div className="space-y-3">
      <button type="button" onClick={() => setView("")} className="inline-flex items-center gap-1 text-sm font-semibold text-muted"><ChevronLeft size={16} /> Dashboard</button>
      <h2 className="flex items-center gap-2 text-lg font-bold"><tile.icon size={20} className="text-brand" /> {tile.label}</h2>
      {view === "profile" && <AccountPanel onSignOut={onSignOut} />}
      {view !== "profile" && !t && <p className="rounded-2xl bg-surface p-8 text-center text-sm text-muted shadow-sm">No tournament is assigned to this account yet. Ask the venue.</p>}
      {t && view === "tournament" && <TournamentPage t={t} teams={teams} maxTeams={maxTeams} onMaxTeams={onMaxTeams} />}
      {t && view === "prizes" && <PrizesPage key={t.id} t={t} me={me} onMe={onMe} />}
      {t && view === "rules" && <RulesPage key={t.id} t={t} me={me} onMe={onMe} />}
      {t && view === "billing" && <BillingTab key={t.id} tid={t.id} />}
    </div>
  );
}

/* ---------------- Tournament: the details ---------------- */
function TournamentPage({ t, teams, maxTeams, onMaxTeams }: { t: OrgTournament; teams: OrgTeam[] | null; maxTeams: number; onMaxTeams: (n: number) => void }) {
  const [bill, setBill] = useState<Bill | null>(null);
  useEffect(() => { let live = true; orgBilling(t.id).then((b) => live && setBill(b)).catch(() => {}); return () => { live = false; }; }, [t.id]);
  const approved = teams?.filter((x) => x.status === "approved").length ?? 0;
  const waiting = teams?.filter((x) => x.status === "pending").length ?? 0;
  const row = (label: string, value: React.ReactNode) => <div className="flex items-start justify-between gap-4 py-2 text-sm"><span className="text-muted">{label}</span><span className="text-right font-semibold">{value}</span></div>;
  return (
    <div className="space-y-3">
      <section className="rounded-2xl bg-surface p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3"><h3 className="text-xl font-extrabold leading-tight">{t.name}</h3><span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${t.state === "live" ? "bg-rose-500 text-white" : "bg-brand/10 text-brand"}`}>{STATE[t.state]}</span></div>
        {t.description && <p className="mt-1 text-sm text-muted">{t.description}</p>}
        <div className="mt-2 divide-y divide-line">
          {row("Dates", t.startDate === t.endDate ? fmtDay(t.startDate) : `${fmtDay(t.startDate)} to ${fmtDay(t.endDate)}`)}
          {row("Organizer", t.hostName ?? me0(t))}
          {row("Teams", <span className="tabular-nums">{approved} / {maxTeams}{waiting > 0 && <span className="ml-1 text-xs font-medium text-amber-600">({waiting} waiting)</span>}</span>)}
          {row("Prize pool", t.prizePool > 0 ? rs(t.prizePool) : "Not set yet")}
        </div>
      </section>
      <MaxTeamsCard key={`${t.id}-${maxTeams}`} t={t} held={approved + waiting} maxTeams={maxTeams} onMaxTeams={onMaxTeams} />
      <section className="rounded-2xl bg-surface p-4 shadow-sm">
        <h3 className="flex items-center gap-2 text-sm font-bold"><CalendarDays size={16} className="text-brand" /> Days and hours</h3>
        <ul className="mt-2 divide-y divide-line text-sm">
          {t.days.map((d) => <li key={d.date} className="flex justify-between gap-3 py-2"><span className="font-medium">{fmtDay(d.date)}</span><span className="text-muted">{h12(d.startHour)} to {h12(d.endHour)}</span></li>)}
          {t.days.length === 0 && <li className="py-2 text-muted">No days yet.</li>}
        </ul>
      </section>
      {bill && (
        <section className="rounded-2xl bg-surface p-4 shadow-sm" aria-label="Additional services">
          <h3 className="text-sm font-bold">Additional services</h3>
          <ul className="mt-1 divide-y divide-line">
            {SERVICES.map((x) => {
              const on = bill.services.includes(x.id);
              const price = bill.serviceAmounts?.[x.id];
              return (
                <li key={x.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className={`block font-medium ${on ? "" : "text-muted"}`}>{x.label}</span>
                    {typeof price === "number" && price > 0 && <span className="block text-xs text-muted">{rs(price)}{x.per === "bottle" ? " per bottle" : ""}{x.id === "mineral_water" && on && bill.waterBottles > 0 ? ` · ${bill.waterBottles} bottle${bill.waterBottles === 1 ? "" : "s"} taken` : ""}</span>}
                  </span>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${on ? "bg-emerald-500/15 text-emerald-700" : "bg-slate-500/15 text-slate-600"}`}>{on ? "Included" : "Not chosen"}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <p className="flex items-center gap-2 text-xs text-muted"><Users size={14} /> The registered teams are on the Teams page.</p>
    </div>
  );
}
const me0 = (t: OrgTournament) => t.hostName ?? "-";

/* ---------------- the most teams the tournament takes: the host decides ---------------- */
function MaxTeamsCard({ t, held, maxTeams, onMaxTeams }: { t: OrgTournament; held: number; maxTeams: number; onMaxTeams: (n: number) => void }) {
  const [n, setN] = useState(maxTeams);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const clamp = (v: number) => Math.min(64, Math.max(2, v));
  async function save() {
    setBusy(true); setError(""); setOk("");
    try { const r = await orgSaveMaxTeams(t.id, n); onMaxTeams(r.maxTeams); setOk("Team limit saved."); } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  }
  return (
    <section className="rounded-2xl bg-surface p-4 shadow-sm">
      <h3 className="flex items-center gap-2 text-sm font-bold"><Users size={16} className="text-brand" /> Maximum number of teams</h3>
      <p className="mt-1 text-xs text-muted">You decide how many teams your tournament takes. {held} are in or waiting now, so the limit cannot go below that.</p>
      <div className="mt-3 flex items-center justify-center gap-3">
        <button type="button" onClick={() => { setN((v) => clamp(v - 1)); setOk(""); }} aria-label="One team less" className="grid h-11 w-11 place-items-center rounded-full border border-line bg-surface"><Minus size={18} /></button>
        <input inputMode="numeric" value={n} onChange={(e) => { setN(clamp(Number(e.target.value.replace(/\D/g, "").slice(0, 2)) || 2)); setOk(""); }} aria-label="Maximum number of teams" className={`${field} !w-20 text-center text-xl font-extrabold tabular-nums`} />
        <button type="button" onClick={() => { setN((v) => clamp(v + 1)); setOk(""); }} aria-label="One team more" className="grid h-11 w-11 place-items-center rounded-full border border-line bg-surface"><Plus size={18} /></button>
      </div>
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
      {ok && <p role="status" className="mt-3 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-700">{ok}</p>}
      <button type="button" onClick={save} disabled={busy || n === maxTeams} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50">{busy && <Loader2 size={15} className="animate-spin" />} Save team limit</button>
    </section>
  );
}

/* ---------------- Prize Pool: the prizes for 1st, 2nd and so on, and the trophies ---------------- */
const ORDINAL = ["1st", "2nd", "3rd", "4th", "5th", "6th"];
function PrizesPage({ t, me, onMe }: { t: OrgTournament; me: OrgMe; onMe: (m: OrgMe) => void }) {
  const [rows, setRows] = useState<OrgPrize[]>(t.prizes);
  const [edit, setEdit] = useState(t.prizes.length === 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const total = rows.reduce((n, p) => n + (Number(p.cash) || 0), 0);
  const set = (i: number, p: Partial<OrgPrize>) => { setRows((x) => x.map((r, k) => (k === i ? { ...r, ...p } : r))); setOk(""); };
  const add = () => setRows((x) => [...x, { place: ORDINAL[x.length] ?? `${x.length + 1}th`, cash: 0, trophy: "", note: "" }]);

  async function save() {
    setBusy(true); setError(""); setOk("");
    try {
      const r = await orgSavePrizes(t.id, rows.filter((p) => p.place.trim()).map((p) => ({ ...p, cash: Math.max(0, Math.round(Number(p.cash) || 0)) })));
      onMe({ ...me, tournaments: me.tournaments.map((x) => (x.id === t.id ? { ...x, prizes: r.prizes, prizePool: r.prizePool } : x)) });
      setRows(r.prizes); setEdit(false); setOk("Prizes saved.");
    } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  }

  if (!edit) {
    return (
      <div className="space-y-3">
        <section className="rounded-2xl bg-gradient-to-br from-amber-400/20 to-amber-500/5 p-4 text-center shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Total prize pool</p>
          <p className="text-3xl font-extrabold tabular-nums">{rs(t.prizePool)}</p>
        </section>
        <ul className="space-y-2">
          {t.prizes.map((p, i) => (
            <li key={`${p.place}-${i}`} className="flex items-start gap-3 rounded-2xl bg-surface p-4 shadow-sm">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-amber-500/15 text-sm font-extrabold text-amber-700">{p.place}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold tabular-nums">{p.cash > 0 ? rs(p.cash) : "No cash prize"}</span>
                {p.trophy && <span className="mt-0.5 flex items-center gap-1.5 text-sm"><Award size={14} className="text-amber-600" /> {p.trophy}</span>}
                {p.note && <span className="block text-xs text-muted">{p.note}</span>}
              </span>
            </li>
          ))}
        </ul>
        {ok && <p role="status" className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-700">{ok}</p>}
        <button type="button" onClick={() => setEdit(true)} className="w-full rounded-2xl border border-line bg-surface py-3 text-sm font-semibold">Change the prizes</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Add a prize for each place: the cash, the trophy or gift, and anything else to say. The total prize pool is the cash prizes added up.</p>
      <ul className="space-y-3">
        {rows.map((p, i) => (
          <li key={i} className="space-y-2 rounded-2xl bg-surface p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <input value={p.place} maxLength={20} onChange={(e) => set(i, { place: e.target.value })} aria-label="Place" placeholder="1st" className={`${field} !w-24 text-center font-bold`} />
              <label className="flex flex-1 items-center gap-2 text-sm"><span className="text-muted">Rs.</span><input inputMode="numeric" value={p.cash || ""} onChange={(e) => set(i, { cash: Number(e.target.value.replace(/\D/g, "").slice(0, 9)) || 0 })} aria-label="Cash prize" placeholder="Cash prize" className={field} /></label>
              <button type="button" onClick={() => setRows((x) => x.filter((_, k) => k !== i))} aria-label={`Remove ${p.place}`} className="rounded-full p-2 text-red-600 hover:bg-red-500/10"><Trash2 size={16} /></button>
            </div>
            <input value={p.trophy} maxLength={80} onChange={(e) => set(i, { trophy: e.target.value })} aria-label="Trophy or gift" placeholder="Trophy or gift (for example Winner trophy and medals)" className={field} />
            <input value={p.note} maxLength={200} onChange={(e) => set(i, { note: e.target.value })} aria-label="Note" placeholder="Note (optional)" className={field} />
          </li>
        ))}
      </ul>
      {rows.length < 12 && <button type="button" onClick={add} className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line py-3 text-sm font-semibold text-muted"><Plus size={16} /> Add a prize</button>}
      <p className="flex justify-between rounded-xl bg-amber-500/10 px-4 py-3 text-sm font-bold"><span>Total prize pool</span><span className="tabular-nums">{rs(total)}</span></p>
      {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        {t.prizes.length > 0 && <button type="button" onClick={() => { setRows(t.prizes); setEdit(false); setError(""); }} className="flex-1 rounded-2xl border border-line bg-surface py-3 text-sm font-semibold">Cancel</button>}
        <button type="button" onClick={save} disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50">{busy && <Loader2 size={15} className="animate-spin" />} Save prizes</button>
      </div>
      <p className="flex items-center gap-1 text-xs text-muted"><ChevronRight size={12} /> You can change them any time.</p>
    </div>
  );
}

/* ---------------- Rules & Regulations: the rules of this tournament, written by the host ---------------- */
const SAMPLE_RULES = [
  "Every team must be on the court 10 minutes before its match.",
  "A team plays with 5 players on the court; a match cannot start with fewer than 3.",
  "Every player must wear the same colour kit and shin guards.",
  "Matches follow the tie-sheet. A team that is more than 10 minutes late loses the match.",
  "The referee's decision is final. Arguing with the referee or fighting means a red card.",
  "The tournament organizer can remove a team that breaks these rules.",
].join("\n");

function RulesPage({ t, me, onMe }: { t: OrgTournament; me: OrgMe; onMe: (m: OrgMe) => void }) {
  const [text, setText] = useState(t.rules);
  const [edit, setEdit] = useState(!t.rules.trim());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const lines = t.rules.split("\n").map((l) => l.trim()).filter(Boolean);

  async function save() {
    setBusy(true); setError(""); setOk("");
    try {
      const r = await orgSaveRules(t.id, text);
      onMe({ ...me, tournaments: me.tournaments.map((x) => (x.id === t.id ? { ...x, rules: r.rules } : x)) });
      setText(r.rules); setEdit(!r.rules.trim()); setOk("Rules saved.");
    } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  }

  if (!edit) {
    return (
      <div className="space-y-3">
        <section className="rounded-2xl bg-surface p-4 shadow-sm">
          <h3 className="text-sm font-bold">{t.name}: rules and regulations</h3>
          <ol className="mt-3 space-y-2.5">
            {lines.map((l, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-violet-500/15 text-xs font-extrabold text-violet-700">{i + 1}</span>
                <span className="min-w-0 flex-1 break-words pt-0.5">{l}</span>
              </li>
            ))}
          </ol>
        </section>
        {ok && <p role="status" className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-700">{ok}</p>}
        <button type="button" onClick={() => { setText(t.rules); setEdit(true); setOk(""); }} className="w-full rounded-2xl border border-line bg-surface py-3 text-sm font-semibold">Change the rules</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Write the rules and regulations of your tournament. Put one rule on each line; they are numbered for you.</p>
      <textarea value={text} onChange={(e) => { setText(e.target.value); setOk(""); }} maxLength={10000} rows={12} aria-label="Rules and regulations" placeholder={"One rule on each line, for example:\nTeams must arrive 10 minutes early."} className={`${field} min-h-64 resize-y leading-relaxed`} />
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{text.split("\n").filter((l) => l.trim()).length} rules</span>
        <span className="tabular-nums">{text.length} / 10,000</span>
      </div>
      {!text.trim() && <button type="button" onClick={() => setText(SAMPLE_RULES)} className="w-full rounded-2xl border border-dashed border-line py-3 text-sm font-semibold text-muted">Start from sample rules (you can change them)</button>}
      {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        {t.rules.trim() && <button type="button" onClick={() => { setText(t.rules); setEdit(false); setError(""); }} className="flex-1 rounded-2xl border border-line bg-surface py-3 text-sm font-semibold">Cancel</button>}
        <button type="button" onClick={save} disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50">{busy && <Loader2 size={15} className="animate-spin" />} Save rules</button>
      </div>
    </div>
  );
}
