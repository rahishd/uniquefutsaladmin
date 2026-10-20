"use client";

import { useState } from "react";
import SendPdfButton from "../SendPdfButton";
import { pdfFileName, type PdfSpec } from "@/lib/branded-pdf";
import Link from "next/link";
import { Accessibility, ArrowUpRight, HeartPulse, Layers, Package, Phone, QrCode, ShieldAlert, UserCheck } from "lucide-react";
import { Badge } from "../bookings/Badge";
import { Empty, Section, Tile } from "./parts";
import { prettyDate, rs } from "@/lib/bookings";
import { initials } from "@/lib/customers";
import { DigitalView, GoodsEntry } from "@/lib/digitalid";
import { todayKey } from "@/lib/slots";

type Tab = "overview" | "bookings" | "money" | "member" | "activity" | "care";
type Alert = { key: string; label: string; tone: string; tab: Tab };

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
const STATUS: Record<string, string> = { pending: "Waiting", confirmed: "Confirmed", completed: "Done", cancelled: "Cancelled", declined: "Declined", submitted: "Submitted", in_review: "In review", approved: "Approved", rejected: "Rejected", closed: "Closed", open: "Open", awaiting_advance: "Awaiting advance" };
const say = (s: string) => STATUS[s] ?? s.replace(/_/g, " ");

// "3 days ago", "today", "in 2 days": how long this has been waiting
const dayDiff = (date: string) => Math.round((new Date(`${date}T00:00:00Z`).getTime() - new Date(`${todayKey()}T00:00:00Z`).getTime()) / 86_400_000);
const agoText = (date: string) => { const d = dayDiff(date); return d === 0 ? "today" : d < 0 ? `played ${-d} day${d === -1 ? "" : "s"} ago` : `in ${d} day${d === 1 ? "" : "s"}`; };
// opens Payments on exactly this record: its tab, unpaid only, all dates, found by its code, and highlighted
const payHref = (kind: string, code: string, phone: string) => `/payments?kind=${kind}&status=unpaid&period=all&q=${encodeURIComponent(phone)}&hl=pay-${encodeURIComponent(code)}`;

function GoodsRow({ g }: { g: GoodsEntry }) {
  return (
    <li className={`space-y-1 rounded-xl p-3 text-sm ${g.status === "due" ? "bg-red-500/10" : "bg-surface-2"}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-start gap-2"><Package size={15} className="mt-0.5 shrink-0 text-muted" /><span className="min-w-0 font-medium">{g.items}</span></span>
        <span className="shrink-0 font-bold">{rs(g.amount)}</span>
      </div>
      {g.lines.length > 1 && <ul className="ml-6 space-y-0.5 text-xs text-muted">{g.lines.map((l, i) => <li key={i} className="flex justify-between gap-3"><span>{l.quantity} × {l.label}</span><span>{rs(l.amount)}</span></li>)}</ul>}
      <p className="ml-6 text-[11px] text-muted">{g.source}{g.by ? ` (${g.by})` : ""} · {when(g.createdAt)}{g.status === "paid" && g.paidAt ? ` · paid ${when(g.paidAt)}${g.paidBy ? ` by ${g.paidBy}` : ""}` : ""}</p>
    </li>
  );
}

// What the front desk sees after a scan, in the order they need it: who it is and what needs action first (a strip of alerts that jump to the
// right tab), then the details split into tabs instead of one long page.
export default function ScanResult({ view, busy, note, buildCard, onAttendance, onNext }: {
  view: DigitalView; busy: string; note: string; buildCard: () => Promise<PdfSpec>; onAttendance: () => void; onNext: () => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const goUnpaid = () => { setTab("money"); setTimeout(() => document.getElementById("unpaid-list")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80); };
  const p = view.profile;
  const x = view.extras;
  const today = todayKey();
  const nextGame = x.upcomingBookings[0];
  const playingToday = x.upcomingBookings.filter((b) => b.date === today);
  const bulk = Object.values(x.upcomingBookings.filter((b) => b.bulk).reduce<Record<string, typeof x.upcomingBookings>>((m, b) => { (m[b.bulk!] ??= []).push(b); return m; }, {}));
  const single = x.upcomingBookings.filter((b) => !b.bulk);
  const openClaims = x.insurance.filter((c) => c.open);
  const emergencyClaim = openClaims.some((c) => c.severity === "emergency");

  const alerts: Alert[] = [
    ...(!p.user.isActive ? [{ key: "susp", label: "Account suspended", tone: "bg-rose-600 text-white", tab: "overview" as Tab }] : []),
    ...(emergencyClaim ? [{ key: "emerg", label: "Emergency insurance claim open", tone: "bg-rose-600 text-white", tab: "care" as Tab }] : []),
    ...(playingToday.length ? [{ key: "today", label: `Playing today ${playingToday.map((b) => b.time).join(", ")}`, tone: "bg-brand text-white", tab: "bookings" as Tab }] : []),
    ...(x.spent.unpaid > 0 ? [{ key: "unpaid", label: `Unpaid ${rs(x.spent.unpaid)}`, tone: "bg-amber-500/20 text-amber-700", tab: "money" as Tab }] : []),
    ...(x.goods.dueTotal > 0 ? [{ key: "goods", label: `Goods owed ${rs(x.goods.dueTotal)}`, tone: "bg-red-500/15 text-red-600", tab: "money" as Tab }] : []),
    ...(x.membership && !x.membership.attendedToday ? [{ key: "att", label: "Mark today's attendance", tone: "bg-sky-500/15 text-sky-700", tab: "member" as Tab }] : []),
    ...(x.club?.member ? [{ key: "club", label: "Club member: 10% off", tone: "bg-sky-500/15 text-sky-700", tab: "member" as Tab }] : []),
    ...(x.wheelchair.length ? [{ key: "wc", label: "Wheelchair request", tone: "bg-blue-500/15 text-blue-700", tab: "care" as Tab }] : []),
    ...(openClaims.length && !emergencyClaim ? [{ key: "claim", label: "Insurance claim open", tone: "bg-red-500/15 text-red-600", tab: "care" as Tab }] : []),
    ...(p.complaints.open > 0 ? [{ key: "comp", label: `${p.complaints.open} open complaint${p.complaints.open === 1 ? "" : "s"}`, tone: "bg-amber-500/20 text-amber-700", tab: "care" as Tab }] : []),
    ...(p.cancellations.streak >= 2 ? [{ key: "canc", label: `Cancelled ${p.cancellations.streak} in a row`, tone: "bg-amber-500/20 text-amber-700", tab: "care" as Tab }] : []),
    ...(!x.person.emergency ? [{ key: "noem", label: "No emergency contact", tone: "bg-surface-2 text-muted", tab: "overview" as Tab }] : []),
  ];

  const dot = (on: boolean) => on ? <span aria-hidden className="ml-1.5 inline-block h-2 w-2 rounded-full bg-red-500" /> : null;
  const tabs: { id: Tab; label: string; badge?: React.ReactNode }[] = [
    { id: "overview", label: "Overview" },
    { id: "bookings", label: "Bookings", badge: x.upcomingBookings.length > 0 ? <span className="ml-1.5 rounded-full bg-brand/15 px-1.5 text-[11px] text-brand">{x.upcomingBookings.length}</span> : null },
    { id: "money", label: "Money", badge: dot(x.spent.unpaid > 0 || x.goods.dueTotal > 0) },
    { id: "member", label: "Membership & Club", badge: dot(!!x.membership && !x.membership.attendedToday) },
    { id: "activity", label: "Points & activity" },
    { id: "care", label: "Care & support", badge: dot(x.wheelchair.length > 0 || openClaims.length > 0 || p.complaints.open > 0) },
  ];

  return (
    <div className="space-y-4">
      {/* who it is */}
      <div className="rounded-2xl bg-surface p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-brand/10 text-lg font-bold text-brand">{initials(p.user.name, p.user.phoneNumber)}</span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-lg font-bold"><UserCheck size={18} className="shrink-0 text-brand" /><span className="truncate">{p.user.name || "Player"}</span></p>
            <p className="text-sm text-muted">{p.user.phoneNumber} · ID UF-C-{p.user.phoneNumber.slice(-5)}</p>
            <p className="mt-1 flex flex-wrap gap-1.5">
              {p.user.isActive ? <Badge tone="bg-brand/15 text-brand">Active</Badge> : <Badge tone="bg-rose-500/15 text-rose-600">Suspended</Badge>}
              {p.profile.isCaptain && <Badge tone="bg-amber-500/15 text-amber-600">Captain</Badge>}
              {p.vip?.active && <Badge tone="bg-fuchsia-500/15 text-fuchsia-600">VIP {p.vip.code}</Badge>}
              {x.club?.member && <Badge tone="bg-sky-500/15 text-sky-700">Club member</Badge>}
              <span className="text-xs text-muted">Member since {prettyDate(p.user.createdAt.slice(0, 10))}</span>
            </p>
          </div>
        </div>
        {!p.user.isActive && <p className="mt-3 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-700">This account is suspended. Check with the owner before allowing a booking.</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={`tel:${p.user.phoneNumber}`} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-2 text-xs font-semibold"><Phone size={14} /> Call</a>
          <SendPdfButton mode="download" label="Download ID card (PDF)" build={buildCard} filename={pdfFileName("digital-id", view.profile.user.phoneNumber)} message="" className="flex items-center gap-1.5 rounded-full border border-line px-3 py-2 text-xs font-semibold" />
          <SendPdfButton label="Send on WhatsApp (PDF)" build={buildCard} filename={pdfFileName("digital-id", view.profile.user.phoneNumber)} phone={view.profile.user.phoneNumber} message="Your Unique Futsal Digital ID is in the attached PDF. Show the QR at the venue." className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-2 text-xs font-semibold text-white" />
        </div>
        {note && <p role="status" className="mt-3 rounded-xl bg-brand/10 p-3 text-sm text-brand">{note}</p>}
      </div>

      {/* what needs action right now */}
      {alerts.length > 0 && (
        <div className="rounded-2xl bg-surface p-3 shadow-sm" aria-label="Needs attention">
          <p className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-muted">Needs attention</p>
          <div className="flex flex-wrap gap-2">
            {alerts.map((a) => <button key={a.key} type="button" onClick={() => (a.key === "unpaid" ? goUnpaid() : setTab(a.tab))} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${a.tone}`}>{a.label}</button>)}
          </div>
        </div>
      )}

      {/* the details, one topic at a time */}
      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-surface p-1 shadow-sm" role="tablist" aria-label="Customer details">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`flex shrink-0 items-center whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold ${tab === t.id ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}>{t.label}{t.badge}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="Games played" value={p.games.played} sub={p.games.lastGame ? `last ${prettyDate(p.games.lastGame)}` : undefined} />
            <Tile label="Upcoming" value={x.upcomingBookings.length} sub={nextGame ? `next ${prettyDate(nextGame.date)}, ${nextGame.time}` : undefined} />
            <Tile label="Loyalty points" value={x.loyalty.points} sub={x.loyalty.freeGameVouchers ? `${x.loyalty.freeGameVouchers} free-game voucher${x.loyalty.freeGameVouchers === 1 ? "" : "s"}` : undefined} />
            <Tile label="Total spent" value={rs(x.spent.total)} tone="text-brand" sub={x.spent.unpaid > 0 ? `${rs(x.spent.unpaid)} unpaid` : undefined} />
          </div>
          <Section title="Who they are">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-muted">Mobile</dt><dd className="font-medium">{p.user.phoneNumber}</dd></div>
              <div><dt className="text-xs text-muted">Email</dt><dd className="truncate font-medium">{x.person.email || "-"}</dd></div>
              <div><dt className="text-xs text-muted">Age</dt><dd className="font-medium">{x.person.age !== null ? `${x.person.age} years` : "-"}{x.person.dateOfBirth ? <span className="text-xs text-muted"> · born {prettyDate(x.person.dateOfBirth)}</span> : null}</dd></div>
              <div><dt className="text-xs text-muted">Team and position</dt><dd className="font-medium">{p.profile.team ? `${p.profile.team.name} (${p.profile.team.role})` : "No team"}{p.profile.position ? ` · ${p.profile.position}` : ""}</dd></div>
              <div><dt className="text-xs text-muted">Mode</dt><dd className="font-medium capitalize">{p.profile.mode}</dd></div>
              <div><dt className="text-xs text-muted">Area</dt><dd className="font-medium">{p.profile.location || "-"}</dd></div>
            </dl>
            <div className={`rounded-xl p-3 text-sm ${x.person.emergency ? "bg-rose-500/10" : "bg-surface-2"}`}>
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted"><HeartPulse size={14} /> Emergency contact</p>
              {x.person.emergency ? (
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{x.person.emergency.name || "Contact"}{x.person.emergency.relation ? ` (${x.person.emergency.relation})` : ""} · {x.person.emergency.phone}</span>
                  <a href={`tel:${x.person.emergency.phone}`} className="flex items-center gap-1.5 rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white"><Phone size={13} /> Call</a>
                </div>
              ) : <p className="mt-1 text-muted">Not given. Ask the customer to add one in the app (Profile).</p>}
            </div>
          </Section>
        </div>
      )}

      {tab === "bookings" && (
        <div className="space-y-4">
          <Section title="Upcoming games" hint="Court bookings still to play, and whether each is paid">
            {x.upcomingBookings.length === 0 ? <Empty>No upcoming bookings.</Empty> : (
              <div className="space-y-3">
                {single.length > 0 && (
                  <ul className="space-y-2">
                    {single.map((b) => (
                      <li key={b.code} className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 p-3 text-sm">
                        <span><span className="font-semibold">{prettyDate(b.date)}</span> · {b.time}<span className="block font-mono text-xs text-muted">{b.code}</span></span>
                        <span className="text-right">{rs(b.amount)}<span className="mt-0.5 block">{b.paid ? <Badge tone="bg-brand/15 text-brand">Paid</Badge> : <Badge tone="bg-amber-500/15 text-amber-600">Unpaid</Badge>}</span></span>
                      </li>
                    ))}
                  </ul>
                )}
                {bulk.map((g) => (
                  <div key={g[0].bulk} className="rounded-xl border border-line p-3">
                    <p className="mb-2 flex items-center justify-between gap-2 text-xs"><span className="flex items-center gap-1.5 font-bold text-brand"><Layers size={14} /> Bulk booking <span className="font-mono">{g[0].bulk}</span></span><span className="text-muted">{g.length} game{g.length === 1 ? "" : "s"} · {rs(g.reduce((n, b) => n + b.amount, 0))}</span></p>
                    <ul className="space-y-1.5">
                      {g.map((b) => (
                        <li key={b.code} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                          <span>{prettyDate(b.date)} · {b.time}<span className="ml-2 font-mono text-xs text-muted">{b.code}</span></span>
                          {b.paid ? <Badge tone="bg-brand/15 text-brand">Paid</Badge> : <Badge tone="bg-amber-500/15 text-amber-600">Unpaid</Badge>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Section>
          <Section title="Games played">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tile label="Played" value={p.games.played} />
              <Tile label="Cancelled" value={p.games.cancelled} sub={`${p.games.noShows} no-show`} />
              <Tile label="First game" value={p.games.firstGame ? prettyDate(p.games.firstGame) : "-"} />
              <Tile label="Last game" value={p.games.lastGame ? prettyDate(p.games.lastGame) : "-"} />
            </div>
            {p.games.recent.length > 0 && <ul className="space-y-1.5 text-sm">{p.games.recent.slice(0, 8).map((g) => <li key={g.code} className="flex justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2"><span>{prettyDate(g.date)} · {g.time} <span className="font-mono text-xs text-muted">{g.code}</span></span><span className="text-muted">{say(g.status)} · {rs(g.amount)}</span></li>)}</ul>}
          </Section>
          <Section title="Gamezone (PS5)">
            <div className="grid grid-cols-2 gap-2"><Tile label="Sessions played" value={x.gamezone.completed} /><Tile label="Upcoming" value={x.gamezone.upcoming} /></div>
            {x.gamezone.recent.length === 0 ? <Empty>No Gamezone sessions yet.</Empty> : <ul className="space-y-1.5 text-sm">{x.gamezone.recent.map((g) => <li key={g.code} className="flex justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2"><span>{prettyDate(g.date)} · {g.time} · {g.hours} h · {g.game}</span><span className="text-muted">{say(g.status)} · {rs(g.total)}</span></li>)}</ul>}
          </Section>
        </div>
      )}

      {tab === "money" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {x.unpaidItems.length > 0 ? (
              <button type="button" onClick={goUnpaid} aria-label={`Unpaid ${rs(x.spent.unpaid)}: show which bookings`} className="rounded-xl bg-surface-2 p-3 text-left transition hover:bg-amber-500/10 focus-visible:outline-2 focus-visible:outline-brand">
                <p className="text-xs text-muted">Unpaid</p>
                <p className="text-lg font-bold text-amber-600">{rs(x.spent.unpaid)}</p>
                <p className="text-[11px] text-amber-700 underline">{x.unpaidItems.length} booking{x.unpaidItems.length === 1 ? "" : "s"}, tap to see which</p>
              </button>
            ) : <Tile label="Unpaid" value={rs(x.spent.unpaid)} />}
            <Tile label="Goods owed" value={rs(x.goods.dueTotal)} tone={x.goods.dueTotal > 0 ? "text-red-600" : ""} sub={x.goods.due.length ? `${x.goods.due.length} order${x.goods.due.length === 1 ? "" : "s"}` : undefined} />
            <Tile label="Total spent" value={rs(x.spent.total)} tone="text-brand" sub={`games ${rs(x.spent.games)} · goods ${rs(x.spent.goods)}`} />
            <Tile label="Add-ons on games" value={rs(x.addOns.total)} sub={x.addOns.bottles ? `${x.addOns.bottles} water bottles` : undefined} />
          </div>
          {x.unpaidItems.length > 0 && (
            <div id="unpaid-list" className="scroll-mt-24">
              <Section title="Unpaid bookings" hint="Every game and session that makes up the unpaid amount, oldest first. Open one to collect it in Payments.">
                <ul className="space-y-2">
                  {x.unpaidItems.map((u) => (
                    <li key={u.code}>
                      <Link href={payHref(u.kind, u.code, p.user.phoneNumber)} className="flex items-center justify-between gap-3 rounded-xl bg-amber-500/10 p-3 text-sm transition hover:bg-amber-500/20">
                        <span className="min-w-0">
                          <span className="block font-semibold">{prettyDate(u.date)} · {u.time}<span className="ml-2 text-xs font-normal text-amber-700">{agoText(u.date)}</span></span>
                          <span className="block text-xs text-muted"><span className="font-mono">{u.code}</span> · {u.kind === "gamezone" ? "Gamezone" : "Court"}{u.bulk ? ` · bulk ${u.bulk}` : ""} · {say(u.status)}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5 font-bold">{rs(u.amount)}<ArrowUpRight size={16} className="text-amber-700" aria-hidden /></span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="flex justify-between rounded-xl bg-surface-2 px-3 py-2 text-sm font-semibold"><span>Total unpaid</span><span>{rs(x.unpaidItems.reduce((n, u) => n + u.amount, 0))}</span></p>
              </Section>
            </div>
          )}
          <Section title="Inventory & goods" hint="Everything taken from the venue's stock: what is still to pay, and what was paid">
            {x.goods.due.length === 0 && x.goods.paid.length === 0 && <Empty>No goods taken from the venue.</Empty>}
            {x.goods.due.length > 0 && <div className="space-y-1.5"><p className="text-xs font-bold uppercase tracking-wide text-red-600">Still to pay · {rs(x.goods.dueTotal)}</p><ul className="space-y-1.5">{x.goods.due.map((g) => <GoodsRow key={g.id} g={g} />)}</ul></div>}
            {x.goods.paid.length > 0 && <div className="space-y-1.5"><p className="text-xs font-bold uppercase tracking-wide text-muted">Already paid</p><ul className="space-y-1.5">{x.goods.paid.map((g) => <GoodsRow key={g.id} g={g} />)}</ul></div>}
          </Section>
          <Section title="Recent payments">
            {p.payments.recent.length === 0 ? <Empty>No payments yet.</Empty> : (
              <ul className="space-y-1.5 text-sm">
                {p.payments.recent.slice(0, 8).map((r) => (
                  <li key={r.code} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2">
                    <span>{prettyDate(r.date)} · {r.time} <span className="font-mono text-xs text-muted">{r.code}</span></span>
                    <span className="flex items-center gap-2">{rs(r.amount)}<Badge tone={r.status === "paid" ? "bg-brand/15 text-brand" : r.status === "unpaid" ? "bg-amber-500/15 text-amber-600" : "bg-slate-500/15 text-slate-500"}>{say(r.status)}</Badge></span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          {x.addOns.recent.length > 0 && (
            <Section title="Add-ons on games">
              <ul className="space-y-1.5 text-sm">{x.addOns.recent.slice(0, 6).map((a) => <li key={a.code} className="flex justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2"><span>{prettyDate(a.date)}{a.items ? ` · ${a.items}` : ""}{a.bottles ? ` · ${a.bottles} water` : ""}</span><span className="text-muted">{rs(a.price)}</span></li>)}</ul>
            </Section>
          )}
        </div>
      )}

      {tab === "member" && (
        <div className="space-y-4">
          <Section title="Unique Club" hint="Rs. 1,500 for 30 days: 10% off bookings and Gamezone. The membership and tournament discounts unlock after 15 days or 5 games.">
            {x.club ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Tile label="Status" value={x.club.member ? "Member" : "Ended"} sub={x.club.member ? `${x.club.daysLeft} day${x.club.daysLeft === 1 ? "" : "s"} left` : undefined} />
                  <Tile label={x.club.member ? "Valid until" : "Ended on"} value={prettyDate(x.club.validUntil)} sub={`joined ${prettyDate(x.club.startedAt)}`} />
                  <Tile label="Discount given" value={rs(x.club.discountGiven)} sub={`${x.club.discountedGames} game${x.club.discountedGames === 1 ? "" : "s"}`} />
                  <Tile label="Membership & tournament" value={x.club.mature ? "Unlocked" : x.club.member ? "Not yet" : "-"} sub={x.club.mature || !x.club.member ? undefined : `day ${Math.min(x.club.daysIn, x.club.matureAfterDays)}/${x.club.matureAfterDays} · ${Math.min(x.club.gamesPlayed, x.club.matureAfterGames)}/${x.club.matureAfterGames} games`} />
                </div>
                {x.club.member && <p className="rounded-xl bg-sky-500/10 p-3 text-center text-sm font-semibold text-sky-700">Unique Club member: give 10% off their game. A promo code is not used with it.</p>}
              </>
            ) : <Empty>Not a Unique Club member.</Empty>}
          </Section>
          <Section title="Membership & attendance">
            {x.membership ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Tile label="Plan" value={x.membership.plan} sub={x.membership.memberCode ?? undefined} />
                  <Tile label="Hour" value={x.membership.timeSlot ?? "-"} />
                  <Tile label="Valid until" value={prettyDate(x.membership.endDate)} sub={`from ${prettyDate(x.membership.startDate)}`} />
                  <Tile label="Came this month" value={x.membership.attendanceThisMonth} sub={`${x.membership.attendanceCount} in total`} />
                </div>
                {x.membership.attendedToday
                  ? <p className="rounded-xl bg-brand/10 p-3 text-center text-sm font-semibold text-brand">Attendance already marked today</p>
                  : <button onClick={onAttendance} disabled={busy === "att"} className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white disabled:opacity-60">{busy === "att" ? "Saving…" : "Mark today's attendance"}</button>}
                {x.membership.recentDays.length > 0 && <p className="text-xs text-muted">Recent days: {x.membership.recentDays.map((d) => prettyDate(d)).join(", ")}</p>}
              </>
            ) : <Empty>No active membership today.{x.membershipCount > 0 ? ` ${x.membershipCount} earlier on record.` : ""}</Empty>}
          </Section>
        </div>
      )}

      {tab === "activity" && (
        <div className="space-y-4">
          <Section title="Points & referrals">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tile label="Loyalty points" value={x.loyalty.points} />
              <Tile label="Free-game vouchers" value={x.loyalty.freeGameVouchers} />
              <Tile label="Referrals sent" value={x.referrals.asReferrer.total} sub={`${x.referrals.asReferrer.approved} approved`} />
              <Tile label="Referred to them" value={x.referrals.asFriend.total} sub={`${x.referrals.asFriend.pending} waiting`} />
            </div>
            {x.referrals.recent.length > 0 && <ul className="space-y-1.5 text-sm">{x.referrals.recent.map((r) => <li key={r.code} className="flex justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2"><span>{r.role === "referrer" ? "Referred" : "Was referred by a friend"} · {r.teamName}</span><span className="text-muted">{say(r.status)}</span></li>)}</ul>}
          </Section>
          <Section title="Goal Rush (penalty game)" hint="3 or more goals out of 5 earn 1 point, 3 games a day.">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tile label="Games today" value={`${x.goalRush.gamesToday}/3`} />
              <Tile label="Points today" value={x.goalRush.pointsToday} />
              <Tile label="Games in total" value={x.goalRush.gamesTotal} />
              <Tile label="Points in total" value={x.goalRush.pointsTotal} />
            </div>
            {x.goalRush.recent.length > 0 && <ul className="space-y-1.5 text-sm">{x.goalRush.recent.map((g, i) => <li key={i} className="flex justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2"><span>{prettyDate(g.day)} · {g.goals}/{g.shots} goals</span><span className="text-muted">{g.points} point{g.points === 1 ? "" : "s"}</span></li>)}</ul>}
          </Section>
          <Section title="Find Player" hint="Games they asked players for, and games they joined">
            {x.findPlayer.hosting.length === 0 && x.findPlayer.joined.length === 0 ? <Empty>No Find Player games coming up.</Empty> : (
              <ul className="space-y-1.5 text-sm">
                {x.findPlayer.hosting.map((r) => <li key={r.id} className="flex justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2"><span>Hosting {prettyDate(r.date)} · {r.time} · {r.joined}/{r.needed} joined</span><span className="text-muted">{say(r.status)}</span></li>)}
                {x.findPlayer.joined.map((r) => <li key={r.id} className="flex justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2"><span>Joined {r.host}&apos;s game {prettyDate(r.date)} · {r.time}</span><span className="text-muted">{say(r.status)}</span></li>)}
              </ul>
            )}
          </Section>
          {(p.tournaments.entered.length > 0 || p.tournaments.challengesHosted.count > 0) && (
            <Section title="Tournaments & challenges">
              <ul className="space-y-1.5 text-sm">
                {p.tournaments.entered.map((t) => <li key={t.id} className="flex justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2"><span>{t.tournament} · {t.teamName}</span><span className="text-muted">{prettyDate(t.startDate)} · {say(t.status)}</span></li>)}
                {p.tournaments.challengesHosted.recent.map((c) => <li key={c.id} className="flex justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2"><span>Challenge {c.opponent ? `vs ${c.opponent}` : ""} · {prettyDate(c.date)}</span><span className="text-muted">{say(c.status)}</span></li>)}
              </ul>
            </Section>
          )}
        </div>
      )}

      {tab === "care" && (
        <div className="space-y-4">
          <Section title="Emergency contact">
            {x.person.emergency ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-rose-500/10 p-3 text-sm">
                <span className="font-medium">{x.person.emergency.name || "Contact"}{x.person.emergency.relation ? ` (${x.person.emergency.relation})` : ""} · {x.person.emergency.phone}</span>
                <a href={`tel:${x.person.emergency.phone}`} className="flex items-center gap-1.5 rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white"><Phone size={13} /> Call</a>
              </div>
            ) : <Empty>No emergency contact on the account.</Empty>}
          </Section>
          <Section title="Wheelchair request" hint="Open requests from today on">
            {x.wheelchair.length === 0 ? <Empty>No wheelchair request.</Empty> : (
              <ul className="space-y-1.5 text-sm">
                {x.wheelchair.map((w) => (
                  <li key={w.code} className="space-y-0.5 rounded-xl bg-blue-500/10 p-3">
                    <p className="flex items-center justify-between gap-2 font-medium"><span className="flex items-center gap-1.5"><Accessibility size={15} /> {prettyDate(w.date)} about {w.time} · {w.people} wheelchair user{w.people === 1 ? "" : "s"}</span><Badge tone="bg-blue-500/15 text-blue-700">{say(w.status)}</Badge></p>
                    <p className="text-xs text-muted"><span className="font-mono">{w.code}</span>{w.bookingCode ? ` · booking ${w.bookingCode}` : ""}{w.note ? ` · ${w.note}` : ""}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Insurance claims" hint="As the injured player or as the person who filed it">
            {x.insurance.length === 0 ? <Empty>No insurance claims.</Empty> : (
              <ul className="space-y-1.5 text-sm">
                {x.insurance.map((c) => (
                  <li key={c.code} className={`flex items-center justify-between gap-2 rounded-xl p-3 ${c.open ? "bg-red-500/10" : "bg-surface-2"}`}>
                    <span className="flex items-center gap-1.5"><ShieldAlert size={15} className={c.severity === "emergency" ? "text-rose-600" : "text-muted"} /> {c.patientName} · <span className="font-mono text-xs">{c.code}</span>{c.severity === "emergency" && <Badge tone="bg-rose-500/15 text-rose-600">Emergency</Badge>}</span>
                    <span className="text-xs text-muted">{say(c.status)} · {prettyDate(c.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Complaints & cancellations">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tile label="Open complaints" value={p.complaints.open} sub={`${p.complaints.total} in total`} tone={p.complaints.open > 0 ? "text-amber-600" : ""} />
              <Tile label="Late cancels" value={p.cancellations.lateCount} sub={`streak ${p.cancellations.streak}`} />
              <Tile label="Cancelled, last 30 days" value={p.cancellations.last30} sub={`${p.cancellations.total} in total`} />
              <Tile label="No-shows" value={p.games.noShows} />
            </div>
            {p.complaints.recent.length > 0 && <ul className="space-y-1.5 text-sm">{p.complaints.recent.slice(0, 5).map((c) => <li key={c.id} className="flex justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2"><span>{c.categoryLabel} <span className="font-mono text-xs text-muted">{c.code}</span></span><span className="text-muted">{say(c.status)} · {prettyDate(c.createdAt.slice(0, 10))}</span></li>)}</ul>}
          </Section>
        </div>
      )}

      <button onClick={onNext} className="flex w-full items-center justify-center gap-2 rounded-full border border-line bg-surface py-3 text-sm font-semibold"><QrCode size={18} /> Scan the next customer</button>
    </div>
  );
}

