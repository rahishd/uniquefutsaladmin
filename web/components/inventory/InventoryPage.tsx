"use client";

import { useEffect, useState } from "react";
import { Boxes, Minus, Package, Pencil, Plus, Search, Tags, Trash2, X } from "lucide-react";
import { Badge } from "../bookings/Badge";
import Sell from "./Sell";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { Category, Overview, Product, STATE, addCategory, addProduct, changeStock, deleteCategory, deleteProduct, editProduct, listCategories, listProducts, overview as fetchOverview, renameCategory, rs } from "@/lib/inventory";

type Tab = "products" | "sell";
const field = "rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");

export default function InventoryPage() {
  const [tab, setTab] = useState<Tab>("products");
  const [ov, setOv] = useState<Overview | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => { fetchOverview().then(setOv).catch(() => {}); }, [tick]);
  const changed = () => setTick((t) => t + 1);

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Inventory &amp; Goods</h1>
        <p className="text-sm text-muted">Products sold at the venue: stock, restocking, counter sales and loyalty points for registered customers.</p>
      </div>
      {ov && (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
          {([
            ["Products", String(ov.products), ""],
            ["Low or out of stock", String(ov.lowStock + ov.outOfStock), ov.lowStock + ov.outOfStock > 0 ? "ring-2 ring-amber-500/50" : ""],
            ["Stock value (cost)", rs(ov.stockCostValue), ""],
            ["Goods on credit (unpaid)", `${rs(ov.goodsDue.amount)} · ${ov.goodsDue.count}`, ov.goodsDue.count > 0 ? "ring-2 ring-red-500/40" : ""],
            ["Sales today", `${rs(ov.salesToday.amount)} · ${ov.salesToday.count}`, ""],
            ["Sales, last 7 days", `${rs(ov.salesWeek.amount)} · ${ov.salesWeek.count}`, ""],
          ] as const).map(([l, n, ring]) => <div key={l} className={`rounded-2xl bg-surface p-3 shadow-sm ${ring}`}><p className="text-lg font-bold sm:text-xl">{n}</p><p className="text-xs text-muted">{l}</p></div>)}
        </div>
      )}
      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-surface p-1 shadow-sm" role="tablist">
        {([["products", "Products"], ["sell", "Sales"]] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold ${tab === id ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}>{label}</button>
        ))}
      </div>
      {tab === "products" && <Products tick={tick} onChanged={changed} />}
      {tab === "sell" && <Sell tick={tick} onChanged={changed} />}
    </div>
  );
}

/* ---------------- products ---------------- */
type Sheet = { kind: "product"; p: Product | null } | { kind: "stock"; p: Product } | { kind: "categories" } | null;

function Products({ tick, onChanged }: { tick: number; onChanged: () => void }) {
  const [items, setItems] = useState<Product[] | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [stock, setStock] = useState<"" | "low" | "out">("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [local, setLocal] = useState(0);
  const reload = () => { setLocal((n) => n + 1); onChanged(); };

  useEffect(() => { const t = setTimeout(() => setQ(search), 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => {
    let live = true;
    listProducts({ q, category: cat, stock }).then((p) => { if (live) { setItems(p); setError(""); } }).catch((e) => { if (live) setError(msg(e)); });
    listCategories().then((c) => { if (live) setCats(c); }).catch(() => {});
    return () => { live = false; };
  }, [q, cat, stock, tick, local]);

  async function remove(p: Product) {
    if (!guard("inventory.products")) return;
    if (!window.confirm(`Delete "${p.name}"? Its stock history goes with it.`)) return;
    try { await deleteProduct(p.id); setNote("Product deleted."); reload(); } catch (e) { setError(msg(e)); }
  }
  const open = (s: Sheet, perm: string) => { if (guard(perm)) setSheet(s); };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <label className="relative min-w-[12rem] flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setItems(null); }} placeholder="Search products" className={`${field} w-full pl-10`} />
        </label>
        <select value={cat} onChange={(e) => { setCat(e.target.value); setItems(null); }} aria-label="Category" className={field}><option value="">All categories</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select value={stock} onChange={(e) => { setStock(e.target.value as "" | "low" | "out"); setItems(null); }} aria-label="Stock level" className={field}><option value="">Any stock</option><option value="low">Low or out</option><option value="out">Out of stock</option></select>
        <button onClick={() => open({ kind: "categories" }, "inventory.products")} className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-2.5 text-sm font-semibold"><Tags size={16} /> Categories</button>
        <button onClick={() => open({ kind: "product", p: null }, "inventory.products")} className="flex items-center gap-1.5 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16} /> Add product</button>
      </div>
      {note && <p className="rounded-xl bg-brand/10 p-3 text-sm text-brand" role="status">{note}</p>}
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!items && !error && <p className="py-8 text-center text-sm text-muted">Loading products…</p>}
      {items?.length === 0 && <div className="grid place-items-center gap-2 rounded-2xl bg-surface py-12 text-center text-muted shadow-sm"><Boxes size={32} strokeWidth={1.5} /><p>{q || cat || stock ? "No products match." : "No products yet. Add a category, then your first product."}</p></div>}
      <ul className="grid items-start gap-3 xl:grid-cols-2">
        {items?.map((p) => {
          const st = STATE[p.state];
          return (
            <li key={p.id} className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{p.name}</p>
                  <p className="text-xs text-muted">{p.category} · {rs(p.price)} per {p.unit}{p.costPrice ? ` · cost ${rs(p.costPrice)}${p.margin !== null ? ` (${p.margin}% margin)` : ""}` : ""}</p>
                </div>
                <div className="text-right"><p className="text-2xl font-bold leading-none">{p.stock}</p><p className="text-[11px] text-muted">{p.unit} left</p></div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge tone={st.tone}>{st.label}{p.state !== "ok" ? ` (warns at ${p.lowStockThreshold})` : ""}</Badge>
                <div className="flex gap-2">
                  <button onClick={() => open({ kind: "stock", p }, "inventory.stock")} className="flex items-center gap-1 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white"><Package size={13} /> Stock</button>
                  <button onClick={() => open({ kind: "product", p }, "inventory.products")} aria-label={`Edit ${p.name}`} className="flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs font-semibold"><Pencil size={13} /> Edit</button>
                  <button onClick={() => remove(p)} aria-label={`Delete ${p.name}`} className="rounded-full border border-red-500/40 p-1.5 text-red-600"><Trash2 size={14} /></button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {sheet?.kind === "product" && <ProductForm p={sheet.p} cats={cats} onClose={() => setSheet(null)} onSaved={(m) => { setNote(m); reload(); }} />}
      {sheet?.kind === "stock" && <StockForm p={sheet.p} onClose={() => setSheet(null)} onSaved={(m) => { setNote(m); reload(); }} />}
      {sheet?.kind === "categories" && <Categories cats={cats} onClose={() => setSheet(null)} onChanged={reload} />}
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()} className="max-h-[94vh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold">{title}</h2><button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-surface-2"><X size={22} /></button></div>
        {children}
      </div>
    </div>
  );
}
const lab = "block space-y-1 text-sm font-medium";
const num = (s: string) => (s.trim() === "" ? NaN : Number(s));

function ProductForm({ p, cats, onClose, onSaved }: { p: Product | null; cats: Category[]; onClose: () => void; onSaved: (m: string) => void }) {
  const [name, setName] = useState(p?.name ?? "");
  const [category, setCategory] = useState(p?.categoryId ?? cats[0]?.id ?? "");
  const [price, setPrice] = useState(p ? String(p.price) : "");
  const [cost, setCost] = useState(p?.costPrice ? String(p.costPrice) : "");
  const [unit, setUnit] = useState(p?.unit ?? "pcs");
  const [low, setLow] = useState(String(p?.lowStockThreshold ?? 10));
  const [opening, setOpening] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!guard("inventory.products")) return;
    setBusy(true); setError("");
    const body = { name: name.trim(), categoryId: category, price: num(price), costPrice: cost.trim() === "" ? null : num(cost), unit: unit.trim() || "pcs", lowStockThreshold: num(low) };
    try {
      if (p) await editProduct(p.id, body); else await addProduct({ ...body, openingStock: num(opening) || 0 });
      onSaved(p ? "Product saved." : "Product added."); onClose();
    } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  }
  const bad = name.trim().length < 2 || !category || !(num(price) > 0) || Number.isNaN(num(low));
  return (
    <Sheet title={p ? "Edit product" : "Add product"} onClose={onClose}>
      {cats.length === 0 && <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-700">Add a category first (the Categories button).</p>}
      <label className={lab}>Name<input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className={`${field} w-full`} /></label>
      <label className={lab}>Category<select value={category} onChange={(e) => setCategory(e.target.value)} className={`${field} w-full`}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <div className="grid grid-cols-2 gap-3">
        <label className={lab}>Selling price (Rs.)<input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={`${field} w-full`} /></label>
        <label className={lab}>Cost price (Rs.) <span className="font-normal text-muted">optional</span><input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} className={`${field} w-full`} /></label>
        <label className={lab}>Unit<input value={unit} maxLength={12} onChange={(e) => setUnit(e.target.value)} placeholder="pcs, bottle, packet" className={`${field} w-full`} /></label>
        <label className={lab}>Warn when stock is at or below<input inputMode="numeric" value={low} onChange={(e) => setLow(e.target.value.replace(/\D/g, ""))} className={`${field} w-full`} /></label>
        {!p && <label className={`${lab} col-span-2`}>Stock you have now<input inputMode="numeric" value={opening} onChange={(e) => setOpening(e.target.value.replace(/\D/g, ""))} className={`${field} w-full`} /></label>}
      </div>
      {p && <p className="text-xs text-muted">To change how many you have, use the Stock button so it is written in the log.</p>}
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      <button onClick={save} disabled={busy || bad} className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : p ? "Save product" : "Add product"}</button>
    </Sheet>
  );
}

function StockForm({ p, onClose, onSaved }: { p: Product; onClose: () => void; onSaved: (m: string) => void }) {
  const [type, setType] = useState<"add" | "remove" | "set">("add");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const n = num(qty);
  const after = Number.isNaN(n) ? p.stock : type === "add" ? p.stock + n : type === "remove" ? p.stock - n : n;

  async function save() {
    if (!guard("inventory.stock")) return;
    setBusy(true); setError("");
    try {
      const r = await changeStock(p.id, { type, quantity: n, reason: reason.trim() || undefined, ...(type === "add" && cost.trim() ? { costPrice: num(cost) } : {}) });
      onSaved(`${p.name}: stock is now ${r.stock}.`); onClose();
    } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  }
  return (
    <Sheet title={`Stock: ${p.name}`} onClose={onClose}>
      <p className="text-sm text-muted">Now in stock: <strong className="text-foreground">{p.stock} {p.unit}</strong></p>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
        {([["add", "Add stock"], ["remove", "Remove"], ["set", "Count"]] as const).map(([v, l]) => (
          <button key={v} type="button" aria-pressed={type === v} onClick={() => setType(v)} className={`rounded-lg px-2 py-2 text-sm font-semibold ${type === v ? "bg-brand text-white" : "text-muted"}`}>{l}</button>
        ))}
      </div>
      <p className="text-xs text-muted">{type === "add" ? "New stock arrived (a delivery)." : type === "remove" ? "Damaged, lost, expired or used by the venue." : "You counted the shelf: enter the real number."}</p>
      <label className={lab}>{type === "set" ? "Counted amount" : "Quantity"}
        <div className="flex items-center gap-2">
          {type !== "set" && <button type="button" onClick={() => setQty(String(Math.max(0, (Number(qty) || 0) - 1)))} aria-label="One less" className="rounded-full border border-line p-2"><Minus size={14} /></button>}
          <input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} className={`${field} w-full`} />
          {type !== "set" && <button type="button" onClick={() => setQty(String((Number(qty) || 0) + 1))} aria-label="One more" className="rounded-full border border-line p-2"><Plus size={14} /></button>}
        </div>
      </label>
      {type === "add" && <label className={lab}>New cost price per {p.unit} (Rs.) <span className="font-normal text-muted">optional</span><input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} className={`${field} w-full`} /></label>}
      <label className={lab}>Note <span className="font-normal text-muted">optional</span><input value={reason} maxLength={120} onChange={(e) => setReason(e.target.value)} placeholder={type === "add" ? "Supplier delivery" : type === "remove" ? "Broken crate" : "Monthly count"} className={`${field} w-full`} /></label>
      {!Number.isNaN(n) && <p className={`text-sm ${after < 0 ? "text-red-600" : "text-muted"}`}>Stock will be <strong>{after}</strong> {p.unit}.</p>}
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      <button onClick={save} disabled={busy || Number.isNaN(n) || after < 0 || (type !== "set" && n < 1)} className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save stock"}</button>
    </Sheet>
  );
}

function Categories({ cats, onClose, onChanged }: { cats: Category[]; onClose: () => void; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState("");
  async function run(fn: () => Promise<unknown>) {
    if (!guard("inventory.products")) return;
    setError("");
    try { await fn(); onChanged(); } catch (e) { setError(msg(e)); }
  }
  return (
    <Sheet title="Categories" onClose={onClose}>
      <div className="flex gap-2">
        <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="New category, for example Drinks" className={`${field} w-full`} aria-label="New category" />
        <button onClick={() => run(async () => { await addCategory(name.trim()); setName(""); })} disabled={name.trim().length < 2} className="rounded-full bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50">Add</button>
      </div>
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      <ul className="space-y-2">
        {cats.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 p-3">
            {editing?.id === c.id ? (
              <>
                <input value={editing.name} onChange={(e) => setEditing({ id: c.id, name: e.target.value })} maxLength={40} className={`${field} w-full`} aria-label="Category name" />
                <button onClick={() => run(async () => { await renameCategory(c.id, editing.name.trim()); setEditing(null); })} className="rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white">Save</button>
              </>
            ) : (
              <>
                <span className="text-sm font-medium">{c.name} <span className="font-normal text-muted">· {c.products} product{c.products === 1 ? "" : "s"}</span></span>
                <span className="flex gap-2">
                  <button onClick={() => setEditing({ id: c.id, name: c.name })} aria-label={`Rename ${c.name}`} className="rounded-full border border-line p-1.5"><Pencil size={14} /></button>
                  <button onClick={() => { if (window.confirm(`Delete the category "${c.name}"?`)) run(() => deleteCategory(c.id)); }} aria-label={`Delete ${c.name}`} className="rounded-full border border-red-500/40 p-1.5 text-red-600"><Trash2 size={14} /></button>
                </span>
              </>
            )}
          </li>
        ))}
        {cats.length === 0 && <li className="text-sm text-muted">No categories yet.</li>}
      </ul>
    </Sheet>
  );
}
