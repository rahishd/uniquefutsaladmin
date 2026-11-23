"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, MessageSquareText, RotateCcw, Search, Send } from "lucide-react";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { askConfirm } from "@/lib/confirm";
import SendTab from "@/components/sms/SendTab";
import NewCustomersTab from "@/components/sms/NewCustomersTab";
import { SmsFilters, SmsLogs, SmsTemplate, listSms, listTemplates, resetTemplate, saveTemplate } from "@/lib/sms";

const field = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const EMPTY: SmsFilters = { q: "", kind: "", status: "", from: "", to: "", page: 1 };

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kathmandu" });

const KIND_COLOR: Record<string, string> = {
  booking_confirmed: "bg-emerald-100 text-emerald-700", booking_requested: "bg-amber-100 text-amber-700", booking_cancelled: "bg-rose-100 text-rose-700",
  otp: "bg-indigo-100 text-indigo-700", reminder: "bg-sky-100 text-sky-700", staff_alert: "bg-slate-200 text-slate-700",
};

export default function SmsPage() {
  const [tab, setTab] = useState<"send" | "new" | "sent" | "wording">("send");
  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 p-4 lg:p-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><MessageSquareText size={24} className="text-brand" /> SMS messages</h1>
        <p className="mt-1 text-sm text-muted">Send a message to many customers at once, share login details with new customers, see every text that was sent, and change the wording of booking and OTP messages.</p>
      </div>
      <div role="tablist" aria-label="SMS" className="grid grid-cols-2 gap-1 rounded-2xl bg-line/40 p-1 text-sm font-semibold sm:grid-cols-4">
        {([["send", "Send a message"], ["new", "New customers"], ["sent", "Sent messages"], ["wording", "Message wording"]] as const).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-xl px-2 py-2.5 transition ${tab === k ? "bg-surface shadow-sm" : "text-muted"}`}>{label}</button>
        ))}
      </div>
      {tab === "send" ? <SendTab /> : tab === "new" ? <NewCustomersTab /> : tab === "sent" ? <Sent /> : <Wording />}
    </div>
  );
}

function Sent() {
  const [f, setF] = useState<SmsFilters>(EMPTY);
  const [data, setData] = useState<SmsLogs | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback((x: SmsFilters) => {
    const n = ++seq.current;
    listSms(x).then((d) => { if (n === seq.current) { setData(d); setError(""); } }).catch((e) => { if (n === seq.current) setError(e instanceof Error ? e.message : "Could not load messages"); });
  }, []);

  // the list follows the filters (typing waits a moment) and refreshes itself every 30 seconds
  useEffect(() => {
    const h = setTimeout(() => load(f), f.q ? 300 : 0);
    return () => clearTimeout(h);
  }, [f, load]);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") load(f); }, 30_000);
    return () => clearInterval(t);
  }, [f, load]);

  const set = (patch: Partial<SmsFilters>) => setF((x) => ({ ...x, page: 1, ...patch }));
  const filtered = f.q || f.kind || f.status || f.from || f.to;

  return (
    <div className="space-y-4">
      {data && (
        <div className="grid grid-cols-3 gap-3">
          {[["Last 24 hours", data.stats.last24, ""], ["Last 7 days", data.stats.week, ""], ["Failed (7 days)", data.stats.failedWeek, data.stats.failedWeek > 0 ? "text-red-600" : ""]].map(([label, n, cls]) => (
            <div key={label as string} className="rounded-2xl border border-line bg-surface p-3 text-center">
              <p className={`text-2xl font-bold tabular-nums ${cls}`}>{n}</p>
              <p className="text-xs text-muted">{label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2 rounded-2xl border border-line bg-surface p-3">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className={`${field} pl-9`} value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search name, mobile number, booking code or words in the message" aria-label="Search messages" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <select className={field} value={f.kind} onChange={(e) => set({ kind: e.target.value })} aria-label="Type of message">
            <option value="">All types</option>
            {data?.kinds.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
          <select className={field} value={f.status} onChange={(e) => set({ status: e.target.value })} aria-label="Result">
            <option value="">Any result</option>
            <option value="queued">Sent to the gateway</option>
            <option value="failed">Failed</option>
          </select>
          <input type="date" className={field} value={f.from} onChange={(e) => set({ from: e.target.value })} aria-label="From date" />
          <input type="date" className={field} value={f.to} onChange={(e) => set({ to: e.target.value })} aria-label="To date" />
        </div>
        {filtered && <button type="button" onClick={() => setF(EMPTY)} className="text-xs font-semibold text-brand">Clear filters</button>}
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
      {!data && !error && <p className="py-10 text-center text-sm text-muted">Loading…</p>}

      {data && (data.items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">{filtered ? "No messages match these filters." : "No messages have been sent yet."}</p>
      ) : (
        <ul className="space-y-2">
          {data.items.map((m) => {
            const isOpen = open === m.id;
            return (
              <li key={m.id} className={`rounded-2xl border bg-surface ${m.status === "failed" ? "border-red-300" : "border-line"}`}>
                <button type="button" onClick={() => setOpen(isOpen ? null : m.id)} aria-expanded={isOpen} className="flex w-full items-start gap-3 p-3 text-left">
                  <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${m.status === "failed" ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-700"}`}>
                    {m.status === "failed" ? <AlertTriangle size={15} /> : <Send size={15} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold">{m.recipientName || "Customer"}</span>
                      <span className="text-sm tabular-nums text-muted">{m.phoneNumber}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${KIND_COLOR[m.kind] ?? "bg-slate-100 text-slate-600"}`}>{m.kindLabel}</span>
                      {m.bookingCode && <span className="text-xs text-muted">{m.bookingCode}</span>}
                    </span>
                    <span className={`mt-1 block text-sm text-muted ${isOpen ? "" : "line-clamp-1"}`}>{m.message}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-muted">
                    <span className="block">{when(m.createdAt)}</span>
                    <span className={`block font-semibold ${m.status === "failed" ? "text-red-600" : "text-emerald-700"}`}>{m.status === "failed" ? "Failed" : "Sent"}</span>
                  </span>
                </button>
                {isOpen && (
                  <div className="space-y-1 border-t border-line px-3 pb-3 pt-2 text-xs text-muted">
                    {m.error && <p className="font-semibold text-red-600">Why it failed: {m.error}</p>}
                    <p>Sent through: {m.provider === "android" ? "the venue phone (SMS Gateway for Android)" : "Sparrow SMS"}. &quot;Sent&quot; means the gateway took the text; it does not prove the phone received it.</p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ))}

      {data && data.pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <button type="button" disabled={f.page <= 1} onClick={() => setF((x) => ({ ...x, page: x.page - 1 }))} className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 disabled:opacity-40"><ChevronLeft size={14} /> Newer</button>
          <span className="text-muted">Page {data.page} of {data.pages} · {data.total} messages</span>
          <button type="button" disabled={f.page >= data.pages} onClick={() => setF((x) => ({ ...x, page: x.page + 1 }))} className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 disabled:opacity-40">Older <ChevronRight size={14} /></button>
        </div>
      )}
    </div>
  );
}

function Wording() {
  const [list, setList] = useState<SmsTemplate[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    listTemplates().then(setList).catch((e) => setError(e instanceof Error ? e.message : "Could not load the wording"));
  }, []);

  const replace = (t: SmsTemplate) => setList((l) => l && l.map((x) => (x.key === t.key ? t : x)));

  return (
    <div className="space-y-4">
      <p className="rounded-2xl bg-brand/5 p-3 text-sm text-muted">Write the message as the customer should read it. Tap a {"{placeholder}"} to add it; it is filled in for each customer. New texts use your wording within a minute. Short texts cost less: aim for under 160 characters.</p>
      {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
      {!list && !error && <p className="py-10 text-center text-sm text-muted">Loading…</p>}
      {list?.map((t) => <TemplateCard key={t.key} t={t} onChange={replace} />)}
    </div>
  );
}

function TemplateCard({ t, onChange }: { t: SmsTemplate; onChange: (t: SmsTemplate) => void }) {
  const [text, setText] = useState(t.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const dirty = text.trim() !== t.body;

  // the preview follows what is typed
  const preview = text.replace(/\{(\w+)\}/g, (whole, n: string) => t.placeholders.find((p) => p.name === n)?.sample ?? whole).replace(/ {2,}/g, " ").trim();
  const long = text.length > t.maxLength;
  const parts = Math.max(1, Math.ceil(preview.length / 160));

  function insert(name: string) {
    const el = area.current;
    const tag = `{${name}}`;
    if (!el) { setText((x) => x + tag); return; }
    const a = el.selectionStart ?? text.length;
    const b = el.selectionEnd ?? text.length;
    setText(text.slice(0, a) + tag + text.slice(b));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + tag.length, a + tag.length); });
  }

  async function save() {
    if (!guard("sms.manage") || busy) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const r = await saveTemplate(t.key, text);
      onChange(r);
      setText(r.body);
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!guard("sms.manage") || busy) return;
    if (!(await askConfirm(`Go back to the standard wording for "${t.label}"?`, { confirmLabel: "Reset" }))) return;
    setBusy(true);
    setError("");
    try {
      const r = await resetTemplate(t.key);
      onChange(r);
      setText(r.body);
      setSaved(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not reset");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{t.label} {t.custom && <span className="ml-1 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">Customised</span>}</h2>
          <p className="mt-0.5 text-xs text-muted">{t.when}</p>
        </div>
        {t.custom && (
          <button type="button" onClick={() => void reset()} disabled={busy} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted disabled:opacity-50"><RotateCcw size={12} /> Standard wording</button>
        )}
      </div>

      <textarea ref={area} value={text} onChange={(e) => { setText(e.target.value); setSaved(false); }} rows={4} className={`${field} mt-3 resize-y`} aria-label={`${t.label} wording`} />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {t.placeholders.map((p) => (
          <button key={p.name} type="button" onClick={() => insert(p.name)} title={`${p.meaning}, for example: ${p.sample.trim()}`} className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-brand hover:bg-brand/5">{`{${p.name}}`}</button>
        ))}
      </div>

      <div className="mt-3 rounded-xl bg-line/40 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">What the customer reads (example)</p>
        <p className="mt-1 text-sm">{preview || "…"}</p>
        <p className={`mt-1 text-xs ${long ? "font-semibold text-red-600" : "text-muted"}`}>{text.length} / {t.maxLength} characters · about {parts} SMS{parts > 1 ? "es" : ""}</p>
      </div>

      {error && <p role="alert" className="mt-2 rounded-xl bg-red-500/10 p-2.5 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex items-center justify-end gap-3">
        {saved && !dirty && <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><Check size={14} /> Saved</span>}
        <button type="button" onClick={() => void save()} disabled={!dirty || busy || long || text.trim().length < 5} className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Saving…" : "Save wording"}</button>
      </div>
    </section>
  );
}
