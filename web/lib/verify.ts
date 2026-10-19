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

/** A fresh verification number for a PDF about to be downloaded (null if it cannot be made: the PDF is still produced). */
export async function issuePdfCode(title: string, details = ""): Promise<string | null> {
  try { return (await api<{ code: string }>("/admin/verify/issue", { method: "POST", body: JSON.stringify({ title, details }) })).code; } catch { return null; }
}

/** Prints the verification number and where to check it at the bottom of every page of an A4 jsPDF document (mm). */
export function stampVerification(doc: { getNumberOfPages(): number; setPage(n: number): unknown; setFont(f: string, s: string): { setFontSize(n: number): { setTextColor(r: number, g?: number, b?: number): { text(t: string, x: number, y: number): unknown } } }; setDrawColor(n: number): { line(a: number, b: number, c: number, d: number): unknown } }, code: string | null) {
  if (!code) return;
  for (let p = 1; p <= doc.getNumberOfPages(); p++) {
    doc.setPage(p);
    doc.setDrawColor(200).line(14, 282, 196, 282);
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(12).text(`Verification number: ${code}`, 14, 288);
    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(100).text("Verify this document at Verify Documents in uniquefutsal.com/verify", 14, 293);
  }
}
