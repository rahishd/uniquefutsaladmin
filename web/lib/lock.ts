import { useSyncExternalStore } from "react";
import { api } from "./api";

// Portal lock. "Locked" is remembered on this device (so a reload stays locked) and shared by every open tab of the portal.
// The 4 digit code lives on the server (set by the Owner or an Admin only); signing in again clears the lock (see setToken in lib/api.ts).
export const LOCK_KEY = "uf-portal-locked";
const EVENT = "uf-lock-change";

function read(): boolean {
  try { return localStorage.getItem(LOCK_KEY) === "1"; } catch { return false; }
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => { window.removeEventListener("storage", cb); window.removeEventListener(EVENT, cb); };
}

export const useLocked = () => useSyncExternalStore(subscribe, read, () => false);

export function setLocked(on: boolean) {
  try {
    if (on) localStorage.setItem(LOCK_KEY, "1");
    else localStorage.removeItem(LOCK_KEY);
  } catch { /* storage blocked: the lock only lasts until the page is reloaded */ }
  window.dispatchEvent(new Event(EVENT));
}

export type LockInfo = { hasCode: boolean; canManage: boolean };
export const getLockInfo = () => api<LockInfo>("/admin/lock");
export const saveLockCode = (code: string) => api<{ hasCode: boolean }>("/admin/lock/code", { method: "PUT", body: JSON.stringify({ code }) });
export const removeLockCode = () => api<{ hasCode: boolean }>("/admin/lock/code", { method: "DELETE" });
export const checkLockCode = (code: string) => api<{ ok: boolean }>("/admin/lock/unlock", { method: "POST", body: JSON.stringify({ code }) });
