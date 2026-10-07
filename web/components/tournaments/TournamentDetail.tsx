"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Badge } from "../bookings/Badge";
import BillingPanel from "./BillingPanel";
import HostLinkCard from "./HostLinkCard";
import TieSheetEditor from "./TieSheetEditor";
import { canDo } from "@/lib/access";
import { prettyDate, rs } from "@/lib/bookings";
import { TournamentDetail as Detail, getTournament, staffEditor } from "@/lib/tournaments";

const TONE = { live: "bg-rose-500/15 text-rose-600", upcoming: "bg-blue-500/15 text-blue-600", completed: "bg-slate-500/15 text-slate-600" } as const;
const LABEL = { live: "Running", upcoming: "Coming up", completed: "Finished" } as const;

export default function TournamentDetail({ id }: { id: string }) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const api = useMemo(() => staffEditor(id), [id]);

  const reload = useCallback(() => {
    getTournament(id).then((d) => { setData(d); setError(""); }).catch((e) => setError(e instanceof Error ? e.message : "Could not load the tournament"));
  }, [id]);
  useEffect(() => {
    let live = true;
    getTournament(id).then((d) => { if (live) { setData(d); setError(""); } }).catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load the tournament"); });
    return () => { live = false; };
  }, [id]);

  const canEdit = canDo("tournaments.edit");
  return (
    <div className="w-full space-y-4">
      <Link href="/tournaments" className="inline-flex items-center gap-1 text-sm font-semibold text-muted"><ChevronLeft size={16} /> All tournaments</Link>
      {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
      {!data && !error && <p className="py-10 text-center text-sm text-muted">Loading…</p>}

      {data && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h1 className="text-2xl font-bold">{data.tournament.name}</h1>
              <p className="text-sm text-muted">{prettyDate(data.tournament.startDate)} to {prettyDate(data.tournament.endDate)} · {data.tournament.hostedEvent ? `hosted by ${data.tournament.hostName ?? "a manager"}` : `${data.tournament.registrations} teams registered`} · prize pool {rs(data.tournament.prizePool)}</p>
            </div>
            <Badge tone={TONE[data.tournament.state]}>{LABEL[data.tournament.state]}</Badge>
          </div>

          {data.tournament.hostedEvent && <BillingPanel id={id} canBill={canDo("tournaments.bill")} />}

          {data.canShare && <HostLinkCard tournamentId={id} name={data.tournament.name} link={data.hostLink} onChanged={reload} />}

          <section aria-label="Tie-sheet" className="space-y-3">
            <div>
              <h2 className="text-lg font-bold">Tie-sheet and live scores</h2>
              <p className="text-sm text-muted">Goals, kick-off and full time are saved at once and go to the customers who follow that match. Changes to team names, times and rounds are saved with the Save button.{!canEdit && " You can look but not change: ask the owner for the edit permission."}</p>
            </div>
            <TieSheetEditor key={id} initial={data.rounds} api={api} canEdit={canEdit} />
          </section>
        </>
      )}
    </div>
  );
}
