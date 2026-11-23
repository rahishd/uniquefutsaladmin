"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Dices, Search, X } from "lucide-react";
import { Badge } from "../bookings/Badge";
import { prettyDate } from "@/lib/bookings";
import { LudoDetail, LudoFilters, LudoList, LudoStatus, LudoTotals, PAGE_SIZE, listLudo, ludoGame } from "@/lib/ludo";

const STATUS: Record<LudoStatus, { label: string; tone: string }> = {
  completed: { label: "Finished", tone: "bg-emerald-500/15 text-emerald-700" },
  abandoned: { label: "Left unfinished", tone: "bg-surface-2 text-muted" },
  cancelled: { label: "Cancelled", tone: "bg-amber-500/15 text-amber-700" },
  active: { label: "Playing", tone: "bg-blue-500/15 text-blue-700" },
  lobby: { label: "In the lobby", tone: "bg-surface-2 text-muted" },
};
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const COLORS = ["Red", "Green", "Yellow", "Blue"];

function TotalsCard({ title, t }: { title: string; t: LudoTotals | undefined }) {
  return (
    <section className="rounded-2xl bg-surface p-4 shadow-sm">
      <h2 className="text-sm font-bold">{title}</h2>
      <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
        {([
          ["Games", t?.games], ["Players", t?.players], ["Points collected", t?.pointsCollected],
          ["Solo", t?.solo], ["With friends", t?.multi], ["Points given", t?.pointsGiven],
          ["Finished", t?.completed], ["Left unfinished", t?.abandoned], ["Points refunded", t?.pointsRefunded],
        ] as const).map(([k, v]) => (
          <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="font-bold">{v ?? "…"}</dd></div>
        ))}
      </dl>
    </section>
  );
}

// Unique Ludo: the online board game in the customer app. Read-only: games, who played, the points moved and odd patterns.
export default function LudoAdminPage() {
  const [f, setF] = useState<LudoFilters>({ status: "", mode: "", q: "" });
  const [search, setSearch] = useState("");
  const [pageNo, setPageNo] = useState(1);
  const [data, setData] = useState<LudoList | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<LudoDetail | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setF((x) => ({ ...x, q: search })); setPageNo(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let live = true;
    listLudo(f, pageNo)
      .then((d) => { if (live) { setData(d); setError(""); } })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load the games"); });
    return () => { live = false; };
  }, [f, pageNo]);

  const change = (p: Partial<LudoFilters>) => { setF((x) => ({ ...x, ...p })); setPageNo(1); setData(null); };
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const maxDay = Math.max(1, ...(data?.byDay.map((d) => d.games) ?? [1]));

  async function show(id: string) {
    try { setOpen(await ludoGame(id)); } catch (e) { setError(e instanceof Error ? e.message : "Could not open the game"); }
  }

  return (
    <div className="w-full space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Dices size={24} className="text-brand" /> Unique Ludo</h1>
        <p className="text-sm text-muted">The online Ludo game in the customer app (it replaced Goal Rush). Every player pays 1 loyalty point when a game starts and the winner earns 2. Limits per customer per day (Nepal time): 4 single player games and 5 games with friends. The dice, moves, winner and points are decided by the customer server and cannot be edited here. To correct points, use Loyalty Points &gt; Adjust (it is logged with your name and the reason).</p>
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
            <div key={d.day} className="flex flex-1 flex-col items-center gap-1" title={`${prettyDate(d.day)}: ${d.solo} solo, ${d.multi} with friends`}>
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
                <button onClick={() => setSearch(x.phone)} className="font-semibold underline-offset-2 hover:underline">{x.name || "Customer"} · {x.phone}</button>
                <span className="text-muted"> — {x.reasons.join(", ")} ({x.games} games)</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Status" value={f.status} onChange={(e) => change({ status: e.target.value as LudoFilters["status"] })} className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm">
          <option value="">Every game</option><option value="completed">Finished</option><option value="abandoned">Left unfinished</option><option value="cancelled">Cancelled</option><option value="active">Being played</option>
        </select>
        <select aria-label="Mode" value={f.mode} onChange={(e) => change({ mode: e.target.value as LudoFilters["mode"] })} className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm">
          <option value="">Solo and with friends</option><option value="solo">Single player</option><option value="multi">With friends</option>
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
          const winner = g.players.find((p) => p.won);
          return (
            <li key={g.id}>
              <button onClick={() => show(g.id)} className="flex w-full items-center gap-3 rounded-2xl bg-surface p-4 text-left shadow-sm hover:ring-1 hover:ring-brand/40">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{g.mode === "solo" ? "Single player" : "With friends"} <span className="text-sm font-normal text-muted">· {g.code}{g.mode === "solo" ? ` · ${g.difficulty}` : ""}</span></p>
                  <p className="truncate text-xs text-muted">{g.players.map((p) => (p.isBot ? p.name : p.name || p.phone)).join(", ")}</p>
                  <p className="text-xs text-muted">{g.day ? prettyDate(g.day) : ""}{g.startedAt ? ` · ${time(g.startedAt)}` : ""}{g.seconds !== null ? ` · ${Math.floor(g.seconds / 60)}m ${g.seconds % 60}s` : ""}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone={st.tone}>{st.label}</Badge>
                    {winner && <Badge tone="bg-surface-2 text-foreground">Winner: {winner.isBot ? `${winner.name}` : winner.name || winner.phone}</Badge>}
                  </div>
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
                <h2 className="text-lg font-bold">{open.mode === "solo" ? "Single player" : "With friends"} · {open.code}</h2>
                <p className="text-sm text-muted">{open.day ? prettyDate(open.day) : ""} · {STATUS[open.status].label}{open.cancelReason ? ` (${open.cancelReason})` : ""}</p>
              </div>
              <button onClick={() => setOpen(null)} aria-label="Close" className="rounded-full p-1 hover:bg-surface-2"><X size={22} /></button>
            </div>
            <ul className="space-y-2">
              {open.players.map((p) => (
                <li key={p.seat} className="rounded-xl bg-surface-2 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{COLORS[p.seat] ? `${p.name}` : p.name}{p.isBot ? " (computer)" : p.phone ? ` · ${p.phone}` : ""}</span>
                    <span className="text-xs text-muted">{p.result === "won" ? "Won" : p.result === "lost" ? "Lost" : p.result === "left" ? "Left" : p.result ?? ""}{p.rank ? ` · #${p.rank}` : ""} · {p.captures} captures{p.botControl && !p.isBot ? " · computer played for them" : ""}</span>
                  </div>
                  {!p.isBot && (
                    <p className="mt-1 text-xs text-muted">
                      {p.fee ? `Entry ${p.fee.points} point` : "No entry fee"}{p.reward ? ` · Reward +${p.reward.points}` : ""}{p.refund ? ` · Refund +${p.refund.points}` : ""}
                      {p.fee ? <span className="font-mono"> · {p.fee.id}</span> : null}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <details className="rounded-xl bg-surface-2 p-3 text-sm">
              <summary className="cursor-pointer font-semibold">Dice and moves log ({open.events.length})</summary>
              <ol className="mt-2 max-h-56 space-y-1 overflow-y-auto text-xs text-muted">
                {open.events.map((e) => (
                  <li key={e.seq}>#{e.seq} · {open.players[e.seat]?.name ?? `seat ${e.seat + 1}`} · {e.kind}{e.value ? ` ${e.value}` : ""}{e.token !== null ? ` token ${e.token + 1}` : ""}{e.detail ? ` (${e.detail})` : ""}</li>
                ))}
                {open.events.length === 0 && <li>No moves were made.</li>}
              </ol>
            </details>
          </div>
        </div>
      )}
    </div>
  );
}
