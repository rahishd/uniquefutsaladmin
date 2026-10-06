"use client";

import { useEffect, useState } from "react";
import { Gamepad2, Phone, RefreshCw, Trophy } from "lucide-react";
import { Badge } from "../bookings/Badge";
import CollectModal from "../payments/CollectModal";
import { canDo } from "@/lib/auth";
import { rs } from "@/lib/bookings";
import { METHOD_LABEL } from "@/lib/payments";
import { ArrivalItem, ArrivalsDay, getArrivals, groupOf, span, startText } from "@/lib/arrivals";

const REFRESH_MS = 15000;

type Loaded = { day: ArrivalsDay; at: number }; // `at` = when it arrived, so "confirmed 5 min ago" stays correct between refreshes

function Card({ i, now, at, onCollect }: { i: ArrivalItem; now: number; at: number; onCollect: () => void }) {
  const ago = i.checkedInAt ? Math.max(0, (at - Date.parse(i.checkedInAt)) / 60000) : null;
  const start = startText(i, now);
  const late = !i.checkedInAt && start.late;
  const Icon = i.kind === "court" ? Trophy : Gamepad2;
  return (
    <li className={`rounded-2xl bg-surface p-4 shadow-sm ${late ? "ring-2 ring-amber-500/60" : ""}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"><Icon size={20} /></span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 break-words font-semibold">{i.name || "Guest"}</p>
          <p className="text-sm text-muted">{i.time} – {i.endTime} · {i.kind === "court" ? "Court" : "Gamezone"} · <span className="font-mono">{i.code}</span></p>
          <p className={`text-xs font-medium ${late ? "text-amber-600" : "text-muted"}`}>
            {start.text}
            {ago !== null && ` · confirmed ${ago < 1 ? "just now" : `${span(ago)} ago`}`}
          </p>
        </div>
        {ago !== null && ago < 3 && <Badge tone="bg-orange-500 text-white">NEW</Badge>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {i.paid ? <Badge tone="bg-brand/15 text-brand">Paid</Badge> : <Badge tone="bg-amber-500/15 text-amber-600">Unpaid {rs(i.amount)}</Badge>}
        <Badge tone="bg-surface-2 text-muted">{i.method === "venue" ? "Cash at venue" : METHOD_LABEL[i.method] ?? i.method}</Badge>
        <span className="ml-auto flex gap-2">
          {!i.paid && canDo("payments.write") && <button onClick={onCollect} className="rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white">Collect</button>}
          {i.phone && (
            <a href={`tel:${i.phone}`} aria-label={`Call ${i.name ?? i.phone}`} className="flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs font-semibold">
              <Phone size={13} /> {i.phone}
            </a>
          )}
        </span>
      </div>
    </li>
  );
}

function Section({ title, hint, count, tone, children }: { title: string; hint: string; count: number; tone: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2 px-1">
        <h2 className="text-sm font-bold">{title}</h2>
        <span className={`rounded-full px-2 text-xs font-bold ${tone}`}>{count}</span>
        <span className="text-xs text-muted">{hint}</span>
      </div>
      {count === 0 ? <p className="rounded-2xl bg-surface py-6 text-center text-sm text-muted shadow-sm">Nobody here right now.</p> : <ul className="space-y-2">{children}</ul>}
    </section>
  );
}

export default function ArrivalsPage() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [collecting, setCollecting] = useState<ArrivalItem | null>(null);

  useEffect(() => {
    let live = true;
    getArrivals()
      .then((day) => { if (live) { setLoaded({ day, at: Date.now() }); setError(""); } })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load arrivals"); });
    return () => { live = false; };
  }, [tick]);

  // Live: refresh every 15 seconds while the tab is visible, and straight away when you come back to it.
  useEffect(() => {
    const go = () => { if (document.visibilityState === "visible") setTick((t) => t + 1); };
    const id = setInterval(go, REFRESH_MS);
    document.addEventListener("visibilitychange", go);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", go); };
  }, []);

  const day = loaded?.day;
  const now = day?.nowMinutes ?? 0;
  const items = day?.items ?? [];
  const pick = (g: ReturnType<typeof groupOf>) => items.filter((i) => groupOf(i, now) === g);
  const onTheWay = pick("onTheWay").sort((a, b) => Date.parse(b.checkedInAt!) - Date.parse(a.checkedInAt!)); // newest check-in first
  const waiting = pick("waiting");
  const finished = pick("finished");
  const unpaidHere = [...onTheWay, ...waiting].filter((i) => !i.paid).length;
  const render = (list: ArrivalItem[]) => list.map((i) => <Card key={`${i.kind}-${i.id}`} i={i} now={now} at={loaded!.at} onCollect={() => setCollecting(i)} />);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Arrivals</h1>
          <p className="text-sm text-muted">Today&apos;s players: who is on the way and who has not confirmed yet.</p>
        </div>
        <button onClick={() => setTick((t) => t + 1)} aria-label="Refresh now" className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-2 text-xs font-semibold shadow-sm">
          <RefreshCw size={14} /> Live
        </button>
      </div>

      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!loaded && !error && <p className="py-10 text-center text-sm text-muted">Loading today&apos;s arrivals…</p>}

      {loaded && (
        <>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-2xl bg-surface p-3 shadow-sm"><p className="text-2xl font-bold text-brand">{onTheWay.length}</p><p className="text-xs text-muted">On the way</p></div>
            <div className="rounded-2xl bg-surface p-3 shadow-sm"><p className="text-2xl font-bold">{waiting.length}</p><p className="text-xs text-muted">Not confirmed</p></div>
            <div className="rounded-2xl bg-surface p-3 shadow-sm"><p className="text-2xl font-bold text-amber-600">{unpaidHere}</p><p className="text-xs text-muted">Unpaid to collect</p></div>
          </div>

          <Section title="On the way" hint="tapped &quot;I'm coming&quot;" count={onTheWay.length} tone="bg-brand/15 text-brand">{render(onTheWay)}</Section>
          <Section title="Not confirmed yet" hint="booked for later today" count={waiting.length} tone="bg-surface-2 text-muted">{render(waiting)}</Section>

          {finished.length > 0 && (
            <details className="rounded-2xl bg-surface p-4 shadow-sm">
              <summary className="cursor-pointer text-sm font-bold">Finished today <span className="ml-1 rounded-full bg-surface-2 px-2 text-xs text-muted">{finished.length}</span></summary>
              <ul className="mt-3 space-y-2">{render(finished)}</ul>
            </details>
          )}

          <p className="text-center text-xs text-muted">Refreshes every 15 seconds. Last updated {new Date(loaded.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}.</p>
        </>
      )}

      {collecting && (
        <CollectModal target={{ kind: collecting.kind, ref: collecting.ref, code: collecting.code, customer: collecting.name, amount: collecting.amount, method: collecting.method }}
          onClose={() => setCollecting(null)} onDone={() => { setCollecting(null); setTick((t) => t + 1); }} />
      )}
    </div>
  );
}
