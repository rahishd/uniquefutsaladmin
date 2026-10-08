"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle, RefreshCw, UserPlus, X } from "lucide-react";
import Switch from "../Switch";
import { guard } from "@/lib/access";
import { ApiError } from "@/lib/api";
import { addCustomer } from "@/lib/customers";
import { copyText } from "@/lib/vip";

const field = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";

// Easy to read out loud: no 0/O or 1/l/I.
function easyPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint32Array(8)), (n) => chars[n % chars.length]).join("");
}

// Staff add a customer who is at the desk and has no account yet. With "app sign-in" on, the person can sign in to the app with their
// mobile number and the password shown at the end; with it off, it is a record only (bookings, billing, points).
export default function AddCustomerSheet({ onClose, onAdded }: { onClose: () => void; onAdded: (phone: string) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [signIn, setSignIn] = useState(true);
  const [password, setPassword] = useState(easyPassword);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ name: string; phone: string; password: string | null } | null>(null);
  const [copied, setCopied] = useState("");

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setError("");
    if (!guard("customers.create")) return;
    if (name.trim().length < 2) return setError("Enter the customer's name.");
    if (!/^9\d{9}$/.test(phone)) return setError("Enter a 10-digit mobile number starting with 9.");
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email, or leave it empty.");
    if (signIn && password.length < 6) return setError("The password needs at least 6 characters.");
    setBusy(true);
    try {
      const r = await addCustomer({ name: name.trim(), phoneNumber: phone, ...(email.trim() ? { email: email.trim() } : {}), ...(signIn ? { password } : {}) });
      setDone({ name: r.name ?? name.trim(), phone: r.phoneNumber, password: signIn ? password : null });
      onAdded(r.phoneNumber);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not add the customer");
    } finally {
      setBusy(false);
    }
  }

  const copy = async (what: string, text: string) => { if (await copyText(text)) { setCopied(what); setTimeout(() => setCopied(""), 1500); } };
  const message = done?.password
    ? `Hello ${done.name.split(" ")[0]}! Your Unique Futsal account is ready. Open the app and sign in with your mobile number ${done.phone} and the password ${done.password}.`
    : "";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label="Add a customer" onClick={(e) => e.stopPropagation()} className="max-h-[95vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold"><UserPlus size={20} className="text-brand" /> {done ? "Customer added" : "Add a customer"}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-muted hover:bg-surface-2"><X size={22} /></button>
        </div>

        {done ? (
          <div className="space-y-3">
            <p className="rounded-xl bg-brand/10 p-3 text-sm"><strong>{done.name}</strong> ({done.phone}) is now a registered customer. You can book and bill for them straight away.</p>
            {done.password ? (
              <>
                <div className="space-y-1 rounded-2xl bg-surface-2 p-4">
                  <p className="text-xs text-muted">Mobile number</p><p className="font-mono font-semibold">{done.phone}</p>
                  <p className="pt-2 text-xs text-muted">Password</p><p className="font-mono font-semibold">{done.password}</p>
                </div>
                <p className="text-xs text-muted">Give these to the customer so they can sign in to the app. The password is shown only now.</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => copy("all", `Mobile: ${done.phone}\nPassword: ${done.password}`)} className="flex items-center gap-1.5 rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold">{copied === "all" ? <Check size={14} /> : <Copy size={14} />} {copied === "all" ? "Copied" : "Copy details"}</button>
                  <a href={`https://wa.me/977${done.phone}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-full bg-[#25D366] px-4 py-2 text-sm font-semibold text-white"><MessageCircle size={15} /> Send on WhatsApp</a>
                </div>
              </>
            ) : (
              <p className="rounded-xl bg-surface-2 p-3 text-xs text-muted">This customer cannot sign in to the app (no password was set). They exist as a record for bookings, billing and points.</p>
            )}
            <button onClick={onClose} className="w-full rounded-xl bg-brand py-3 font-semibold text-white">Done</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <label className="block text-sm font-medium">Customer name
              <input value={name} maxLength={60} autoFocus onChange={(e) => setName(e.target.value)} placeholder="Full name" className={`${field} mt-1`} />
            </label>
            <label className="block text-sm font-medium">Mobile number
              <input value={phone} inputMode="numeric" maxLength={10} autoComplete="off" onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} placeholder="98XXXXXXXX" className={`${field} mt-1`} />
            </label>
            <label className="block text-sm font-medium">Email <span className="font-normal text-muted">(optional)</span>
              <input value={email} type="email" autoComplete="off" onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className={`${field} mt-1`} />
            </label>

            <div className="space-y-3 rounded-xl bg-surface-2 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm"><strong>Let them sign in to the app</strong><span className="block text-xs text-muted">{signIn ? "They sign in with their mobile number and this password." : "Record only: bookings, billing and points, no app login."}</span></span>
                <Switch on={signIn} label="Let this customer sign in to the app" onChange={() => setSignIn((v) => !v)} />
              </div>
              {signIn && (
                <div className="flex gap-2">
                  <input value={password} autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} aria-label="Password" className={`${field} font-mono`} />
                  <button type="button" onClick={() => setPassword(easyPassword())} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-surface px-3 text-sm font-semibold"><RefreshCw size={15} /> New</button>
                </div>
              )}
            </div>

            {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
            <button disabled={busy} className="w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-60">{busy ? "Adding…" : "Add customer"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
