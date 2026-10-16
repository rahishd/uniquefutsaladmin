"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Gift, Phone, Search, Star, X } from "lucide-react";
import { Badge } from "../bookings/Badge";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { prettyDate, rs } from "@/lib/bookings";
import { GiftItem, GiftKind, GiftList, GiftStatus, PAGE_SIZE, STATUS, cancelGift, loadGifts } from "@/lib/gifts";

const field = "rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");
const clock = (t: string) => { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// Gift Card: what customers bought for a friend in the app (loyalty points at Rs. 10 each, or a game in the friend's name).
export default function GiftCardsPage() {
  const [kind, setKind] = useState<GiftKind | "">("");
  const [status, setStatus] = useState<GiftStatus | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [pageNo, setPageNo] = useState(1);
  const [data, setData] = useState<GiftList | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [tick, setTick] = useState(0);
  const [cancelling, setCancelling] = useState<GiftItem | null>(null);

  useEffect(() => { const t = setTimeout(() => { setQ(search); setPageNo(1); }, 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => {
    let live = true;
    loadGifts({ kind, status, from, to, q, page: pageNo })
      .then((d) => { if (live) { setData(d); setError(""); } })
      .catch((e) => { if (live) setError(msg(e)); });
    return () => { live = false; };
  }, [kind, status, from, to, q, pageNo, tick]);

  const reset = () => { setPageNo(1); setData(null); };
  const s = data?.summary;
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const STATUSES: { id: GiftStatus | ""; label: string; n?: number }[] = [
    { id: "", label: "All" }, { id: "paid", label: "Paid", n: s?.paid }, { id: "pending", label: "Waiting", n: s?.pending },
    { id: "expired", label: "Not paid", n: s?.expired }, { id: "refunded", label: "Refunded", n: s?.refunded },
  ];

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Gift Card</h1>
        <p className="text-sm text-muted">Loyalty points and games customers bought for a friend in the app. They pay with Fonepay; the points or the booking reach the friend as soon as it is paid.</p>
      </div>

      {s && (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Card label="Gift sales" value={rs(s.revenue)} sub={`${s.paid} paid gift${s.paid === 1 ? "" : "s"}`} />
          <Card label="Points gifted" value={s.pointsSold.toLocaleString("en-IN")} sub={`${s.pointsGifts} gift${s.pointsGifts === 1 ? "" : "s"} · ${rs(s.pointsRevenue)}`} />
          <Card label="Games gifted" value={String(s.gameGifts)} sub={rs(s.gameRevenue)} />
          <Card label="Refunds to pay" value={String(s.refundsDue)} sub={`${s.refunded} cancelled`} warn={s.refundsDue > 0} />
        </div>
      )}
      {s && s.refundsDue > 0 && (
        <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-700">
          {s.refundsDue} cancelled gift{s.refundsDue === 1 ? " is" : "s are"} waiting to be paid back. Record it in <Link href="/payments" className="font-semibold underline">Payments &gt; Refunds</Link> once the money is returned.
        </p>
      )}

      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-surface p-1 shadow-sm" role="tablist" aria-label="Type">
        {([["", "All gifts"], ["points", "Loyalty points"], ["game", "Games"]] as const).map(([id, label]) => (
          <button key={label} role="tab" aria-selected={kind === id} onClick={() => { setKind(id); reset(); }}
            className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold ${kind === id ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}>{label}</button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUSES.map((t) => (
          <button key={t.label} aria-pressed={status === t.id} onClick={() => { setStatus(t.id); reset(); }}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${status === t.id ? "bg-brand text-white" : "bg-surface text-muted shadow-sm hover:bg-surface-2"}`}>
            {t.label}{t.n !== undefined ? ` · ${t.n}` : ""}
          </button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <label className="relative block">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setData(null); }} placeholder="Search gift code, name or mobile number" className={`${field} w-full pl-10`} />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted">From<input type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); reset(); }} className={field} /></label>
        <label className="flex items-center gap-2 text-xs text-muted">To<input type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); reset(); }} className={field} /></label>
      </div>

      {note && <p className="rounded-xl bg-brand/10 p-3 text-sm text-brand" role="status">{note}</p>}
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!data && !error && <p className="py-8 text-center text-sm text-muted">Loading gifts…</p>}
      {data?.items.length === 0 && (
        <div className="grid place-items-center gap-2 rounded-2xl bg-surface py-12 text-center text-muted shadow-sm"><Gift size={32} strokeWidth={1.5} /><p>{q || kind || status || from || to ? "No gifts match." : "No gifts yet. They appear here when customers send one from the app."}</p></div>
      )}

      <ul className="grid items-start gap-2 xl:grid-cols-2">
        {data?.items.map((g) => <GiftCard key={g.id} g={g} onCancel={() => { if (guard("giftcards.refund")) setCancelling(g); }} />)}
      </ul>

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-2 text-sm">
          <button disabled={pageNo <= 1} onClick={() => { setPageNo(pageNo - 1); setData(null); }} className="flex items-center gap-1 rounded-xl bg-surface px-3 py-2 shadow-sm disabled:opacity-40"><ChevronLeft size={16} /> Previous</button>
          <span className="text-muted">Page {pageNo} of {pages} · {data.total} gifts</span>
          <button disabled={pageNo >= pages} onClick={() => { setPageNo(pageNo + 1); setData(null); }} className="flex items-center gap-1 rounded-xl bg-surface px-3 py-2 shadow-sm disabled:opacity-40">Next <ChevronRight size={16} /></button>
        </div>
      )}

      {cancelling && <CancelSheet g={cancelling} onClose={() => setCancelling(null)} onDone={(m) => { setNote(m); setCancelling(null); setTick((t) => t + 1); }} />}
    </div>
  );
}

function Card({ label, value, sub, warn }: { label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div className={`rounded-2xl bg-surface p-3 shadow-sm ${warn ? "ring-2 ring-amber-500/50" : ""}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-xs text-muted">{sub}</p>
    </div>
  );
}

function GiftCard({ g, onCancel }: { g: GiftItem; onCancel: () => void }) {
  const st = STATUS[g.status];
  const isGame = g.kind === "game";
  const gameGone = g.game && ["cancelled", "expired"].includes(g.game.status);
  return (
    <li className={`space-y-3 rounded-2xl bg-surface p-4 shadow-sm ${g.status === "refunded" && !g.payment.refundPaid ? "border-l-4 border-amber-500" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isGame ? "bg-sky-500/15 text-sky-700" : "bg-amber-500/15 text-amber-600"}`}>{isGame ? <CalendarDays size={20} /> : <Star size={20} />}</span>
          <div>
            <p className="font-semibold">{isGame ? "Game gift" : `${g.points} loyalty points`} · {rs(g.amount)}</p>
            <p className="text-xs text-muted"><span className="font-mono">{g.code}</span> · made {when(g.createdAt)}{g.paidAt ? ` · paid ${when(g.paidAt)}` : ""}</p>
          </div>
        </div>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>

      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <Person role="Bought by (paid)" name={g.buyer.name} phone={g.buyer.phone} />
        <Person role="Given to" name={g.friend.name} phone={g.friend.phone} />
      </div>

      {g.game && (
        <p className="rounded-xl bg-surface-2 p-3 text-sm">
          <span className="font-semibold">{prettyDate(g.game.date)}, {clock(g.game.startTime)} – {clock(g.game.endTime)}</span>
          <span className="text-muted"> · booking <span className="font-mono">{g.game.code ?? g.game.bookingId.slice(-6)}</span> · {g.game.status}, payment {g.game.paymentStatus}</span>
        </p>
      )}
      {g.kind === "points" && g.status === "paid" && (
        <p className="text-xs text-muted">{g.pointsDelivered ? `${g.points} points were added to ${g.friend.name || "the friend"}'s account (they last 12 months).` : "Paid, but the points are not on the friend's account yet."}</p>
      )}
      {g.pointsTakenBack && <p className="text-xs text-muted">The {g.points} points were taken back from the friend.</p>}
      {g.message && <p className="text-sm italic text-muted">&ldquo;{g.message}&rdquo;</p>}
      {g.status === "refunded" && (
        <p className={`rounded-xl p-2 text-xs font-semibold ${g.payment.refundPaid ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"}`}>
          {g.payment.refundPaid ? `Rs. ${g.amount.toLocaleString("en-IN")} was paid back to the buyer.` : `Pay Rs. ${g.amount.toLocaleString("en-IN")} back to the buyer, then record it in Payments > Refunds.`}
        </p>
      )}
      {gameGone && g.status === "paid" && <p className="rounded-xl bg-red-500/10 p-2 text-xs font-semibold text-red-600">The booking was cancelled. Cancel this gift to refund the buyer.</p>}

      {g.status === "paid" && !(g.game && g.game.status === "completed") && (
        <div className="flex flex-wrap gap-2">
          <button onClick={onCancel} className="rounded-full border border-red-500/40 px-4 py-1.5 text-xs font-semibold text-red-600">Cancel &amp; refund</button>
        </div>
      )}
    </li>
  );
}

function Person({ role, name, phone }: { role: string; name: string | null; phone: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 p-3">
      <div className="min-w-0"><p className="text-xs text-muted">{role}</p><p className="truncate font-semibold">{name || "Customer"}</p><p className="text-xs text-muted">{phone}</p></div>
      <a href={`tel:${phone}`} aria-label={`Call ${name || phone}`} className="flex shrink-0 items-center gap-1 rounded-full bg-brand px-3 py-2 text-xs font-semibold text-white"><Phone size={14} /> Call</a>
    </div>
  );
}

function CancelSheet({ g, onClose, onDone }: { g: GiftItem; onClose: () => void; onDone: (m: string) => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isGame = g.kind === "game";

  async function go() {
    if (!guard("giftcards.refund")) return;
    setBusy(true); setError("");
    try {
      await cancelGift(g.id, reason.trim());
      onDone(`Gift ${g.code} cancelled. Rs. ${g.amount.toLocaleString("en-IN")} is on Payments > Refunds. Both customers have been told.`);
    } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label="Cancel gift" onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-4 rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Cancel gift &amp; refund</h2><button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-surface-2"><X size={22} /></button></div>
        <p className="text-sm text-muted">
          {isGame
            ? `The game on ${g.game ? `${prettyDate(g.game.date)} at ${clock(g.game.startTime)}` : "the chosen day"} is cancelled and the hour is freed for others.`
            : `The ${g.points} points are taken back from ${g.friend.name || "the friend"}. If they already spent them, it cannot be cancelled.`}
          {" "}Rs. {g.amount.toLocaleString("en-IN")} goes on the Refunds list to pay back to {g.buyer.name || g.buyer.phone}.
        </p>
        <label className="block space-y-1 text-sm font-medium">Reason (both customers see it)
          <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="For example: the buyer asked to cancel" className={`${field} w-full`} />
        </label>
        {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
        <button onClick={go} disabled={busy || reason.trim().length < 3} className="w-full rounded-full bg-red-600 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Cancelling…" : "Cancel gift & refund"}</button>
      </div>
    </div>
  );
}
