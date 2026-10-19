"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, CameraOff, Loader2, RefreshCw, Search, ShieldAlert } from "lucide-react";
import { Badge } from "../bookings/Badge";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { initials } from "@/lib/customers";
import { DigitalView, Found, loadCard, loadDigital, markAttendance, resolveCode, searchCustomers } from "@/lib/digitalid";
import { cardToBlob, drawIdCard } from "@/lib/idcard";
import ScanResult from "./ScanResult";
import { Empty, Section } from "./parts";

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

  const scanning = cam !== "off";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Digital ID</h1>
        <p className="text-sm text-muted">Scan a customer&apos;s QR with this device&apos;s camera to see their profile and activity, organised by topic.</p>
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

      {state === "ok" && view && <ScanResult key={view.profile.user.phoneNumber} view={view} busy={busy} note={note} onCard={card} onAttendance={attendance} onNext={start} />}
    </div>
  );
}
