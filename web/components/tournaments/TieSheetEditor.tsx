"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, Radio, RotateCcw, Trash2, X } from "lucide-react";
import { Badge } from "../bookings/Badge";
import { ApiError } from "@/lib/api";
import {
  EditorApi, Goal, Match, MatchStatus, Round, Side, StructureRound, fromNepalInput, toNepalInput,
} from "@/lib/tournaments";

// The tie-sheet editor, used by staff on the Tournament page and by the match-day host on the shared link.
// Two kinds of change:
//  - the SHAPE of the sheet (rounds, team names, times, venues, notes): edited freely, then saved with "Save changes";
//  - the LIVE state of a match (kick-off, goals, full time, score corrections): done by buttons, saved at once, so two people
//    can follow the same game and a saved sheet never overwrites a score.

type DraftMatch = { key: string; id?: string; home: string; away: string; startsAt: string; venue: string; note: string };
type DraftRound = { key: string; id?: string; name: string; matches: DraftMatch[] };

const uid = () => Math.random().toString(36).slice(2, 9);
const fromServer = (rounds: Round[]): DraftRound[] =>
  rounds.map((r) => ({
    key: r.id, id: r.id, name: r.name,
    matches: r.matches.map((m) => ({ key: m.id, id: m.id, home: m.home ?? "", away: m.away ?? "", startsAt: toNepalInput(m.startsAt), venue: m.venue ?? "", note: m.note ?? "" })),
  }));
const toStructure = (rounds: DraftRound[]): StructureRound[] =>
  rounds.map((r) => ({
    ...(r.id ? { id: r.id } : {}), name: r.name.trim(),
    matches: r.matches.map((m) => ({ ...(m.id ? { id: m.id } : {}), home: m.home.trim() || null, away: m.away.trim() || null, startsAt: fromNepalInput(m.startsAt), venue: m.venue.trim() || null, note: m.note.trim() || null })),
  }));
const shape = (rounds: DraftRound[]) => JSON.stringify(toStructure(rounds));

const field = "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand disabled:opacity-60";
const STATUS: Record<MatchStatus, { label: string; tone: string }> = {
  upcoming: { label: "Upcoming", tone: "bg-slate-500/15 text-slate-600" },
  live: { label: "Live", tone: "bg-rose-500/15 text-rose-600" },
  finished: { label: "Full time", tone: "bg-brand/15 text-brand" },
};

export default function TieSheetEditor({ initial, api, canEdit = true, pollMs = 10_000 }: { initial: Round[]; api: EditorApi; canEdit?: boolean; pollMs?: number }) {
  const [server, setServer] = useState<Round[]>(initial);
  const [draft, setDraft] = useState<DraftRound[]>(() => fromServer(initial));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState<{ matchId: string; side: Side } | null>(null);
  const [goal, setGoal] = useState({ minute: "", scorer: "" });
  const [editScore, setEditScore] = useState<string | null>(null);
  const [score, setScore] = useState({ h: "0", a: "0" });

  const dirty = useMemo(() => shape(draft) !== shape(fromServer(server)), [draft, server]);
  const live = useMemo(() => new Map(server.flatMap((r) => r.matches).map((m) => [m.id, m])), [server]);

  // others may be scoring too: refresh every few seconds, but never throw away what is being typed
  const state = useRef({ dirty, busy });
  useEffect(() => { state.current = { dirty, busy }; });
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== "visible" || state.current.busy) return;
      api.load().then((rounds) => {
        setServer(rounds);
        if (!state.current.dirty) setDraft(fromServer(rounds));
      }).catch(() => {});
    }, pollMs);
    return () => clearInterval(t);
  }, [api, pollMs]);

  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");

  async function save() {
    setBusy("save"); setError(""); setSaved(false);
    try {
      const rounds = await api.save(toStructure(draft));
      setServer(rounds); setDraft(fromServer(rounds)); setSaved(true);
    } catch (e) { fail(e); } finally { setBusy(""); }
  }

  // one match came back from the server after a live action
  const apply = (m: Match) => setServer((rs) => rs.map((r) => ({ ...r, matches: r.matches.map((x) => (x.id === m.id ? m : x)) })));
  async function run(key: string, job: () => Promise<Match>) {
    setBusy(key); setError(""); setSaved(false);
    try { apply(await job()); } catch (e) { fail(e); } finally { setBusy(""); }
  }

  const setRound = (rk: string, patch: Partial<DraftRound>) => { setDraft((d) => d.map((r) => (r.key === rk ? { ...r, ...patch } : r))); setSaved(false); };
  const setMatch = (rk: string, mk: string, patch: Partial<DraftMatch>) => {
    setDraft((d) => d.map((r) => (r.key === rk ? { ...r, matches: r.matches.map((m) => (m.key === mk ? { ...m, ...patch } : m)) } : r)));
    setSaved(false);
  };
  const addRound = () => { setDraft((d) => [...d, { key: uid(), name: "New round", matches: [] }]); setSaved(false); };
  const addMatch = (rk: string) => { setDraft((d) => d.map((r) => (r.key === rk ? { ...r, matches: [...r.matches, { key: uid(), home: "", away: "", startsAt: "", venue: "", note: "" }] } : r))); setSaved(false); };
  const dropMatch = (rk: string, m: DraftMatch) => {
    const hasData = m.id && ((live.get(m.id)?.goals.length ?? 0) > 0 || live.get(m.id)?.status !== "upcoming");
    if (hasData && !window.confirm("This match already has a score or goals. Remove it and its goals?")) return;
    setDraft((d) => d.map((r) => (r.key === rk ? { ...r, matches: r.matches.filter((x) => x.key !== m.key) } : r))); setSaved(false);
  };
  const dropRound = (r: DraftRound) => {
    if (r.matches.length > 0 && !window.confirm(`Remove "${r.name}" with its ${r.matches.length} match${r.matches.length === 1 ? "" : "es"}?`)) return;
    setDraft((d) => d.filter((x) => x.key !== r.key)); setSaved(false);
  };

  function submitGoal(matchId: string, side: Side) {
    const minute = goal.minute.trim() === "" ? null : Math.max(0, Math.min(130, Number(goal.minute)));
    setOpen(null);
    setGoal({ minute: "", scorer: "" });
    void run(`goal-${matchId}`, () => api.goal(matchId, { side, minute: Number.isFinite(minute as number) ? minute : null, scorer: goal.scorer.trim() || null }));
  }

  function matchCard(r: DraftRound, m: DraftMatch) {
    const sv = m.id ? live.get(m.id) : undefined;
    const status: MatchStatus = sv?.status ?? "upcoming";
    const teamsSaved = !!sv?.home && !!sv?.away;
    const ready = !!sv && !dirty && teamsSaved && canEdit; // live buttons only act on what is saved
    const isBusy = busy === `goal-${m.id}` || busy === `st-${m.id}`;
    const goals: Goal[] = sv?.goals ?? [];
    const home = sv?.homeScore ?? 0;
    const away = sv?.awayScore ?? 0;
    const label = (s: Side) => (s === "home" ? sv?.home : sv?.away) ?? (s === "home" ? "Home" : "Away");
    return (
      <li key={m.key} className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <Badge tone={STATUS[status].tone}>{status === "live" && <Radio size={11} className="mr-1 inline" />}{STATUS[status].label}</Badge>
          {canEdit && <button type="button" onClick={() => dropMatch(r.key, m)} aria-label="Remove this match" className="rounded-full p-1.5 text-red-600 hover:bg-red-500/10"><Trash2 size={15} /></button>}
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <input aria-label="Home team" placeholder="Home team" maxLength={40} value={m.home} disabled={!canEdit} onChange={(e) => setMatch(r.key, m.key, { home: e.target.value })} className={`${field} text-center font-semibold`} />
          <span className="min-w-16 text-center text-2xl font-bold tabular-nums" aria-label="Score">{sv && status !== "upcoming" ? `${home} - ${away}` : "v"}</span>
          <input aria-label="Away team" placeholder="Away team" maxLength={40} value={m.away} disabled={!canEdit} onChange={(e) => setMatch(r.key, m.key, { away: e.target.value })} className={`${field} text-center font-semibold`} />
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-xs text-muted">Kick-off (Nepal time)
            <input type="datetime-local" value={m.startsAt} disabled={!canEdit} onChange={(e) => setMatch(r.key, m.key, { startsAt: e.target.value })} className={`${field} mt-1`} />
          </label>
          <label className="text-xs text-muted">Venue
            <input value={m.venue} maxLength={60} placeholder="Court 1" disabled={!canEdit} onChange={(e) => setMatch(r.key, m.key, { venue: e.target.value })} className={`${field} mt-1`} />
          </label>
          <label className="text-xs text-muted">Note (shown to customers)
            <input value={m.note} maxLength={60} placeholder="e.g. Won on penalties" disabled={!canEdit} onChange={(e) => setMatch(r.key, m.key, { note: e.target.value })} className={`${field} mt-1`} />
          </label>
        </div>

        {canEdit && (
          !m.id ? (
            <p className="rounded-xl bg-surface-2 p-2.5 text-xs text-muted">Save the sheet to start scoring this match.</p>
          ) : !teamsSaved || dirty ? (
            <p className="rounded-xl bg-surface-2 p-2.5 text-xs text-muted">{dirty ? "Save your changes to use the score buttons." : "Enter and save both team names to start scoring."}</p>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {status === "upcoming" && <button type="button" disabled={isBusy} onClick={() => run(`st-${m.id}`, () => api.status(m.id!, { status: "live" }))} className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Kick off</button>}
                {status !== "finished" && (["home", "away"] as const).map((s) => (
                  <button key={s} type="button" disabled={!ready || isBusy} onClick={() => { setOpen({ matchId: m.id!, side: s }); setGoal({ minute: "", scorer: "" }); }} className="flex items-center gap-1.5 rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"><Plus size={15} /> Goal: {label(s)}</button>
                ))}
                {status === "live" && <button type="button" disabled={isBusy} onClick={() => run(`st-${m.id}`, () => api.status(m.id!, { status: "finished", note: m.note.trim() || null }))} className="rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold disabled:opacity-60">Full time</button>}
                {status === "finished" && <button type="button" disabled={isBusy} onClick={() => run(`st-${m.id}`, () => api.status(m.id!, { status: "live" }))} className="flex items-center gap-1.5 rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold disabled:opacity-60"><RotateCcw size={14} /> Reopen</button>}
                {status !== "upcoming" && <button type="button" onClick={() => { setEditScore(editScore === m.id ? null : m.id!); setScore({ h: String(home), a: String(away) }); }} className="rounded-full px-3 py-2 text-xs font-semibold text-muted">Correct the score</button>}
                {status !== "upcoming" && <button type="button" disabled={isBusy} onClick={() => window.confirm("Put this match back to Upcoming? Its score is cleared; goals stay in the log.") && run(`st-${m.id}`, () => api.status(m.id!, { status: "upcoming" }))} className="rounded-full px-3 py-2 text-xs font-semibold text-muted">Back to upcoming</button>}
              </div>

              {open?.matchId === m.id && (
                <div className="flex flex-wrap items-end gap-2 rounded-xl bg-rose-500/10 p-3">
                  <p className="w-full text-sm font-semibold">Goal for {label(open.side)}</p>
                  <label className="text-xs text-muted">Minute (optional)
                    <input inputMode="numeric" value={goal.minute} onChange={(e) => setGoal({ ...goal, minute: e.target.value.replace(/\D/g, "").slice(0, 3) })} className={`${field} mt-1 w-24`} />
                  </label>
                  <label className="min-w-40 flex-1 text-xs text-muted">Scorer (optional)
                    <input value={goal.scorer} maxLength={40} onChange={(e) => setGoal({ ...goal, scorer: e.target.value })} className={`${field} mt-1`} />
                  </label>
                  <button type="button" onClick={() => submitGoal(m.id!, open.side)} className="flex items-center gap-1.5 rounded-full bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white"><Check size={15} /> Add goal</button>
                  <button type="button" onClick={() => setOpen(null)} className="rounded-full px-3 py-2.5 text-sm font-semibold text-muted">Cancel</button>
                </div>
              )}

              {editScore === m.id && (
                <div className="flex flex-wrap items-end gap-2 rounded-xl bg-surface-2 p-3">
                  <label className="text-xs text-muted">{label("home")}<input inputMode="numeric" value={score.h} onChange={(e) => setScore({ ...score, h: e.target.value.replace(/\D/g, "").slice(0, 2) })} className={`${field} mt-1 w-20 text-center`} /></label>
                  <label className="text-xs text-muted">{label("away")}<input inputMode="numeric" value={score.a} onChange={(e) => setScore({ ...score, a: e.target.value.replace(/\D/g, "").slice(0, 2) })} className={`${field} mt-1 w-20 text-center`} /></label>
                  <button type="button" onClick={() => { setEditScore(null); void run(`st-${m.id}`, () => api.status(m.id!, { status, homeScore: Number(score.h || 0), awayScore: Number(score.a || 0) })); }} className="rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white">Set score</button>
                  <p className="w-full text-xs text-muted">Use this for a correction. It does not add to the goal log below.</p>
                </div>
              )}
            </div>
          )
        )}

        {goals.length > 0 && (
          <ul aria-label="Goals" className="space-y-1 border-t border-line pt-2 text-sm">
            {goals.map((g) => (
              <li key={g.id} className="flex items-center gap-2">
                <span className="w-10 shrink-0 text-xs font-semibold tabular-nums text-muted">{g.minute !== null ? `${g.minute}'` : "-"}</span>
                <span className="min-w-0 flex-1 truncate"><strong>{g.scorer || "Goal"}</strong> <span className="text-muted">({label(g.side)})</span></span>
                {ready && <button type="button" onClick={() => window.confirm("Take this goal back? The score goes down by one.") && run(`goal-${m.id}`, () => api.undo(g.id))} aria-label="Remove this goal" className="rounded-full p-1 text-muted hover:bg-red-500/10 hover:text-red-600"><X size={14} /></button>}
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
      {draft.length === 0 && <p className="rounded-2xl bg-surface p-8 text-center text-sm text-muted shadow-sm">The tie-sheet is empty. {canEdit ? "Add the first round, for example Quarter-finals." : ""}</p>}

      {draft.map((r) => (
        <section key={r.key} aria-label={r.name} className="space-y-2">
          <div className="flex items-center gap-2">
            <input aria-label="Round name" value={r.name} maxLength={40} disabled={!canEdit} onChange={(e) => setRound(r.key, { name: e.target.value })} className="min-w-0 flex-1 rounded-xl bg-transparent px-1 py-1 text-lg font-bold outline-none focus:bg-surface" />
            {canEdit && <button type="button" onClick={() => addMatch(r.key)} className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs font-semibold shadow-sm"><Plus size={14} /> Match</button>}
            {canEdit && <button type="button" onClick={() => dropRound(r)} aria-label={`Remove ${r.name}`} className="rounded-full p-1.5 text-red-600 hover:bg-red-500/10"><Trash2 size={15} /></button>}
          </div>
          <ul className="grid items-start gap-3 lg:grid-cols-2">{r.matches.map((m) => matchCard(r, m))}</ul>
          {r.matches.length === 0 && <p className="rounded-xl bg-surface p-4 text-center text-sm text-muted shadow-sm">No matches in this round yet.</p>}
        </section>
      ))}

      {canEdit && <button type="button" onClick={addRound} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line py-3 text-sm font-semibold text-muted hover:bg-surface"><Plus size={16} /> Add a round</button>}

      {canEdit && (dirty || saved) && (
        <div className="fixed inset-x-0 bottom-20 z-20 mx-auto flex w-[calc(100%-2rem)] max-w-xl items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-xl lg:bottom-6">
          <span role="status" className="min-w-0 flex-1 text-sm">{saved && !dirty ? <span className="flex items-center gap-1.5 text-brand"><Check size={16} /> Saved. Customers see it now.</span> : "You have changes that are not saved."}</span>
          {dirty && <button type="button" disabled={!!busy} onClick={() => { setDraft(fromServer(server)); setSaved(false); }} className="rounded-full px-3 py-2 text-sm font-semibold text-muted">Discard</button>}
          {dirty && <button type="button" disabled={!!busy} onClick={save} className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{busy === "save" ? "Saving…" : "Save changes"}</button>}
        </div>
      )}
    </div>
  );
}
