"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Dices, ListChecks, Loader2, Plus, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import Bracket, { BracketRound } from "./Bracket";
import TieSheetEditor from "../tournaments/TieSheetEditor";
import { ApiError } from "@/lib/api";
import { askConfirm } from "@/lib/confirm";
import { Format, MAX_TEAMS, MIN_TEAMS, generate, shuffled } from "@/lib/tiesheet-gen";
import { OrgTeam, OrgTournament, organizerEditor } from "@/lib/organizer";
import { Round, StructureRound, fromNepalInput } from "@/lib/tournaments";

// Tie-sheet generator. Pick the format, pick the teams (registered teams are suggested; anything else can be typed), press Generate and the
// bracket is built and laid out. Save it, then score the matches. The court number is not asked for: one court, no repeating.
const field = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");
const hasPlay = (rounds: Round[]) => rounds.some((r) => r.matches.some((m) => m.status !== "upcoming" || m.goals.length > 0));

// the first kick-off to suggest: the first tournament day at its opening hour, as a Nepal-time field value
const suggestStart = (t: OrgTournament) => {
  const d = t.days[0];
  return d ? `${d.date}T${String(d.startHour).padStart(2, "0")}:00` : `${t.startDate}T10:00`;
};

export default function TieSheetTab({ tournament, teams }: { tournament: OrgTournament; teams: OrgTeam[] }) {
  const api = useMemo(() => organizerEditor(tournament.id), [tournament.id]);
  const [rounds, setRounds] = useState<Round[] | null>(null);
  const [view, setView] = useState<"bracket" | "score" | "generate">("bracket");
  const [error, setError] = useState("");

  const load = useCallback(() => api.load().then((r) => { setRounds(r); setError(""); return r; }).catch((e) => { setError(msg(e)); return null; }), [api]);
  useEffect(() => {
    let live = true;
    api.load().then((r) => { if (live) { setRounds(r); if (r.length === 0) setView("generate"); } }).catch((e) => live && setError(msg(e)));
    return () => { live = false; };
  }, [api]);
  // the bracket follows the matches while the organizer scores (the scoring screen has its own refresh)
  useEffect(() => {
    if (view !== "bracket") return;
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 10_000);
    return () => clearInterval(t);
  }, [view, load]);

  if (!rounds) return <p className="py-16 text-center text-sm text-muted">{error || "Loading the tie-sheet…"}</p>;

  const seg = (id: typeof view, label: string, Icon: React.ElementType) => (
    <button type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)} className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold ${view === id ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}><Icon size={16} /> {label}</button>
  );

  return (
    <div className="space-y-4">
      {rounds.length > 0 && (
        <div className="flex gap-1 rounded-2xl bg-surface p-1 shadow-sm" role="tablist" aria-label="Tie-sheet views">
          {seg("bracket", "Tie-sheet", ListChecks)}
          {seg("score", "Score matches", Check)}
          {seg("generate", "New sheet", Sparkles)}
        </div>
      )}
      {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}

      {view === "bracket" && rounds.length > 0 && <Bracket rounds={rounds} />}
      {view === "score" && rounds.length > 0 && <TieSheetEditor initial={rounds} api={api} pollMs={8000} showVenue={false} />}
      {view === "generate" && (
        <Generator tournament={tournament} teams={teams} hasSheet={rounds.length > 0} playedAlready={hasPlay(rounds)}
          onSaved={(r) => { setRounds(r); setView("bracket"); }} onCancel={rounds.length > 0 ? () => setView("bracket") : undefined} />
      )}
    </div>
  );
}

function Generator({ tournament, teams, hasSheet, playedAlready, onSaved, onCancel }: {
  tournament: OrgTournament; teams: OrgTeam[]; hasSheet: boolean; playedAlready: boolean; onSaved: (r: Round[]) => void; onCancel?: () => void;
}) {
  const api = useMemo(() => organizerEditor(tournament.id), [tournament.id]);
  const [format, setFormat] = useState<Format>("knockout");
  const [picked, setPicked] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [shuffle, setShuffle] = useState(true);
  const [third, setThird] = useState(false);
  const [timed, setTimed] = useState(true);
  const [first, setFirst] = useState(() => suggestStart(tournament));
  const [gap, setGap] = useState(30);
  const [out, setOut] = useState<StructureRound[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const box = useRef<HTMLDivElement>(null);

  const registered = useMemo(() => teams.filter((t) => t.status !== "rejected"), [teams]);
  const lower = (s: string) => s.trim().toLowerCase();
  const isPicked = (n: string) => picked.some((p) => lower(p) === lower(n));
  // typing suggests registered teams that are not in the list yet
  const suggestions = registered.filter((t) => !isPicked(t.teamName) && (typed.trim() === "" || lower(t.teamName).includes(lower(typed)))).slice(0, 8);

  useEffect(() => {
    const down = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setSuggestOpen(false); };
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, []);

  const add = (name: string) => {
    const n = name.trim().slice(0, 40);
    if (!n || isPicked(n)) return;
    if (picked.length >= MAX_TEAMS) return setError(`At most ${MAX_TEAMS} teams.`);
    setError(""); setOut(null); setPicked((p) => [...p, n]); setTyped("");
  };
  const remove = (n: string) => { setOut(null); setPicked((p) => p.filter((x) => x !== n)); };
  const addAll = () => { setOut(null); setPicked((p) => [...p, ...registered.filter((t) => !p.some((x) => lower(x) === lower(t.teamName))).map((t) => t.teamName)].slice(0, MAX_TEAMS)); };

  function build() {
    setError("");
    if (picked.length < MIN_TEAMS) return setError(`Add at least ${MIN_TEAMS} teams.`);
    const start = timed && first ? fromNepalInput(first) : null;
    setOut(generate({ format, teams: picked, shuffle, thirdPlace: third, firstKickOff: start, minutesBetween: gap }));
  }
  const reshuffle = () => {
    if (!out) return;
    const start = timed && first ? fromNepalInput(first) : null;
    setOut(generate({ format, teams: shuffled(picked), shuffle: false, thirdPlace: third, firstKickOff: start, minutesBetween: gap }));
  };

  async function save() {
    if (!out) return;
    if (hasSheet && !(await askConfirm(playedAlready ? "Replace the current tie-sheet? Matches already played, their scores and goals will be removed." : "Replace the current tie-sheet with this one?"))) return;
    setBusy(true); setError("");
    try { onSaved(await api.save(out)); } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  }

  const matchCount = out?.reduce((n, r) => n + r.matches.length, 0) ?? 0;
  const preview: BracketRound[] = (out ?? []).map((r) => ({ name: r.name, matches: r.matches.map((m) => ({ home: m.home, away: m.away, startsAt: m.startsAt, note: m.note })) }));

  return (
    <div className="space-y-4">
      <section className="space-y-4 rounded-2xl bg-surface p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Tie-sheet generator</h2>
          {onCancel && <button type="button" onClick={onCancel} aria-label="Close the generator" className="rounded-full p-1.5 text-muted hover:bg-surface-2"><X size={18} /></button>}
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-muted">1. Format</p>
          <div className="grid grid-cols-2 gap-2">
            {([["knockout", "Knockout", "Lose and you are out. Quarter-finals, semi-finals, final."], ["league", "League", "Everyone plays everyone once."]] as const).map(([id, label, hint]) => (
              <button key={id} type="button" aria-pressed={format === id} onClick={() => { setFormat(id); setOut(null); }} className={`rounded-xl border p-3 text-left ${format === id ? "border-brand bg-brand/10" : "border-line"}`}>
                <span className="block text-sm font-semibold">{label}</span><span className="block text-xs text-muted">{hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted">2. Teams ({picked.length})</p>
            {registered.length > 0 && <button type="button" onClick={addAll} className="text-xs font-semibold text-brand">Add all registered teams ({registered.length})</button>}
          </div>

          {/* a drop-down of the registered teams while typing; any other name can be added too */}
          <div ref={box} className="relative">
            <div className="flex gap-2">
              <input value={typed} maxLength={40} placeholder={registered.length ? "Type or choose a registered team" : "Type a team name"} aria-label="Add a team" role="combobox" aria-expanded={suggestOpen} aria-controls="team-suggest"
                onFocus={() => setSuggestOpen(true)} onChange={(e) => { setTyped(e.target.value); setSuggestOpen(true); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(typed || suggestions[0]?.teamName || ""); } if (e.key === "Escape") setSuggestOpen(false); }} className={field} />
              <button type="button" onClick={() => add(typed)} disabled={!typed.trim()} className="flex shrink-0 items-center gap-1 rounded-xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50"><Plus size={16} /> Add</button>
            </div>
            {suggestOpen && suggestions.length > 0 && (
              <ul id="team-suggest" role="listbox" aria-label="Registered teams" className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-xl">
                {suggestions.map((t) => (
                  <li key={t.id} role="option" aria-selected={false}>
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { add(t.teamName); setSuggestOpen(true); }} className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2">
                      <span className="min-w-0"><span className="block truncate font-semibold">{t.teamName}</span><span className="block truncate text-xs text-muted">Captain {t.captainName}</span></span>
                      {t.status === "pending" && <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700">Pending</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {picked.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Teams in the tie-sheet">
              {picked.map((n, i) => (
                <li key={n} className="flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pl-3 pr-1.5 text-sm font-medium"><span className="text-xs text-muted">{i + 1}.</span> {n}
                  <button type="button" onClick={() => remove(n)} aria-label={`Remove ${n}`} className="rounded-full p-1 text-muted hover:bg-black/10"><X size={13} /></button></li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted">3. Options</p>
          <label className="flex items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2"><Dices size={16} className="text-muted" /> Shuffle the teams (random draw)</span><input type="checkbox" checked={shuffle} onChange={(e) => { setShuffle(e.target.checked); setOut(null); }} className="h-5 w-5" /></label>
          {format === "knockout" && <label className="flex items-center justify-between gap-3 text-sm"><span>Third place play-off</span><input type="checkbox" checked={third} onChange={(e) => { setThird(e.target.checked); setOut(null); }} className="h-5 w-5" /></label>}
          <label className="flex items-center justify-between gap-3 text-sm"><span>Give every match a kick-off time</span><input type="checkbox" checked={timed} onChange={(e) => { setTimed(e.target.checked); setOut(null); }} className="h-5 w-5" /></label>
          {timed && (
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-muted">First kick-off (Nepal time)<input type="datetime-local" value={first} onChange={(e) => { setFirst(e.target.value); setOut(null); }} className={`${field} mt-1`} /></label>
              <label className="text-xs text-muted">Minutes between matches<input inputMode="numeric" value={gap} onChange={(e) => { setGap(Math.max(0, Math.min(600, Number(e.target.value.replace(/\D/g, "")) || 0))); setOut(null); }} className={`${field} mt-1`} /></label>
            </div>
          )}
        </div>

        {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
        <button type="button" onClick={build} className="flex w-full items-center justify-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white"><Sparkles size={17} /> Generate tie-sheet</button>
      </section>

      {out && (
        <section className="space-y-3" aria-label="Preview">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-bold">Preview <span className="text-sm font-normal text-muted">{out.length} round{out.length === 1 ? "" : "s"}, {matchCount} match{matchCount === 1 ? "" : "es"}</span></h3>
            {shuffle && <button type="button" onClick={reshuffle} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold"><RefreshCw size={13} /> Draw again</button>}
          </div>
          <Bracket rounds={preview} />
          <div className="flex gap-2">
            <button type="button" onClick={() => setOut(null)} className="flex items-center gap-1.5 rounded-full border border-line px-4 py-3 text-sm font-semibold text-muted"><Trash2 size={15} /> Discard</button>
            <button type="button" disabled={busy} onClick={save} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />} Save this tie-sheet</button>
          </div>
        </section>
      )}
    </div>
  );
}
