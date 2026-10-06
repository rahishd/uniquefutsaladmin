"use client";

import { useEffect, useState } from "react";
import { Check, Copy, MessageCircle, RefreshCw, Search, X } from "lucide-react";
import { ApiError } from "@/lib/api";
import { rs } from "@/lib/bookings";
import { CustomerRow, initials, listCustomers, saveVip } from "@/lib/customers";
import { VipItem, VipType, copyText, describe, generateCode, giveVip, shareLink } from "@/lib/vip";

const field = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const PERCENTS = [5, 10, 15, 20];
const AMOUNTS = [100, 200, 300, 500];

// Create (pick a customer, make a code, choose the discount) or edit one VIP code.
export default function GiveVipSheet({ edit, onClose, onSaved }: { edit: VipItem | null; onClose: () => void; onSaved: () => void }) {
  const [customer, setCustomer] = useState<{ phone: string; name: string | null } | null>(edit ? { phone: edit.phone, name: edit.customerName } : null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CustomerRow[] | null>(null);
  const [code, setCode] = useState(edit?.code ?? "");
  const [type, setType] = useState<VipType>(edit?.type ?? "percent");
  const [value, setValue] = useState(edit ? String(edit.value) : "10");
  const [note, setNote] = useState(edit?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ code: string; type: VipType; value: number } | null>(null);
  const [copied, setCopied] = useState(false);

  // search customers as staff type
  useEffect(() => {
    if (customer) return;
    let live = true;
    const t = setTimeout(() => {
      listCustomers({ q: search, mode: "", status: "active", page: 1 })
        .then((d) => { if (live) setResults(d.items); })
        .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not search customers"); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [search, customer]);

  async function choose(c: CustomerRow) {
    setCustomer({ phone: c.phoneNumber, name: c.name });
    setError("");
    if (!code) generateCode().then(setCode).catch(() => {});
  }

  async function regenerate() {
    try { setCode(await generateCode()); } catch { setError("Could not make a new code. Type one instead."); }
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setError("");
    const n = Number(value);
    if (!customer) return setError("Choose a customer first.");
    if (!/^[A-Za-z0-9]{3,20}$/.test(code.trim())) return setError("The code needs 3 to 20 letters or numbers, for example VIP or VIPK7M3Q.");
    if (!Number.isInteger(n) || n < 1) return setError("Enter the discount as a whole number.");
    if (type === "percent" && n > 100) return setError("A percent cannot be more than 100.");
    setBusy(true);
    try {
      const c = code.trim().toUpperCase();
      if (edit) await saveVip(customer.phone, { code: c, type, value: n, active: edit.active, note: note.trim() || null });
      else await giveVip({ phone: customer.phone, code: c, type, value: n, note: note.trim() || null });
      setDone({ code: c, type, value: n });
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const preview = Number(value) > 0 ? describe({ type, value: Number(value) }) : "";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label={edit ? "Change VIP code" : "Give VIP privilege"} onClick={(e) => e.stopPropagation()} className="max-h-[94vh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-bold">{done ? "VIP code ready" : edit ? "Change VIP code" : "Give VIP privilege"}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-surface-2"><X size={22} /></button>
        </div>

        {done && customer ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted">{customer.name ?? customer.phone} can now use this code.</p>
            <p className="rounded-2xl bg-brand/10 py-5 font-mono text-3xl font-bold tracking-widest text-brand">{done.code}</p>
            <p className="font-semibold">{describe(done)} on every game</p>
            <p className="text-xs text-muted">They type it once in the promo box when they book. After that the discount applies to every game automatically.</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={async () => { setCopied(await copyText(done.code)); }} className="flex items-center justify-center gap-2 rounded-xl bg-surface-2 py-3 text-sm font-semibold">{copied ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy code</>}</button>
              <a href={shareLink(customer.phone, customer.name, done)} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-semibold text-white"><MessageCircle size={16} /> Send on WhatsApp</a>
            </div>
            <button onClick={onClose} className="w-full rounded-xl border border-line py-3 text-sm font-semibold">Done</button>
          </div>
        ) : !customer ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">Choose the customer who gets the privilege.</p>
            <label className="relative block">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input autoFocus value={search} onChange={(e) => { setSearch(e.target.value); setResults(null); }} placeholder="Search name or phone" className={`${field} pl-10`} />
            </label>
            {results === null && <p className="py-4 text-center text-sm text-muted">Searching…</p>}
            {results?.length === 0 && <p className="rounded-xl bg-surface-2 p-3 text-center text-sm text-muted">No customer found. They need an account in the app first.</p>}
            <ul className="max-h-72 divide-y divide-line overflow-y-auto">
              {results?.map((c) => (
                <li key={c.phoneNumber}>
                  <button disabled={!!c.vip} onClick={() => choose(c)} className="flex w-full items-center gap-3 py-2.5 text-left disabled:opacity-50">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand/15 text-sm font-bold text-brand">{initials(c.name, c.phoneNumber)}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{c.name || "No name"}</span><span className="block text-xs text-muted">{c.phoneNumber} · {c.stats.gamesPlayed} games · paid {rs(c.stats.paidTotal)}</span></span>
                    {c.vip && <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-xs font-semibold text-amber-700">Has {c.vip.code}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand/15 text-sm font-bold text-brand">{initials(customer.name, customer.phone)}</span>
              <div className="min-w-0 flex-1"><p className="truncate font-semibold">{customer.name ?? "Customer"}</p><p className="text-xs text-muted">{customer.phone}</p></div>
              {!edit && <button type="button" onClick={() => { setCustomer(null); setResults(null); }} className="text-xs font-semibold text-brand">Change</button>}
            </div>

            <label className="block text-sm font-medium">Referral code
              <div className="mt-1 flex gap-2">
                <input value={code} onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase())} maxLength={20} placeholder="VIP" className={`${field} font-mono uppercase`} />
                <button type="button" onClick={regenerate} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-surface-2 px-3 text-sm font-semibold"><RefreshCw size={15} /> Generate</button>
              </div>
              <span className="mt-1 block text-xs font-normal text-muted">Type your own, such as VIP, or press Generate for a unique one.</span>
            </label>

            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Discount on every game</legend>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
                {([["percent", "Percent (%)"], ["flat", "Rupees (Rs.)"]] as const).map(([id, label]) => (
                  <button type="button" key={id} aria-pressed={type === id} onClick={() => { setType(id); setValue(id === "percent" ? "10" : "200"); }} className={`rounded-lg py-2 text-sm font-semibold ${type === id ? "bg-brand text-white" : "text-muted"}`}>{label}</button>
                ))}
              </div>
              <input value={value} inputMode="numeric" onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))} aria-label={type === "percent" ? "Percent off" : "Rupees off"} className={`${field} mt-2 text-lg font-bold`} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(type === "percent" ? PERCENTS : AMOUNTS).map((n) => (
                  <button type="button" key={n} onClick={() => setValue(String(n))} className="rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold text-muted hover:bg-brand/10">{type === "percent" ? `${n}%` : rs(n)}</button>
                ))}
              </div>
            </fieldset>

            <label className="block text-sm font-medium">Note <span className="font-normal text-muted">(optional, only staff see it)</span>
              <input value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Friend of the owner" className={`${field} mt-1`} />
            </label>

            {code && preview && (
              <p className="rounded-xl bg-brand/10 p-3 text-sm text-brand">When {customer.name?.split(" ")[0] ?? "the customer"} types <strong className="font-mono">{code}</strong> in the promo box, every game they book is <strong>{preview}</strong>.</p>
            )}
            {edit && edit.code !== code && <p className="text-xs text-amber-700">A new code has to be typed by the customer again.</p>}
            {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
            <button disabled={busy} className="w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-60">{busy ? "Saving…" : edit ? "Save changes" : "Give VIP privilege"}</button>
          </form>
        )}
        {!customer && error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      </div>
    </div>
  );
}
