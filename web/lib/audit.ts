import { api } from "./api";

export type AuditRow = { id: string; staffId: string; staffName: string; action: string; entity: string; entityId: string | null; details: string | null; ip: string | null; createdAt: string };
export type AuditList = { items: AuditRow[]; total: number; page: number; limit: number };
export type AuditFilters = {
  entities: { name: string; count: number }[]; actions: { name: string; count: number }[]; staff: { id: string; name: string; count: number }[];
  summary: { total: number; today: number; week: number };
};
export type AuditQuery = { q: string; staffId: string; entity: string; action: string; from: string; to: string };

export const PAGE_SIZE = 25;

const qs = (f: AuditQuery, page: number, limit: number) => {
  const p = new URLSearchParams({ page: String(page), limit: String(limit) });
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  return p.toString();
};
export const listAudit = (f: AuditQuery, page: number) => api<AuditList>(`/admin/audit?${qs(f, page, PAGE_SIZE)}`);
export const auditFilters = () => api<AuditFilters>("/admin/audit/filters");

// Up to `max` rows of the current filter (for the download), fetched 100 at a time
export async function allAudit(f: AuditQuery, max = 2000): Promise<AuditRow[]> {
  const out: AuditRow[] = [];
  for (let page = 1; out.length < max; page++) {
    const r = await api<AuditList>(`/admin/audit?${qs(f, page, 100)}`);
    out.push(...r.items);
    if (out.length >= r.total || r.items.length === 0) break;
  }
  return out.slice(0, max);
}

// "walk-in" -> "Walk-in", "mark-paid" -> "Mark paid"
export const nice = (s: string) => { const t = s.replace(/[-_]+/g, " ").trim(); return t.charAt(0).toUpperCase() + t.slice(1); };

// The details are stored as JSON text: show them as a short list of "name: value"
export function detailPairs(details: string | null): { k: string; v: string }[] {
  if (!details) return [];
  try {
    const o = JSON.parse(details);
    if (o === null || typeof o !== "object" || Array.isArray(o)) return [{ k: "Details", v: String(o) }];
    return Object.entries(o as Record<string, unknown>).map(([k, v]) => ({
      k: nice(k.replace(/([a-z])([A-Z])/g, "$1 $2")),
      v: v === null || v === undefined ? "none" : Array.isArray(v) ? v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ") || "none" : typeof v === "object" ? JSON.stringify(v) : String(v),
    }));
  } catch { return [{ k: "Details", v: details }]; }
}

const cell = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
export function downloadAuditCsv(rows: AuditRow[]) {
  const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Kathmandu", hour12: true });
  const lines = [["When (Nepal)", "Staff", "Action", "What", "Record", "Details", "IP"], ...rows.map((r) => [when(r.createdAt), r.staffName, nice(r.action), nice(r.entity), r.entityId, detailPairs(r.details).map((d) => `${d.k}: ${d.v}`).join("; "), r.ip])];
  const url = URL.createObjectURL(new Blob(["﻿" + lines.map((l) => l.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
