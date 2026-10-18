import { api, setToken } from "./api";

export type Admin = { id: string; email: string; name: string; role: string; isAdmin?: boolean; isOwner?: boolean; permissions?: string[]; avatar?: string | null };
const ADMIN_KEY = "uf_admin_user";

export async function login(email: string, password: string) {
  const data = await api<{ token: string; admin: Admin }>("/admin/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  setToken(data.token);
  try { localStorage.setItem(ADMIN_KEY, JSON.stringify(data.admin)); } catch {}
  return data.admin;
}

// Re-reads the signed-in staff member (role and permissions) so a permission change takes effect without signing in again.
export async function refreshAdmin(): Promise<Admin | null> {
  const me = await api<Admin>("/admin/auth/me");
  try { localStorage.setItem(ADMIN_KEY, JSON.stringify(me)); } catch {}
  return me;
}

// Sets (data URL) or removes (null) the signed-in person's own profile picture.
export async function setAvatar(image: string | null): Promise<string | null> {
  const { avatar } = await api<{ avatar: string | null }>("/admin/auth/avatar", { method: "POST", body: JSON.stringify({ image }) });
  const me = currentAdmin();
  if (me) { try { localStorage.setItem(ADMIN_KEY, JSON.stringify({ ...me, avatar })); } catch {} }
  return avatar;
}

export function logout() {
  setToken(null);
  try { localStorage.removeItem(ADMIN_KEY); } catch {}
}

export function currentAdmin(): Admin | null {
  try { return JSON.parse(localStorage.getItem(ADMIN_KEY) ?? "null"); } catch { return null; }
}

