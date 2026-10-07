"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDays, ChevronRight, Radio, Trophy, Users } from "lucide-react";
import { Badge } from "../bookings/Badge";
import { prettyDate, rs } from "@/lib/bookings";
import { TournamentItem, listTournaments } from "@/lib/tournaments";

const TONE = { live: "bg-rose-500/15 text-rose-600", upcoming: "bg-blue-500/15 text-blue-600", completed: "bg-slate-500/15 text-slate-600" } as const;
const LABEL = { live: "Running", upcoming: "Coming up", completed: "Finished" } as const;

export default function TournamentsPage() {
  const [items, setItems] = useState<TournamentItem[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    const load = () => listTournaments().then((d) => { if (live) { setItems(d); setError(""); } }).catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load tournaments"); });
    load();
    const t = setInterval(load, 30_000);
    return () => { live = false; clearInterval(t); };
  }, []);

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Trophy className="text-amber-500" /> Tournaments</h1>
        <p className="text-sm text-muted">Open a tournament to edit its tie-sheet, score goals live and share a private link with the match-day host. Customers see every change in the app.</p>
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
      {!items && !error && <p className="py-10 text-center text-sm text-muted">Loading…</p>}
      {items && items.length === 0 && (
        <div className="grid place-items-center gap-3 rounded-2xl bg-surface py-14 text-center text-muted shadow-sm"><Trophy size={34} strokeWidth={1.5} /><p>No tournaments yet.</p></div>
      )}

      <ul className="grid items-start gap-3 xl:grid-cols-2">
        {items?.map((t) => (
          <li key={t.id}>
            <Link href={`/tournaments/${t.id}`} className="block space-y-3 rounded-2xl bg-surface p-4 shadow-sm transition hover:shadow-md">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-semibold">{t.name}</p>
                  <p className="flex items-center gap-1.5 text-sm text-muted"><CalendarDays size={14} /> {prettyDate(t.startDate)} to {prettyDate(t.endDate)}</p>
                </div>
                <Badge tone={TONE[t.state]}>{LABEL[t.state]}</Badge>
                <ChevronRight size={18} className="mt-1 shrink-0 text-muted" />
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                <span className="flex items-center gap-1.5 text-muted"><Users size={14} /> <strong className="text-foreground">{t.registrations}</strong> of {t.maxTeams} teams registered</span>
                <span className="text-muted">Prize pool <strong className="text-foreground">{rs(t.prizePool)}</strong></span>
                <span className="text-muted">{t.matches} {t.matches === 1 ? "match" : "matches"}, {t.finished} played</span>
                {t.live > 0 && <span className="flex items-center gap-1 font-semibold text-rose-600"><Radio size={13} /> {t.live} live now</span>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
