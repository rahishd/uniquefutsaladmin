"use client";

// The Gamezone session clock on screen. The booked hours run from the moment staff press Start; every started minute after that is billed
// at the session's hourly price / 60 (the same sums the server makes when the session is stopped, so the live price matches the final bill).
import { useSyncExternalStore } from "react";
import type { GzClock } from "./gamezone";

export const GZ_EXTRA_MAX_MIN = 30; // longest extra time to allow (mirrors the server); after it the alarm rings again

// The server's clock minus this device's clock, so the timer is right even if the counter PC's clock is off.
let offset = 0;
export const syncServerTime = (serverNow: string) => { const t = Date.parse(serverNow); if (!Number.isNaN(t)) offset = t - Date.now(); };
export const getNow = () => Date.now() + offset;

let tick = 0;
const subs = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
function subscribe(cb: () => void) {
  subs.add(cb);
  if (!timer) timer = setInterval(() => { tick++; subs.forEach((f) => f()); }, 1000);
  return () => {
    subs.delete(cb);
    if (!subs.size && timer) { clearInterval(timer); timer = undefined; }
  };
}
// Re-renders the component every second and returns the server's "now" in milliseconds.
export function useNow(): number {
  useSyncExternalStore(subscribe, () => tick, () => 0);
  return getNow();
}

export type ClockView = {
  running: boolean;
  remainingMs: number; // time left of the booked hours (0 once over)
  overMs: number; // how long past the booked time (0 while inside it)
  extraMinutes: number; // started minutes past the booked time
  extraCharge: number; // Rs, for those minutes
  perMinute: number; // Rs per minute
  stage: 0 | 1 | 2; // 0 inside the time, 1 time is up, 2 the maximum extra time is used
  progress: number; // 0..1 of the booked time used
};

export function clockAt(c: GzClock, nowMs: number): ClockView {
  const running = !c.endedAt;
  const booked = c.bookedMinutes * 60_000;
  if (!running) {
    return { running, remainingMs: 0, overMs: 0, extraMinutes: c.extraMinutes, extraCharge: c.extraCharge, perMinute: c.hourlyRate / 60, stage: 0, progress: 1 };
  }
  const used = Math.max(0, nowMs - Date.parse(c.startedAt));
  const overMs = Math.max(0, used - booked);
  const extraMinutes = overMs > 0 ? Math.ceil(overMs / 60_000) : 0;
  return {
    running, remainingMs: Math.max(0, booked - used), overMs, extraMinutes, extraCharge: Math.round((c.hourlyRate * extraMinutes) / 60), perMinute: c.hourlyRate / 60,
    stage: used < booked ? 0 : overMs >= GZ_EXTRA_MAX_MIN * 60_000 ? 2 : 1, progress: Math.min(1, used / booked),
  };
}

const two = (n: number) => String(n).padStart(2, "0");
// 3725000 -> "1:02:05", 65000 -> "01:05"
export function hms(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(s / 3600);
  return h > 0 ? `${h}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}` : `${two(Math.floor(s / 60))}:${two(s % 60)}`;
}
