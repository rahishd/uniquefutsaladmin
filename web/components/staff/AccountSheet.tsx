"use client";

import { useEffect, useState } from "react";
import { Check, Copy, MessageCircle, RefreshCw, ShieldCheck, UserRound, X } from "lucide-react";
import { guard } from "@/lib/access";
import { ApiError } from "@/lib/api";
import { Account, Catalog, createStaff, getCatalog, randomPassword, updateStaff } from "@/lib/staff";
import { copyText } from "@/lib/vip";

const field = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";

function Box({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 ${on ? "border-brand bg-brand text-white" : "border-slate-400/60 bg-surface"}`}>
      {on && <Check size={15} strokeWidth={3} />}
    </span>
  );
}

// The sign-in details of an account that was just saved: copy each one, copy everything, or send it on WhatsApp.
function SignInDetails({ email, password }: { email: string; password?: string }) {
  const [done, setDone] = useState("");
  const link = typeof window === "undefined" ? "" : `${window.location.origin}/login`;
  const message = [
    "Unique Futsal admin portal: your sign-in details", link && `Link: ${link}`, `Email: ${email}`, password ? `Password: ${password}` : "Password: unchanged",
    password ? "Please change your password after signing in (Settings > My password)." : "",
  ].filter(Boolean).join("\n");
  async function copy(what: string, text: string) { setDone((await copyText(text)) ? what : ""); setTimeout(() => setDone(""), 2000); }
  const row = (label: string, value: string, key: string, canCopy: boolean) => (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0"><p className="text-xs text-muted">{label}</p><p className="break-all font-mono font-semibold">{value}</p></div>
      {canCopy && <button type="button" onClick={() => copy(key, value)} aria-label={`Copy ${label.toLowerCase()}`} className="flex shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold">{done === key ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}</button>}
    </div>
  );
  return (
    <div className="space-y-3 text-left">
      <div className="space-y-3 rounded-2xl bg-brand/10 p-4">
        {row("Email", email, "email", true)}
        {row("Password", password || "Unchanged", "password", !!password)}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => copy("all", message)} className="flex items-center justify-center gap-1.5 rounded-xl border border-line py-2.5 text-sm font-semibold">{done === "all" ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy all details</>}</button>
        <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 rounded-xl bg-[#25D366] py-2.5 text-sm font-semibold text-white"><MessageCircle size={15} /> Share on WhatsApp</a>
      </div>
    </div>
  );
}

// Add an account, or choose what one staff member may do: one small tick for every action, grouped like the pages.
export default function AccountSheet({ edit, onClose, onSaved }: { edit: Account | null; onClose: () => void; onSaved: () => void }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [type, setType] = useState<"admin" | "staff">(edit?.accountType ?? "staff");
  const [name, setName] = useState(edit?.name ?? "");
  const [email, setEmail] = useState(edit?.email ?? "");
  const [password, setPassword] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<{ email: string; password: string } | null>(null);

  useEffect(() => {
    let live = true;
    getCatalog()
      .then((c) => {
        if (!live) return;
        setCatalog(c);
        // an account being edited starts from what it can do now; an admin being turned into staff starts empty
        if (edit && edit.accountType === "staff") setChecked(new Set(edit.effective.filter((p) => c.assignable.includes(p))));
      })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load the options"); });
    return () => { live = false; };
  }, [edit]);

  const toggle = (key: string) => setChecked((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const setSection = (keys: string[], on: boolean) => setChecked((s) => { const n = new Set(s); keys.forEach((k) => (on ? n.add(k) : n.delete(k))); return n; });
  const preset = (permissions: string[]) => setChecked(new Set(permissions));

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setError("");
    if (!guard("staff.manage")) return;
    if (name.trim().length < 2) return setError("Enter the person's name.");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid login email. It is what they sign in with.");
    if (!edit && password.length < 10) return setError("The password needs at least 10 characters. Press Generate to make one.");
    if (edit && password && password.length < 10) return setError("A new password needs at least 10 characters.");
    const permissions = [...checked];
    setBusy(true);
    try {
      if (edit) {
        const emailChanged = email.trim().toLowerCase() !== edit.email;
        await updateStaff(edit.id, { name: name.trim(), ...(emailChanged ? { email: email.trim() } : {}), accountType: type, ...(type === "staff" ? { permissions } : {}), ...(password ? { password } : {}) });
        onSaved();
        if (password || emailChanged) setSaved({ email: email.trim().toLowerCase(), password });
        else onClose();
      } else {
        await createStaff({ email: email.trim(), name: name.trim(), accountType: type, password, permissions: type === "staff" ? permissions : [] });
        onSaved();
        setSaved({ email: email.trim().toLowerCase(), password });
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const total = catalog?.assignable.length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label={edit ? "Permissions" : "Add account"} onClick={(e) => e.stopPropagation()} className="flex max-h-[95vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-surface sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-bold">{saved ? "Account saved" : edit ? `Permissions - ${edit.name}` : "Add an account"}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-muted hover:bg-surface-2"><X size={22} /></button>
        </div>

        {saved ? (
          <div className="space-y-3 p-5 text-center">
            <SignInDetails email={saved.email} password={saved.password} />
            <p className="text-sm text-muted">Give these sign-in details to the person. A new password is shown only now. The old email and password stop working from now on.</p>
            <button onClick={onClose} className="w-full rounded-xl bg-brand py-3 font-semibold text-white">Done</button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              <p className="text-sm text-muted">Only the Owner can change these. Changes apply the next time the staff member opens a page. Managing accounts is always Owner-only.</p>

              <fieldset>
                <legend className="mb-1.5 text-sm font-medium">Account type</legend>
                <div className="grid grid-cols-2 gap-2">
                  {([["admin", "Admin", "Everything except managing accounts", ShieldCheck], ["staff", "Staff", "Only what you tick below", UserRound]] as const).map(([id, label, hint, Icon]) => (
                    <button type="button" key={id} aria-pressed={type === id} disabled={edit?.role === "owner" && id === "staff"} onClick={() => setType(id)}
                      className={`rounded-xl border p-3 text-left disabled:opacity-50 ${type === id ? "border-brand bg-brand/10" : "border-line"}`}>
                      <span className="flex items-center gap-2 font-semibold"><Icon size={16} /> {label}</span>
                      <span className="mt-0.5 block text-xs text-muted">{hint}</span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium">Name
                  <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className={`${field} mt-1`} />
                </label>
                <label className="block text-sm font-medium">Login email (they sign in with this)
                  <input value={email} type="email" autoComplete="off" onChange={(e) => setEmail(e.target.value)} className={`${field} mt-1`} />
                </label>
              </div>
              <label className="block text-sm font-medium">{edit ? "New password (leave empty to keep theirs)" : "Password"}
                <div className="mt-1 flex gap-2">
                  <input value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className={`${field} font-mono`} />
                  <button type="button" onClick={() => setPassword(randomPassword())} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-surface-2 px-3 text-sm font-semibold"><RefreshCw size={15} /> Generate</button>
                </div>
              </label>

              {type === "admin" ? (
                <p className="rounded-xl bg-brand/10 p-3 text-sm text-brand">Admins can use every page and do every action. Only the Owner can add accounts or change what staff may do.</p>
              ) : !catalog ? (
                <p className="py-4 text-center text-sm text-muted">{error || "Loading the options…"}</p>
              ) : (
                <div className="space-y-5">
                  {edit?.legacyRole && <p className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-700">This account uses an older fixed role. What it can do now is ticked below. Saving turns it into a normal Staff account with exactly these ticks.</p>}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted">Quick start:</span>
                    {catalog.presets.map((p) => (
                      <button type="button" key={p.id} title={p.hint} onClick={() => preset(p.permissions)} className="rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold hover:bg-brand/10">{p.label}</button>
                    ))}
                    <button type="button" onClick={() => preset([])} className="rounded-full px-3 py-1 text-xs font-semibold text-muted">Clear all</button>
                  </div>

                  {catalog.sections.map((sec) => {
                    const keys = sec.permissions.map((p) => p.key);
                    const all = keys.every((k) => checked.has(k));
                    return (
                      <section key={sec.id} aria-label={sec.label}>
                        <div className="flex items-center justify-between border-b border-line pb-1.5">
                          <h3 className="text-base font-bold">{sec.label}</h3>
                          <button type="button" onClick={() => setSection(keys, !all)} className="text-sm font-semibold text-brand">{all ? "Clear all" : "Select all"}</button>
                        </div>
                        <ul>
                          {sec.permissions.map((p) => (
                            <li key={p.key}>
                              <label className="flex cursor-pointer items-center gap-3 py-2.5">
                                <input type="checkbox" checked={checked.has(p.key)} onChange={() => toggle(p.key)} className="sr-only" />
                                <Box on={checked.has(p.key)} />
                                <span className="text-[15px]">{p.label}</span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      </section>
                    );
                  })}
                </div>
              )}

              {error && catalog && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
            </div>

            <div className="flex items-center gap-3 border-t border-line bg-surface px-5 py-3">
              <button disabled={busy} className="flex-1 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 py-3.5 text-base font-bold text-white shadow-lg disabled:opacity-60">
                {busy ? "Saving…" : edit ? "Save Permissions" : "Create Account"}
              </button>
              <button type="button" onClick={onClose} className="px-4 py-3 text-base font-semibold">Cancel</button>
            </div>
            {type === "staff" && catalog && <p className="bg-surface px-5 pb-3 text-center text-xs text-muted">{checked.size} of {total} permissions ticked{checked.size === 0 ? ". Nothing ticked: this person can sign in but cannot do anything." : "."}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
