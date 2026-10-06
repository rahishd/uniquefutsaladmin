"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Eye, EyeOff, Settings as Cog, XCircle } from "lucide-react";
import { ApiError } from "@/lib/api";
import Switch from "../Switch";
import { guard } from "@/lib/access";
import { SettingsData, Venue, changePassword, getSettings, saveBooking, saveVenue, saveWifi } from "@/lib/settings";

const input = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand disabled:opacity-60";
const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-surface p-4 shadow-sm lg:p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      {hint && <p className="mb-3 text-sm text-muted">{hint}</p>}
      <div className={hint ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

// A Save button that shows what happened
function SaveRow({ busy, saved, error, disabled, label = "Save" }: { busy: boolean; saved: boolean; error: string; disabled?: boolean; label?: string }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button type="submit" disabled={busy || disabled} className="rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : label}</button>
      {saved && <span className="flex items-center gap-1 text-sm font-semibold text-brand"><CheckCircle2 size={16} /> Saved</span>}
      {error && <span className="text-sm text-red-600" role="alert">{error}</span>}
    </div>
  );
}

function useSave<T>(fn: (v: T) => Promise<unknown>, permission: string) {
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  async function run(v: T) {
    if (!guard(permission)) return;
    setBusy(true); setSaved(false); setError("");
    try { await fn(v); setSaved(true); } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  }
  return { busy, saved, error, run, reset: () => { setSaved(false); setError(""); } };
}

function VenueCard({ initial, canEdit }: { initial: Venue; canEdit: boolean }) {
  const [v, setV] = useState(initial);
  const s = useSave(saveVenue, "settings.edit");
  const set = (k: keyof Venue, val: string) => { setV((x) => ({ ...x, [k]: val })); s.reset(); };
  const field = (k: keyof Venue, label: string, ph = "", type = "text") => (
    <label className="block text-sm font-medium">{label}<input type={type} className={`${input} mt-1`} value={v[k]} placeholder={ph} disabled={!canEdit} onChange={(e) => set(k, e.target.value)} /></label>
  );
  return (
    <Card title="Venue details" hint="Shown to customers in the app: the footer, the Help page and the WhatsApp and Call buttons.">
      <form onSubmit={(e) => { e.preventDefault(); s.run(v); }}>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("name", "Venue name")}
          {field("phone", "Phone number", "98XXXXXXXX", "tel")}
          {field("whatsapp", "WhatsApp link", "https://wa.me/9779811940018")}
          {field("email", "Email", "", "email")}
          <div className="sm:col-span-2">{field("address", "Address")}</div>
          {field("facebook", "Facebook page link", "https://facebook.com/…")}
          {field("tiktok", "TikTok link", "https://tiktok.com/@…")}
          <div className="sm:col-span-2">{field("mapEmbed", "Map link (shown in the footer)", "https://www.google.com/maps?…&output=embed")}</div>
        </div>
        {canEdit && <SaveRow busy={s.busy} saved={s.saved} error={s.error} />}
      </form>
    </Card>
  );
}

function WifiCard({ initial, canEdit }: { initial: { ssid: string; password: string; visible: boolean; access: "booked" | "all" }; canEdit: boolean }) {
  const [w, setW] = useState(initial);
  const [show, setShow] = useState(false);
  const s = useSave(saveWifi, "settings.edit");
  return (
    <Card title="Venue Wi-Fi" hint="The name and password signed-in customers see when they tap the Wi-Fi button in the app. Turn the switch off to hide the button, or leave the name empty.">
      <form onSubmit={(e) => { e.preventDefault(); s.run(w); }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">Wi-Fi name<input className={`${input} mt-1`} value={w.ssid} maxLength={32} disabled={!canEdit} onChange={(e) => { setW({ ...w, ssid: e.target.value }); s.reset(); }} /></label>
          <label className="block text-sm font-medium">Password
            <span className="relative mt-1 block">
              <input type={show ? "text" : "password"} className={`${input} pr-11`} value={w.password} maxLength={63} disabled={!canEdit} autoComplete="off" onChange={(e) => { setW({ ...w, password: e.target.value }); s.reset(); }} />
              <button type="button" onClick={() => setShow((x) => !x)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </span>
          </label>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-surface-2 p-3">
          <span className="text-sm font-medium">Show the Wi-Fi button in the customer app<span className="block text-xs font-normal text-muted">{w.visible ? "Customers can see the name and password." : "The button is hidden."}</span></span>
          <Switch on={w.visible} label="Show the Wi-Fi button in the customer app" disabled={!canEdit} onChange={() => { setW({ ...w, visible: !w.visible }); s.reset(); }} />
        </div>
        <label className="mt-3 block text-sm font-medium">Who can see the password
          <select className={`${input} mt-1`} value={w.access} disabled={!canEdit || !w.visible} onChange={(e) => { setW({ ...w, access: e.target.value as "booked" | "all" }); s.reset(); }}>
            <option value="booked">Only customers at the venue (booked game, Gamezone or membership from 1 hour before to 30 minutes after)</option>
            <option value="all">Every signed-in customer, any time</option>
          </select>
        </label>
        {canEdit && <SaveRow busy={s.busy} saved={s.saved} error={s.error} />}
      </form>
    </Card>
  );
}

function BookingCard({ initial, canEdit }: { initial: number; canEdit: boolean }) {
  const [d, setD] = useState(String(initial));
  const s = useSave(saveBooking, "settings.edit");
  const n = d === "" ? NaN : Number(d);
  return (
    <Card title="Booking deposit" hint="The advance a customer pays when they book and choose to pay at the venue. Rs. 0 means no advance is asked.">
      <form onSubmit={(e) => { e.preventDefault(); if (Number.isInteger(n)) s.run({ advanceDeposit: n }); }}>
        <label className="block max-w-xs text-sm font-medium">Advance deposit (Rs.)
          <input inputMode="numeric" className={`${input} mt-1`} value={d} disabled={!canEdit} onChange={(e) => { setD(e.target.value.replace(/\D/g, "").slice(0, 6)); s.reset(); }} />
        </label>
        <p className="mt-2 text-xs text-muted">Court prices and hours are set in Courts &amp; Pricing, and promo codes in Promo Codes.</p>
        {canEdit && <SaveRow busy={s.busy} saved={s.saved} error={s.error} disabled={!Number.isInteger(n)} />}
      </form>
    </Card>
  );
}

function Status({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-3 py-3">
      {ok ? <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-brand" /> : <XCircle size={20} className="mt-0.5 shrink-0 text-amber-600" />}
      <span className="min-w-0"><span className="block text-sm font-semibold">{label}</span><span className="block text-xs text-muted">{detail}</span></span>
    </li>
  );
}

function PasswordCard() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const s = useSave(async ({ c, n }: { c: string; n: string }) => { await changePassword(c, n); setCur(""); setNext(""); setAgain(""); }, "dashboard.view");
  const bad = next.length > 0 && (next.length < 10 ? "Use at least 10 characters" : again && next !== again ? "The two new passwords are different" : "");
  return (
    <Card title="My password" hint="Change the password you sign in with. Use at least 10 characters.">
      <form onSubmit={(e) => { e.preventDefault(); if (!bad && next && next === again) s.run({ c: cur, n: next }); }}>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm font-medium">Current password<input type="password" autoComplete="current-password" className={`${input} mt-1`} value={cur} onChange={(e) => { setCur(e.target.value); s.reset(); }} /></label>
          <label className="block text-sm font-medium">New password<input type="password" autoComplete="new-password" className={`${input} mt-1`} value={next} onChange={(e) => { setNext(e.target.value); s.reset(); }} /></label>
          <label className="block text-sm font-medium">New password again<input type="password" autoComplete="new-password" className={`${input} mt-1`} value={again} onChange={(e) => { setAgain(e.target.value); s.reset(); }} /></label>
        </div>
        {bad && <p className="mt-2 text-xs text-red-600">{bad}</p>}
        <SaveRow busy={s.busy} saved={s.saved} error={s.error} disabled={!cur || !next || next !== again || !!bad} label="Change password" />
      </form>
    </Card>
  );
}

export default function SettingsPage() {
  const [d, setD] = useState<SettingsData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { getSettings().then(setD).catch((e) => setError(msg(e))); }, []);

  return (
    <div className="w-full space-y-4 lg:space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Cog className="text-brand" /> Settings</h1>
        <p className="text-sm text-muted">Venue details, Wi-Fi, the booking deposit and the state of the connected services. Changes show in the customer app and are recorded in the Audit Log.</p>
      </div>
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!d && !error && <p className="py-10 text-center text-sm text-muted">Loading…</p>}
      {d && (
        <>
          {!d.canEdit && <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800">You can look at the settings but not change them.</p>}
          <VenueCard initial={d.venue} canEdit={d.canEdit} />
          <div className="grid items-start gap-4 lg:grid-cols-2 lg:gap-5">
            <WifiCard initial={d.wifi} canEdit={d.canEdit} />
            <BookingCard initial={d.booking.advanceDeposit} canEdit={d.canEdit} />
          </div>
          <Card title="Connected services" hint="Read only. Keys and secrets are set on the server and are never shown here.">
            <ul className="divide-y divide-line">
              <Status ok={d.integrations.fonepay.mode === "live" && d.integrations.fonepay.configured} label={`Fonepay payments: ${d.integrations.fonepay.mode === "live" ? "live" : "test mode"}`}
                detail={d.integrations.fonepay.mode === "live" ? (d.integrations.fonepay.configured ? "Real QR codes are made and payments are checked with Fonepay." : "Live mode is on but the merchant code, secret or URL is missing.") : d.integrations.fonepay.note} />
              <Status ok={d.integrations.push.configured} label="Push notifications to customers' phones" detail={d.integrations.push.configured ? "Ready. Notices also reach installed apps." : "Not set up. Notices only appear inside the app until the push keys are added on the server."} />
              <Status ok={d.integrations.database} label="Database" detail={d.integrations.database ? "Connected." : "Not reachable."} />
              <Status ok={d.integrations.environment === "production"} label={`Environment: ${d.integrations.environment}`} detail={d.integrations.environment === "production" ? "This is the real venue system." : "This is a development copy: do not use it for real customers."} />
            </ul>
          </Card>
        </>
      )}
      <PasswordCard />
    </div>
  );
}
