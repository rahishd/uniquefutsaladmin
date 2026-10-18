import { currentAdmin } from "./auth";

// Every account sees every page. What a person may DO is checked on the server for each action; the portal also checks here first,
// so a person who is not allowed gets a clear message instead of a half-filled form that cannot be saved.
export const DENIED_EVENT = "uf-denied";

export const canDo = (permission: string) => !!currentAdmin()?.permissions?.includes(permission);

// The permission(s) that open each page; holding any one shows the page. A page not listed here is always shown.
const pagePermissions: Record<string, string[]> = {
  overview: ["dashboard.view"], dashboard: ["dashboard.view"], slots: ["slots.view"], bookings: ["bookings.view"], arrivals: ["arrivals.view"],
  sales: ["inventory.sell", "inventory.view"], payments: ["payments.view"], "ev-charging": ["payments.view"], "service-funds": ["servicefunds.view"],
  courts: ["courts.view"], "digital-id": ["digitalid.scan", "digitalid.attendance"], customers: ["customers.view"], "goal-rush": ["goalrush.view"],
  "gift-card": ["giftcards.view"], club: ["club.view"], vip: ["vip.view"], membership: ["membership.view"], loyalty: ["loyalty.view"],
  promos: ["promos.view"], teams: ["teams.view"], disputes: ["teams.view"], tournaments: ["tournaments.view"], gamezone: ["gamezone.view"],
  notifications: ["notifications.send"], complaints: ["complaints.view"], wheelchair: ["wheelchair.view"], insurance: ["insurance.view"], refer: ["refer.view"], academy: ["academy.view"], content: ["content.view"],
  partners: ["content.view"], verify: ["verify.view"], inventory: ["inventory.view"], reports: ["reports.view"], staff: ["staff.manage"],
  audit: ["audit.view"], settings: ["settings.view"],
};

// false when this account has none of the permissions for the page, so the portal hides its link.
export const canSeePage = (slug: string) => {
  const need = pagePermissions[slug];
  return !need || need.some(canDo);
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
