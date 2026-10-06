import { currentAdmin } from "./auth";

// Every account sees every page. What a person may DO is checked on the server for each action; the portal also checks here first,
// so a person who is not allowed gets a clear message instead of a half-filled form that cannot be saved.
export const DENIED_EVENT = "uf-denied";

export const canDo = (permission: string) => !!currentAdmin()?.permissions?.includes(permission);

export function showDenied() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(DENIED_EVENT));
}

// true when the signed-in account may do this; otherwise shows the "ask the Owner" message and returns false.
export function guard(permission: string): boolean {
  if (canDo(permission)) return true;
  showDenied();
  return false;
}
