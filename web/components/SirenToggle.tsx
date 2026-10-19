"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BellRing, ChevronDown, Volume2, VolumeX } from "lucide-react";
import { getSirenVolume, isSirenBlocked, isSirenMuted, setSirenMuted, setSirenVolume, startSiren, subscribeSirenMute } from "@/lib/siren";
import { PushState, disablePush, enablePush, pushState, resyncPush, sendTestPush } from "@/lib/staffPush";

const WHY: Record<PushState, string> = {
  on: "On. You get alerts on this device even when the portal is closed or the phone is asleep.",
  off: "Off. Turn on to get alerts when the portal is closed.",
  denied: "Blocked in this browser. Allow notifications for this site in the browser settings, then turn it on.",
  unsupported: "This browser cannot show alerts when closed. On iPhone, add the portal to the Home Screen first.",
  unavailable: "Not set up on the server yet (it needs push keys).",
};

// Header controls: the speaker mutes or unmutes the alert sound instantly; the arrow opens volume and closed-portal alerts.
export default function SirenToggle() {
  const muted = useSyncExternalStore(subscribeSirenMute, isSirenMuted, () => false);
  const volume = useSyncExternalStore(subscribeSirenMute, getSirenVolume, () => 1);
  const blocked = useSyncExternalStore(subscribeSirenMute, isSirenBlocked, () => false);
  const [open, setOpen] = useState(false);
  const [push, setPush] = useState<PushState>("off");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const Icon = muted ? VolumeX : Volume2;

  useEffect(() => { void pushState().then(setPush); void resyncPush(); }, []);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  async function togglePush() {
    setBusy(true);
    setNote("");
    try { setPush(push === "on" ? await disablePush() : await enablePush()); } catch { setNote("Could not change this. Check your connection and try again."); }
    setBusy(false);
  }
  async function test() {
    setNote("");
    try { const r = await sendTestPush(); setNote(r.devices > 0 ? "Sent. Close this tab to see how it looks." : "No device is registered yet. Turn on closed-portal alerts first."); } catch { setNote("Could not send the test."); }
  }

  const btn = "grid h-9 place-items-center bg-[#1e2d5e] text-white transition hover:bg-[#2a3c74] md:h-11";
  return (
    <div ref={box} className="relative">
      <div className="flex overflow-hidden rounded-xl md:rounded-2xl">
        <button
          type="button"
          onClick={() => { setSirenMuted(!muted); if (muted) startSiren(600); }} // unmuting plays a short beep so you know it works
          title={muted ? "Alert sound is off. Click to turn on" : blocked ? "Click anywhere on the page once to switch the alert sound on" : "Alert sound is on. Click to mute"}
          aria-label={muted ? "Unmute alert sound" : "Mute alert sound"}
          aria-pressed={muted}
          className={`${btn} relative w-9 md:w-11 ${muted ? "text-white/60" : ""}`}
        >
          <Icon size={18} className="md:h-[22px] md:w-[22px]" />
          {!muted && blocked && <span aria-hidden className="absolute right-1 top-1 h-2.5 w-2.5 animate-pulse rounded-full bg-amber-400 ring-2 ring-[#1e2d5e]" />}
        </button>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Sound and alert settings" aria-expanded={open} className={`${btn} w-5 border-l border-white/10 md:w-6`}>
          <ChevronDown size={14} />
        </button>
      </div>

      {open && (
        <div role="dialog" aria-label="Sound and alert settings" className="absolute right-0 top-12 z-50 w-[min(20rem,calc(100vw-2rem))] space-y-4 rounded-2xl border border-line bg-surface p-4 text-foreground shadow-xl md:top-14">
          <div>
            <div className="mb-2 flex items-center justify-between text-sm font-semibold">
              <span>Alert volume</span>
              <span className="text-muted">{muted ? "Muted" : `${Math.round(volume * 100)}%`}</span>
            </div>
            <input
              type="range" min={0} max={100} step={5} value={Math.round(volume * 100)}
              onChange={(e) => { setSirenVolume(Number(e.target.value) / 100); if (muted && Number(e.target.value) > 0) setSirenMuted(false); }}
              aria-label="Alert volume" className="w-full accent-[var(--brand)]"
            />
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => startSiren(1500)} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold">Play a test sound</button>
              <button type="button" onClick={() => setSirenMuted(!muted)} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold">{muted ? "Unmute" : "Mute"}</button>
            </div>
          </div>

          <div className="border-t border-line pt-3">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm font-semibold"><BellRing size={16} /> Alerts when closed</p>
              <button
                type="button" role="switch" aria-checked={push === "on"} disabled={busy || push === "unsupported" || push === "unavailable"} onClick={togglePush}
                className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-40 ${push === "on" ? "bg-brand" : "bg-line"}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${push === "on" ? "left-[22px]" : "left-0.5"}`} />
              </button>
            </div>
            <p className="mt-1.5 text-xs text-muted">{WHY[push]}</p>
            {push === "on" && <button type="button" onClick={test} className="mt-2 rounded-full border border-line px-3 py-1.5 text-xs font-semibold">Send a test alert</button>}
            {note && <p className="mt-2 text-xs text-muted" role="status">{note}</p>}
            <p className="mt-2 text-[11px] text-muted">{blocked ? "Sound is waiting for one click on the page (a browser rule). " : ""}When the portal is closed, the phone or computer uses its own notification sound.</p>
          </div>
        </div>
      )}
    </div>
  );
}
