// Fetch wrapper for the Unique Futsal API. Only the public API address is configured here; no secrets.
import { showDenied } from "./access";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5100/api";
const TOKEN_KEY = "uf_admin_token";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};

export const setToken = (t: string | null) => {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
};

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  const body = await res.json().catch(() => null);
  if (res.status === 401 && token) {
    // Session expired or account disabled: sign out and go to the login page.
    setToken(null);
    if (typeof window !== "undefined") window.location.replace("/login");
  }
  if (res.status === 403) showDenied();
  if (!res.ok) throw new ApiError(res.status, body?.message ?? `Request failed (${res.status})`);
  return (body?.data ?? body) as T;
}
