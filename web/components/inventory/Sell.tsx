"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Minus, Plus, Search, ShoppingCart } from "lucide-react";
import PaySplit, { INITIAL_PAY, PayState, paymentsFor } from "../PaySplit";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { BillResult, CreditResult, CustomerBill, Product, checkout, customerBill, listProducts, rs, sell } from "@/lib/inventory";

const field = "rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");
const dayName = (key: string) => new Date(`${key}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const hour12 = (t: string) => { const h = Number(t.slice(0, 2)); return `${h % 12 || 12}${t.slice(2)} ${h < 12 ? "AM" : "PM"}`; };

// Counter sale and final bill. Tap products to add them (or type a bigger quantity). With a registered customer's number the bill also lists
// their recent games, so goods and games are paid together, stored on their account, and earn loyalty points.
export default function Sell({ tick, onChanged }: { tick: number; onChanged: () => void }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [pay, setPay] = useState<PayState>(INITIAL_PAY);
  const [dueOn, setDueOn] = useState<Record<string, boolean>>({}); // goods on credit chosen for this bill
  const [phone, setPhone] = useState("");
  const [bill, setBill] = useState<{ phone: string; data: CustomerBill } | null>(null);
  const [games, setGames] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<BillResult | CreditResult | { simple: true; amount: number; items: string } | null>(null);
  const [local, setLocal] = useState(0);

  useEffect(() => {
    let live = true;
    listProducts({}).then((p) => { if (live) setProducts(p); }).catch((e) => { if (live) setError(msg(e)); });
    return () => { live = false; };
  }, [tick, local]);

  const phoneOk = /^9\d{9}$/.test(phone);
  // the customer's recent games, looked up when a full number is typed
  useEffect(() => {
    if (!phoneOk) return;
    let live = true;
    customerBill(phone).then((d) => {
      if (!live) return;
      setBill({ phone, data: d });
      setGames(Object.fromEntries(d.games.filter((g) => !g.paid).map((g) => [g.id, true]))); // what they still owe is ticked
      setDueOn(Object.fromEntries(d.goodsDues.map((g) => [g.id, true])));
    }).catch(() => { if (live) setBill(null); });
    return () => { live = false; };
  }, [phone, phoneOk, local]);

  const customer = phoneOk && bill?.phone === phone ? bill.data : null;
  const known = customer?.customer ?? null;
  const byId = new Map((products ?? []).map((p) => [p.id, p]));
  const lines = Object.entries(cart).map(([id, qty]) => ({ p: byId.get(id), qty })).filter((l): l is { p: Product; qty: number } => !!l.p && l.qty > 0);
  const goodsTotal = lines.reduce((s, l) => s + Math.round(l.p.price * l.qty), 0);
  const chosenGames = (customer?.games ?? []).filter((g) => games[g.id] && !g.paid);
  const gameTotal = chosenGames.reduce((s, g) => s + g.total, 0);
  const chosenDues = (customer?.goodsDues ?? []).filter((d) => dueOn[d.id]);
  const dueTotal = chosenDues.reduce((s, d) => s + d.amount, 0);
  const total = goodsTotal + gameTotal + dueTotal;
  const ready = paymentsFor(total, pay);
  const canCredit = !!known && lines.length > 0 && chosenGames.length === 0 && chosenDues.length === 0; // goods only can go on the account
  const goodsPts = known ? Math.floor((goodsTotal + dueTotal) / 100) : 0;
  const gamePts = Math.round(chosenGames.filter((g) => !g.upcoming).reduce((s, g) => s + g.pointsIfCompleted, 0) * 10) / 10;
  const waiting = chosenGames.filter((g) => g.upcoming).length;
  const shown = (products ?? []).filter((p) => !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase()));
  const setQty = (p: Product, qty: number) => setCart((c) => ({ ...c, [p.id]: Math.max(0, Math.min(Number.isFinite(qty) ? qty : 0, p.stock)) }));

  function reset() { setCart({}); setPhone(""); setBill(null); setPay(INITIAL_PAY); setLocal((n) => n + 1); onChanged(); }

  async function complete(onAccount = false) {
    if (!guard("inventory.sell")) return;
    if (!onAccount && (chosenGames.length || chosenDues.length) && !guard("payments.collect")) return;
    if (!onAccount && ready.problem) return setError(ready.problem);
    setBusy(true); setError("");
    const items = lines.map((l) => ({ productId: l.p.id, quantity: l.qty }));
    const how = ready.payments ? { payments: ready.payments, fonepayQrId: ready.fonepayQrId } : { payment: ready.single === "cash" ? ("cash" as const) : ("online" as const), fonepayQrId: ready.fonepayQrId };
    try {
      if (onAccount && phone) setDone(await checkout({ phone, payment: "due", items, bookingIds: [], goodsDueIds: [] }));
      else if (phone && known) setDone(await checkout({ phone, ...how, items, bookingIds: chosenGames.map((g) => g.id), goodsDueIds: chosenDues.map((d) => d.id) }));
      else {
        const r = await sell({ ...how, items });
        setDone({ simple: true, amount: r.amount, items: r.items });
      }
      reset();
    } catch (e) { setError(msg(e)); setLocal((n) => n + 1); } finally { setBusy(false); }
  }

  if (done) {
    return (
      <div className="mx-auto grid max-w-md place-items-center gap-3 rounded-2xl bg-surface p-8 text-center shadow-sm">
        <CheckCircle2 size={44} className="text-brand" />
        {"due" in done && done.due ? (
          <>
            <h2 className="text-xl font-bold">Put on {done.customerName ?? "the customer"}&apos;s account: {rs(done.total)}</h2>
            <ul className="w-full space-y-1 border-y border-line py-3 text-left text-sm">
              {done.lines.map((l, i) => <li key={i} className="flex justify-between gap-3"><span>{l.quantity > 1 ? `${l.quantity} x ` : ""}{l.label}</span><span className="font-semibold">{rs(l.amount)}</span></li>)}
            </ul>
            <p className="text-xs text-muted">The stock is taken. It shows as an inventory due the next time you open one of this customer&apos;s unpaid bookings or make a bill. Loyalty points are added when it is paid.</p>
          </>
        ) : "simple" in done ? (
          <>
            <h2 className="text-xl font-bold">Sale recorded: {rs(done.amount)}</h2>
            <p className="max-w-sm text-sm text-muted">{done.items}</p>
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold">Bill {(done as BillResult).code}: {rs((done as BillResult).total)}</h2>
            <p className="text-sm text-muted">{done.customerName}</p>
            <ul className="w-full space-y-1 border-y border-line py-3 text-left text-sm">
              {done.lines.map((l, i) => <li key={i} className="flex justify-between gap-3"><span>{l.type === "goods" && l.quantity > 1 ? `${l.quantity} x ` : ""}{l.label}</span><span className="font-semibold">{rs(l.amount)}</span></li>)}
              <li className="flex justify-between border-t border-line pt-2 text-base font-bold"><span>Total</span><span>{rs(done.total)}</span></li>
            </ul>
            <p className="text-sm">Loyalty points added: <strong>{Math.round((done.pointsGoods + done.pointsGames) * 10) / 10}</strong>{done.pointsGoods || done.pointsGames ? ` (goods ${done.pointsGoods}, games ${done.pointsGames})` : ""}</p>
            {done.gamesWaitingForPoints > 0 && <p className="text-xs text-muted">{done.gamesWaitingForPoints} game{done.gamesWaitingForPoints === 1 ? "" : "s"} not played yet: the points are added when the game is completed.</p>}
            <p className="text-xs text-muted">This bill is now in the customer&apos;s payment history in the app.</p>
          </>
        )}
        <button onClick={() => setDone(null)} className="mt-2 rounded-full bg-brand px-8 py-3 text-sm font-semibold text-white">New sale</button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
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
        <h2 className="flex items-center gap-2 font-semibold"><ShoppingCart size={18} /> {known ? "Final bill" : "This sale"}</h2>

        <label className="block space-y-1 text-sm font-medium">Customer number <span className="font-normal text-muted">(optional)</span>
          <input inputMode="numeric" value={phone} onChange={(e) => { setPhone(e.target.value.replace(/\D/g, "").slice(0, 10)); setError(""); }} placeholder="98XXXXXXXX" className={`${field} w-full`} />
        </label>
        {phone && !phoneOk && <p className="text-xs text-red-600">Enter all 10 digits, starting with 9.</p>}
        {phoneOk && customer && !known && <p className="rounded-xl bg-amber-500/10 p-2 text-xs text-amber-700">This number is not registered, so there is no account for the bill or points. Clear it for a walk-in sale.</p>}
        {known && <p className="rounded-xl bg-brand/10 p-2 text-sm font-semibold text-brand">{known.name ?? "Registered customer"}</p>}

        {known && customer && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">Games (last 7 days)</p>
            {customer.games.length === 0 && <p className="text-xs text-muted">No games in the last 7 days.</p>}
            <ul className="space-y-1.5">
              {customer.games.map((g) => (
                <li key={g.id}>
                  <label className={`flex items-center gap-2 rounded-xl p-2 text-sm ${g.paid ? "bg-surface-2 opacity-70" : "border border-line"}`}>
                    <input type="checkbox" disabled={g.paid} checked={!!games[g.id] && !g.paid} onChange={(e) => setGames((x) => ({ ...x, [g.id]: e.target.checked }))} className="h-4 w-4 accent-[var(--brand)]" />
                    <span className="min-w-0 flex-1"><span className="block truncate">{dayName(g.date)}, {hour12(g.startTime)}</span><span className="block text-[11px] text-muted">{g.code} · {g.paid ? "Paid" : g.upcoming ? "Not played yet" : "Played, unpaid"}</span></span>
                    <span className="font-semibold">{rs(g.total)}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        {known && customer && customer.goodsDues.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">Inventory dues (goods on credit)</p>
            <ul className="space-y-1.5">
              {customer.goodsDues.map((d) => (
                <li key={d.id}>
                  <label className="flex items-center gap-2 rounded-xl border border-line p-2 text-sm">
                    <input type="checkbox" checked={!!dueOn[d.id]} onChange={(e) => setDueOn((x) => ({ ...x, [d.id]: e.target.checked }))} className="h-4 w-4 accent-[var(--brand)]" />
                    <span className="min-w-0 flex-1 truncate">{d.items}</span>
                    <span className="font-semibold">{rs(d.amount)}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-2 border-t border-line pt-3">
          <p className="text-sm font-semibold">Goods</p>
          {lines.length === 0 && <p className="text-sm text-muted">Tap a product to add it.</p>}
          <ul className="space-y-2">
            {lines.map(({ p, qty }) => (
              <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{p.name}<span className="block text-xs text-muted">{rs(p.price)} each</span></span>
                <span className="flex items-center gap-1">
                  <button onClick={() => setQty(p, qty - 1)} aria-label={`One less ${p.name}`} className="rounded-full border border-line p-1"><Minus size={13} /></button>
                  <input inputMode="numeric" value={qty} onChange={(e) => setQty(p, Number(e.target.value.replace(/\D/g, "")) || 0)} aria-label={`Quantity of ${p.name}`} className="w-14 rounded-lg border border-line bg-surface px-1 py-1 text-center text-sm font-semibold outline-none focus:border-brand" />
                  <button onClick={() => setQty(p, qty + 1)} disabled={qty >= p.stock} aria-label={`One more ${p.name}`} className="rounded-full border border-line p-1 disabled:opacity-30"><Plus size={13} /></button>
                </span>
                <span className="w-20 text-right font-semibold">{rs(p.price * qty)}</span>
              </li>
            ))}
          </ul>
          {lines.length > 0 && <p className="text-xs text-muted">Type a number for a bulk quantity (up to what is in stock).</p>}
        </div>

        <div className="space-y-1 border-t border-line pt-3 text-sm">
          {known && <div className="flex justify-between"><span className="text-muted">Games</span><span>{rs(gameTotal)}</span></div>}
          {known && dueTotal > 0 && <div className="flex justify-between"><span className="text-muted">Goods on credit</span><span>{rs(dueTotal)}</span></div>}
          {known && <div className="flex justify-between"><span className="text-muted">New goods</span><span>{rs(goodsTotal)}</span></div>}
          <div className="flex items-center justify-between"><span className="font-semibold">Total</span><span className="text-xl font-bold">{rs(total)}</span></div>
          {known && (goodsPts > 0 || gamePts > 0 || waiting > 0) && (
            <p className="text-xs text-amber-600">Earns {Math.round((goodsPts + gamePts) * 10) / 10} loyalty points now{waiting > 0 ? ` (+ points for ${waiting} game${waiting === 1 ? "" : "s"} when played)` : ""}.</p>
          )}
        </div>

        <PaySplit total={total} value={pay} onChange={(v) => { setPay(v); setError(""); }} customerPhone={known ? phone : undefined} />
        {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
        <button onClick={() => complete(false)} disabled={busy || total === 0 || !!ready.problem || (!!phone && (!phoneOk || !known))} className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Saving…" : known ? `Complete bill ${total ? rs(total) : ""}` : `Complete sale ${total ? rs(total) : ""}`}
        </button>
        {canCredit && (
          <button onClick={() => complete(true)} disabled={busy} className="w-full rounded-full border border-line py-2.5 text-sm font-semibold disabled:opacity-50">Put on account, pay later ({rs(goodsTotal)})</button>
        )}
      </aside>
    </div>
  );
}
