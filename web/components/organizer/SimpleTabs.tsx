"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, CheckCircle2, ChevronDown, Loader2, Lock, LockOpen, LogOut, Pencil, Phone, Plus, Trash2, Users, X } from "lucide-react";
import { ApiError, setToken } from "@/lib/api";
import { logout, setAvatar } from "@/lib/auth";
import { rs } from "@/lib/bookings";
import { Bill, fmtDay, range } from "@/lib/hosted-tournaments";
import { askConfirm } from "@/lib/confirm";
import { OrgMe, OrgTeam, TeamInput, orgAddTeam, orgBilling, orgChangePassword, orgDeleteTeam, orgEditTeam, orgSetRegistrationClosed } from "@/lib/organizer";

const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");
const field = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";

/* ---------------- Teams ---------------- */
const STATUS: Record<OrgTeam["status"], { label: string; tone: string }> = {
  approved: { label: "Approved", tone: "bg-emerald-500/15 text-emerald-700" },
  pending: { label: "Waiting for approval", tone: "bg-amber-500/15 text-amber-700" },
  rejected: { label: "Not accepted", tone: "bg-slate-500/15 text-slate-600" },
};
type TeamFilter = "registered" | "new" | "all";

// Add a team or edit one. Players go one to a line.
function TeamSheet({ tid, team, onClose, onSaved }: { tid: string; team: OrgTeam | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(team?.teamName ?? "");
  const [captain, setCaptain] = useState(team?.captainName ?? "");
  const [phone, setPhone] = useState(team?.phone ?? "");
  const [players, setPlayers] = useState((team?.players ?? []).join("\n"));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    if (busy) return;
    if (name.trim().length < 2) return setErr("Enter the team name.");
    if (captain.trim().length < 2) return setErr("Enter the captain's name.");
    if (!/^\+?\d[\d\s-]{6,16}$/.test(phone.trim())) return setErr("Enter the captain's phone number, digits only.");
    const list = players.split(/\n+/).map((p) => p.trim()).filter(Boolean);
    const body: TeamInput = { teamName: name.trim(), captainName: captain.trim(), phone: phone.trim(), players: list };
    setBusy(true); setErr("");
    try { if (team) await orgEditTeam(tid, team.id, body); else await orgAddTeam(tid, body); onSaved(); onClose(); }
    catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center" onClick={onClose}>
      <form role="dialog" aria-label={team ? "Edit team" : "Add a team"} onClick={(e) => e.stopPropagation()} onSubmit={save} noValidate className="max-h-[92dvh] w-full max-w-lg space-y-3 overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold">{team ? "Edit team" : "Add a team"}</h2><button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-muted hover:bg-surface-2"><X size={18} /></button></div>
        <label className="block text-sm font-medium">Team name<input value={name} maxLength={40} onChange={(e) => { setName(e.target.value); setErr(""); }} placeholder="Madhan FC" className={field + " mt-1"} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">Captain<input value={captain} maxLength={40} onChange={(e) => { setCaptain(e.target.value); setErr(""); }} placeholder="Captain name" className={field + " mt-1"} /></label>
          <label className="block text-sm font-medium">Captain&apos;s phone<input value={phone} inputMode="tel" maxLength={17} onChange={(e) => { setPhone(e.target.value.replace(/[^\d+\s-]/g, "")); setErr(""); }} placeholder="98XXXXXXXX" className={field + " mt-1"} /></label>
        </div>
        <label className="block text-sm font-medium">Players <span className="font-normal text-muted">(one name on each line, optional)</span><textarea value={players} rows={5} onChange={(e) => setPlayers(e.target.value)} className={field + " mt-1"} /></label>
        {err && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{err}</p>}
        <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy && <Loader2 size={16} className="animate-spin" />} {team ? "Save changes" : "Add team"}</button>
      </form>
    </div>
  );
}

export function TeamsTab({ tid, teams, max, closed, onClosed, onChanged }: { tid: string; teams: OrgTeam[] | null; max: number; closed: boolean; onClosed: (v: boolean) => void; onChanged: () => void }) {
  const [filter, setFilter] = useState<TeamFilter>("registered");
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState<OrgTeam | "new" | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  if (!teams) return <p className="py-16 text-center text-sm text-muted">Loading the teams…</p>;

  const approved = teams.filter((t) => t.status === "approved");
  const fresh = teams.filter((t) => t.status === "pending");
  const shown = filter === "registered" ? approved : filter === "new" ? fresh : teams;
  const full = approved.length + fresh.length >= max;

  async function act(key: string, job: () => Promise<unknown>) {
    setBusy(key); setErr("");
    try { await job(); onChanged(); } catch (e) { setErr(msg(e)); } finally { setBusy(""); }
  }
  async function toggleRegistration() {
    if (!closed && !(await askConfirm("Close registration? Customers will no longer be able to register a team in the app. You can open it again any time."))) return;
    setBusy("reg"); setErr("");
    try { const r = await orgSetRegistrationClosed(tid, !closed); onClosed(r.registrationClosed); } catch (e) { setErr(msg(e)); } finally { setBusy(""); }
  }
  const remove = async (t: OrgTeam) => { if (await askConfirm("Remove " + t.teamName + " from the tournament? This cannot be undone.")) void act("del" + t.id, () => orgDeleteTeam(tid, t.id)); };

  const chip = (id: TeamFilter, label: string, n: number, alert = false) => (
    <button key={id} type="button" role="tab" aria-selected={filter === id} onClick={() => setFilter(id)} className={"flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold " + (filter === id ? "bg-brand text-white" : "text-muted hover:bg-surface-2")}>
      {label} <span className={"rounded-full px-1.5 py-0.5 text-[11px] font-bold " + (filter === id ? "bg-white/25 text-white" : alert && n > 0 ? "bg-amber-500 text-white" : "bg-surface-2 text-muted")}>{n}</span>
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-4 shadow-sm">
        <div className="min-w-0"><h2 className="text-lg font-bold">Teams</h2><p className="text-xs text-muted">{approved.length} of {max} places taken.</p></div>
        <button type="button" onClick={() => setForm("new")} disabled={full} title={full ? "The tournament is full" : "Add a team"} className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Plus size={16} /> Add team</button>
      </div>

      <div className={"flex items-center justify-between gap-3 rounded-2xl p-3 shadow-sm " + (closed ? "bg-red-500/10" : "bg-surface")}>
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={"grid h-9 w-9 shrink-0 place-items-center rounded-xl " + (closed ? "bg-red-500/15 text-red-600" : "bg-emerald-500/15 text-emerald-600")}>{closed ? <Lock size={17} /> : <LockOpen size={17} />}</span>
          <span className="min-w-0"><span className="block text-sm font-bold">{closed ? "Registration is closed" : "Registration is open"}</span><span className="block text-xs text-muted">{closed ? "Customers cannot register a team in the app." : "Customers can register a team in the app."}</span></span>
        </div>
        <button type="button" onClick={toggleRegistration} disabled={busy === "reg"} className={"flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60 " + (closed ? "bg-emerald-600 text-white" : "border border-red-500/40 text-red-600")}>
          {busy === "reg" && <Loader2 size={14} className="animate-spin" />}{closed ? "Open registration" : "Close registration"}
        </button>
      </div>

      <div className="flex gap-1 rounded-2xl bg-surface p-1 shadow-sm" role="tablist" aria-label="Teams">
        {chip("registered", "Registered", approved.length)}
        {chip("new", "New", fresh.length, true)}
        {chip("all", "All", teams.length)}
      </div>
      {err && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{err}</p>}

      {shown.length === 0 && (
        <p className="rounded-2xl bg-surface p-8 text-center text-sm text-muted shadow-sm">
          {filter === "new" ? "No new team is waiting for you." : filter === "registered" ? "No team is registered yet. Add the first one." : "No team yet."}
        </p>
      )}
      <ul className="space-y-2">
        {shown.map((t) => {
          const on = open === t.id;
          const mine = busy.endsWith(t.id);
          return (
            <li key={t.id} className="overflow-hidden rounded-2xl bg-surface shadow-sm">
              <button type="button" onClick={() => setOpen(on ? null : t.id)} aria-expanded={on} className="flex w-full items-center gap-3 p-4 text-left">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"><Users size={18} /></span>
                <span className="min-w-0 flex-1"><span className="block truncate font-bold">{t.teamName}</span><span className="block truncate text-xs text-muted">Captain {t.captainName} · {t.players.length} player{t.players.length === 1 ? "" : "s"}</span></span>
                <span className={"shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold " + STATUS[t.status].tone}>{t.status === "pending" ? "New" : STATUS[t.status].label}</span>
                <ChevronDown size={16} className={"shrink-0 text-muted transition " + (on ? "rotate-180" : "")} />
              </button>
              {on && (
                <div className="space-y-3 border-t border-line p-4 text-sm">
                  <div className="flex flex-wrap gap-2">
                    <a href={"tel:" + t.phone} className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"><Phone size={15} /> Call {t.captainName.split(" ")[0]}</a>
                    <button type="button" onClick={() => setForm(t)} className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold"><Pencil size={14} /> Edit</button>
                    <button type="button" disabled={mine} onClick={() => remove(t)} className="inline-flex items-center gap-2 rounded-full border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-600 disabled:opacity-50"><Trash2 size={14} /> Delete</button>
                  </div>
                  {t.status === "pending" && (
                    <div className="flex gap-2 rounded-xl bg-amber-500/10 p-3">
                      <p className="flex-1 text-xs text-amber-800">This team registered by itself. Accept it into the tournament?</p>
                      <button type="button" disabled={mine || approved.length + fresh.length > max} onClick={() => act("ok" + t.id, () => orgEditTeam(tid, t.id, { status: "approved" }))} className="flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"><Check size={13} /> Accept</button>
                      <button type="button" disabled={mine} onClick={() => act("no" + t.id, () => orgEditTeam(tid, t.id, { status: "rejected" }))} className="flex items-center gap-1 rounded-full bg-slate-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"><X size={13} /> Decline</button>
                    </div>
                  )}
                  {t.status === "rejected" && <button type="button" disabled={mine || full} onClick={() => act("ok" + t.id, () => orgEditTeam(tid, t.id, { status: "approved" }))} className="rounded-full border border-line px-4 py-2 text-xs font-semibold">Accept this team after all</button>}
                  {t.players.length > 0 && <ol className="list-inside list-decimal space-y-0.5 text-muted">{t.players.map((p, i) => <li key={p + i}>{p}</li>)}</ol>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {form && <TeamSheet tid={tid} team={form === "new" ? null : form} onClose={() => setForm(null)} onSaved={onChanged} />}
    </div>
  );
}

/* ---------------- Billing (read only) ---------------- */
export function BillingTab({ tid }: { tid: string }) {
  const [bill, setBill] = useState<Bill | null | undefined>(undefined);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    orgBilling(tid).then((b) => live && setBill(b)).catch((e) => live && setError(msg(e)));
    return () => { live = false; };
  }, [tid]);
  if (error) return <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>;
  if (bill === undefined) return <p className="py-16 text-center text-sm text-muted">Loading the bill…</p>;
  if (bill === null) return <p className="rounded-2xl bg-surface p-8 text-center text-sm text-muted shadow-sm">There is no bill for this tournament.</p>;
  const row = (l: string, v: string, strong = false, tone = "") => <div className={`flex items-center justify-between gap-3 py-1.5 text-sm ${strong ? "font-bold" : ""}`}><span className={strong ? "" : "text-muted"}>{l}</span><span className={`tabular-nums ${tone}`}>{v}</span></div>;
  return (
    <div className="space-y-3">
      <section className="rounded-2xl bg-surface p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="text-lg font-bold">Tournament bill</h2><p className="text-xs text-muted">What the venue has put on your tournament. Only the venue staff change it.</p></div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${bill.closedAt ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700"}`}>{bill.closedAt ? "Final bill" : "Running"}</span>
        </div>
        <div className="mt-3 divide-y divide-line">
          {row(`Court: ${bill.hours} hour${bill.hours === 1 ? "" : "s"} at ${rs(bill.rate)}`, rs(bill.court))}
          {bill.goods > 0 && row("Goods from the shop", rs(bill.goods))}
          {(bill.servicesTotal ?? 0) > 0 && row("Additional services", rs(bill.servicesTotal))}
          {bill.extras > 0 && row("Extra charges", rs(bill.extras))}
          {bill.discount > 0 && row("Discount", `- ${rs(bill.discount)}`, false, "text-emerald-700")}
          {(bill.clubDiscount ?? 0) > 0 && row("Unique Club discount", `- ${rs(bill.clubDiscount ?? 0)}`, false, "text-emerald-700")}
          {row("Total", rs(bill.total), true)}
          {row("Paid so far", rs(bill.paid), false, "text-emerald-700")}
          {row(bill.due > 0 ? "Still to pay" : "Balance", rs(Math.max(0, bill.due)), true, bill.due > 0 ? "text-red-600" : "text-emerald-700")}
        </div>
      </section>
      <section className="rounded-2xl bg-surface p-4 shadow-sm">
        <h3 className="text-sm font-bold">Days and hours</h3>
        <ul className="mt-2 space-y-1.5 text-sm">{bill.days.map((d) => <li key={d.id} className="flex justify-between gap-3"><span>{fmtDay(d.date)}<span className="block text-xs text-muted">{range(d)}</span></span><span className="tabular-nums text-muted">{rs(d.amount)}</span></li>)}</ul>
      </section>
      {(bill.serviceLines?.length ?? 0) > 0 && (
        <section className="rounded-2xl bg-surface p-4 shadow-sm">
          <h3 className="text-sm font-bold">Additional services</h3>
          <ul className="mt-2 divide-y divide-line text-sm">
            {bill.serviceLines.map((l) => <li key={l.id} className="flex items-start justify-between gap-3 py-1.5"><span className="min-w-0"><span className="block font-medium">{l.label}</span>{l.id === "mineral_water" && <span className="block text-xs text-muted">{l.quantity} bottle{l.quantity === 1 ? "" : "s"} x {rs(l.unitPrice)}</span>}</span><span className="tabular-nums font-semibold">{rs(l.amount)}</span></li>)}
          </ul>
        </section>
      )}
      {bill.lines.some((l) => l.kind === "goods") && (
        <section className="rounded-2xl bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-bold">Inventory: goods taken from the shop</h3><span className="text-xs font-semibold text-muted">{bill.lines.filter((l) => l.kind === "goods").reduce((n, l) => n + l.quantity, 0)} items</span></div>
          <ul className="mt-2 divide-y divide-line text-sm">
            {bill.lines.filter((l) => l.kind === "goods").map((l) => <li key={l.id} className="flex items-start justify-between gap-3 py-1.5"><span className="min-w-0"><span className="block truncate font-medium">{l.label}</span><span className="block text-xs text-muted">{l.quantity} x {rs(l.unitPrice)}</span></span><span className="tabular-nums font-semibold">{rs(l.amount)}</span></li>)}
          </ul>
          <p className="mt-2 flex justify-between border-t border-line pt-2 text-sm font-bold"><span>Goods total</span><span className="tabular-nums">{rs(bill.goods)}</span></p>
        </section>
      )}
      {bill.lines.some((l) => l.kind !== "goods") && (
        <section className="rounded-2xl bg-surface p-4 shadow-sm">
          <h3 className="text-sm font-bold">Extra charges and discounts</h3>
          <ul className="mt-2 divide-y divide-line text-sm">{bill.lines.filter((l) => l.kind !== "goods").map((l) => <li key={l.id} className="flex justify-between gap-3 py-1.5"><span className="min-w-0 truncate">{l.label}</span><span className={`tabular-nums ${l.amount < 0 ? "text-emerald-700" : ""}`}>{l.amount < 0 ? "- " : ""}{rs(Math.abs(l.amount))}</span></li>)}</ul>
        </section>
      )}
      {bill.payments.length > 0 && (
        <section className="rounded-2xl bg-surface p-4 shadow-sm">
          <h3 className="text-sm font-bold">Payments received</h3>
          <ul className="mt-2 divide-y divide-line text-sm">{bill.payments.map((p) => <li key={p.id} className="flex justify-between gap-3 py-1.5"><span className="text-muted">{new Date(p.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kathmandu" })}{p.cash > 0 && p.fonepay > 0 ? " · cash + Fonepay" : p.fonepay > 0 ? " · Fonepay" : " · cash"}</span><span className="font-semibold tabular-nums text-emerald-700">{rs(p.amount)}</span></li>)}</ul>
        </section>
      )}
    </div>
  );
}

/* ---------------- Account: change password and sign out (opened from the Dashboard) ---------------- */
export function AccountPanel({ onSignOut }: { onSignOut: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  async function password(ev: React.FormEvent) {
    ev.preventDefault();
    setErr(""); setOk("");
    if (next.length < 10) return setErr("The new password needs at least 10 characters.");
    setBusy(true);
    try { const r = await orgChangePassword(cur, next); setToken(r.token); setCur(""); setNext(""); setOk("Password changed. Other devices are signed out."); }
    catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-3">
      <form onSubmit={password} className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
        <h3 className="text-sm font-bold">Change password</h3>
        <input type="password" autoComplete="current-password" placeholder="Current password" aria-label="Current password" value={cur} onChange={(e) => setCur(e.target.value)} className={field} />
        <input type="password" autoComplete="new-password" placeholder="New password (10 or more characters)" aria-label="New password" value={next} onChange={(e) => setNext(e.target.value)} className={field} />
        <button type="submit" disabled={!cur || !next || busy} className="flex w-full items-center justify-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? <Loader2 size={15} className="animate-spin" /> : null} Change password</button>
      </form>
      {err && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{err}</p>}
      {ok && <p role="status" className="flex items-center gap-2 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-700"><CheckCircle2 size={16} /> {ok}</p>}
      <button type="button" onClick={() => { logout(); onSignOut(); }} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow-sm"><LogOut size={16} /> Sign out</button>
    </div>
  );
}

/* ---------------- Profile (the picture and name; the password and sign-out are on the Dashboard) ---------------- */
export function ProfileTab({ me, onMe }: { me: OrgMe; onMe: (m: OrgMe) => void }) {
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  async function photo(file?: File) {
    if (!file) return;
    setErr("");
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return setErr("Choose a JPG, PNG or WebP picture.");
    if (file.size > 8 * 1024 * 1024) return setErr("The picture is too large (8 MB limit).");
    setBusy("photo");
    try {
      const image = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
      onMe({ ...me, avatar: await setAvatar(image) });
    } catch (e) { setErr(msg(e)); } finally { setBusy(""); }
  }
  return (
    <div className="space-y-3">
      <section className="flex flex-col items-center gap-3 rounded-2xl bg-surface p-6 text-center shadow-sm">
        <button type="button" onClick={() => picker.current?.click()} aria-label="Change profile picture" className="relative grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-header ring-4 ring-white shadow-lg">
          {me.avatar
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={me.avatar} alt="" className="h-full w-full object-cover" />
            : <span className="text-3xl font-bold text-white">{me.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</span>}
          <span className="absolute inset-x-0 bottom-0 grid place-items-center bg-black/45 py-1 text-white">{busy === "photo" ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}</span>
        </button>
        <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Choose profile picture" onChange={(e) => { void photo(e.target.files?.[0]); e.target.value = ""; }} />
        <div><h2 className="text-xl font-bold">{me.name}</h2><p className="text-sm text-muted">Unique Futsal ID: {me.email}</p></div>
        <p className="rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">Tournament Organizer</p>
      </section>

      {err && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{err}</p>}
      <p className="rounded-2xl bg-surface p-4 text-sm text-muted shadow-sm">To change your password or sign out, open Profile on the Dashboard.</p>
    </div>
  );
}

