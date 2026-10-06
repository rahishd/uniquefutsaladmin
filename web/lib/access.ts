import { currentAdmin } from "./auth";

// Which permission a page needs to be opened. Pages not listed (not built yet) are for admins only.
// This only hides links and shows a friendly message; the server checks every request again.
export const NEEDS: Record<string, string> = {
  bookings: "bookings.read", slots: "bookings.read", arrivals: "bookings.read",
  payments: "payments.read", courts: "courts.read", promos: "promos.read",
  customers: "customers.read", vip: "customers.read", loyalty: "loyalty.read", membership: "membership.read",
  teams: "teams.read", disputes: "teams.read", gamezone: "gamezone.read", complaints: "complaints.read",
  notifications: "notifications.write", reports: "reports.read", audit: "audit.read", staff: "staff.manage",
};

export function canSee(slug: string): boolean {
  const a = currentAdmin();
  if (!a) return false;
  if (a.isAdmin) return true;
  const need = NEEDS[slug];
  return !!need && !!a.permissions?.includes(need);
}
