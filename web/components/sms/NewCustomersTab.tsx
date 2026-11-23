"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, KeyRound, Loader2, Send } from "lucide-react";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { NewCustomer, NewCustomers, SmsTemplate, listNewCustomers, listTemplates, sendLoginDetails } from "@/lib/sms";

const field = "rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand";
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kathmandu" });

function ago(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
  return d <= 0 ? "Today" : d === 1 ? "Yesterday" : `${d} days ago`;
}

export default function NewCustomersTab() {
  const [days, setDays] = useState(14);
  const [data, setData] = useState<NewCustomers | null>(null);
  const [tpl, setTpl] = useState<SmsTemplate | null>(null);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    listNewCustomers(days).then((d) => { setData(d); setError(""); }).catch((e) => setError(e instanceof Error ? e.message : "Could not load new customers"));
  }, [days]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { listTemplates().then((l) => setTpl(l.find((t) => t.key === "login_details") ?? null)).catch(() => undefined); }, []);

  const toggle = (p: string) => setPick((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; });
  const notSent = data?.items.filter((c) => c.active && !c.detailsSentAt) ?? [];

  async function send(phones: string[], label: string) {
    if (!guard("sms.send") || busy || phones.length === 0) return;
    setBusy(label); setError(""); setNotice("");
    try {
      const r = await sendLoginDetails(phones);
      setNotice(r.failed ? `Sent to ${r.sent}. ${r.failed} could not be sent: ${r.results.find((x) => !x.ok)?.error ?? "see Sent messages"}.` : `Login details sent to ${r.sent} customer${r.sent === 1 ? "" : "s"}.`);
      setPick(new Set());
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not send");
    } finally { setBusy(""); }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-brand/5 p-4 text-sm">
        <p className="flex items-center gap-2 font-semibold"><KeyRound size={16} className="text-brand" /> What the customer receives</p>
        <p className="mt-1.5 text-muted">{tpl ? tpl.preview : "A welcome text with their mobile number, the app address, and how to sign in."}</p>
        <p className="mt-2 text-xs text-muted">Passwords are never sent by SMS: they are stored scrambled and nobody can read them back. The customer signs in with their own password, or taps <b>Continue with OTP</b> to get a code by SMS. You can change this wording in the Message wording tab.</p>
      </div>

      {data && !data.configured && (
        <p role="alert" className="flex items-start gap-2 rounded-2xl bg-amber-100 p-3 text-sm text-amber-900"><AlertTriangle size={18} className="mt-0.5 shrink-0" /> The SMS gateway is not set up on the admin server yet, so nothing can be sent from here.</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-muted">Registered in the last
          <select className={field} value={days} onChange={(e) => { setDays(Number(e.target.value)); setPick(new Set()); }} aria-label="Period">
            {[3, 7, 14, 30, 60].map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={notSent.length === 0} onClick={() => setPick(new Set(notSent.map((c) => c.phone)))} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-40">Select all not yet sent ({notSent.length})</button>
          <button type="button" disabled={pick.size === 0 || busy !== "" || !data?.configured} onClick={() => void send([...pick], "selected")} className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
            {busy === "selected" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send login details ({pick.size})
          </button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
      {notice && <p role="status" className="flex items-center gap-2 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-700"><CheckCircle2 size={16} /> {notice}</p>}
      {!data && !error && <p className="py-10 text-center text-sm text-muted">Loading…</p>}

      {data && (data.items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">No one has registered in the last {days} days.</p>
      ) : (
        <ul className="space-y-2">
          {data.items.map((c: NewCustomer) => {
            const on = pick.has(c.phone);
            return (
              <li key={c.phone} className={`flex items-center gap-3 rounded-2xl border bg-surface p-3 ${on ? "border-brand ring-1 ring-brand" : "border-line"}`}>
                <button type="button" onClick={() => toggle(c.phone)} aria-pressed={on} aria-label={`Select ${c.name ?? c.phone}`} disabled={!c.active} className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border ${on ? "border-brand bg-brand text-white" : "border-line"} disabled:opacity-30`}>{on && <Check size={14} />}</button>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{c.name || "Customer"} {!c.active && <span className="ml-1 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Suspended</span>}</p>
                  <p className="text-xs text-muted"><span className="tabular-nums">{c.phone}</span> · registered {ago(c.createdAt)}</p>
                </div>
                {c.detailsSentAt
                  ? <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Sent {day(c.detailsSentAt)}</span>
                  : <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">Not sent</span>}
                <button type="button" disabled={!c.active || busy !== "" || !data.configured} onClick={() => void send([c.phone], c.phone)} className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-40">
                  {busy === c.phone ? "Sending…" : c.detailsSentAt ? "Send again" : "Send"}
                </button>
              </li>
            );
          })}
        </ul>
      ))}
    </div>
  );
}
