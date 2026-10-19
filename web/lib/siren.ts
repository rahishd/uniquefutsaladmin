// A short two-tone siren for alerts staff must not miss (a customer ordering at the venue). Browsers only allow sound after the
// person has touched the page once, so if it is blocked the loud red alert on screen still shows. Respects "reduce motion"
// only for the visuals; the sound is the point of the alert.
let ctx: AudioContext | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
let stopAt: ReturnType<typeof setTimeout> | undefined;
let osc: OscillatorNode | null = null;

// Mute is remembered on this device and shared by every component that asks (the header toggle, the bell).
const MUTE_KEY = "uf-siren-muted";
const MUTE_EVENT = "uf-siren-mute";
export function isSirenMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; }
}
const VOL_KEY = "uf-siren-volume";
/** 0 to 1, remembered on this device (default full). */
export function getSirenVolume(): number {
  try { const v = Number(localStorage.getItem(VOL_KEY)); return localStorage.getItem(VOL_KEY) === null || Number.isNaN(v) ? 1 : Math.min(1, Math.max(0, v)); } catch { return 1; }
}
export function setSirenVolume(v: number) {
  try { localStorage.setItem(VOL_KEY, String(Math.min(1, Math.max(0, v)))); } catch { /* not remembered */ }
  if (clip) clip.volume = getSirenVolume();
  window.dispatchEvent(new Event(MUTE_EVENT));
}
export function setSirenMuted(muted: boolean) {
  try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch { /* not remembered */ }
  if (muted) stopSiren();
  window.dispatchEvent(new Event(MUTE_EVENT));
}
export function subscribeSirenMute(fn: () => void) {
  window.addEventListener(MUTE_EVENT, fn);
  window.addEventListener("storage", fn);
  return () => { window.removeEventListener(MUTE_EVENT, fn); window.removeEventListener("storage", fn); };
}

/** True until the browser allows sound (it needs one click or key press on the page first). */
export const isSirenBlocked = () => !ctx || ctx.state !== "running";

// Browsers only let a page make sound after a real touch or key press, so the first one unlocks the audio for later alerts.
export function unlockSirenOnFirstTouch() {
  if (typeof window === "undefined") return () => {};
  const unlock = () => {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) { ctx ??= new AC(); void ctx.resume().then(() => window.dispatchEvent(new Event(MUTE_EVENT))); }
    } catch { /* unsupported */ }
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
}

export function stopSiren() {
  if (clip) { try { clip.pause(); } catch { /* already stopped */ } clip = null; }
  clearInterval(timer);
  clearTimeout(stopAt);
  try { osc?.stop(); } catch { /* already stopped */ }
  osc = null;
}

// The notification sound: the file at public/sounds/notification.mp3 when it exists, otherwise the built-in two-tone siren below.
const SOUND_URL = "/sounds/notification.mp3";
let fileMissing = false;
let clip: HTMLAudioElement | null = null;

export function startSiren(ms = 6000) {
  if (typeof window === "undefined" || isSirenMuted()) return;
  stopSiren();
  if (!fileMissing) {
    try {
      const a = new Audio(SOUND_URL);
      a.volume = getSirenVolume();
      clip = a;
      // a long alert (a customer order) plays the sound three times
      let left = ms > 3000 ? 2 : 0;
      a.addEventListener("error", () => { fileMissing = true; if (clip === a) { clip = null; synthSiren(ms); } }, { once: true });
      a.addEventListener("ended", () => { if (left-- > 0 && clip === a) { a.currentTime = 0; void a.play().catch(() => {}); } });
      void a.play().catch(() => { /* blocked until the first click, or the error event above handles a missing file */ });
      try { navigator.vibrate?.([300, 150, 300]); } catch { /* not supported */ }
      return;
    } catch { /* fall back to the built-in tone */ }
  }
  synthSiren(ms);
}

function synthSiren(ms: number) {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    void ctx.resume();
    const gain = ctx.createGain();
    gain.gain.value = 0.45 * getSirenVolume();
    gain.connect(ctx.destination);
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.value = 880;
    o.connect(gain);
    o.start();
    osc = o;
    let hi = true;
    timer = setInterval(() => { hi = !hi; if (ctx) o.frequency.setValueAtTime(hi ? 880 : 640, ctx.currentTime); }, 420);
    stopAt = setTimeout(stopSiren, ms);
    try { navigator.vibrate?.([300, 150, 300, 150, 300]); } catch { /* not supported */ }
  } catch {
    // sound blocked or unsupported: the on-screen alert still shows
  }
}
