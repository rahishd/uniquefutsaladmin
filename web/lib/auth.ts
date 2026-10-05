import { api, setToken } from "./api";

export type Admin = { id: string; email: string; name: string; role: string; permissions?: string[] };
const ADMIN_KEY = "uf_admin_user";

export async function login(email: string, password: string) {
  const data = await api<{ token: string; admin: Admin }>("/admin/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  setToken(data.token);
  try { localStorage.setItem(ADMIN_KEY, JSON.stringify(data.admin)); } catch {}
  return data.admin;
}

export function logout() {
  setToken(null);
  try { localStorage.removeItem(ADMIN_KEY); } catch {}
}

export function currentAdmin(): Admin | null {
  try { return JSON.parse(localStorage.getItem(ADMIN_KEY) ?? "null"); } catch { return null; }
}

// UI only (hides buttons the role cannot use); the API checks every request again.
export const canDo = (permission: string) => !!currentAdmin()?.permissions?.includes(permission);
