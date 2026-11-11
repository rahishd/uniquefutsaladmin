"use client";

import { Radio } from "lucide-react";
import { nepalTime } from "@/lib/tournaments";

// The tie-sheet drawn as a bracket: one column per round, one card per match, in playing order (Match 1, 2, 3 ...).
// Used for the preview while generating and for the saved sheet (with live scores). Names like "Winner of Match 3" show in italics.
export type BracketMatch = {
  id?: string; home: string | null; away: string | null; startsAt: string | null; note: string | null;
  status?: "upcoming" | "live" | "finished"; homeScore?: number | null; awayScore?: number | null;
};
export type BracketRound = { id?: string; name: string; matches: BracketMatch[] };

const placeholder = (n: string | null) => !n || /^(Winner|Loser) of Match \d+$/.test(n);

function Team({ name, score, won, lost }: { name: string | null; score: number | null | undefined; won: boolean; lost: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 px-3 py-2 ${won ? "bg-emerald-500/10" : ""}`}>
      <span className={`min-w-0 truncate text-sm ${placeholder(name) ? "italic text-muted" : lost ? "text-muted" : "font-semibold"} ${won ? "!font-bold text-emerald-700" : ""}`}>{name ?? "To be decided"}</span>
      {score !== null && score !== undefined && <span className={`shrink-0 rounded-md px-2 py-0.5 text-sm font-bold tabular-nums ${won ? "bg-emerald-600 text-white" : "bg-surface-2"}`}>{score}</span>}
    </div>
  );
}

export default function Bracket({ rounds }: { rounds: BracketRound[] }) {
  let n = 0;
  if (rounds.length === 0) return null;
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-3 [scrollbar-width:thin]" role="region" aria-label="Tie-sheet" tabIndex={0}>
      <div className="flex min-w-max items-stretch gap-4">
        {rounds.map((r, ri) => (
          <section key={r.id ?? `${r.name}-${ri}`} aria-label={r.name} className="flex w-60 shrink-0 flex-col">
            <h3 className="mb-3 rounded-full bg-header px-4 py-1.5 text-center text-xs font-bold uppercase tracking-wider text-white shadow-sm">{r.name}</h3>
            <ul className="flex flex-1 flex-col justify-around gap-3">
              {r.matches.map((m, mi) => {
                n++;
                const done = m.status === "finished";
                const hs = m.homeScore ?? 0;
                const as = m.awayScore ?? 0;
                const shown = m.status && m.status !== "upcoming";
                return (
                  <li key={m.id ?? mi} className="relative">
                    {ri < rounds.length - 1 && <span aria-hidden className="absolute -right-4 top-1/2 h-px w-4 bg-line" />}
                    <div className={`overflow-hidden rounded-2xl border bg-surface shadow-sm ${m.status === "live" ? "border-rose-500 ring-2 ring-rose-500/30" : "border-line"}`}>
                      <div className="flex items-center justify-between gap-2 border-b border-line bg-surface-2/60 px-3 py-1.5 text-[11px] font-semibold text-muted">
                        <span>Match {n}</span>
                        {m.status === "live" ? <span className="flex items-center gap-1 text-rose-600"><Radio size={11} /> LIVE</span> : done ? <span>Full time</span> : m.startsAt ? <span>{nepalTime(m.startsAt)}</span> : <span>Time to be set</span>}
                      </div>
                      <Team name={m.home} score={shown ? hs : null} won={done && hs > as} lost={done && hs < as} />
                      <div className="mx-3 border-t border-line" />
                      <Team name={m.away} score={shown ? as : null} won={done && as > hs} lost={done && as < hs} />
                      {m.note && <p className="border-t border-line px-3 py-1.5 text-[11px] text-muted">{m.note}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
