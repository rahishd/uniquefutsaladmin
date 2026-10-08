"use client";

import { useState } from "react";
import { Eye, EyeOff, Pencil } from "lucide-react";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { CustomerEdit, editCustomer } from "@/lib/customers";

// Staff fix a customer's details here. A new password needs no old one: customers who forget it are told to contact the venue.
export default function EditCustomer({ phone, name, email, onSaved }: { phone: string; name: string | null; email: string | null; onSaved: (newPhone: string) => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: name ?? "", phone, email: email ?? "", password: "" });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const input = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";

  async function save() {
    if (!guard("customers.edit")) return;
    const body: CustomerEdit = {};
    if (f.name.trim() !== (name ?? "")) body.name = f.name.trim();
    if (f.phone.trim() !== phone) body.phoneNumber = f.phone.trim();
    if (f.email.trim() !== (email ?? "")) body.email = f.email.trim() || null;
    if (f.password) body.password = f.password;
    if (!Object.keys(body).length) { setOpen(false); return; }
    if (body.phoneNumber && !window.confirm(`Change the phone number from ${phone} to ${body.phoneNumber}? The customer will sign in with the new number.`)) return;
    setBusy(true); setError(""); setDone("");
    try {
      await editCustomer(phone, body);
      setDone(body.password ? `Saved. Tell the customer their new password: ${body.password}` : "Saved.");
      setF((v) => ({ ...v, password: "" }));
      onSaved(body.phoneNumber ?? phone);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save");
    } finally { setBusy(false); }
  }

  if (!open) return (
    <div className="space-y-2">
      <button onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-surface-2 py-3 text-sm font-semibold"><Pencil size={16} /> Edit details / set password</button>
      {done && <p className="rounded-xl bg-brand/10 p-3 text-sm text-brand">{done}</p>}
    </div>
  );
  return (
    <section className="space-y-3 rounded-2xl border border-line p-4">
      <h3 className="font-bold">Edit customer</h3>
      <label className="block text-xs text-muted">Name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={input} /></label>
      <label className="block text-xs text-muted">Contact number<input inputMode="numeric" maxLength={10} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, "") })} className={input} /></label>
      <label className="block text-xs text-muted">Email<input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={input} /></label>
      <label className="relative block text-xs text-muted">New password (leave empty to keep the current one)
        <input type={show ? "text" : "password"} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="At least 6 characters" autoComplete="new-password" className={`${input} pr-10`} />
        <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} className="absolute bottom-2.5 right-3 text-muted">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
      </label>
      <p className="text-xs text-muted">No old password is needed. Passwords are stored scrambled and cannot be read back later, so note the new one down and tell the customer.</p>
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {done && <p className="rounded-xl bg-brand/10 p-3 text-sm text-brand">{done}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setOpen(false)} className="rounded-xl bg-surface-2 py-2.5 text-sm font-semibold">Cancel</button>
        <button onClick={save} disabled={busy} className="rounded-xl bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Saving…" : "Save"}</button>
      </div>
    </section>
  );
}
