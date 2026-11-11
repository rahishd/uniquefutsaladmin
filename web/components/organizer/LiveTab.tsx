"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ExternalLink, Flag, Loader2, Play, Radio, RotateCcw, Trash2, Undo2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { askConfirm } from "@/lib/confirm";
import { OrgTournament, orgSetLiveLink, organizerEditor } from "@/lib/organizer";
import { Match, Round, Side, nepalTime } from "@/lib/tournaments";

// The Live page, in three easy steps: 1) choose the match from the tie-sheet, 2) paste the Facebook Live link, 3) go live and tap a goal
// the moment it happens. The match score, the followers' notices and the tie-sheet all follow those taps.
const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");
const field = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const looksFacebook = (v: string) => /^https:\/\/([a-z0-9-]+\.)*(facebook\.com|fb\.watch|fb\.com|fb\.gg)(\/|$)/i.test(v.trim());

const STATUS = {
  upcoming: { label: "Not started", tone: "bg-slate-500/15 text-slate-600" },
  live: { label: "LIVE", tone: "bg-rose-500 text-white" },
  finished: { label: "Full time", tone: "bg-emerald-500/15 text-emerald-700" },
} as const;

export default function LiveTab({ tournament }: { tournament: OrgTournament }) {
  const api = useMemo(() => organizerEditor(tournament.id), [tournament.id]);
  const [rounds, setRounds] = useState<Round[] | null>(null);
  const [pick, setPick] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => api.load().then((r) => { setRounds(r); setError(""); }).catch((e) => setError(msg(e))), [api]);
  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t); }, [load]);
  // while the list is open it follows the tie-sheet
  useEffect(() => {
    if (pick) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 10_000);
    return () => clearInterval(t);
  }, [pick, load]);

  const all = useMemo(() => (rounds ?? []).flatMap((r) => r.matches.map((m) => ({ ...m, round: r.name }))), [rounds]);
  const match = all.find((m) => m.id === pick);
  // a changed match from the server replaces the old one in the list
  const patch = (m: Match) => setRounds((rs) => (rs ?? []).map((r) => ({ ...r, matches: r.matches.map((x) => (x.id === m.id ? m : x)) })));

  if (!rounds) return <p className="py-16 text-center text-sm text-muted">{error || "Loading your matches…"}</p>;
  if (match) return <Console key={match.id} tid={tournament.id} m={match} round={match.round} onChange={patch} onBack={() => { setPick(""); void load(); }} />;
  return <Picker rounds={rounds} onPick={setPick} error={error} />;
}

/* ---------------- step 1: choose the match ---------------- */
function Picker({ rounds, onPick, error }: { rounds: Round[]; onPick: (id: string) => void; error: string }) {
  const matches = rounds.flatMap((r) => r.matches.map((m) => ({ ...m, round: r.name })));
  if (matches.length === 0) {
    return (
      <div className="grid place-items-center gap-3 rounded-2xl bg-surface p-10 text-center shadow-sm">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-rose-500/10 text-rose-600"><Radio size={30} /></span>
        <h2 className="text-lg font-bold">Make the tie-sheet first</h2>
        <p className="max-w-xs text-sm text-muted">Your matches come from the tie-sheet. Open the Tie-sheet page, build it, then come back here to go live.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold"><Radio size={20} className="text-rose-600" /> Go live</h2>
        <p className="text-sm text-muted"><b className="text-foreground">Step 1.</b> Choose the match you are showing live.</p>
      </div>
      {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
      {rounds.filter((r) => r.matches.length > 0).map((r) => (
        <section key={r.id} className="space-y-2">
          <h3 className="px-1 text-xs font-bold uppercase tracking-wide text-muted">{r.name}</h3>
          <ul className="space-y-2">
            {[...r.matches].sort((a, b) => Number(b.status === "live") - Number(a.status === "live")).map((m) => {
              const ready = Boolean(m.home && m.away);
              const st = STATUS[m.status];
              return (
                <li key={m.id}>
                  <button type="button" disabled={!ready} onClick={() => onPick(m.id)} className="flex w-full items-center gap-3 rounded-2xl bg-surface p-4 text-left shadow-sm transition active:scale-[0.99] disabled:opacity-50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-bold">{m.home ?? "To be decided"} <span className="font-medium text-muted">vs</span> {m.away ?? "To be decided"}</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {!ready ? "Teams not set yet" : m.status === "upcoming" ? nepalTime(m.startsAt) || "No time set" : `${m.homeScore ?? 0} - ${m.awayScore ?? 0}`}
                        {m.liveUrl && <span className="ml-2 font-semibold text-sky-600">· Facebook link added</span>}
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${st.tone}`}>{st.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* ---------------- steps 2 and 3: the Facebook link and the live score ---------------- */
function Console({ tid, m, round, onChange, onBack }: { tid: string; m: Match & { round: string }; round: string; onChange: (m: Match) => void; onBack: () => void }) {
  const api = useMemo(() => organizerEditor(tid), [tid]);
  const [link, setLink] = useState(m.liveUrl ?? "");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function run<T extends Match>(key: string, fn: () => Promise<T>) {
    if (busy) return;
    setBusy(key); setError("");
    try { onChange(await fn()); } catch (e) { setError(msg(e)); } finally { setBusy(""); }
  }
  const goal = (side: Side) => run(`goal-${side}`, () => api.goal(m.id, { side, minute: null, scorer: null }));

  async function saveLink(next: string | null) {
    if (busy) return;
    if (next && !looksFacebook(next)) { setError("This is not a Facebook link. Paste the link of your Facebook live video."); setOk(""); return; }
    setBusy("link"); setError(""); setOk("");
    try {
      const r = await orgSetLiveLink(tid, m.id, next);
      onChange({ ...m, liveUrl: r.liveUrl });
      setLink(r.liveUrl ?? ""); setOk(r.liveUrl ? "Facebook link saved." : "Link removed.");
    } catch (e) { setError(msg(e)); } finally { setBusy(""); }
  }

  const st = STATUS[m.status];
  const home = m.home ?? "Home", away = m.away ?? "Away";
  const goals = [...m.goals].reverse(); // the newest first, so the last tap is on top

  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm font-semibold text-muted"><ChevronLeft size={16} /> All matches</button>

      {/* the scoreboard */}
      <section className="rounded-3xl bg-gradient-to-br from-[#0c0b5d] to-[#06053a] p-5 text-center text-white shadow-lg">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-white/60">
          <span>{round}</span>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold normal-case tracking-normal ${st.tone}`}>{m.status === "live" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />}{st.label}</span>
        </div>
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <p className="break-words text-sm font-bold leading-tight sm:text-base">{home}</p>
          <p className="rounded-2xl bg-white/10 px-4 py-2 text-4xl font-extrabold tabular-nums">{m.homeScore ?? 0}<span className="mx-1.5 text-white/40">-</span>{m.awayScore ?? 0}</p>
          <p className="break-words text-sm font-bold leading-tight sm:text-base">{away}</p>
        </div>
      </section>

      {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}

      {/* step 2: the Facebook link */}
      <section className="space-y-2 rounded-2xl bg-surface p-4 shadow-sm">
        <h3 className="text-sm font-bold"><span className="mr-1.5 inline-grid h-5 w-5 place-items-center rounded-full bg-brand text-[11px] text-white">2</span> Facebook live link</h3>
        <p className="text-xs text-muted">Start your live video on Facebook, copy its link and paste it here so the customers can watch.</p>
        <input value={link} onChange={(e) => { setLink(e.target.value); setOk(""); }} inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="https://www.facebook.com/…" aria-label="Facebook live link" className={field} />
        {ok && <p role="status" className="rounded-xl bg-emerald-500/10 p-2.5 text-sm text-emerald-700">{ok}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={() => saveLink(link.trim() || null)} disabled={busy !== "" || link.trim() === (m.liveUrl ?? "")} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50">{busy === "link" && <Loader2 size={15} className="animate-spin" />} Save link</button>
          {m.liveUrl && (
            <>
              <a href={m.liveUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-semibold"><ExternalLink size={15} /> Open</a>
              <button type="button" onClick={() => saveLink(null)} disabled={busy !== ""} aria-label="Remove the link" className="grid w-12 place-items-center rounded-2xl border border-line bg-surface text-red-600 disabled:opacity-50"><Trash2 size={16} /></button>
            </>
          )}
        </div>
      </section>

      {/* step 3: the live score */}
      <section className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
        <h3 className="text-sm font-bold"><span className="mr-1.5 inline-grid h-5 w-5 place-items-center rounded-full bg-brand text-[11px] text-white">3</span> Live score</h3>

        {m.status === "upcoming" && (
          <>
            <p className="text-xs text-muted">When the match kicks off, press the button. Then tap a goal the moment it happens.</p>
            <button type="button" onClick={() => run("kick", () => api.status(m.id, { status: "live" }))} disabled={busy !== "" || !m.home || !m.away} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#f5822a] py-4 text-base font-extrabold text-white shadow-md active:scale-[0.99] disabled:opacity-50">{busy === "kick" ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />} Kick off, go live</button>
          </>
        )}

        {m.status === "live" && (
          <>
            <p className="text-xs text-muted">Tap the team that scored. The score updates for everyone at once.</p>
            <div className="grid grid-cols-2 gap-3">
              {([["home", home], ["away", away]] as const).map(([side, name]) => (
                <button key={side} type="button" onClick={() => goal(side)} disabled={busy !== ""} className="flex min-h-28 flex-col items-center justify-center gap-1 rounded-2xl bg-emerald-600 p-3 text-white shadow-md transition active:scale-95 disabled:opacity-60">
                  {busy === `goal-${side}` ? <Loader2 size={26} className="animate-spin" /> : <span className="text-4xl font-extrabold leading-none">+1</span>}
                  <span className="line-clamp-2 break-words text-center text-sm font-bold leading-tight">{name}</span>
                  <span className="text-[11px] font-semibold text-white/80">Goal</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={async () => (await askConfirm("Finish this match? The score becomes the final result.")) && run("full", () => api.status(m.id, { status: "finished" }))} disabled={busy !== ""} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-line bg-surface py-3.5 text-sm font-bold disabled:opacity-50">{busy === "full" ? <Loader2 size={16} className="animate-spin" /> : <Flag size={16} />} Full time</button>
          </>
        )}

        {m.status === "finished" && (
          <>
            <p className="rounded-xl bg-emerald-500/10 p-3 text-center text-sm font-semibold text-emerald-700">Match finished: {home} {m.homeScore ?? 0} - {m.awayScore ?? 0} {away}</p>
            <button type="button" onClick={() => run("reopen", () => api.status(m.id, { status: "live" }))} disabled={busy !== ""} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-line bg-surface py-3.5 text-sm font-bold disabled:opacity-50"><RotateCcw size={16} /> Reopen the match</button>
          </>
        )}

        {goals.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Goals</p>
            <ul className="divide-y divide-line text-sm">
              {goals.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0 truncate"><span aria-hidden>⚽</span> <b>{g.side === "home" ? home : away}</b>{g.scorer ? <span className="text-muted"> · {g.scorer}</span> : null}{g.minute !== null ? <span className="text-muted"> · {g.minute}&apos;</span> : null}</span>
                  <button type="button" onClick={() => run(`undo-${g.id}`, () => api.undo(g.id))} disabled={busy !== ""} className="inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-500/10 disabled:opacity-50"><Undo2 size={13} /> Undo</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
