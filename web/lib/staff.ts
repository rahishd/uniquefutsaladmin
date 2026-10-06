import { api } from "./api";

export type Feature = {
  id: string;
  label: string;
  hint: string;
  view?: string[];
  full: string[];
  extras?: { permission: string; label: string }[];
};
export type Preset = { id: string; label: string; hint: string; permissions: string[] };
export type Catalog = { features: Feature[]; presets: Preset[]; assignable: string[] };

export type Account = {
  id: string;
  email: string;
  name: string;
  role: string; // owner | admin | staff | an older role
  accountType: "admin" | "staff";
  legacyRole: boolean;
  permissions: string[];
  effective: string[];
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

export const listStaff = () => api<Account[]>("/admin/staff");
export const getCatalog = () => api<Catalog>("/admin/staff/catalog");
export const createStaff = (b: { email: string; name: string; accountType: "admin" | "staff"; password: string; permissions: string[] }) =>
  api<Account>("/admin/staff", { method: "POST", body: JSON.stringify(b) });
export const updateStaff = (id: string, b: { name?: string; accountType?: "admin" | "staff"; permissions?: string[]; isActive?: boolean; password?: string }) =>
  api<Account>(`/admin/staff/${id}`, { method: "PATCH", body: JSON.stringify(b) });

// ---- the form works with one level per feature; the server stores a flat list of permissions ----
export type Level = "none" | "view" | "full";

export function levelsOf(features: Feature[], perms: string[]): { levels: Record<string, Level>; extras: Record<string, boolean> } {
  const has = new Set(perms);
  const levels: Record<string, Level> = {};
  const extras: Record<string, boolean> = {};
  for (const f of features) {
    levels[f.id] = f.full.every((p) => has.has(p)) ? "full" : f.view && f.view.every((p) => has.has(p)) ? "view" : "none";
    for (const x of f.extras ?? []) extras[x.permission] = has.has(x.permission);
  }
  return { levels, extras };
}

export function permissionsOf(features: Feature[], levels: Record<string, Level>, extras: Record<string, boolean>): string[] {
  const out = new Set<string>();
  for (const f of features) {
    const l = levels[f.id];
    if (l === "full") f.full.forEach((p) => out.add(p));
    else if (l === "view") f.view?.forEach((p) => out.add(p));
    if (l === "full") for (const x of f.extras ?? []) if (extras[x.permission]) out.add(x.permission);
  }
  return [...out];
}

export function randomPassword(): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(14));
  return Array.from(bytes, (n) => chars[n % chars.length]).join("");
}

export const ROLE_LABEL = (a: Account) => (a.role === "owner" ? "Owner" : a.accountType === "admin" ? "Admin" : "Staff");
