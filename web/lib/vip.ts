import { api } from "./api";
import { rs } from "./bookings";

export type VipType = "percent" | "flat";
export type VipStatus = "" | "active" | "paused" | "unclaimed";

export type VipItem = {
  phone: string;
  customerName: string | null;
  accountActive: boolean;
  code: string;
  type: VipType;
  value: number;
  active: boolean;
  note: string | null;
  claimedAt: string | null;
  createdAt: string;
  usage: { games: number; discountGiven: number };
};

export type VipList = {
  items: VipItem[];
  total: number;
  page: number;
  limit: number;
  totals: { customers: number; active: number; paused: number; entered: number; games: number; discountGiven: number };
};

export const PAGE_SIZE = 20;

export const listVip = (p: { status: VipStatus; q: string; page: number }) => {
  const qs = new URLSearchParams({ page: String(p.page), limit: String(PAGE_SIZE) });
  if (p.status) qs.set("status", p.status);
  if (p.q.trim()) qs.set("q", p.q.trim());
  return api<VipList>(`/admin/vip?${qs}`);
};

export const generateCode = () => api<{ code: string }>("/admin/vip/generate-code").then((r) => r.code);

export const giveVip = (b: { phone: string; code?: string; type: VipType; value: number; note?: string | null }) =>
  api<VipItem>("/admin/vip", { method: "POST", body: JSON.stringify(b) });

export const describe = (v: { type: VipType; value: number }) => (v.type === "percent" ? `${v.value}% off` : `${rs(v.value)} off`);

export async function copyText(t: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    return false;
  }
}
