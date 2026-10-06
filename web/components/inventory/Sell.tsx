"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Minus, Plus, Search, ShoppingCart } from "lucide-react";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { Product, listProducts, rs, sell } from "@/lib/inventory";

const field = "rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");

// Counter sale: tap products to add them, choose how it was paid, optionally enter a registered customer's number for points.
export default function Sell({ tick, onChanged }: { tick: number; onChanged: () => void }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [pay, setPay] = useState<"cash" | "online">("cash");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ amount: number; items: string; points: number; customerName: string | null } | null>(null);
  const [local, setLocal] = useState(0);

  useEffect(() => {
    let live = true;
    listProducts({}).then((p) => { if (live) setProducts(p); }).catch((e) => { if (live) setError(msg(e)); });
    return () => { live = false; };
  }, [tick, local]);

  const byId = new Map((products ?? []).map((p) => [p.id, p]));
  const lines = Object.entries(cart).map(([id, qty]) => ({ p: byId.get(id), qty })).filter((l): l is { p: Product; qty: number } => !!l.p && l.qty > 0);
  const total = lines.reduce((s, l) => s + Math.round(l.p.price * l.qty), 0);
  const phoneOk = phone === "" || /^9\d{9}$/.test(phone);
  const shown = (products ?? []).filter((p) => !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase()));

  const setQty = (p: Product, qty: number) => setCart((c) => ({ ...c, [p.id]: Math.max(0, Math.min(qty, p.stock)) }));

  async function complete() {
    if (!guard("inventory.sell")) return;
    setBusy(true); setError("");
    try {
      const r = await sell({ payment: pay, ...(phone ? { phone } : {}), items: lines.map((l) => ({ productId: l.p.id, quantity: l.qty })) });
      setDone(r); setCart({}); setPhone(""); setLocal((n) => n + 1); onChanged();
    } catch (e) { setError(msg(e)); setLocal((n) => n + 1); } finally { setBusy(false); }
  }

  if (done) {
    return (
      <div className="grid place-items-center gap-3 rounded-2xl bg-surface py-12 text-center shadow-sm">
        <CheckCircle2 size={44} className="text-brand" />
        <h2 className="text-xl font-bold">Sale recorded: {rs(done.amount)}</h2>
        <p className="max-w-sm text-sm text-muted">{done.items}</p>
        {done.customerName && <p className="text-sm">{done.customerName} earned <strong>{done.points}</strong> loyalty point{done.points === 1 ? "" : "s"}.</p>}
        <button onClick={() => setDone(null)} className="rounded-full bg-brand px-8 py-3 text-sm font-semibold text-white">New sale</button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-3">
        <label className="relative block">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products" className={`${field} w-full pl-10`} />
        </label>
        {!products && !error && <p className="py-8 text-center text-sm text-muted">Loading products…</p>}
        {products?.length === 0 && <p className="rounded-2xl bg-surface py-10 text-center text-sm text-muted shadow-sm">No products yet. Add some in the Products tab.</p>}
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {shown.map((p) => {
            const inCart = cart[p.id] ?? 0;
            return (
              <li key={p.id}>
                <button type="button" disabled={p.stock <= inCart} onClick={() => setQty(p, inCart + 1)} aria-label={`Add ${p.name}`}
                  className={`relative w-full rounded-2xl bg-surface p-3 text-left shadow-sm disabled:opacity-50 ${inCart ? "ring-2 ring-brand" : "hover:ring-2 hover:ring-brand/40"}`}>
                  <p className="truncate text-sm font-semibold">{p.name}</p>
                  <p className="text-sm text-brand">{rs(p.price)}</p>
                  <p className={`text-xs ${p.state === "ok" ? "text-muted" : p.state === "low" ? "text-amber-600" : "text-red-600"}`}>{p.stock <= 0 ? "Out of stock" : `${p.stock} ${p.unit} left`}</p>
                  {inCart > 0 && <span className="absolute right-2 top-2 rounded-full bg-brand px-2 text-xs font-bold text-white">{inCart}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <aside className="h-fit space-y-4 rounded-2xl bg-surface p-4 shadow-sm lg:sticky lg:top-20" aria-label="Sale">
        <h2 className="flex items-center gap-2 font-semibold"><ShoppingCart size={18} /> This sale</h2>
        {lines.length === 0 && <p className="text-sm text-muted">Tap a product to add it.</p>}
        <ul className="space-y-2">
          {lines.map(({ p, qty }) => (
            <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{p.name}<span className="block text-xs text-muted">{rs(p.price)} each</span></span>
              <span className="flex items-center gap-1">
                <button onClick={() => setQty(p, qty - 1)} aria-label={`One less ${p.name}`} className="rounded-full border border-line p-1"><Minus size={13} /></button>
                <span className="w-6 text-center font-semibold">{qty}</span>
                <button onClick={() => setQty(p, qty + 1)} disabled={qty >= p.stock} aria-label={`One more ${p.name}`} className="rounded-full border border-line p-1 disabled:opacity-30"><Plus size={13} /></button>
              </span>
              <span className="w-20 text-right font-semibold">{rs(p.price * qty)}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-line pt-3"><span className="font-semibold">Total</span><span className="text-xl font-bold">{rs(total)}</span></div>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
          {([["cash", "Cash"], ["online", "Online / QR"]] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={pay === v} onClick={() => setPay(v)} className={`rounded-lg py-2 text-sm font-semibold ${pay === v ? "bg-brand text-white" : "text-muted"}`}>{l}</button>)}
        </div>
        <label className="block space-y-1 text-sm font-medium">Customer number <span className="font-normal text-muted">(optional, for points)</span>
          <input inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="98XXXXXXXX" className={`${field} w-full`} />
        </label>
        {phone && !phoneOk && <p className="text-xs text-red-600">Enter all 10 digits, starting with 9.</p>}
        {phone && phoneOk && total >= 100 && <p className="text-xs text-muted">Earns {Math.floor(total / 100)} loyalty point{Math.floor(total / 100) === 1 ? "" : "s"} (Rs. 100 = 1).</p>}
        {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
        <button onClick={complete} disabled={busy || lines.length === 0 || !phoneOk} className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : `Complete sale ${total ? rs(total) : ""}`}</button>
      </aside>
    </div>
  );
}
