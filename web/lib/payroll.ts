import { api } from "./api";

// Payroll (Admin): each person's monthly salary, what was paid and what is still owed (unpaid salary carries over to the next month).
export type PayrollRow = {
  staffId: string; name: string; email: string; role: string; isActive: boolean;
  salary: number | null; previousDues: number; paid: number; remaining: number;
};
export type PayrollPage = {
  month: string; currentMonth: string;
  totals: { salaries: number; paid: number; stillToPay: number; owed: number };
  rows: PayrollRow[]; canManage: boolean;
};
export type PayrollMonth = { month: string; salary: number | null; previousDues: number; paid: number; remaining: number };
export type PayrollPayment = { id: string; month: string; amount: number; note: string | null; paidByName: string; createdAt: string };
export type PayrollHistory = { staff: { id: string; name: string; email: string; role: string }; months: PayrollMonth[]; payments: PayrollPayment[] };

const json = (b: unknown) => ({ body: JSON.stringify(b) });
export const getPayroll = (month?: string) => api<PayrollPage>(`/admin/payroll${month ? `?month=${month}` : ""}`);
export const getPayrollHistory = (id: string) => api<PayrollHistory>(`/admin/payroll/staff/${id}/history`);
export const setSalary = (id: string, month: string, amount: number) => api<{ id: string }>(`/admin/payroll/staff/${id}/salary`, { method: "PUT", ...json({ month, amount }) });
export const payStaff = (id: string, month: string, amount: number, note?: string) => api<{ id: string }>(`/admin/payroll/staff/${id}/pay`, { method: "POST", ...json({ month, amount, note: note || undefined }) });
export const removePayment = (pid: string) => api<{ id: string }>(`/admin/payroll/payments/${pid}`, { method: "DELETE" });

/** "NPR 9,000.00" */
export const npr = (n: number) => `NPR ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** "November 2026" */
export const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
export const shiftMonth = (m: string, by: number) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
export const roleLabel = (r: string) => (r === "owner" ? "Owner" : r === "admin" ? "Admin" : "Staff");
