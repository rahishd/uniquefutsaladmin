"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Loader2, Send, Square } from "lucide-react";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { askConfirm } from "@/lib/confirm";
import { Audiences, Campaign, Preview, listAudiences, listCampaigns, previewAudience, sendTest, startCampaign, stopCampaign } from "@/lib/sms";

const field = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";

// Ready-made starting points: staff pick one, then change the words. {name} becomes the customer's first name.
const IDEAS = [
  { label: "Festival wish", text: "Dear {name}, warm festival wishes from all of us at Unique Futsal. May your days be full of joy and good games!" },
  { label: "Special offer", text: "Hi {name}, this week only: 10% off any booking at Unique Futsal. Book now in the app!" },
  { label: "We miss you", text: "Hi {name}, we miss you on the pitch! Book a game this week and bring your team. - Unique Futsal" },
  { label: "Notice", text: "Dear {name}, Unique Futsal will be closed on [date] for [reason]. Sorry for any trouble." },
];

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kathmandu" });
const parts = (text: string) => Math.max(1, Math.ceil(text.length / (/[^\u0000-\u007F -ÿ]/.test(text) ? 70 : 160)));

export default function SendTab() {
  const [aud, setAud] = useState<Audiences | null>(null);
  const [audience, setAudience] = useState("all");
  const [numbers, setNumbers] = useState("");
  const [prev, setPrev] = useState<Preview | null>(null);
  const [text, setText] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const area = useRef<HTMLTextAreaElement>(null);

  const loadCampaigns = useCallback(() => { listCampaigns().then(setCampaigns).catch(() => undefined); }, []);

  useEffect(() => {
    listAudiences().then(setAud).catch((e) => setError(e instanceof Error ? e.message : "Could not load the groups"));
    loadCampaigns();
  }, [loadCampaigns]);

  // while a send is under way, watch it
  const sending = campaigns.find((c) => c.status === "sending");
  useEffect(() => {
    if (!sending) return;
    const t = setInterval(loadCampaigns, 2000);
    return () => clearInterval(t);
  }, [sending, loadCampaigns]);

  // how many people the chosen group is, right now (typing a list of numbers waits a moment)
  useEffect(() => {
    let live = true;
    const h = setTimeout(() => {
      previewAudience(audience, numbers).then((p) => { if (live) setPrev(p); }).catch(() => { if (live) setPrev(null); });
    }, audience === "numbers" ? 350 : 0);
    return () => { live = false; clearTimeout(h); };
  }, [audience, numbers]);

  const chosen = aud?.audiences.find((a) => a.key === audience);
  const maxLen = aud?.maxLength ?? 320;
  const example = text.replace(/\{name\}/g, prev?.sample[0]?.name ?? "Sita").trim();
  const count = prev?.count ?? 0;
  const tooLong = text.length > maxLen;
  const ready = !!aud?.configured && count > 0 && !prev?.tooMany && text.trim().length >= 5 && !tooLong && !sending;

  function insertName() {
    const el = area.current;
    if (!el) { setText((x) => x + "{name}"); return; }
    const a = el.selectionStart ?? text.length;
    const b = el.selectionEnd ?? text.length;
    setText(text.slice(0, a) + "{name}" + text.slice(b));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + 6, a + 6); });
  }

  async function test() {
    if (!guard("sms.send") || busy) return;
    setBusy("test"); setError(""); setNotice("");
    try {
      await sendTest(text, testPhone);
      setNotice(`A test text was sent to ${testPhone}. Check that phone.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not send the test");
    } finally { setBusy(""); }
  }

  async function sendAll() {
    if (!guard("sms.send") || busy || !ready) return;
    const who = audience === "numbers" ? `${count} number${count === 1 ? "" : "s"} you typed` : `${count} ${chosen?.label.toLowerCase() ?? "customers"}`;
    const ok = await askConfirm(`Send this message to ${who}?\n\n"${example}"\n\nAbout ${count * parts(example)} SMS will be sent from the venue phone. This cannot be undone, but you can stop it while it is sending.`, { title: "Send to everyone?", confirmLabel: `Send to ${count}`, danger: false });
    if (!ok) return;
    setBusy("send"); setError(""); setNotice("");
    try {
      await startCampaign({ audience, numbers, body: text, expected: count });
      setText("");
      loadCampaigns();
      setNotice("Sending has started. You can watch it below.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not start sending");
    } finally { setBusy(""); }
  }

  async function stop(c: Campaign) {
    if (!guard("sms.send")) return;
    if (!(await askConfirm("Stop sending? Messages already handed to the phone will still go out.", { confirmLabel: "Stop sending", danger: true }))) return;
    try { await stopCampaign(c.id); loadCampaigns(); } catch (e) { setError(e instanceof ApiError ? e.message : "Could not stop"); }
  }

  const num = (n: number, label: string) => `${n} ${label}${n === 1 ? "" : "s"}`;

  return (
    <div className="space-y-5">
      {aud && !aud.configured && (
        <p role="alert" className="flex items-start gap-2 rounded-2xl bg-amber-100 p-3 text-sm text-amber-900"><AlertTriangle size={18} className="mt-0.5 shrink-0" /> The SMS gateway is not set up on the admin server yet, so messages cannot be sent from here. Ask the developer to add the SMS settings (SMS_PROVIDER and the gateway login).</p>
      )}

      {sending && (
        <section className="rounded-2xl border border-brand/40 bg-brand/5 p-4" aria-live="polite">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 font-semibold"><Loader2 size={16} className="animate-spin text-brand" /> Sending to {sending.audienceLabel.toLowerCase()}…</p>
            <button type="button" onClick={() => void stop(sending)} className="inline-flex items-center gap-1.5 rounded-full border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600"><Square size={12} /> Stop</button>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-brand transition-all" style={{ width: `${Math.round(((sending.sent + sending.failed) / sending.total) * 100)}%` }} /></div>
          <p className="mt-2 text-xs text-muted">{sending.sent + sending.failed} of {sending.total} handled · {sending.sent} sent{sending.failed > 0 ? ` · ${sending.failed} failed` : ""}</p>
        </section>
      )}

      {/* 1 */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="flex items-center gap-2 font-semibold"><span className="grid h-6 w-6 place-items-center rounded-full bg-brand text-xs text-white">1</span> Who should get it?</h2>
        {!aud && !error && <p className="py-6 text-center text-sm text-muted">Loading…</p>}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {aud?.audiences.map((a) => {
            const on = audience === a.key;
            return (
              <button key={a.key} type="button" onClick={() => setAudience(a.key)} aria-pressed={on} className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${on ? "border-brand bg-brand/5 ring-1 ring-brand" : "border-line hover:bg-line/30"}`}>
                <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${on ? "border-brand bg-brand text-white" : "border-line"}`}>{on && <Check size={12} />}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2"><span className="font-semibold">{a.label}</span>{a.count !== null && <span className="rounded-full bg-line/60 px-2 py-0.5 text-xs font-semibold tabular-nums">{a.count}</span>}</span>
                  <span className="block text-xs text-muted">{a.description}</span>
                </span>
              </button>
            );
          })}
        </div>
        {audience === "numbers" && (
          <div className="mt-3">
            <textarea className={`${field} min-h-24`} value={numbers} onChange={(e) => setNumbers(e.target.value)} placeholder={"One number per line, or separated by commas\n9801234567\n9812345678"} aria-label="Mobile numbers" />
          </div>
        )}
        {prev && (
          <p className="mt-3 text-sm text-muted">
            {count === 0 ? "Nobody in this group." : <>This will go to <b>{num(count, audience === "numbers" ? "number" : "person")}</b>{prev.sample.length > 0 && <> (for example {prev.sample.map((s) => s.name).join(", ")})</>}.</>}
            {prev.optedOut > 0 && <> {num(prev.optedOut, "customer")} left out because they turned off promotional messages.</>}
            {prev.invalid > 0 && <span className="text-amber-700"> {num(prev.invalid, "entry")} ignored: not a valid mobile number.</span>}
            {prev.tooMany && <span className="font-semibold text-red-600"> That is more than {aud?.max} people: pick a smaller group.</span>}
          </p>
        )}
      </section>

      {/* 2 */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="flex items-center gap-2 font-semibold"><span className="grid h-6 w-6 place-items-center rounded-full bg-brand text-xs text-white">2</span> Write your message</h2>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="self-center text-xs text-muted">Start from:</span>
          {IDEAS.map((i) => <button key={i.label} type="button" onClick={() => setText(i.text)} className="rounded-full border border-line px-3 py-1 text-xs font-medium hover:bg-line/40">{i.label}</button>)}
        </div>
        <textarea ref={area} className={`${field} mt-3 min-h-28 resize-y`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your message here…" aria-label="Message" />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={insertName} className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-brand hover:bg-brand/5" title="Becomes each customer's first name">+ Add customer name</button>
          <span className={`text-xs ${tooLong ? "font-semibold text-red-600" : "text-muted"}`}>{text.length} / {maxLen} characters · about {parts(example || " ")} SMS each</span>
        </div>
        {text.trim() && (
          <div className="mt-3 rounded-xl bg-line/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">How it will look</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{example}</p>
          </div>
        )}
      </section>

      {/* 3 */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="flex items-center gap-2 font-semibold"><span className="grid h-6 w-6 place-items-center rounded-full bg-brand text-xs text-white">3</span> Check and send</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input className={field} value={testPhone} inputMode="numeric" onChange={(e) => setTestPhone(e.target.value.replace(/[^\d+ ]/g, "").slice(0, 16))} placeholder="Your mobile number, to try it first" aria-label="Your mobile number for a test" />
          <button type="button" onClick={() => void test()} disabled={busy !== "" || !aud?.configured || text.trim().length < 5 || tooLong || testPhone.replace(/\D/g, "").length < 10} className="shrink-0 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold disabled:opacity-40">{busy === "test" ? "Sending…" : "Send me a test"}</button>
        </div>
        {error && <p role="alert" className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
        {notice && <p role="status" className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-700"><CheckCircle2 size={16} /> {notice}</p>}
        <button type="button" onClick={() => void sendAll()} disabled={!ready || busy !== ""} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-3.5 text-base font-semibold text-white disabled:opacity-40">
          <Send size={18} /> {busy === "send" ? "Starting…" : count > 0 ? `Send to ${num(count, audience === "numbers" ? "number" : "person")}` : "Send"}
        </button>
        <p className="mt-2 text-center text-xs text-muted">You will be asked to confirm before anything is sent.</p>
      </section>

      {campaigns.length > 0 && (
        <section aria-label="Recent mass messages">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Recently sent in bulk</h2>
          <ul className="space-y-2">
            {campaigns.map((c) => (
              <li key={c.id} className="rounded-2xl border border-line bg-surface p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="line-clamp-2 min-w-0 flex-1 text-sm">{c.body}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.status === "done" ? "bg-emerald-100 text-emerald-700" : c.status === "sending" ? "bg-brand/10 text-brand" : "bg-amber-100 text-amber-800"}`}>{c.status === "done" ? "Finished" : c.status === "sending" ? "Sending" : "Stopped"}</span>
                </div>
                <p className="mt-1.5 text-xs text-muted">{c.audienceLabel} · {c.sent} sent{c.failed > 0 ? ` · ${c.failed} failed` : ""} of {c.total} · {when(c.createdAt)} · by {c.createdByName}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
