"use client";

// The alarm that rings when a Gamezone session's time is up: a rising and falling siren made with the browser's own audio (no sound file).
// Browsers only allow sound after the person has touched the page once, so the audio is unlocked on the first click or key press
// (pressing Start counts). Until then `soundReady()` is false and the screen shows the visual alert alone.
let ctx: AudioContext | null = null;
let osc: OscillatorNode | null = null;
let gain: GainNode | null = null;
let sweep: ReturnType<typeof setInterval> | undefined;

export function unlockAudio() {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
  } catch { /* no audio on this device: the visual alert still shows */ }
}

export const soundReady = () => ctx?.state === "running";

export function startSiren() {
  if (osc) return;
  unlockAudio();
  if (!ctx) return;
  try {
    osc = ctx.createOscillator();
    gain = ctx.createGain();
    osc.type = "square";
    gain.gain.value = 0.12;
    osc.connect(gain).connect(ctx.destination);
    osc.frequency.setValueAtTime(700, ctx.currentTime);
    osc.start();
    let high = true;
    const wail = () => {
      if (!ctx || !osc) return;
      osc.frequency.cancelScheduledValues(ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(high ? 1150 : 700, ctx.currentTime + 0.6);
      high = !high;
    };
    wail();
    sweep = setInterval(wail, 650);
  } catch { /* ignore */ }
}

export function stopSiren() {
  if (sweep) { clearInterval(sweep); sweep = undefined; }
  try { osc?.stop(); osc?.disconnect(); gain?.disconnect(); } catch { /* already stopped */ }
  osc = null;
  gain = null;
}
