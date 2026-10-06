// Who may do what in the admin portal.
//
//   Admin accounts (role "owner" or "admin") get ALL access, including managing staff accounts.
//   Staff accounts (role "staff") get only the permissions an admin ticked for them (StaffUser.permissions).
//   Older roles (manager, frontdesk, accountant) still work from the fixed lists below until an admin edits the account,
//   which turns it into a normal Staff account with the ticked permissions.
//
// Staff can never be given "staff.manage" (managing accounts) or "settings.write": those are admin only.

export const PERMISSIONS = [
  "bookings.read", "bookings.write",
  "payments.read", "payments.write",
  "customers.read", "customers.write",
  "courts.read", "courts.write",
  "promos.read", "promos.write",
  "loyalty.read", "loyalty.write", "loyalty.adjust",
  "teams.read", "teams.write",
  "gamezone.read", "gamezone.write",
  "membership.read", "membership.write",
  "complaints.read", "complaints.write",
  "notifications.write",
  "reports.read", "audit.read",
  "settings.write", "staff.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

// ---- the features an admin can switch on for a staff member, one per page of the portal ----
export type Feature = {
  id: string;
  label: string;
  hint: string;
  view?: Permission[]; // "View only" level
  full: Permission[]; // "Full access" level (includes view)
  extras?: { permission: Permission; label: string }[]; // optional extra, needs full access
};

export const FEATURES: Feature[] = [
  { id: "bookings", label: "Bookings, Slots & Arrivals", hint: "See the day timeline and bookings; book walk-ins, cancel, complete", view: ["bookings.read"], full: ["bookings.read", "bookings.write"] },
  { id: "payments", label: "Payments", hint: "See paid and unpaid; collect payments and record refunds", view: ["payments.read"], full: ["payments.read", "payments.write"] },
  { id: "courts", label: "Courts & Pricing", hint: "See prices; change prices and block hours", view: ["courts.read"], full: ["courts.read", "courts.write"] },
  { id: "promos", label: "Promo Codes", hint: "See promo codes; create, change and remove them", view: ["promos.read"], full: ["promos.read", "promos.write"] },
  { id: "customers", label: "Customers & VIP Privilege", hint: "See customers; edit, suspend, give VIP codes", view: ["customers.read"], full: ["customers.read", "customers.write"] },
  { id: "loyalty", label: "Loyalty Points", hint: "See points; record goods sales", view: ["loyalty.read"], full: ["loyalty.read", "loyalty.write"], extras: [{ permission: "loyalty.adjust", label: "Adjust points and void free-game vouchers" }] },
  { id: "membership", label: "Membership plans", hint: "See plans; create and edit plans and prices", view: ["membership.read"], full: ["membership.read", "membership.write"] },
  { id: "teams", label: "Teams, Challenges & Disputes", hint: "See teams; resolve disputes, mark challenge games paid", view: ["teams.read"], full: ["teams.read", "teams.write"] },
  { id: "gamezone", label: "Gamezone (PS5)", hint: "See sessions; collect, cancel; change rates, consoles and games", view: ["gamezone.read"], full: ["gamezone.read", "gamezone.write"] },
  { id: "complaints", label: "Complaints", hint: "See complaints; reply and change status", view: ["complaints.read"], full: ["complaints.read", "complaints.write"] },
  { id: "notifications", label: "Send notices to customers", hint: "Send promo, tournament and general notices", full: ["notifications.write"] },
  { id: "reports", label: "Reports", hint: "Revenue, occupancy and loyalty reports", view: ["reports.read"], full: ["reports.read"] },
  { id: "audit", label: "Audit log", hint: "See who changed what", view: ["audit.read"], full: ["audit.read"] },
];

// Everything an admin may tick for a staff member.
export const ASSIGNABLE: Permission[] = [...new Set(FEATURES.flatMap((f) => [...f.full, ...(f.extras?.map((x) => x.permission) ?? [])]))];

const all = [...PERMISSIONS] as Permission[];
const ADMIN_ONLY: Permission[] = ["staff.manage", "settings.write"];
const view = [...new Set(FEATURES.flatMap((f) => f.view ?? []))];

// Quick starts in the "Add staff" form. The admin can still tick or untick anything.
export const PRESETS: { id: string; label: string; hint: string; permissions: Permission[] }[] = [
  { id: "frontdesk", label: "Front desk", hint: "Bookings, payments, customers, loyalty, teams, Gamezone, complaints", permissions: ["bookings.read", "bookings.write", "payments.read", "payments.write", "customers.read", "courts.read", "promos.read", "loyalty.read", "loyalty.write", "teams.read", "teams.write", "gamezone.read", "gamezone.write", "membership.read", "complaints.read", "complaints.write"] },
  { id: "accountant", label: "Accountant", hint: "Payments, reports and the audit log; view bookings and customers", permissions: ["bookings.read", "payments.read", "payments.write", "customers.read", "courts.read", "promos.read", "loyalty.read", "gamezone.read", "membership.read", "reports.read", "audit.read"] },
  { id: "gamezone", label: "Gamezone attendant", hint: "Gamezone sessions and rates, and who is arriving", permissions: ["bookings.read", "gamezone.read", "gamezone.write"] },
  { id: "manager", label: "Manager", hint: "Everything staff can be given", permissions: ASSIGNABLE },
  { id: "viewer", label: "View only", hint: "Can look at every page but change nothing", permissions: view },
];

// Older fixed roles, kept so existing accounts keep working until an admin edits them.
const LEGACY: Record<string, Permission[]> = {
  manager: all.filter((p) => !ADMIN_ONLY.includes(p) || p === "settings.write"),
  frontdesk: PRESETS[0].permissions,
  accountant: PRESETS[1].permissions,
};

export const isAdminRole = (role: string) => role === "owner" || role === "admin";

// The permissions this account really has right now.
export function effectivePermissions(s: { role: string; permissions?: string[] | null }): Permission[] {
  if (isAdminRole(s.role)) return all;
  if (s.role === "staff") return (s.permissions ?? []).filter((p): p is Permission => (ASSIGNABLE as string[]).includes(p));
  return LEGACY[s.role] ?? [];
}

export const ACCOUNT_TYPES = ["admin", "staff"] as const;
