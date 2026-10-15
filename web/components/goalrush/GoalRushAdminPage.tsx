"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Search, Trophy, X } from "lucide-react";
import { Badge } from "../bookings/Badge";
import { prettyDate } from "@/lib/bookings";
import { GRDetail, GRFilters, GRList, GRTotals, PAGE_SIZE, goalRushGame, listGoalRush } from "@/lib/goalrush";

const STATUS = {
  completed: { label: "Finished", tone: "bg-emerald-500/15 text-emerald-700" },
  abandoned: { label: "Not finished", tone: "bg-surface-2 text-muted" },
  active: { label: "Playing", tone: "bg-blue-500/15 text-blue-700" },
} as const;
const OUTCOME: Record<string, { label: string; tone: string }> = {
  goal: { label: "Goal", tone: "bg-emerald-500/15 text-emerald-700" },
  save: { label: "Saved", tone: "bg-amber-500/15 text-amber-700" },
  wide: { label: "Wide", tone: "bg-surface-2 text-muted" },
  over: { label: "Over the bar", tone: "bg-surface-2 text-muted" },
  post: { label: "Hit the post", tone: "bg-surface-2 text-muted" },
};
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "–");

function TotalsCard({ title, t }: { title: string; t: GRTotals | undefined }) {
  return (
    <section className="rounded-2xl bg-surface p-4 shadow-sm">
      <h2 className="text-sm font-bold">{title}</h2>
      <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
        {([
          ["Games", t?.games], ["Players", t?.players], ["Points given", t?.points],
          ["Goals", t?.goals], ["Saves", t?.saves], ["Misses", t?.misses],
          ["Finished", t?.completed], ["Not finished", t?.abandoned], ["Goal rate", t ? pct(t.goals, t.shots) : undefined],
        ] as const).map(([k, v]) => (
          <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="font-bold">{v ?? "…"}</dd></div>
        ))}
      </dl>
    </section>
  );
}

// Unique Goal Rush: the penalty game in the customer app. Read-only: games, goals, saves, the points it gave and odd patterns.
export default function GoalRushAdminPage() {
  const [f, setF] = useState<GRFilters>({ status: "", rewarded: "", q: "" });
  const [search, setSearch] = useState("");
  const [pageNo, setPageNo] = useState(1);
  const [data, setData] = useState<GRList | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<GRDetail | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setF((x) => ({ ...x, q: search })); setPageNo(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let live = true;
    listGoalRush(f, pageNo)
      .then((d) => { if (live) { setData(d); setError(""); } })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load the games"); });
    return () => { live = false; };
  }, [f, pageNo]);

  const change = (p: Partial<GRFilters>) => { setF((x) => ({ ...x, ...p })); setPageNo(1); setData(null); };
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const maxDay = Math.max(1, ...(data?.byDay.map((d) => d.games) ?? [1]));

  async function show(id: string) {
    try { setOpen(await goalRushGame(id)); } catch (e) { setError(e instanceof Error ? e.message : "Could not open the game"); }
  }

  return (
    <div className="w-full space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Trophy size={24} className="text-brand" /> Unique Goal Rush</h1>
        <p className="text-sm text-muted">The penalty game in the customer app. 5 shots a game, 3 games a day; a finished game with 3 or more goals earns 1 loyalty point (every 3 goals = 1 point), so at most 3 points a day. Results are decided by the server and cannot be edited here. To correct a reward, use Loyalty Points &gt; Adjust (it is logged with your name and the reason).</p>
      </header>

      <div className="grid gap-3 lg:grid-cols-3">
        <TotalsCard title="Today" t={data?.totals.today} />
        <TotalsCard title="This month" t={data?.totals.month} />
        <TotalsCard title="All time" t={data?.totals.all} />
      </div>

      <section className="rounded-2xl bg-surface p-4 shadow-sm" aria-label="Games per day">
        <h2 className="text-sm font-bold">Games per day (last 14 days)</h2>
        <div className="mt-3 flex h-32 items-end gap-1.5">
          {data?.byDay.map((d) => (
            <div key={d.day} className="flex flex-1 flex-col items-center gap-1" title={`${prettyDate(d.day)}: ${d.games} games, ${d.goals} goals, ${d.points} points`}>
              <span className="text-[10px] text-muted">{d.games || ""}</span>
              <span className="w-full rounded-t bg-brand/70" style={{ height: `${Math.max(2, (d.games / maxDay) * 88)}px` }} />
              <span className="text-[10px] text-muted">{d.day.slice(8)}</span>
            </div>
          ))}
        </div>
      </section>

      {data && data.flags.length > 0 && (
        <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4" aria-label="Players to look at">
          <h2 className="flex items-center gap-2 text-sm font-bold text-amber-800"><AlertTriangle size={16} /> Worth a look (last 7 days)</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {data.flags.map((x) => (
              <li key={x.phone}>
                <button onClick={() => { setSearch(x.phone); }} className="font-semibold underline-offset-2 hover:underline">{x.name || "Customer"} · {x.phone}</button>
                <span className="text-muted"> — {x.reasons.join(", ")} ({x.games} games)</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Status" value={f.status} onChange={(e) => change({ status: e.target.value as GRFilters["status"] })} className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm">
          <option value="">Every game</option><option value="completed">Finished</option><option value="abandoned">Not finished</option><option value="active">Being played</option>
        </select>
        <select aria-label="Reward" value={f.rewarded} onChange={(e) => change({ rewarded: e.target.value as GRFilters["rewarded"] })} className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm">
          <option value="">With or without points</option><option value="yes">Earned points</option><option value="no">No points</option>
        </select>
        <label className="relative ml-auto block w-full sm:w-64">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or mobile number" aria-label="Search players" className="w-full rounded-xl border border-line bg-surface py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand" />
        </label>
      </div>

      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!data && !error && <p className="py-10 text-center text-sm text-muted">Loading games…</p>}
      {data && data.items.length === 0 && <p className="rounded-2xl bg-surface py-14 text-center text-muted shadow-sm">No games match these filters.</p>}

      <ul className="grid items-start gap-2 xl:grid-cols-2">
        {data?.items.map((g) => {
          const st = STATUS[g.status];
          return (
            <li key={g.id}>
              <button onClick={() => show(g.id)} className="flex w-full items-center gap-3 rounded-2xl bg-surface p-4 text-left shadow-sm hover:ring-1 hover:ring-brand/40">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{g.name || "Customer"} <span className="text-sm font-normal text-muted">· {g.phone}</span></p>
                  <p className="text-xs text-muted">{prettyDate(g.day)} · {time(g.startedAt)}{g.seconds !== null ? ` · ${g.seconds}s` : ""}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone={st.tone}>{st.label}</Badge>
                    <Badge tone="bg-surface-2 text-foreground">{g.goals} goal{g.goals === 1 ? "" : "s"} / {g.shots} shot{g.shots === 1 ? "" : "s"}</Badge>
                    {g.saves > 0 && <Badge tone="bg-amber-500/15 text-amber-700">{g.saves} saved</Badge>}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-lg font-bold ${g.points > 0 ? "text-emerald-700" : "text-muted"}`}>{g.points > 0 ? `+${g.points}` : "0"}</p>
                  <p className="text-[11px] text-muted">points</p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-2 text-sm">
          <button disabled={pageNo <= 1} onClick={() => { setPageNo(pageNo - 1); setData(null); }} className="flex items-center gap-1 rounded-xl bg-surface px-3 py-2 shadow-sm disabled:opacity-40"><ChevronLeft size={16} /> Previous</button>
          <span className="text-muted">Page {pageNo} of {pages} · {data.total} games</span>
          <button disabled={pageNo >= pages} onClick={() => { setPageNo(pageNo + 1); setData(null); }} className="flex items-center gap-1 rounded-xl bg-surface px-3 py-2 shadow-sm disabled:opacity-40">Next <ChevronRight size={16} /></button>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setOpen(null)}>
          <div role="dialog" aria-label="Game details" onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">{open.name || "Customer"} · {open.userId}</h2>
                <p className="text-sm text-muted">{prettyDate(open.day)} · game {open.id}</p>
              </div>
              <button onClick={() => setOpen(null)} aria-label="Close" className="rounded-full p-1 hover:bg-surface-2"><X size={22} /></button>
            </div>
            <ol className="space-y-2">
              {open.shots.map((s) => {
                const o = OUTCOME[s.outcome] ?? { label: s.outcome, tone: "bg-surface-2 text-muted" };
                return (
                  <li key={s.no} className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                    <span className="font-semibold">Shot {s.no}</span>
                    <span className="text-xs text-muted">aim {s.aimX.toFixed(2)}, {s.aimY.toFixed(2)} · power {Math.round(s.power * 100)}% · keeper {s.keeper}</span>
                    <Badge tone={o.tone}>{o.label}</Badge>
                  </li>
                );
              })}
              {open.shots.length === 0 && <li className="text-sm text-muted">No shots taken.</li>}
            </ol>
            <div className="rounded-xl bg-surface-2 p-3 text-sm">
              {open.reward
                ? <>Reward: <b>+{open.reward.points} points</b> on {prettyDate(open.reward.earnedOn)}{open.reward.expiresOn ? `, valid until ${prettyDate(open.reward.expiresOn)}` : ""}. Reference <span className="font-mono">{open.reward.id}</span>.</>
                : open.status === "completed" ? "No points: no goal in this game." : "No points: the game was not finished."}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
