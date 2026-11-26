"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDays, ChevronRight, Plus, Radio, Trophy, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { guard } from "@/lib/access";
import { Badge } from "../bookings/Badge";
import RegisterTournament from "./RegisterTournament";
import ExportContactsButton from "./ExportContactsButton";
import { prettyDate, rs } from "@/lib/bookings";
import { TournamentItem, listTournaments } from "@/lib/tournaments";

const TONE = { live: "bg-rose-500/15 text-rose-600", upcoming: "bg-blue-500/15 text-blue-600", completed: "bg-slate-500/15 text-slate-600" } as const;
const LABEL = { live: "Running", upcoming: "Coming up", completed: "Finished" } as const;

export default function TournamentsPage() {
  const [items, setItems] = useState<TournamentItem[] | null>(null);
  const [error, setError] = useState("");
  const [registering, setRegistering] = useState(false);
  const [tab, setTab] = useState<"hosted" | "upcoming">("hosted"); // only one group of cards is shown at a time
  const router = useRouter();

  useEffect(() => {
    let live = true;
    const load = () => listTournaments().then((d) => { if (live) { setItems(d); setError(""); } }).catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load tournaments"); });
    load();
    const t = setInterval(load, 30_000);
    return () => { live = false; clearInterval(t); };
  }, []);

  // Upcoming: anything that has not started yet (hosted events too). Hosted: the events the venue hosts that are running or finished.
  const upcoming = items?.filter((t) => t.state === "upcoming") ?? [];
  const hosted = items?.filter((t) => t.hostedEvent && t.state !== "upcoming") ?? [];
  const shown = tab === "hosted" ? hosted : upcoming;

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
       <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Trophy className="text-amber-500" /> Tournaments</h1>
        <p className="text-sm text-muted">Open a tournament to edit its tie-sheet, score goals live and share a private link with the match-day host. Customers see every change in the app.</p>
       </div>
       <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center max-sm:[&>*]:w-full max-sm:[&>*]:justify-center">
        <ExportContactsButton label="Export contacts" title="Export every tournament's captains and hosts, and all customers, to Excel" />
        <button onClick={() => guard("tournaments.create") && setRegistering(true)} className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16} /> Register tournament</button>
       </div>
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
      {!items && !error && <p className="py-10 text-center text-sm text-muted">Loading…</p>}
      {items && (
        <div role="tablist" aria-label="Tournaments" className="grid grid-cols-2 gap-2 sm:flex">
          {([["hosted", "Hosted", hosted.length], ["upcoming", "Upcoming", upcoming.length]] as const).map(([id, label, n]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`rounded-full px-5 py-2 text-center text-sm font-semibold transition ${tab === id ? "bg-brand text-white" : "bg-surface text-foreground shadow-sm"}`}>{label} <span className="opacity-70">{n}</span></button>
          ))}
        </div>
      )}
      {items && shown.length === 0 && (
        <div className="grid place-items-center gap-3 rounded-2xl bg-surface py-14 text-center text-muted shadow-sm"><Trophy size={34} strokeWidth={1.5} /><p>{tab === "hosted" ? "No running or finished hosted tournaments." : "No upcoming tournaments."}</p></div>
      )}

      <ul className="grid grid-cols-[minmax(0,1fr)] items-start gap-3 xl:grid-cols-2">
        {shown.map((t) => (
          <li key={t.id}>
            <Link href={`/tournaments/${t.id}`} className="block space-y-3 rounded-2xl bg-surface p-4 shadow-sm transition hover:shadow-md">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-semibold">{t.name}</p>
                  <p className="flex items-center gap-1.5 text-sm text-muted"><CalendarDays size={14} /> {prettyDate(t.startDate)} to {prettyDate(t.endDate)}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Badge tone={TONE[t.state]}>{LABEL[t.state]}</Badge>
                  {/* a hosted event: whether the bill is paid or how much is still due (clear and easy to see) */}
                  {t.hostedEvent && (t.billTotal ?? 0) > 0 && ((t.billDue ?? 0) > 0
                    ? <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-extrabold tracking-wide text-white">DUE {rs(t.billDue ?? 0)}</span>
                    : <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-extrabold tracking-wide text-white">PAID</span>)}
                </div>
                <ChevronRight size={18} className="mt-1 shrink-0 text-muted" />
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                {t.hostedEvent ? (
                  <span className="flex items-center gap-1.5 text-muted"><Users size={14} /> Hosted by <strong className="text-foreground">{t.hostName ?? "a manager"}</strong>. Open it for the bill and payments.</span>
                ) : (
                  <>
                    <span className="flex items-center gap-1.5 text-muted"><Users size={14} /> <strong className="text-foreground">{t.registrations}</strong>{t.maxTeams > 0 ? ` of ${t.maxTeams}` : ""} teams registered</span>
                    <span className="text-muted">Prize pool <strong className="text-foreground">{rs(t.prizePool)}</strong></span>
                  </>
                )}
                <span className="text-muted">{t.matches} {t.matches === 1 ? "match" : "matches"}, {t.finished} played</span>
                {t.live > 0 && <span className="flex items-center gap-1 font-semibold text-rose-600"><Radio size={13} /> {t.live} live now</span>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {registering && <RegisterTournament onClose={() => setRegistering(false)} onCreated={(id) => router.push(`/tournaments/${id}`)} />}
    </div>
  );
}
