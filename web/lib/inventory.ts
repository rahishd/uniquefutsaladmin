import { api } from "./api";

export type StockState = "ok" | "low" | "out";
export type Product = {
  id: string; name: string; description: string | null; price: number; costPrice: number | null; unit: string; stock: number; lowStockThreshold: number;
  categoryId: string; category: string; state: StockState; margin: number | null;
};
export type Category = { id: string; name: string; products: number };
export type Overview = {
  products: number; outOfStock: number; lowStock: number; stockCostValue: number; stockRetailValue: number;
  salesToday: { amount: number; count: number }; salesWeek: { amount: number; count: number }; goodsDue: { amount: number; count: number };
};
export type Log = { id: string; product: string; unit: string; change: number; price: number | null; reason: string | null; createdAt: string };
export type Sale = { credit?: "due" | "paid" | null; id: string; amount: number; items: string | null; soldAt: string; customerPhone: string | null; customerName: string | null; soldBy: string | null };
export type Paged<T> = { items: T[]; total: number; page: number; limit: number };
export type ProductInput = { name: string; description?: string | null; price: number; costPrice?: number | null; unit: string; lowStockThreshold: number; categoryId: string };

export const PAGE_SIZE = 25;
export const rs = (n: number) => `Rs. ${Math.round(n).toLocaleString("en-IN")}`;

export const STATE: Record<StockState, { label: string; tone: string }> = {
  ok: { label: "In stock", tone: "bg-brand/15 text-brand" },
  low: { label: "Low stock", tone: "bg-amber-500/15 text-amber-600" },
  out: { label: "Out of stock", tone: "bg-red-500/15 text-red-600" },
};

export const overview = () => api<Overview>("/admin/inventory/overview");
export const listCategories = () => api<Category[]>("/admin/inventory/categories");
export const addCategory = (name: string) => api<Category>("/admin/inventory/categories", { method: "POST", body: JSON.stringify({ name }) });
export const renameCategory = (id: string, name: string) => api<null>(`/admin/inventory/categories/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });
export const deleteCategory = (id: string) => api<null>(`/admin/inventory/categories/${id}`, { method: "DELETE" });

export const listProducts = (p: { q?: string; category?: string; stock?: "low" | "out" | "" }) => {
  const qs = new URLSearchParams();
  if (p.q?.trim()) qs.set("q", p.q.trim());
  if (p.category) qs.set("category", p.category);
  if (p.stock) qs.set("stock", p.stock);
  return api<Product[]>(`/admin/inventory/products?${qs}`);
};
export const addProduct = (b: ProductInput & { openingStock: number }) => api<Product>("/admin/inventory/products", { method: "POST", body: JSON.stringify(b) });
export const editProduct = (id: string, b: Partial<ProductInput>) => api<Product>(`/admin/inventory/products/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteProduct = (id: string) => api<null>(`/admin/inventory/products/${id}`, { method: "DELETE" });
export const changeStock = (id: string, b: { type: "add" | "remove" | "set"; quantity: number; reason?: string; costPrice?: number }) =>
  api<Product>(`/admin/inventory/products/${id}/stock`, { method: "POST", body: JSON.stringify(b) });

export type BillLine = { type: "game" | "goods"; label: string; quantity: number; amount: number };
export type CustomerGame = { id: string; code: string; date: string; startTime: string; endTime: string; total: number; status: string; paid: boolean; paymentMethod: string; pointsIfCompleted: number; upcoming: boolean };
export type GoodsDueItem = { id: string; items: string; amount: number; createdAt: string };
export type CustomerBill = { customer: { phone: string; name: string | null } | null; games: CustomerGame[]; goodsDues: GoodsDueItem[] };
export type PayArgs = { payment?: "cash" | "online" | "due"; payments?: { method: "cash" | "esewa" | "fonepay"; amount: number }[] };
export type BillResult = { id: string; code: string; due?: false; total: number; goodsTotal: number; gameTotal: number; lines: BillLine[]; customerName: string | null; pointsGoods: number; pointsGames: number; gamesWaitingForPoints: number };
export type Bill = { id: string; code: string; customerPhone: string; customerName: string | null; total: number; goodsTotal: number; gameTotal: number; paymentMethod: string; lines: BillLine[]; points: number; createdAt: string };

export const customerBill = (phone: string) => api<CustomerBill>(`/admin/inventory/customer-bill?phone=${phone}`);
export type CreditResult = { due: true; dueId: string; total: number; lines: BillLine[]; customerName: string | null };
export const checkout = (b: PayArgs & { phone: string; items: { productId: string; quantity: number }[]; bookingIds: string[]; goodsDueIds: string[] }) =>
  api<BillResult | CreditResult>("/admin/inventory/checkout", { method: "POST", body: JSON.stringify(b) });
export const listBills = (page: number) => api<Paged<Bill>>(`/admin/inventory/bills?page=${page}&limit=${PAGE_SIZE}`);

export const listLogs = (page: number) => api<Paged<Log>>(`/admin/inventory/logs?page=${page}&limit=${PAGE_SIZE}`);
export const listSales = (page: number) => api<Paged<Sale>>(`/admin/inventory/sales?page=${page}&limit=${PAGE_SIZE}`);
export const sell = (b: PayArgs & { phone?: string; items: { productId: string; quantity: number }[] }) =>
  api<{ id: string; amount: number; items: string; points: number; customerName: string | null }>("/admin/inventory/sales", { method: "POST", body: JSON.stringify(b) });
