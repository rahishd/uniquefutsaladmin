import { api } from "./api";

export type PermissionItem = { key: string; label: string };
export type Section = { id: string; label: string; permissions: PermissionItem[] };
export type Preset = { id: string; label: string; hint: string; permissions: string[] };
export type Catalog = { sections: Section[]; presets: Preset[]; assignable: string[] };

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
export const updateStaff = (id: string, b: { name?: string; email?: string; accountType?: "admin" | "staff"; permissions?: string[]; isActive?: boolean; password?: string }) =>
  api<Account>(`/admin/staff/${id}`, { method: "PATCH", body: JSON.stringify(b) });

export const deleteStaff = (id: string) => api<null>(`/admin/staff/${id}`, { method: "DELETE" });

export function randomPassword(): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(14));
  return Array.from(bytes, (n) => chars[n % chars.length]).join("");
}

export const ROLE_LABEL = (a: Account) => (a.role === "owner" ? "Owner" : a.accountType === "admin" ? "Admin" : "Staff");
