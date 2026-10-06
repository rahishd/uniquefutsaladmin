"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, GraduationCap, HeartPulse, Phone, Plus, Search, X } from "lucide-react";
import { Badge } from "../bookings/Badge";
import Switch from "../Switch";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import {
  AClass, AEnrollment, AList, AOverview, ATerms, PAGE_SIZE, STATUS, addClass, cancelClass, cancelEnrollment, clock, dayLabel, editClass,
  getTerms, listClasses, listEnrollments, markAttendance, overview, saveTerms,
} from "@/lib/academy";

type Tab = "classes" | "children" | "terms";
const field = "rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");
const tomorrow = () => { const d = new Date(Date.now() + 86400000); return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" }); };

export default function AcademyPage() {
  const [tab, setTab] = useState<Tab>("classes");
  const [stats, setStats] = useState<AOverview | null>(null);
  const [pickClass, setPickClass] = useState<string>(""); // jump from a class to its children
  const refreshStats = useCallback(() => { overview().then(setStats).catch(() => {}); }, []);
  useEffect(refreshStats, [refreshStats]);

  const TABS: { id: Tab; label: string }[] = [{ id: "classes", label: "Classes" }, { id: "children", label: "Enrolled children" }, { id: "terms", label: "Terms & Conditions" }];
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Children&apos;s Academy</h1>
        <p className="text-sm text-muted">Ages 10 to 14. Add class times and choose when guardians can see them, then see who is enrolled.</p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([["Upcoming classes", stats.upcomingClasses], ["Shown to guardians", stats.visibleClasses], ["Children enrolled", stats.enrolledChildren], ["With health notes", stats.withHealthNotes]] as const).map(([l, n]) => (
            <div key={l} className="rounded-2xl bg-surface p-3 shadow-sm"><p className="text-2xl font-bold">{n}</p><p className="text-xs text-muted">{l}</p></div>
          ))}
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-surface p-1 shadow-sm" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold ${tab === t.id ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}>{t.label}</button>
        ))}
      </div>

      {tab === "classes" && <Classes onChanged={refreshStats} onOpen={(id) => { setPickClass(id); setTab("children"); }} />}
      {tab === "children" && <Children sessionId={pickClass} onClearClass={() => setPickClass("")} onChanged={refreshStats} />}
      {tab === "terms" && <Terms />}
    </div>
  );
}

/* ---------------- classes ---------------- */
function Classes({ onChanged, onOpen }: { onChanged: () => void; onOpen: (id: string) => void }) {
  const [scope, setScope] = useState<"upcoming" | "past">("upcoming");
  const [rows, setRows] = useState<AClass[] | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AClass | null>(null);
  const [cancelling, setCancelling] = useState<AClass | null>(null);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    listClasses(scope).then((r) => { if (live) { setRows(r); setError(""); } }).catch((e) => { if (live) setError(msg(e)); });
    return () => { live = false; };
  }, [scope, tick]);
  const changed = () => { setTick((t) => t + 1); onChanged(); };

  async function toggle(c: AClass) {
    if (!guard("academy.sessions")) return;
    try { await editClass(c.id, { visible: !c.visible }); setNote(c.visible ? "Hidden from guardians." : "Now shown to guardians."); changed(); } catch (e) { setError(msg(e)); }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1 rounded-xl bg-surface p-1 shadow-sm">
          {(["upcoming", "past"] as const).map((s) => (
            <button key={s} onClick={() => { setScope(s); setRows(null); }} aria-pressed={scope === s} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${scope === s ? "bg-brand text-white" : "text-muted"}`}>{s === "upcoming" ? "Upcoming" : "Past"}</button>
          ))}
        </div>
        <button onClick={() => { if (guard("academy.sessions")) setAdding(true); }} className="flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"><Plus size={16} /> Add class</button>
      </div>
      {note && <p className="rounded-xl bg-brand/10 p-3 text-sm text-brand" role="status">{note}</p>}
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!rows && !error && <p className="py-8 text-center text-sm text-muted">Loading classes…</p>}
      {rows?.length === 0 && (
        <div className="grid place-items-center gap-2 rounded-2xl bg-surface py-12 text-center text-muted shadow-sm">
          <GraduationCap size={32} strokeWidth={1.5} />
          <p>{scope === "upcoming" ? "No upcoming classes. Add one so guardians can enrol." : "No past classes."}</p>
        </div>
      )}
      <ul className="space-y-2">
        {rows?.map((c) => (
          <li key={c.id} className={`space-y-3 rounded-2xl bg-surface p-4 shadow-sm ${c.status === "cancelled" ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{dayLabel(c.date)} · {clock(c.startTime)} to {clock(c.endTime)}</p>
                <p className="text-xs text-muted">{c.title}{c.coach ? ` · Coach ${c.coach}` : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                {c.status === "cancelled" ? <Badge tone="bg-slate-500/15 text-slate-500">Cancelled</Badge> : c.seatsLeft === 0 ? <Badge tone="bg-amber-500/15 text-amber-600">Full</Badge> : <Badge tone="bg-brand/15 text-brand">{c.seatsLeft} seats left</Badge>}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <button onClick={() => onOpen(c.id)} className="font-semibold text-brand">{c.enrolled} of {c.capacity} enrolled · see children</button>
              {c.status === "open" && (
                <div className="flex flex-wrap items-center gap-3">
                  {scope === "upcoming" && (
                    <label className="flex items-center gap-2 text-xs text-muted">{c.visible ? "Shown to guardians" : "Hidden"}
                      <Switch on={c.visible} onChange={() => toggle(c)} label={`Show ${dayLabel(c.date)} class to guardians`} />
                    </label>
                  )}
                  {!c.started && <button onClick={() => { if (guard("academy.sessions")) setEditing(c); }} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold">Edit</button>}
                  {!c.started && <button onClick={() => { if (guard("academy.sessions")) setCancelling(c); }} className="rounded-full border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-600">Cancel class</button>}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      {adding && <ClassForm onClose={() => setAdding(false)} onSaved={(m) => { setNote(m); changed(); }} />}
      {editing && <ClassForm cls={editing} onClose={() => setEditing(null)} onSaved={(m) => { setNote(m); changed(); }} />}
      {cancelling && <CancelClass cls={cancelling} onClose={() => setCancelling(null)} onDone={(m) => { setNote(m); changed(); }} />}
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()} className="max-h-[94vh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold">{title}</h2><button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-surface-2"><X size={22} /></button></div>
        {children}
      </div>
    </div>
  );
}

function ClassForm({ cls, onClose, onSaved }: { cls?: AClass; onClose: () => void; onSaved: (m: string) => void }) {
  const [date, setDate] = useState(cls?.date ?? tomorrow());
  const [start, setStart] = useState(cls?.startTime ?? "07:00");
  const [end, setEnd] = useState(cls?.endTime ?? "08:30");
  const [title, setTitle] = useState(cls?.title ?? "");
  const [coach, setCoach] = useState(cls?.coach ?? "");
  const [capacity, setCapacity] = useState(String(cls?.capacity ?? 15));
  const [visible, setVisible] = useState(cls?.visible ?? true);
  const [weeks, setWeeks] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = !!cls && cls.enrolled > 0; // date and time cannot move once children are enrolled

  async function save() {
    if (!guard("academy.sessions")) return;
    setBusy(true); setError("");
    try {
      if (cls) {
        await editClass(cls.id, { title: title || cls.title, coach: coach || null, capacity: Number(capacity), visible, ...(locked ? {} : { date, startTime: start, endTime: end }) });
        onSaved("Class saved.");
      } else {
        const r = await addClass({ date, startTime: start, endTime: end, title: title || undefined, coach: coach || undefined, capacity: Number(capacity), visible, repeatWeeks: Number(weeks) });
        onSaved(`${r.length} class${r.length === 1 ? "" : "es"} added${visible ? " and shown to guardians" : " (hidden until you show them)"}.`);
      }
      onClose();
    } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  }
  const lab = "block space-y-1 text-sm font-medium";
  return (
    <Sheet title={cls ? "Edit class" : "Add a class"} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <label className={`${lab} col-span-2`}>Date<input type="date" value={date} disabled={locked} onChange={(e) => setDate(e.target.value)} className={`${field} w-full disabled:opacity-50`} /></label>
        <label className={lab}>Starts<input type="time" value={start} disabled={locked} onChange={(e) => setStart(e.target.value)} className={`${field} w-full disabled:opacity-50`} /></label>
        <label className={lab}>Ends<input type="time" value={end} disabled={locked} onChange={(e) => setEnd(e.target.value)} className={`${field} w-full disabled:opacity-50`} /></label>
        <label className={`${lab} col-span-2`}>Class name <span className="font-normal text-muted">(optional)</span><input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Children's Academy class" className={`${field} w-full`} /></label>
        <label className={lab}>Coach <span className="font-normal text-muted">(optional)</span><input value={coach} maxLength={60} onChange={(e) => setCoach(e.target.value)} className={`${field} w-full`} /></label>
        <label className={lab}>Seats<input inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value.replace(/\D/g, "").slice(0, 3))} className={`${field} w-full`} /></label>
        {!cls && <label className={`${lab} col-span-2`}>Repeat every week for<select value={weeks} onChange={(e) => setWeeks(e.target.value)} className={`${field} w-full`}>
          <option value="0">Just this one</option>{[1, 2, 3, 4, 8, 12].map((n) => <option key={n} value={n}>{n} more week{n > 1 ? "s" : ""}</option>)}</select></label>}
      </div>
      {locked && <p className="text-xs text-muted">Children are enrolled, so the date and time are locked. Cancel the class and add a new one to move it.</p>}
      <label className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 p-3 text-sm font-medium">Show to guardians in the app<Switch on={visible} onChange={() => setVisible((v) => !v)} label="Show to guardians" /></label>
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      <button onClick={save} disabled={busy} className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Saving…" : cls ? "Save class" : "Add class"}</button>
    </Sheet>
  );
}

function CancelClass({ cls, onClose, onDone }: { cls: AClass; onClose: () => void; onDone: (m: string) => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function go() {
    setBusy(true); setError("");
    try { const r = await cancelClass(cls.id, reason.trim()); onDone(`Class cancelled. ${r.cancelledEnrollments} guardian${r.cancelledEnrollments === 1 ? "" : "s"} told.`); onClose(); } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  }
  return (
    <Sheet title="Cancel this class?" onClose={onClose}>
      <p className="text-sm">{dayLabel(cls.date)}, {clock(cls.startTime)} to {clock(cls.endTime)}. {cls.enrolled > 0 ? `${cls.enrolled} enrolled ${cls.enrolled === 1 ? "child's guardian" : "children's guardians"} will be told in the app.` : "Nobody is enrolled."}</p>
      <label className="block space-y-1 text-sm font-medium">Reason <span className="font-normal text-muted">(shown to guardians, optional)</span>
        <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="For example: heavy rain" className={`${field} w-full`} /></label>
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={onClose} className="rounded-full border border-line py-3 text-sm font-semibold">Keep class</button>
        <button onClick={go} disabled={busy} className="rounded-full bg-red-600 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Cancelling…" : "Cancel class"}</button>
      </div>
    </Sheet>
  );
}

/* ---------------- enrolled children ---------------- */
function Children({ sessionId, onClearClass, onChanged }: { sessionId: string; onClearClass: () => void; onChanged: () => void }) {
  const [status, setStatus] = useState("");
  const [health, setHealth] = useState(false);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [pageNo, setPageNo] = useState(1);
  const [data, setData] = useState<AList | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => { const t = setTimeout(() => { setQ(search); setPageNo(1); }, 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => {
    let live = true;
    listEnrollments({ sessionId, status, health: health ? "condition" : "", q, page: pageNo })
      .then((d) => { if (live) { setData(d); setError(""); } })
      .catch((e) => { if (live) setError(msg(e)); });
    return () => { live = false; };
  }, [sessionId, status, health, q, pageNo, tick]);

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  async function act(fn: () => Promise<unknown>, perm: string) {
    if (!guard(perm)) return;
    try { await fn(); setTick((t) => t + 1); onChanged(); } catch (e) { setError(msg(e)); }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <label className="relative min-w-[12rem] flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setData(null); }} placeholder="Search child, guardian, phone or code" className={`${field} w-full pl-10`} />
        </label>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPageNo(1); setData(null); }} aria-label="Status" className={field}>
          <option value="">All statuses</option>{(Object.keys(STATUS) as (keyof typeof STATUS)[]).map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
        </select>
        <button aria-pressed={health} onClick={() => { setHealth((h) => !h); setPageNo(1); setData(null); }} className={`flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-semibold ${health ? "border-red-500 bg-red-500/10 text-red-600" : "border-line text-muted"}`}><HeartPulse size={16} /> Health notes only</button>
      </div>
      {sessionId && <button onClick={() => { onClearClass(); setPageNo(1); setData(null); }} className="flex items-center gap-1 rounded-full bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand">Showing one class only <X size={14} /></button>}
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!data && !error && <p className="py-8 text-center text-sm text-muted">Loading children…</p>}
      {data?.items.length === 0 && (
        <div className="grid place-items-center gap-2 rounded-2xl bg-surface py-12 text-center text-muted shadow-sm"><GraduationCap size={32} strokeWidth={1.5} /><p>No enrolled children match.</p></div>
      )}
      <ul className="space-y-2">
        {data?.items.map((e) => <ChildCard key={e.id} e={e} onAttend={(s) => act(() => markAttendance(e.id, s), "academy.enrollments")} onCancel={() => { if (window.confirm(`Cancel ${e.childName}'s class? The guardian is told.`)) act(() => cancelEnrollment(e.id), "academy.enrollments"); }} />)}
      </ul>
      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-2 text-sm">
          <button disabled={pageNo <= 1} onClick={() => { setPageNo(pageNo - 1); setData(null); }} className="flex items-center gap-1 rounded-xl bg-surface px-3 py-2 shadow-sm disabled:opacity-40"><ChevronLeft size={16} /> Previous</button>
          <span className="text-muted">Page {pageNo} of {pages} · {data.total} children</span>
          <button disabled={pageNo >= pages} onClick={() => { setPageNo(pageNo + 1); setData(null); }} className="flex items-center gap-1 rounded-xl bg-surface px-3 py-2 shadow-sm disabled:opacity-40">Next <ChevronRight size={16} /></button>
        </div>
      )}
    </div>
  );
}

function ChildCard({ e, onAttend, onCancel }: { e: AEnrollment; onAttend: (s: "attended" | "no_show" | "confirmed") => void; onCancel: () => void }) {
  const st = STATUS[e.status];
  const started = e.session.started;
  return (
    <li className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{e.childName} <span className="font-normal text-muted">· age {e.childAge}</span></p>
          <p className="text-xs text-muted">{dayLabel(e.session.date)}, {clock(e.session.startTime)} to {clock(e.session.endTime)} · <span className="font-mono">{e.code}</span></p>
        </div>
        <Badge tone={st.tone}>{st.label}{e.status === "cancelled" && e.cancelledBy ? ` by ${e.cancelledBy}` : ""}</Badge>
      </div>
      {e.healthStatus === "condition" && (
        <p className="flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-sm text-red-700"><HeartPulse size={16} className="mt-0.5 shrink-0" /><span><strong>Health:</strong> {e.healthNotes}</span></p>
      )}
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 p-3">
          <div className="min-w-0"><p className="text-xs text-muted">Guardian</p><p className="truncate font-semibold">{e.guardianName}</p><p className="text-xs text-muted">{e.guardianPhone}</p></div>
          <a href={`tel:${e.guardianPhone}`} aria-label={`Call guardian ${e.guardianName}`} className="flex shrink-0 items-center gap-1 rounded-full bg-brand px-3 py-2 text-xs font-semibold text-white"><Phone size={14} /> Call</a>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 p-3">
          <div className="min-w-0"><p className="text-xs text-muted">Emergency contact</p><p className="font-semibold">{e.emergencyPhone}</p></div>
          <a href={`tel:${e.emergencyPhone}`} aria-label={`Call emergency contact for ${e.childName}`} className="flex shrink-0 items-center gap-1 rounded-full bg-red-600 px-3 py-2 text-xs font-semibold text-white"><Phone size={14} /> Call</a>
        </div>
      </div>
      <p className="text-xs text-muted">Address: {e.address} · accepted terms v{e.termsVersion}</p>
      {e.status !== "cancelled" && (
        <div className="flex flex-wrap gap-2">
          {started && e.status !== "attended" && <button onClick={() => onAttend("attended")} className="rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white">Mark attended</button>}
          {started && e.status !== "no_show" && <button onClick={() => onAttend("no_show")} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold">Mark no-show</button>}
          {started && e.status !== "confirmed" && <button onClick={() => onAttend("confirmed")} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted">Undo</button>}
          {!started && <button onClick={onCancel} className="rounded-full border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-600">Cancel enrolment</button>}
        </div>
      )}
    </li>
  );
}

/* ---------------- terms ---------------- */
function Terms() {
  const [t, setT] = useState<ATerms | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => { getTerms().then((d) => { setT(d); setText(d.text); }).catch((e) => setError(msg(e))); }, []);

  async function save() {
    if (!guard("academy.terms")) return;
    setBusy(true); setError(""); setNote("");
    try { const d = await saveTerms(text.trim()); setT(d); setText(d.text); setNote(`Saved as version ${d.version}. Guardians must accept this version to enrol.`); } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  }

  if (!t && !error) return <p className="py-8 text-center text-sm text-muted">Loading terms…</p>;
  return (
    <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Terms &amp; Conditions guardians accept</h2>
        {t && <Badge tone="bg-brand/15 text-brand">Version {t.version}</Badge>}
      </div>
      <p className="text-sm text-muted">Guardians see exactly this text and must tick to accept it. Every change makes a new version, and guardians have to accept the newest one before they can confirm a class.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} maxLength={5000} aria-label="Terms and Conditions" className={`${field} w-full font-sans leading-relaxed`} />
      <p className="text-right text-xs text-muted">{text.length} / 5000{t?.updatedAt ? ` · last saved ${new Date(t.updatedAt).toLocaleString("en-GB")}${t.updatedBy ? ` by ${t.updatedBy}` : ""}` : ""}</p>
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {note && <p className="rounded-xl bg-brand/10 p-3 text-sm text-brand" role="status">{note}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={save} disabled={busy || !t || text.trim() === t.text} className="rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save new version"}</button>
        {t && t.text !== text && <button onClick={() => setText(t.text)} className="text-sm font-semibold text-muted">Discard changes</button>}
        {!!t?.history?.length && <button onClick={() => setShowHistory((s) => !s)} className="ml-auto text-sm font-semibold text-brand">{showHistory ? "Hide" : "Show"} earlier versions</button>}
      </div>
      {showHistory && t?.history?.map((h) => (
        <details key={h.version} className="rounded-xl bg-surface-2 p-3 text-sm">
          <summary className="cursor-pointer font-semibold">Version {h.version}{h.updatedAt ? ` · ${new Date(h.updatedAt).toLocaleDateString("en-GB")}` : " · original"}</summary>
          <p className="mt-2 whitespace-pre-line text-muted">{h.text}</p>
        </details>
      ))}
    </div>
  );
}
