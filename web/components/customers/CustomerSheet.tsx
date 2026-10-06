"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MessageCircle, Phone, ShieldCheck, ShieldOff, X } from "lucide-react";
import { Badge } from "../bookings/Badge";
import CancellationsSection from "./CancellationsSection";
import VipSection from "./VipSection";
import VipTag from "./VipTag";
import { ApiError } from "@/lib/api";
import { canDo } from "@/lib/auth";
import { prettyDate, rs, STATUS as BOOKING_STATUS } from "@/lib/bookings";
import { STATUS as COMPLAINT_STATUS, ago } from "@/lib/complaints";
import { METHOD_LABEL } from "@/lib/payments";
import { CustomerRow, Profile, getProfile, initials, setActive } from "@/lib/customers";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-line p-4">
      <div>
        <h3 className="font-bold">{title}</h3>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

const Tile = ({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) => (
  <div className="rounded-xl bg-surface-2 p-3">
    <p className="text-xs text-muted">{label}</p>
    <p className={`text-lg font-bold ${tone ?? ""}`}>{value}</p>
    {sub && <p className="text-[11px] text-muted">{sub}</p>}
  </div>
);

const Empty = ({ children }: { children: React.ReactNode }) => <p className="rounded-xl bg-surface-2 p-3 text-center text-sm text-muted">{children}</p>;

const PAY_TONE = { paid: "bg-brand/15 text-brand", unpaid: "bg-amber-500/15 text-amber-600", cancelled: "bg-slate-500/15 text-slate-500" };

export default function CustomerSheet({ customer, onClose, onChanged }: { customer: CustomerRow; onClose: () => void; onChanged: () => void }) {
  const [p, setP] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const canWrite = canDo("customers.write");

  useEffect(() => {
    let live = true;
    getProfile(customer.phoneNumber)
      .then((d) => { if (live) setP(d); })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load this customer"); });
    return () => { live = false; };
  }, [customer.phoneNumber]);

  async function toggleActive() {
    if (!p) return;
    const next = !p.user.isActive;
    if (!window.confirm(next ? `Let ${p.user.name ?? p.user.phoneNumber} use the app again?` : `Suspend ${p.user.name ?? p.user.phoneNumber}? They will not be able to sign in. Their records are kept.`)) return;
    setBusy("active");
    setError("");
    try {
      await setActive(p.user.phoneNumber, next);
      setP({ ...p, user: { ...p.user, isActive: next } });
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not change the account");
    } finally {
      setBusy("");
    }
  }

  const name = p?.user.name ?? customer.name ?? "Customer";
  const isCaptain = (p?.profile.mode ?? customer.mode) === "captain";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label={`Customer ${name}`} onClick={(e) => e.stopPropagation()} className="max-h-[94vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="flex items-start gap-3">
          <span className="relative grid h-14 w-14 shrink-0 place-items-center rounded-full bg-brand/15 text-lg font-bold text-brand">
            {initials(customer.name, customer.phoneNumber)}
            {isCaptain && <span title="Captain" className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-amber-400 text-[11px] font-black text-white">C</span>}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-bold">{name}</h2>
            <p className="text-sm text-muted">{customer.phoneNumber}{p?.user.email ? ` · ${p.user.email}` : ""}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {(p?.vip ?? customer.vip) && <VipTag />}
              <Badge tone={isCaptain ? "bg-amber-400/20 text-amber-700" : "bg-surface-2 text-muted"}>{isCaptain ? "Captain" : "Regular player"}</Badge>
              {p && !p.user.isActive && <Badge tone="bg-red-500/15 text-red-600">Suspended</Badge>}
              {p && <Badge tone="bg-surface-2 text-muted">Joined {prettyDate(p.user.createdAt.slice(0, 10))}</Badge>}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-surface-2"><X size={22} /></button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <a href={`tel:${customer.phoneNumber}`} className="flex items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-semibold text-white"><Phone size={16} /> Call {customer.phoneNumber}</a>
          <a href={`https://wa.me/977${customer.phoneNumber}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-surface-2 py-3 text-sm font-semibold"><MessageCircle size={16} /> WhatsApp</a>
        </div>

        {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
        {!p && !error && <p className="py-8 text-center text-sm text-muted">Loading the customer&apos;s history…</p>}

        {p && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Tile label="Games played" value={String(p.games.played)} sub={p.games.gamezoneSessions ? `+ ${p.games.gamezoneSessions} Gamezone` : undefined} />
              <Tile label="Paid so far" value={rs(p.payments.paid.amount)} sub={`${p.payments.paid.count} payments`} tone="text-brand" />
              <Tile label="Still to pay" value={rs(p.payments.unpaid.amount)} sub={`${p.payments.unpaid.count} bookings`} tone={p.payments.unpaid.amount > 0 ? "text-amber-600" : ""} />
              <Tile label="Extra items bought" value={rs(p.goods.total)} sub={`${p.goods.count} purchases`} />
            </div>

            <Section title="Captain or regular profile">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Tile label="Mode" value={isCaptain ? "Captain" : "Regular"} />
                <Tile label="Position" value={p.profile.position ?? "–"} sub={p.profile.location ?? undefined} />
              </div>
              {p.profile.team ? (
                <div className="rounded-xl bg-surface-2 p-3">
                  <p className="font-semibold">{p.profile.team.name} <span className="font-normal text-muted">· {p.profile.team.role === "captain" ? "captain" : "member"}</span></p>
                  <p className="text-xs text-muted">{p.profile.team.members} players · {p.profile.team.area}</p>
                  <p className="mt-1 text-sm">Challenge record: <strong>{p.profile.team.record.won}</strong> won, <strong>{p.profile.team.record.drawn}</strong> drawn, <strong>{p.profile.team.record.lost}</strong> lost ({p.profile.team.record.played} played)</p>
                </div>
              ) : <Empty>Not in a team.</Empty>}
            </Section>

            <Section title="Games" hint="Court bookings on their account or phone number">
              <div className="grid grid-cols-4 gap-2 text-center">
                {([["Played", p.games.played], ["Coming up", p.games.upcoming], ["Cancelled", p.games.cancelled], ["No-shows", p.games.noShows]] as const).map(([l, v]) => (
                  <div key={l} className="rounded-xl bg-surface-2 p-2"><p className="text-lg font-bold">{v}</p><p className="text-[11px] text-muted">{l}</p></div>
                ))}
              </div>
              <p className="text-xs text-muted">First game {p.games.firstGame ? prettyDate(p.games.firstGame) : "–"} · Last game {p.games.lastGame ? prettyDate(p.games.lastGame) : "–"}</p>
              {p.games.recent.length === 0 ? <Empty>No bookings yet.</Empty> : (
                <ul className="divide-y divide-line">
                  {p.games.recent.map((g) => {
                    const st = BOOKING_STATUS[g.status] ?? { label: g.status, tone: "bg-slate-500/15 text-slate-500" };
                    return (
                      <li key={g.code} className="flex items-center gap-3 py-2 text-sm">
                        <div className="min-w-0 flex-1"><p className="font-semibold">{prettyDate(g.date)} · {g.time}</p><p className="font-mono text-xs text-muted">{g.code}</p></div>
                        <Badge tone={st.tone}>{st.label}</Badge>
                        <span className="w-20 text-right font-semibold">{rs(g.amount)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>

            <Section title="Payments" hint="Court bookings and Gamezone together">
              <div className="grid grid-cols-2 gap-2">
                <Tile label="Cash at venue" value={rs(p.payments.paidCash.amount)} sub={`${p.payments.paidCash.count} payments`} />
                <Tile label="Online" value={rs(p.payments.paidOnline.amount)} sub={`${p.payments.paidOnline.count} payments`} />
              </div>
              {p.payments.recent.length === 0 ? <Empty>No payments yet.</Empty> : (
                <ul className="divide-y divide-line">
                  {p.payments.recent.map((r) => (
                    <li key={`${r.kind}-${r.code}`} className="flex items-center gap-3 py-2 text-sm">
                      <div className="min-w-0 flex-1"><p className="font-semibold">{prettyDate(r.date)}</p><p className="text-xs text-muted">{r.kind === "court" ? "Court" : "Gamezone"} · {r.method === "venue" ? "Cash at venue" : METHOD_LABEL[r.method] ?? r.method}</p></div>
                      <Badge tone={PAY_TONE[r.status]}>{r.status === "paid" ? "Paid" : r.status === "unpaid" ? "Unpaid" : "Cancelled"}</Badge>
                      <span className="w-20 text-right font-semibold">{rs(r.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Extra items bought" hint="Water, drinks and other goods sold at the venue">
              {p.goods.items.length === 0 ? <Empty>Nothing bought yet.</Empty> : (
                <ul className="divide-y divide-line">
                  {p.goods.items.map((g) => (
                    <li key={g.id} className="flex items-center gap-3 py-2 text-sm">
                      <div className="min-w-0 flex-1"><p className="truncate font-semibold">{g.items || "Goods"}</p><p className="text-xs text-muted">{prettyDate(g.soldAt.slice(0, 10))}</p></div>
                      <span className="font-semibold">{rs(g.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <CancellationsSection p={p} canWrite={canWrite} busy={busy === "active"} onToggleActive={toggleActive} />

            <VipSection p={p} canManage={canDo("customers.write")} />

            <Section title="Complaints">
              <p className="text-sm">{p.complaints.total} sent{p.complaints.open > 0 ? <> · <strong className="text-amber-600">{p.complaints.open} still open</strong></> : ""}</p>
              {p.complaints.recent.length === 0 ? <Empty>No complaints.</Empty> : (
                <ul className="divide-y divide-line">
                  {p.complaints.recent.map((c) => {
                    const st = COMPLAINT_STATUS[c.status as keyof typeof COMPLAINT_STATUS];
                    return (
                      <li key={c.id} className="flex items-center gap-3 py-2 text-sm">
                        <div className="min-w-0 flex-1"><p className="font-semibold">{c.categoryLabel}</p><p className="text-xs text-muted"><span className="font-mono">{c.code}</span> · {ago(c.createdAt)}</p></div>
                        {st && <Badge tone={st.tone}>{st.label}</Badge>}
                      </li>
                    );
                  })}
                </ul>
              )}
              {p.complaints.total > 0 && canDo("complaints.read") && <Link href={`/complaints?q=${encodeURIComponent(customer.phoneNumber)}`} className="inline-block text-sm font-semibold text-brand">Open in Complaints</Link>}
            </Section>

            <Section title="Tournaments and hosting" hint="Tournaments are run by the venue. Customers enter them with a team, and captains can host challenge matches.">
              <div>
                <p className="mb-1 text-sm font-semibold">Tournaments entered ({p.tournaments.entered.length})</p>
                {p.tournaments.entered.length === 0 ? <Empty>Has not entered a tournament.</Empty> : (
                  <ul className="divide-y divide-line">
                    {p.tournaments.entered.map((t) => (
                      <li key={t.id} className="flex items-center gap-3 py-2 text-sm"><div className="min-w-0 flex-1"><p className="font-semibold">{t.tournament}</p><p className="text-xs text-muted">as {t.teamName} · {prettyDate(t.startDate)}</p></div><Badge tone="bg-surface-2 text-muted">{t.status}</Badge></li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="mb-1 text-sm font-semibold">Challenge matches hosted ({p.tournaments.challengesHosted.count})</p>
                {p.tournaments.challengesHosted.count === 0 ? <Empty>{isCaptain ? "No challenges sent yet." : "Only captains can host challenge matches."}</Empty> : (
                  <ul className="divide-y divide-line">
                    {p.tournaments.challengesHosted.recent.map((c) => (
                      <li key={c.id} className="flex items-center gap-3 py-2 text-sm"><div className="min-w-0 flex-1"><p className="font-semibold">vs {c.opponent ?? "a team"}</p><p className="text-xs text-muted">{prettyDate(c.date)} · {String(c.startHour).padStart(2, "0")}:00</p></div><Badge tone="bg-surface-2 text-muted">{c.status}</Badge></li>
                    ))}
                  </ul>
                )}
              </div>
            </Section>

            {canWrite && (
              <button onClick={toggleActive} disabled={busy === "active"} className={`flex w-full items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold disabled:opacity-60 ${p.user.isActive ? "border-red-500/40 text-red-600" : "border-brand text-brand"}`}>
                {p.user.isActive ? <><ShieldOff size={16} /> Suspend this account</> : <><ShieldCheck size={16} /> Reactivate this account</>}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
