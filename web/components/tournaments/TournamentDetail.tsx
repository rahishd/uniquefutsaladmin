"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, Link2, ListOrdered, UserPlus, X } from "lucide-react";
import { Badge } from "../bookings/Badge";
import BillingPanel from "./BillingPanel";
import HostLinkCard from "./HostLinkCard";
import RegistrationsCard from "./RegistrationsCard";
import TieSheetEditor from "./TieSheetEditor";
import { canDo } from "@/lib/access";
import { prettyDate, rs } from "@/lib/bookings";
import { TournamentDetail as Detail, getTournament, staffEditor } from "@/lib/tournaments";

const TONE = { live: "bg-rose-500/15 text-rose-600", upcoming: "bg-blue-500/15 text-blue-600", completed: "bg-slate-500/15 text-slate-600" } as const;
const LABEL = { live: "Running", upcoming: "Coming up", completed: "Finished" } as const;

export default function TournamentDetail({ id }: { id: string }) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<"" | "registrations" | "host" | "tiesheet">(""); // the registrations, host-link and tie-sheet open from the buttons in the header
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
          {(() => {
            const lead = (
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h1 className="text-2xl font-bold">{data.tournament.name}</h1>
                {!data.tournament.hostedEvent && <p className="text-sm text-muted">{prettyDate(data.tournament.startDate)} to {prettyDate(data.tournament.endDate)} · {data.tournament.registrations} teams registered · prize pool {rs(data.tournament.prizePool)}</p>}
              </div>
              <Badge tone={TONE[data.tournament.state]}>{LABEL[data.tournament.state]}</Badge>
            </div>
            );
            const actions = (
              <>
                <button type="button" onClick={() => setPanel("registrations")} className="flex w-full items-center justify-center gap-2 sm:flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition bg-brand text-white shadow-sm hover:opacity-90"><UserPlus size={16} /> Team registrations</button>
                {data.canShare && <button type="button" onClick={() => setPanel("host")} className="flex w-full items-center justify-center gap-2 sm:flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition border border-line bg-surface-2 hover:bg-line/40"><Link2 size={16} /> Match-day host link</button>}
                {!data.tournament.hostedEvent && <button type="button" onClick={() => setPanel("tiesheet")} className="flex w-full items-center justify-center gap-2 sm:flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition border border-line bg-surface-2 hover:bg-line/40"><ListOrdered size={16} /> Tie-sheet</button>}
              </>
            );
            return data.tournament.hostedEvent
              ? <BillingPanel id={id} canBill={canDo("tournaments.bill")} lead={lead} actions={actions} />
              : (
                <div className="space-y-4 rounded-2xl bg-surface p-4 shadow-sm">
                  {lead}
                  <div className="flex flex-col gap-2 border-t border-line pt-3 sm:flex-row">{actions}</div>
                </div>
              );
          })()}

          {panel && (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setPanel("")}>
              <div role="dialog" aria-label={panel === "registrations" ? "Team registrations" : "Match-day host link"} className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-background p-4 shadow-xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={() => setPanel("")} aria-label="Close" className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-surface-2"><X size={16} /></button>
                {panel === "registrations" && <RegistrationsCard tournamentId={id} name={data.tournament.name} finished={data.tournament.state === "completed"} entryFee={data.tournament.entryFee} onFeeSaved={reload} />}
                {panel === "host" && data.canShare && <HostLinkCard tournamentId={id} name={data.tournament.name} link={data.hostLink} onChanged={reload} />}
              </div>
            </div>
          )}

          {/* the tie-sheet: opened from its button; it stays mounted while closed, so changes not yet saved are not lost */}
          {!data.tournament.hostedEvent && <div className={panel === "tiesheet" ? "fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" : "hidden"} onClick={() => setPanel("")}>
            <div role="dialog" aria-label="Tie-sheet and live scores" className="relative max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-t-3xl bg-background p-4 shadow-xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
              <button type="button" onClick={() => setPanel("")} aria-label="Close" className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-surface-2"><X size={16} /></button>
              <section aria-label="Tie-sheet" className="space-y-3">
                <div>
                  <h2 className="text-lg font-bold">Tie-sheet and live scores</h2>
                  <p className="text-sm text-muted">Goals, kick-off and full time are saved at once and go to the customers who follow that match. Changes to team names, times and rounds are saved with the Save button.{!canEdit && " You can look but not change: ask the owner for the edit permission."}</p>
                </div>
                <TieSheetEditor key={id} initial={data.rounds} api={api} canEdit={canEdit} />
              </section>
            </div>
          </div>}
        </>
      )}
    </div>
  );
}
