// Role -> permissions. One place to change who may do what.
export const PERMISSIONS = [
  "bookings.read", "bookings.write",
  "payments.read", "payments.write",
  "customers.read", "customers.write",
  "courts.write", "promos.write",
  "loyalty.read", "loyalty.write", "loyalty.adjust",
  "teams.read", "teams.write",
  "gamezone.read", "gamezone.write",
  "membership.read", "membership.write",
  "notifications.write",
  "reports.read", "audit.read",
  "settings.write", "staff.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export const ROLES = ["owner", "manager", "frontdesk", "accountant"] as const;
export type Role = (typeof ROLES)[number];

const all = [...PERMISSIONS] as Permission[];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: all,
  manager: all.filter((p) => p !== "staff.manage"),
  frontdesk: ["bookings.read", "bookings.write", "payments.read", "payments.write", "customers.read", "loyalty.read", "loyalty.write", "teams.read", "teams.write", "gamezone.read", "gamezone.write", "membership.read"],
  accountant: ["bookings.read", "payments.read", "payments.write", "customers.read", "loyalty.read", "gamezone.read", "membership.read", "reports.read", "audit.read"],
};

export const can = (role: string, p: Permission) => (ROLE_PERMISSIONS[role as Role] ?? []).includes(p);
