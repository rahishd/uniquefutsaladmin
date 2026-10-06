"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, CameraOff, Download, Loader2, MessageCircle, Phone, QrCode, RefreshCw, Search, ShieldAlert, UserCheck } from "lucide-react";
import { Badge } from "../bookings/Badge";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { prettyDate, rs } from "@/lib/bookings";
import { initials } from "@/lib/customers";
import { DigitalView, Found, loadCard, loadDigital, markAttendance, resolveCode, searchCustomers } from "@/lib/digitalid";
import { cardToBlob, drawIdCard } from "@/lib/idcard";

const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");

// Plain words for every reason the camera may not start.
function cameraProblem(e: unknown): string {
  if (typeof window !== "undefined" && !window.isSecureContext) return "The camera only works on a secure (https) page. Open the portal with its https address, or use the search below.";
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Camera permission was blocked. Tap the lock icon next to the address, allow Camera for this site, then press Start camera again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera was found on this device. Use the search below instead.";
  if (name === "NotReadableError" || name === "AbortError") return "The camera is busy in another app or tab. Close it there and try again.";
  return "The camera could not start. Use the search below instead.";
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
      <div>
        <h3 className="font-bold">{title}</h3>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
const Tile = ({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: string }) => (
  <div className="rounded-xl bg-surface-2 p-3">
    <p className="text-xs text-muted">{label}</p>
    <p className={`text-lg font-bold ${tone ?? ""}`}>{value}</p>
    {sub && <p className="text-[11px] text-muted">{sub}</p>}
  </div>
);
const Empty = ({ children }: { children: React.ReactNode }) => <p className="rounded-xl bg-surface-2 p-3 text-center text-sm text-muted">{children}</p>;

export default function DigitalIdPage() {
  const video = useRef<HTMLVideoElement>(null);
  const work = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef(0);
  const busyRef = useRef(false);
  const loop = useRef<() => void>(() => {});

  const [cam, setCam] = useState<"off" | "starting" | "on">("off");
  const [camError, setCamError] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "invalid" | "error" | "ok">("idle");
  const [problem, setProblem] = useState("");
  const [view, setView] = useState<DigitalView | null>(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCam("off");
  }, []);
  useEffect(() => stop, [stop]);

  const open = useCallback(async (phone: string) => {
    setState("loading");
    setNote("");
    try {
      setView(await loadDigital(phone));
      setState("ok");
    } catch (e) {
      setProblem(msg(e));
      setState("error");
    }
  }, []);

  const onCode = useCallback(async (text: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    stop();
    setState("loading");
    setNote("");
    try {
      const r = await resolveCode(text);
      await open(r.phone);
    } catch (e) {
      setProblem(msg(e));
      setState(e instanceof ApiError && (e.status === 422 || e.status === 404) ? "invalid" : "error");
    } finally {
      busyRef.current = false;
    }
  }, [open, stop]);

  const tick = useCallback(() => {
    const v = video.current, c = work.current;
    if (v && c && v.readyState === v.HAVE_ENOUGH_DATA && v.videoWidth) {
      const w = 640, h = Math.round((v.videoHeight / v.videoWidth) * 640);
      c.width = w; c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(v, 0, 0, w, h);
      const hit = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
      if (hit?.data) { void onCode(hit.data); return; }
    }
    raf.current = requestAnimationFrame(() => loop.current());
  }, [onCode]);
  useEffect(() => { loop.current = tick; }, [tick]);

  async function start() {
    if (!guard("digitalid.scan")) return;
    setCamError("");
    setState("idle");
    setView(null);
    if (!navigator.mediaDevices?.getUserMedia) { setCamError(cameraProblem(null)); return; }
    setCam("starting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      stream.current = s;
      const v = video.current!;
      v.srcObject = s;
      await v.play();
      setCam("on");
      raf.current = requestAnimationFrame(() => loop.current());
    } catch (e) {
      setCamError(cameraProblem(e));
      stop();
    }
  }

  // manual search (all state changes happen inside the timer callback)
  useEffect(() => {
    const term = q.trim();
    const t = setTimeout(() => {
      if (term.length < 2) { setFound(null); return; }
      setSearching(true);
      searchCustomers(term).then(setFound).catch(() => setFound([])).finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  const results = q.trim().length >= 2 ? found : null;

  async function attendance() {
    if (!view || !guard("digitalid.attendance")) return;
    setBusy("att");
    try {
      const r = await markAttendance(view.profile.user.phoneNumber);
      setNote(r.alreadyMarked ? "Attendance was already marked today." : "Attendance marked for today.");
      await open(view.profile.user.phoneNumber);
      setNote(r.alreadyMarked ? "Attendance was already marked today." : "Attendance marked for today.");
    } catch (e) { setNote(msg(e)); } finally { setBusy(""); }
  }

  // The card to download or send on WhatsApp
  async function card(kind: "download" | "whatsapp") {
    if (!view || !guard("digitalid.scan")) return;
    setBusy(kind);
    setNote("");
    try {
      const d = await loadCard(view.profile.user.phoneNumber);
      const canvas = document.createElement("canvas");
      await drawIdCard(canvas, d);
      const blob = await cardToBlob(canvas);
      const file = new File([blob], `unique-futsal-id-${d.phone}.png`, { type: "image/png" });
      if (kind === "whatsapp" && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: `Your Unique Futsal Digital ID, ${d.name}. Show the QR at the venue.` });
        return;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      if (kind === "whatsapp") {
        window.open(`${d.whatsapp}?text=${encodeURIComponent(`Hi ${d.name}, your Unique Futsal Digital ID card is attached. Show the QR at the venue.`)}`, "_blank", "noopener");
        setNote("The card was downloaded. Attach it in the WhatsApp chat that just opened.");
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setNote(msg(e));
    } finally { setBusy(""); }
  }

  const p = view?.profile;
  const x = view?.extras;
  const scanning = cam !== "off";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Digital ID</h1>
        <p className="text-sm text-muted">Scan a customer&apos;s QR with this device&apos;s camera to see their profile and activity.</p>
      </div>

      <Section title="Scan a QR code">
        <div className={`relative overflow-hidden rounded-2xl bg-black ${scanning ? "" : "hidden"}`}>
          <video ref={video} muted playsInline className="aspect-[4/3] w-full object-cover" />
          {cam === "on" && <div className="pointer-events-none absolute inset-8 rounded-2xl border-4 border-white/80" />}
          {cam === "starting" && <div className="absolute inset-0 grid place-items-center text-white"><Loader2 className="animate-spin" /></div>}
        </div>
        <canvas ref={work} className="hidden" />
        {camError && <p role="alert" className="flex gap-2 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-700"><CameraOff size={18} className="mt-0.5 shrink-0" />{camError}</p>}
        <button onClick={scanning ? stop : start} disabled={cam === "starting"} className="flex w-full items-center justify-center gap-2 rounded-full bg-brand py-3 text-sm font-semibold text-white disabled:opacity-60">
          {scanning ? <><CameraOff size={18} /> Stop camera</> : <><Camera size={18} /> Start camera</>}
        </button>
        {!scanning && state === "idle" && <p className="text-center text-xs text-muted">The browser will ask to use the camera the first time. Point it at the QR on the customer&apos;s phone or printed card.</p>}
      </Section>

      <Section title="Or search" hint="If the camera or the QR does not work, find the customer by name or mobile number.">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or mobile number" className="w-full rounded-xl border border-line bg-surface py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand" />
        </div>
        {searching && <p className="text-sm text-muted">Searching…</p>}
        {found && found.length === 0 && !searching && <Empty>No customer found.</Empty>}
        {results && results.length > 0 && (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {results.map((f) => (
              <li key={f.phoneNumber}>
                <button onClick={() => { stop(); setQ(""); setFound(null); void open(f.phoneNumber); }} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-xs font-bold text-brand">{initials(f.name, f.phoneNumber)}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{f.name || "Player"}</span><span className="text-xs text-muted">{f.phoneNumber}</span></span>
                  {!f.isActive && <Badge tone="bg-rose-500/15 text-rose-600">Suspended</Badge>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {state === "loading" && <div className="flex items-center justify-center gap-2 rounded-2xl bg-surface p-8 text-sm text-muted shadow-sm"><Loader2 className="animate-spin" size={18} /> Looking up the customer…</div>}

      {state === "invalid" && (
        <div role="alert" className="space-y-3 rounded-2xl bg-rose-500/10 p-4 text-rose-700">
          <p className="flex items-center gap-2 font-bold"><ShieldAlert size={18} /> Code not accepted</p>
          <p className="text-sm">{problem}</p>
          <button onClick={start} className="flex items-center gap-2 rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white"><RefreshCw size={15} /> Scan again</button>
        </div>
      )}

      {state === "error" && (
        <div role="alert" className="space-y-3 rounded-2xl bg-amber-500/10 p-4 text-amber-700">
          <p className="font-bold">Something went wrong</p>
          <p className="text-sm">{problem}</p>
        </div>
      )}

      {state === "ok" && p && x && (
        <div className="space-y-4">
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
                  <span className="text-xs text-muted">Member since {prettyDate(p.user.createdAt.slice(0, 10))}</span>
                </p>
              </div>
            </div>
            {!p.user.isActive && <p className="mt-3 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-700">This account is suspended. Check with the owner before allowing a booking.</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={`tel:${p.user.phoneNumber}`} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-2 text-xs font-semibold"><Phone size={14} /> Call</a>
              <button onClick={() => card("download")} disabled={!!busy} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-2 text-xs font-semibold disabled:opacity-60"><Download size={14} /> ID card</button>
              <button onClick={() => card("whatsapp")} disabled={!!busy} className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"><MessageCircle size={14} /> Send card on WhatsApp</button>
            </div>
            {note && <p role="status" className="mt-3 rounded-xl bg-brand/10 p-3 text-sm text-brand">{note}</p>}
          </div>

          <Section title="Membership & attendance">
            {x.membership ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Tile label="Plan" value={x.membership.plan} sub={x.membership.memberCode ?? undefined} />
                  <Tile label="Hour" value={x.membership.timeSlot ?? "-"} />
                  <Tile label="Valid until" value={prettyDate(x.membership.endDate)} sub={`from ${prettyDate(x.membership.startDate)}`} />
                  <Tile label="Came this month" value={x.membership.attendanceThisMonth} sub={`${x.membership.attendanceCount} in total`} />
                </div>
                {x.membership.attendedToday ? <p className="rounded-xl bg-brand/10 p-3 text-center text-sm font-semibold text-brand">Attendance already marked today</p>
                  : <button onClick={attendance} disabled={busy === "att"} className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white disabled:opacity-60">{busy === "att" ? "Saving…" : "Mark attendance for today"}</button>}
                {x.membership.recentDays.length > 0 && <p className="text-xs text-muted">Recent days: {x.membership.recentDays.map((d) => prettyDate(d)).join(", ")}</p>}
              </>
            ) : <Empty>No active membership today.{x.membershipCount > 0 ? ` ${x.membershipCount} earlier on record.` : ""}</Empty>}
          </Section>

          <Section title="Bookings" hint="Upcoming games, and whether each is paid">
            {x.upcomingBookings.length === 0 ? <Empty>No upcoming bookings.</Empty> : (
              <ul className="space-y-2">
                {x.upcomingBookings.map((b) => (
                  <li key={b.code} className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 p-3 text-sm">
                    <span><span className="font-semibold">{prettyDate(b.date)}</span> · {b.time}<span className="block font-mono text-xs text-muted">{b.code}</span></span>
                    <span className="text-right">{rs(b.amount)}<span className="mt-0.5 block">{b.paid ? <Badge tone="bg-brand/15 text-brand">Paid</Badge> : <Badge tone="bg-amber-500/15 text-amber-600">Unpaid</Badge>}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Games & history">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tile label="Games played" value={p.games.played} />
              <Tile label="Upcoming" value={p.games.upcoming} />
              <Tile label="Cancelled" value={p.games.cancelled} sub={`${p.games.noShows} no-show`} />
              <Tile label="Last game" value={p.games.lastGame ? prettyDate(p.games.lastGame) : "-"} />
            </div>
            {p.games.recent.length > 0 && (
              <ul className="space-y-1.5 text-sm">
                {p.games.recent.slice(0, 5).map((g) => (
                  <li key={g.code} className="flex justify-between rounded-lg bg-surface-2 px-3 py-2"><span>{prettyDate(g.date)} · {g.time} <span className="font-mono text-xs text-muted">{g.code}</span></span><span className="text-muted">{g.status}</span></li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Points & referrals">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tile label="Loyalty points" value={x.loyalty.points} />
              <Tile label="Free-game vouchers" value={x.loyalty.freeGameVouchers} />
              <Tile label="Referrals sent" value={x.referrals.asReferrer.total} sub={`${x.referrals.asReferrer.approved} approved`} />
              <Tile label="Referred to them" value={x.referrals.asFriend.total} sub={`${x.referrals.asFriend.pending} waiting`} />
            </div>
            {x.referrals.recent.length > 0 && <ul className="space-y-1.5 text-sm">{x.referrals.recent.map((r) => <li key={r.code} className="flex justify-between rounded-lg bg-surface-2 px-3 py-2"><span>{r.role === "referrer" ? "Booked for" : "Booked by a friend for"} {r.teamName} · {prettyDate(r.gameDate)}</span><span className="text-muted">{r.status}</span></li>)}</ul>}
          </Section>

          <Section title="Gamezone (PS5)">
            <div className="grid grid-cols-2 gap-2"><Tile label="Sessions played" value={x.gamezone.completed} /><Tile label="Upcoming" value={x.gamezone.upcoming} /></div>
            {x.gamezone.recent.length === 0 ? <Empty>No Gamezone sessions yet.</Empty> : (
              <ul className="space-y-1.5 text-sm">{x.gamezone.recent.map((g) => <li key={g.code} className="flex justify-between rounded-lg bg-surface-2 px-3 py-2"><span>{prettyDate(g.date)} · {g.time} · {g.hours} hr · {g.game}</span><span className="text-muted">{rs(g.total)} · {g.status}</span></li>)}</ul>
            )}
          </Section>

          <Section title="Extra add-ons & total spent">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tile label="Add-ons on games" value={rs(x.addOns.total)} sub={x.addOns.bottles ? `${x.addOns.bottles} water bottles` : undefined} />
              <Tile label="Goods bought" value={rs(x.spent.goods)} sub={`${p.goods.count} sales`} />
              <Tile label="Total spent" value={rs(x.spent.total)} tone="text-brand" />
              <Tile label="Still unpaid" value={rs(x.spent.unpaid)} tone={x.spent.unpaid > 0 ? "text-amber-600" : ""} />
            </div>
            {x.addOns.recent.length > 0 && <ul className="space-y-1.5 text-sm">{x.addOns.recent.slice(0, 5).map((a) => <li key={a.code} className="flex justify-between rounded-lg bg-surface-2 px-3 py-2"><span>{prettyDate(a.date)} · {a.items || `${a.bottles} water`}</span><span className="text-muted">{rs(a.price)}</span></li>)}</ul>}
          </Section>

          <Section title="Other details">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tile label="Team" value={p.profile.team?.name ?? "-"} sub={p.profile.team ? p.profile.team.role : undefined} />
              <Tile label="Position" value={p.profile.position ?? "-"} />
              <Tile label="Open complaints" value={p.complaints.open} sub={`${p.complaints.total} in total`} />
              <Tile label="Late cancels" value={p.cancellations.lateCount} sub={`streak ${p.cancellations.streak}`} />
            </div>
          </Section>

          <button onClick={start} className="flex w-full items-center justify-center gap-2 rounded-full border border-line bg-surface py-3 text-sm font-semibold"><QrCode size={18} /> Scan the next customer</button>
        </div>
      )}
    </div>
  );
}
