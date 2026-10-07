"use client";

import { useEffect, useMemo, useState } from "react";
import { Lock, Trophy } from "lucide-react";
import TieSheetEditor from "./TieSheetEditor";
import { ApiError } from "@/lib/api";
import { HostView, hostEditor, hostView, nepalTime } from "@/lib/tournaments";

// What the match-day host sees: the tournament, every match with its goals, and the same editor staff use.
export default function HostPage({ token }: { token: string }) {
  const [view, setView] = useState<HostView | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const api = useMemo(() => hostEditor(token), [token]);

  useEffect(() => {
    let live = true;
    hostView(token)
      .then((d) => { if (live) setView(d); })
      .catch((e) => { if (live) setError({ status: e instanceof ApiError ? e.status : 0, message: e instanceof Error ? e.message : "Could not open this link" }); });
    return () => { live = false; };
  }, [token]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 pb-10">
      <header className="flex items-center gap-3 rounded-2xl bg-header p-4 text-white">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-header"><Trophy size={22} /></span>
        <div className="min-w-0">
          <p className="text-xs text-white/70">UNIQUE FUTSAL · Match-day host</p>
          <h1 className="truncate text-lg font-bold">{view?.tournament.name ?? "Tournament"}</h1>
        </div>
      </header>

      {error && (
        <div role="alert" className="grid place-items-center gap-3 rounded-2xl bg-surface p-10 text-center shadow-sm">
          <Lock size={30} className="text-muted" />
          <p className="font-semibold">{error.status === 410 ? "This link has expired" : "This link does not work"}</p>
          <p className="text-sm text-muted">{error.message}</p>
        </div>
      )}
      {!view && !error && <p className="py-10 text-center text-sm text-muted">Opening…</p>}

      {view && (
        <>
          <p className="rounded-xl bg-surface p-3 text-sm text-muted shadow-sm">
            Add goals as they happen, kick off and finish matches, and change the tie-sheet. Customers who follow a match are notified straight away. This page updates by itself.
            {view.expiresAt && <> The link works until {nepalTime(view.expiresAt)}.</>} Please do not share it.
          </p>
          <TieSheetEditor initial={view.rounds} api={api} pollMs={8000} />
        </>
      )}
    </div>
  );
}
