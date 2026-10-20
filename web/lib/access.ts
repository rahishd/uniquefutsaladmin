import { currentAdmin } from "./auth";

// Every account sees every page. What a person may DO is checked on the server for each action; the portal also checks here first,
// so a person who is not allowed gets a clear message instead of a half-filled form that cannot be saved.
export const DENIED_EVENT = "uf-denied";

export const canDo = (permission: string) => !!currentAdmin()?.permissions?.includes(permission);

// The permission group(s) of each page: the part before the dot, e.g. "bookings" for bookings.view, bookings.cancel and so on. A page not listed here is always shown.
const pageGroups: Record<string, string[]> = {
  overview: ["dashboard"], dashboard: ["dashboard"], slots: ["slots"], bookings: ["bookings"], arrivals: ["arrivals"],
  sales: ["inventory"], payments: ["payments"], "ev-charging": ["payments"], "service-funds": ["servicefunds"],
  courts: ["courts"], "digital-id": ["digitalid"], customers: ["customers"], "goal-rush": ["goalrush"],
  "gift-card": ["giftcards"], club: ["club"], vip: ["vip"], membership: ["membership"], loyalty: ["loyalty"],
  promos: ["promos"], teams: ["teams"], disputes: ["teams"], tournaments: ["tournaments"], gamezone: ["gamezone"],
  notifications: ["notifications"], complaints: ["complaints"], wheelchair: ["wheelchair"], insurance: ["insurance"], refer: ["refer"], academy: ["academy"], content: ["content"],
  partners: ["content"], verify: ["verify"], inventory: ["inventory"], reports: ["reports"], staff: ["staff"],
  audit: ["audit"], settings: ["settings"],
};

// A page (its sidebar link and its dashboard icon) shows when this account holds at least one permission of that page, even a small one
// such as only "Cancel Booking". It is hidden when the account holds none of them.
export const canSeePage = (slug: string) => {
  const groups = pageGroups[slug];
  if (!groups) return true;
  const mine = currentAdmin()?.permissions ?? [];
  return mine.some((p) => groups.includes(p.split(".")[0]));
};

export function showDenied() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(DENIED_EVENT));
}

// true when the signed-in account may do this; otherwise shows the "ask the Owner" message and returns false.
export function guard(permission: string): boolean {
  if (canDo(permission)) return true;
  showDenied();
  return false;
}
