"use client";

import { useEffect, useState } from "react";
import { Laptop, MapPin, Smartphone, Tablet, UserRound, X } from "lucide-react";
import { VisitRow, getVisits } from "@/lib/overview";
import { prettyDate } from "@/lib/bookings";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kathmandu" });
const place = (v: VisitRow) => [v.city, v.region, v.country].filter((x, i, a) => x && a.indexOf(x) === i).join(", ");
const device = (v: VisitRow) => [v.deviceName, v.os, v.browser].filter(Boolean).join(" · ");

// Who opened the website in the chosen period: their name when signed in, where they were, their IP address and what device they used.
// Everything except the name comes from the request itself, so some of it can be missing (for example no location for a private network).
export default function VisitsSheet({ from, to, onClose }: { from: string; to: string; onClose: () => void }) {
  const [data, setData] = useState<{ total: number; items: VisitRow[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    getVisits(from, to).then((d) => { if (live) setData(d); }).catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load the visitors"); });
    return () => { live = false; };
  }, [from, to]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label="Website visitors" onClick={(e) => e.stopPropagation()} className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-surface sm:rounded-3xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 pb-3 pt-5">
          <div>
            <h2 className="text-xl font-bold">Website visitors</h2>
            <p className="text-sm text-muted">{from === to ? prettyDate(from) : `${prettyDate(from)} to ${prettyDate(to)}`}{data ? ` · ${data.total} ${data.total === 1 ? "visitor" : "visitors"}` : ""}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-surface-2"><X size={22} /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-4">
          {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
          {!data && !error && <p className="py-8 text-center text-sm text-muted">Loading the visitors…</p>}
          {data && data.items.length === 0 && <p className="py-8 text-center text-sm text-muted">Nobody visited in this period.</p>}
          {data?.items.map((v) => {
            const Dev = v.deviceType === "mobile" ? Smartphone : v.deviceType === "tablet" ? Tablet : Laptop;
            const where = place(v);
            return (
              <div key={v.id} className="rounded-2xl border border-line p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="flex min-w-0 items-center gap-2 font-semibold"><UserRound size={16} className="shrink-0 text-muted" /><span className="truncate">{v.name ?? (v.registered ? "Signed-in customer" : "Guest visitor")}</span>
                    {v.registered && <span className="shrink-0 rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-semibold text-brand">Signed in</span>}</p>
                  <p className="shrink-0 text-xs text-muted">{when(v.lastAt)}</p>
                </div>
                {v.phone && <p className="ml-6 text-xs text-muted">{v.phone}</p>}
                <p className="mt-1.5 flex items-start gap-2 text-muted"><MapPin size={15} className="mt-0.5 shrink-0" /><span>{where || "Location not available"}</span></p>
                <p className="mt-1 flex items-start gap-2 text-muted"><Dev size={15} className="mt-0.5 shrink-0" /><span>{device(v) || "Device not available"}{v.deviceType ? ` (${v.deviceType})` : ""}</span></p>
                <p className="ml-6 mt-1 text-xs text-muted">IP address: <span className="font-mono text-foreground">{v.ip ?? "not available"}</span> · {v.pages} {v.pages === 1 ? "page" : "pages"} opened</p>
              </div>
            );
          })}
          {data && data.total > data.items.length && <p className="pt-1 text-center text-xs text-muted">Showing the latest {data.items.length} of {data.total}.</p>}
        </div>
      </div>
    </div>
  );
}
