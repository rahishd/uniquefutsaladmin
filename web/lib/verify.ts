import { api } from "./api";

export type OrgType = "school" | "college" | "bank" | "company" | "other";
export const ORGS: { id: OrgType; label: string }[] = [
  { id: "school", label: "School" }, { id: "college", label: "College" }, { id: "bank", label: "Bank" }, { id: "company", label: "Company" }, { id: "other", label: "Other" },
];
export type VerifyDoc = { id: string; code: string; title: string | null; issuedTo: string | null; orgType: OrgType | null; details: string | null; photos: string[]; issuedBy: string | null; revoked: boolean; createdAt: string };
export type VerifyBill = { id: string; code: string; sourceType: string | null; reference: string; customer: string | null; total: number | null; revoked: boolean; createdAt: string };
export type Lookup = { found: false } | { found: true; genuine: boolean; kind: string; code: string; title: string | null; issuedTo: string | null; sourceType: string | null; issuedAt: string; revoked: boolean };

export const listVerify = () => api<{ documents: VerifyDoc[]; bills: VerifyBill[] }>("/admin/verify");
export const lookupCode = (code: string) => api<Lookup>(`/admin/verify/lookup/${code}`);
export const createDocument = (b: { title: string; issuedTo: string; orgType: OrgType; details?: string; photos: string[] }) =>
  api<VerifyDoc>("/admin/verify/documents", { method: "POST", body: JSON.stringify(b) });
export const setRevoked = (id: string, revoked: boolean) => api<VerifyDoc>(`/admin/verify/${id}`, { method: "PATCH", body: JSON.stringify({ revoked }) });
