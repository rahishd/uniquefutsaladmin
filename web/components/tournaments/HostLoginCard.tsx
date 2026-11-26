"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, MessageSquare, RefreshCw, ShieldOff } from "lucide-react";
import { Badge } from "../bookings/Badge";
import { guard } from "@/lib/access";
import { ApiError } from "@/lib/api";
import { waNumber } from "@/lib/branded-pdf";
import { copyText } from "@/lib/vip";
import { askConfirm } from "@/lib/confirm";
import { HostLoginInfo, getHostLogin, nepalTime, organizerUrl, setHostLogin, smsHostLogin, switchOffHostLogin } from "@/lib/tournaments";

const field = "rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const randomPin = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, "0");

// The host's own login: ID = the host's contact number, PIN = 4 digits chosen here. It opens the Tournament Organizer app, where the host
// sees the teams, the tie-sheet and the bill (paid and still to pay) of every tournament registered with that number.
export default function HostLoginCard({ tournamentId, name }: { tournamentId: string; name: string }) {
  const [info, setInfo] = useState<HostLoginInfo | null>(null);
  const [pin, setPin] = useState("");
  const [shared, setShared] = useState<string | null>(null); // the PIN just set: shown once so it can be sent
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState("");

  const load = useCallback(() => {
    getHostLogin(tournamentId).then((d) => { setInfo(d); setError(""); }).catch((e) => setError(e instanceof ApiError ? e.message : "Could not load the host login"));
  }, [tournamentId]);
  useEffect(() => { load(); }, [load]);

  const account = info?.account;
  const exists = !!account && account.exists && account.isOrganizer;
  const active = !!account && account.exists && account.isOrganizer && account.active;

  async function save() {
    if (!guard("tournaments.share")) return;
    if (!/^\d{4}$/.test(pin)) return setError("The PIN must be exactly 4 digits.");
    if (exists && !(await askConfirm("Set a new PIN? The old PIN stops working at once, so send the new one to the host."))) return;
    setBusy("save"); setError(""); setNote("");
    try { await setHostLogin(tournamentId, pin); setShared(pin); setPin(""); setNote("Host login is ready. Send the details to the host."); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Could not save"); } finally { setBusy(""); }
  }
  async function off() {
    if (!guard("tournaments.share") || !(await askConfirm("Switch the host login off? The host can no longer sign in until you set a new PIN."))) return;
    setBusy("off"); setError(""); setNote("");
    try { await switchOffHostLogin(tournamentId); setShared(null); load(); } catch (e) { setError(e instanceof ApiError ? e.message : "Could not switch it off"); } finally { setBusy(""); }
  }
  async function sms() {
    if (!shared) return;
    setBusy("sms"); setError(""); setNote("");
    try { await smsHostLogin(tournamentId, shared, window.location.origin); setNote("Sent by SMS."); } catch (e) { setError(e instanceof ApiError ? e.message : "The text was not sent"); } finally { setBusy(""); }
  }

  const phone = info?.phone ?? "";
  const details = shared ? `Unique Futsal Tournament Host Portal\nID: ${phone}\nPIN: ${shared}\nSign in: ${organizerUrl()}` : "";
  const copy = async (what: string, text: string) => { if (await copyText(text)) { setCopied(what); setTimeout(() => setCopied(""), 1500); } };

  return (
    <section aria-label="Host login" className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand/10 text-brand"><KeyRound size={18} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Host login (ID and PIN)</h2>
          <p className="text-sm text-muted">The host signs in to the Tournament Organizer app with their contact number as the ID and the 4-digit PIN you set. One login holds every tournament registered with that number: teams, tie-sheet and the bill, paid and still to pay.</p>
        </div>
        {info?.available && <Badge tone={active ? "bg-brand/15 text-brand" : "bg-surface-2 text-muted"}>{!exists ? "No login yet" : active ? "On" : "Off"}</Badge>}
      </div>

      {!info && !error && <p className="py-2 text-center text-sm text-muted">Loading…</p>}
      {info && !info.available && <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">This tournament has no host contact number (a 10-digit mobile number), so there is no login ID to make. Register the tournament with the host&apos;s number.</p>}

      {info?.available && (
        <>
          <div className="grid gap-2 rounded-xl bg-surface-2 p-3 text-sm sm:grid-cols-2">
            <div><p className="text-xs text-muted">Login ID (host contact number)</p><p className="font-mono text-base font-semibold">{phone}</p></div>
            <div>
              <p className="text-xs text-muted">{info.hostName ? `Host: ${info.hostName}` : "Host"}</p>
              <p className="text-xs text-muted">{account && account.exists ? `${account.tournaments} tournament${account.tournaments === 1 ? "" : "s"} on this login. ${account.lastLoginAt ? `Last signed in ${nepalTime(account.lastLoginAt)}.` : "Not signed in yet."}` : "No login made yet."}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm font-medium">4-digit PIN
              <input inputMode="numeric" autoComplete="off" value={pin} maxLength={4} onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setError(""); }} placeholder="1234" className={`${field} w-24 text-center font-mono tracking-[0.3em]`} />
            </label>
            <button type="button" onClick={() => setPin(randomPin())} className="flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-2 text-sm font-semibold"><RefreshCw size={14} /> Make one</button>
            <button type="button" disabled={busy !== "" || pin.length !== 4} onClick={save} className="flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><KeyRound size={15} /> {busy === "save" ? "Saving…" : exists ? "Set new PIN" : "Create host login"}</button>
            {active && <button type="button" disabled={busy !== ""} onClick={off} className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-red-600 disabled:opacity-60"><ShieldOff size={14} /> Switch off</button>}
          </div>
          <p className="text-xs text-muted">Four digits are easy to guess, so after 5 wrong tries the login waits 15 minutes. The PIN is shown only right after you set it.</p>

          {shared && (
            <div className="space-y-2 rounded-xl border border-brand/30 bg-brand/5 p-3">
              <p className="text-sm font-semibold">Send to the host for {name}</p>
              <pre className="whitespace-pre-wrap rounded-lg bg-surface p-2 text-xs">{details}</pre>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => copy("all", details)} className="flex items-center gap-1.5 rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold">{copied === "all" ? <Check size={14} /> : <Copy size={14} />} {copied === "all" ? "Copied" : "Copy"}</button>
                <button type="button" disabled={busy !== ""} onClick={sms} className="flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"><MessageSquare size={14} /> {busy === "sms" ? "Sending…" : "Send by SMS"}</button>
                <a href={`https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(details)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-full bg-[#25D366] px-4 py-2 text-sm font-semibold text-white">Send on WhatsApp</a>
              </div>
            </div>
          )}
        </>
      )}

      {note && <p role="status" className="rounded-xl bg-brand/10 p-3 text-sm font-medium text-brand">{note}</p>}
      {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
    </section>
  );
}
