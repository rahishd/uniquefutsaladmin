// Who may do what in the admin portal.
//
//   Owner  : everything, including adding accounts and choosing what staff may do. Only the owner can do that, always.
//   Admin  : everything except managing accounts.
//   Staff  : only the small permissions the owner ticked (StaffUser.permissions). Everyone sees every page; what a person
//            may DO is checked on the server for each action, and the portal tells them to contact the owner if they may not.
//
// Older roles (manager, frontdesk, accountant) and older, coarse permission names (bookings.read, payments.write, ...) are
// still understood, so existing accounts keep working until the owner edits them.

export type PermissionItem = { key: string; label: string };
export type Section = { id: string; label: string; permissions: PermissionItem[] };

// One small permission per action, grouped like the pages of the portal. This list is what the owner ticks.
export const SECTIONS: Section[] = [
  { id: "dashboard", label: "Dashboard", permissions: [{ key: "dashboard.view", label: "View Dashboard" }] },
  { id: "bookings", label: "Bookings", permissions: [
    { key: "bookings.view", label: "View Bookings" },
    { key: "bookings.create", label: "Create Booking (walk-in / manual)" },
    { key: "bookings.cancel", label: "Cancel / Reject Booking" },
    { key: "bookings.complete", label: "Complete Booking" },
    { key: "bookings.noshow", label: "Mark No-show" },
    { key: "bookings.stats", label: "Record Goals & Assists" },
  ] },
  { id: "slots", label: "Slots & Arrivals", permissions: [
    { key: "slots.view", label: "View Slots Timeline" },
    { key: "arrivals.view", label: "View Arrivals" },
  ] },
  { id: "payments", label: "Payments", permissions: [
    { key: "payments.view", label: "View Payments" },
    { key: "payments.collect", label: "Collect / Mark Payment Paid" },
    { key: "payments.refund", label: "Record Refunds" },
  ] },
  { id: "courts", label: "Courts & Pricing", permissions: [
    { key: "courts.view", label: "View Prices & Blocked Hours" },
    { key: "courts.price", label: "Edit Court Prices" },
    { key: "courts.block", label: "Block / Unblock Hours" },
  ] },
  { id: "promos", label: "Promo Codes", permissions: [
    { key: "promos.view", label: "View Promo Codes" },
    { key: "promos.create", label: "Add Promo Code" },
    { key: "promos.edit", label: "Edit Promo Code" },
    { key: "promos.delete", label: "Delete Promo Code" },
  ] },
  { id: "customers", label: "Customers", permissions: [
    { key: "customers.view", label: "View Customers" },
    { key: "customers.edit", label: "Edit Customer Details" },
    { key: "customers.suspend", label: "Suspend / Reactivate Account" },
  ] },
  { id: "vip", label: "VIP Privilege", permissions: [
    { key: "vip.view", label: "View VIP Customers" },
    { key: "vip.manage", label: "Give / Change / Remove VIP Code" },
  ] },
  { id: "loyalty", label: "Loyalty Points", permissions: [
    { key: "loyalty.view", label: "View Loyalty Points" },
    { key: "loyalty.goods", label: "Record Goods Sale" },
    { key: "loyalty.adjust", label: "Adjust Points" },
    { key: "loyalty.void", label: "Void Free-game Voucher" },
  ] },
  { id: "membership", label: "Membership", permissions: [
    { key: "membership.view", label: "View Membership Plans" },
    { key: "membership.create", label: "Add Membership Plan" },
    { key: "membership.edit", label: "Edit Membership Plan & Prices" },
  ] },
  { id: "teams", label: "Teams & Challenges", permissions: [
    { key: "teams.view", label: "View Teams, Challenges & Disputes" },
    { key: "teams.resolve", label: "Resolve Disputed Results" },
    { key: "teams.venuepaid", label: "Mark Challenge Game Paid" },
  ] },
  { id: "gamezone", label: "Gamezone (PS5)", permissions: [
    { key: "gamezone.view", label: "View Gamezone Sessions" },
    { key: "gamezone.collect", label: "Collect Gamezone Payment" },
    { key: "gamezone.manage", label: "Complete / Cancel Session" },
    { key: "gamezone.catalog", label: "Edit Rates, Consoles & Games" },
  ] },
  { id: "complaints", label: "Complaints", permissions: [
    { key: "complaints.view", label: "View Complaints" },
    { key: "complaints.reply", label: "Reply & Change Status" },
  ] },
  { id: "notices", label: "Notices", permissions: [{ key: "notifications.send", label: "Send Notices to Customers" }] },
  { id: "reports", label: "Reports & Audit", permissions: [
    { key: "reports.view", label: "View Reports" },
    { key: "audit.view", label: "View Audit Log" },
  ] },
];

// "staff.manage" (add accounts, choose what staff may do) belongs to the owner only and is never offered in the list above.
export const OWNER_ONLY = ["staff.manage"] as const;

export const ASSIGNABLE: string[] = SECTIONS.flatMap((s) => s.permissions.map((p) => p.key));
export const PERMISSIONS = [...ASSIGNABLE, ...OWNER_ONLY] as const;
export type Permission = (typeof PERMISSIONS)[number];

// ---- the older, coarse permission names, expanded into the small ones ----
const EXPAND: Record<string, string[]> = {
  "bookings.read": ["bookings.view", "slots.view", "arrivals.view"],
  "bookings.write": ["bookings.create", "bookings.cancel", "bookings.complete", "bookings.noshow", "bookings.stats"],
  "payments.read": ["payments.view"], "payments.write": ["payments.collect", "payments.refund"],
  "customers.read": ["customers.view"], "customers.write": ["customers.edit", "customers.suspend", "vip.view", "vip.manage"],
  "courts.read": ["courts.view"], "courts.write": ["courts.price", "courts.block"],
  "promos.read": ["promos.view"], "promos.write": ["promos.create", "promos.edit", "promos.delete"],
  "loyalty.read": ["loyalty.view"], "loyalty.write": ["loyalty.goods"],
  "teams.read": ["teams.view"], "teams.write": ["teams.resolve", "teams.venuepaid"],
  "gamezone.read": ["gamezone.view"], "gamezone.write": ["gamezone.collect", "gamezone.manage", "gamezone.catalog"],
  "membership.read": ["membership.view"], "membership.write": ["membership.create", "membership.edit"],
  "complaints.read": ["complaints.view"], "complaints.write": ["complaints.reply"],
  "notifications.write": ["notifications.send"], "reports.read": ["reports.view"], "audit.read": ["audit.view"],
};
const expand = (list: string[]) => [...new Set(list.flatMap((p) => EXPAND[p] ?? [p]))];

const FRONT_DESK = expand(["dashboard.view", "bookings.read", "bookings.write", "payments.read", "payments.write", "customers.read", "vip.view", "courts.read", "promos.read", "loyalty.read", "loyalty.write", "teams.read", "teams.write", "gamezone.read", "gamezone.write", "membership.read", "complaints.read", "complaints.write"]);
const ACCOUNTANT = expand(["dashboard.view", "bookings.read", "payments.read", "payments.write", "customers.read", "vip.view", "courts.read", "promos.read", "loyalty.read", "gamezone.read", "membership.read", "reports.read", "audit.read"]);
const VIEW_ONLY = ASSIGNABLE.filter((k) => k.endsWith(".view"));

// Quick starts in the "Add staff" form. The owner can still tick or untick anything afterwards.
export const PRESETS: { id: string; label: string; hint: string; permissions: string[] }[] = [
  { id: "frontdesk", label: "Front desk", hint: "Bookings, payments, loyalty, teams, Gamezone and complaints", permissions: FRONT_DESK },
  { id: "accountant", label: "Accountant", hint: "Payments, reports and the audit log; view bookings and customers", permissions: ACCOUNTANT },
  { id: "gamezone", label: "Gamezone attendant", hint: "Gamezone sessions and rates, and who is arriving", permissions: ["dashboard.view", "slots.view", "arrivals.view", "gamezone.view", "gamezone.collect", "gamezone.manage", "gamezone.catalog"] },
  { id: "manager", label: "Manager", hint: "Everything on the list", permissions: ASSIGNABLE },
  { id: "viewer", label: "View only", hint: "Can look at every page but change nothing", permissions: VIEW_ONLY },
];

// Older fixed roles, kept so existing accounts keep working until the owner edits them.
const LEGACY: Record<string, string[]> = { manager: ASSIGNABLE, frontdesk: FRONT_DESK, accountant: ACCOUNTANT };

export const isOwnerRole = (role: string) => role === "owner";
export const isAdminRole = (role: string) => role === "owner" || role === "admin";

// The permissions this account really has right now.
export function effectivePermissions(s: { role: string; permissions?: string[] | null }): Permission[] {
  let list: string[];
  if (s.role === "owner") list = [...ASSIGNABLE, ...OWNER_ONLY];
  else if (s.role === "admin") list = ASSIGNABLE;
  else if (s.role === "staff") list = expand(s.permissions ?? []);
  else list = LEGACY[s.role] ?? [];
  return [...new Set(list)].filter((p): p is Permission => (PERMISSIONS as readonly string[]).includes(p));
}

export const ACCOUNT_TYPES = ["admin", "staff"] as const;
