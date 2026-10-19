// Live updates for the header buttons: one poll of the activity feed (what customers and staff just did), shared by every
// button. Each button counts the items for its page that arrived after it was last clicked on this device, and a click opens
// the newest one with ?hl=<record key> so the page can highlight it.
import { useSyncExternalStore } from "react";
import { api } from "./api";
import { canDo } from "./access";

export type LiveItem = { id: string; type: string; title: string; text: string; href: string; at: string; ref?: string };

// which header button an activity type belongs to (a new booking lights up both Slots and Bookings)
const PAGES: Record<string, string[]> = {
  booking: ["/slots", "/bookings"],
  payment: ["/payments"],
  customer: ["/customers"],
  arrival: ["/arrivals"],
  gamezone: ["/gamezone"],
  membership: ["/membership"],
  order: ["/payments"],
  complaint: ["/complaints"],
  referral: ["/refer"],
  academy: ["/academy"],
  challenge: ["/teams"],
  result: ["/teams", "/disputes"],
  wheelchair: ["/wheelchair"],
  insurance: ["/insurance"],
};

let items: LiveItem[] = [];
let started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const key = (page: string) => `uf-live-seen:${page}`;
// nothing counts as new the first time this browser sees a button
function seenAt(page: string): string {
  try {
    const v = localStorage.getItem(key(page));
    if (v) return v;
    const now = new Date().toISOString();
    localStorage.setItem(key(page), now);
    return now;
  } catch {
    return new Date(0).toISOString();
  }
}

function load() {
  api<{ items: LiveItem[] }>("/admin/activity").then((d) => { items = d.items; emit(); }).catch(() => {});
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  // the staff details may still be loading when the first button appears, so ask again every few seconds
  const tick = () => { if (document.visibilityState === "visible" && canDo("dashboard.view")) load(); };
  tick();
  setInterval(tick, 5000);
  document.addEventListener("visibilitychange", tick);
}

function subscribe(fn: () => void) {
  start();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** New items for one header button, newest first. */
export function unseenFor(page: string): LiveItem[] {
  const since = seenAt(page);
  return items.filter((i) => (PAGES[i.type] ?? []).includes(page) && i.at > since);
}

/** Marks a button as read; returns where to go (the newest new item, with ?hl= so it is highlighted), or null. */
export function openLive(page: string): string | null {
  const newest = unseenFor(page)[0];
  try { localStorage.setItem(key(page), new Date().toISOString()); } catch { /* not remembered */ }
  emit();
  if (!newest) return null;
  // the item's own link when it points at this page (it may carry a date), otherwise this page itself
  const target = newest.href.startsWith(page) ? newest.href : page;
  return `${target}${target.includes("?") ? "&" : "?"}hl=${encodeURIComponent(newest.ref ?? newest.id)}`;
}

let version = 0;
listeners.add(() => { version += 1; });

/** Re-renders whenever the feed or a button's read state changes. */
export function useLive() {
  useSyncExternalStore(subscribe, () => version, () => 0);
  return { unseenFor, openLive, targetFor };
}

/** Where a dashboard tile should go: the newest recent item for that page, with ?hl= so the page highlights it (null = open the page as usual). */
export function targetFor(slug: string): string | null {
  const page = `/${slug}`;
  const newest = items.find((i) => i.href === page || i.href.startsWith(`${page}?`) || i.href.startsWith(`${page}/`) || (PAGES[i.type] ?? []).includes(page));
  if (!newest) return null;
  const target = newest.href.startsWith(page) ? newest.href : page;
  return `${target}${target.includes("?") ? "&" : "?"}hl=${encodeURIComponent(newest.ref ?? newest.id)}`;
}
