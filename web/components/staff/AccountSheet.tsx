"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, ShieldCheck, UserRound, X } from "lucide-react";
import { ApiError } from "@/lib/api";
import { Account, Catalog, Level, createStaff, getCatalog, levelsOf, permissionsOf, randomPassword, updateStaff } from "@/lib/staff";

const field = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";

// Create or edit an account. Admin = all access. Staff = a level (none, view, full) for each page of the portal.
export default function AccountSheet({ edit, onClose, onSaved }: { edit: Account | null; onClose: () => void; onSaved: () => void }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [type, setType] = useState<"admin" | "staff">(edit?.accountType ?? "staff");
  const [name, setName] = useState(edit?.name ?? "");
  const [email, setEmail] = useState(edit?.email ?? "");
  const [password, setPassword] = useState("");
  const [levels, setLevels] = useState<Record<string, Level>>({});
  const [extras, setExtras] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<{ email: string; password: string } | null>(null);

  useEffect(() => {
    let live = true;
    getCatalog()
      .then((c) => {
        if (!live) return;
        setCatalog(c);
        // an admin being turned into staff starts with nothing ticked; staff start from what they can do now
        const start = edit && edit.accountType === "staff" ? edit.effective : [];
        const l = levelsOf(c.features, start);
        setLevels(l.levels);
        setExtras(l.extras);
      })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load the options"); });
    return () => { live = false; };
  }, [edit]);

  const perms = useMemo(() => (catalog ? permissionsOf(catalog.features, levels, extras) : []), [catalog, levels, extras]);
  const areas = catalog ? catalog.features.filter((f) => levels[f.id] && levels[f.id] !== "none") : [];

  const setLevel = (id: string, l: Level) => setLevels((x) => ({ ...x, [id]: l }));
  const preset = (permissions: string[]) => {
    if (!catalog) return;
    const l = levelsOf(catalog.features, permissions);
    setLevels(l.levels);
    setExtras(l.extras);
  };

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setError("");
    if (name.trim().length < 2) return setError("Enter the person's name.");
    if (!edit && !/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email. It is what they sign in with.");
    if (!edit && password.length < 10) return setError("The password needs at least 10 characters. Press Generate to make one.");
    if (edit && password && password.length < 10) return setError("A new password needs at least 10 characters.");
    setBusy(true);
    try {
      if (edit) {
        await updateStaff(edit.id, { name: name.trim(), accountType: type, ...(type === "staff" ? { permissions: perms } : {}), ...(password ? { password } : {}) });
        onSaved();
        if (password) setSaved({ email: edit.email, password });
        else onClose();
      } else {
        await createStaff({ email: email.trim(), name: name.trim(), accountType: type, password, permissions: type === "staff" ? perms : [] });
        onSaved();
        setSaved({ email: email.trim().toLowerCase(), password });
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const seg = (on: boolean) => `rounded-lg px-2.5 py-1.5 text-xs font-semibold ${on ? "bg-brand text-white" : "text-muted"}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label={edit ? "Edit account" : "Add account"} onClick={(e) => e.stopPropagation()} className="max-h-[95vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-bold">{saved ? "Account saved" : edit ? `Edit ${edit.name}` : "Add an account"}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-surface-2"><X size={22} /></button>
        </div>

        {saved ? (
          <div className="space-y-3 text-center">
            <p className="text-sm text-muted">Give these sign-in details to the person. The password is shown only now.</p>
            <div className="space-y-1 rounded-2xl bg-brand/10 p-4 text-left">
              <p className="text-xs text-muted">Email</p><p className="font-mono font-semibold">{saved.email}</p>
              <p className="pt-2 text-xs text-muted">Password</p><p className="font-mono font-semibold">{saved.password}</p>
            </div>
            <button onClick={onClose} className="w-full rounded-xl bg-brand py-3 font-semibold text-white">Done</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Account type</legend>
              <div className="grid grid-cols-2 gap-2">
                {([["admin", "Admin", "All access to everything, including accounts", ShieldCheck], ["staff", "Staff", "Only the pages you choose below", UserRound]] as const).map(([id, label, hint, Icon]) => (
                  <button type="button" key={id} aria-pressed={type === id} disabled={edit?.role === "owner" && id === "staff"} onClick={() => setType(id)}
                    className={`rounded-xl border p-3 text-left disabled:opacity-50 ${type === id ? "border-brand bg-brand/10" : "border-line"}`}>
                    <span className="flex items-center gap-2 font-semibold"><Icon size={16} /> {label}</span>
                    <span className="mt-0.5 block text-xs text-muted">{hint}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="block text-sm font-medium">Name
              <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className={`${field} mt-1`} />
            </label>
            <label className="block text-sm font-medium">Email (they sign in with this)
              <input value={email} disabled={!!edit} type="email" onChange={(e) => setEmail(e.target.value)} className={`${field} mt-1 disabled:opacity-60`} />
            </label>
            <label className="block text-sm font-medium">{edit ? "New password (leave empty to keep theirs)" : "Password"}
              <div className="mt-1 flex gap-2">
                <input value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className={`${field} font-mono`} />
                <button type="button" onClick={() => setPassword(randomPassword())} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-surface-2 px-3 text-sm font-semibold"><RefreshCw size={15} /> Generate</button>
              </div>
            </label>

            {type === "admin" ? (
              <p className="rounded-xl bg-brand/10 p-3 text-sm text-brand">Admins can open every page and do everything, including adding and changing accounts.</p>
            ) : !catalog ? (
              <p className="py-4 text-center text-sm text-muted">{error || "Loading the options…"}</p>
            ) : (
              <div className="space-y-3">
                {edit?.legacyRole && <p className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-700">This account uses an older fixed role. What it can do now is ticked below. Saving turns it into a normal Staff account with exactly these choices.</p>}
                <div>
                  <p className="mb-1.5 text-sm font-medium">What can this person do?</p>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="self-center text-xs text-muted">Quick start:</span>
                    {catalog.presets.map((p) => (
                      <button type="button" key={p.id} title={p.hint} onClick={() => preset(p.permissions)} className="rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold hover:bg-brand/10">{p.label}</button>
                    ))}
                    <button type="button" onClick={() => preset([])} className="rounded-full px-3 py-1 text-xs font-semibold text-muted">Clear all</button>
                  </div>
                </div>

                <ul className="divide-y divide-line rounded-xl border border-line">
                  {catalog.features.map((f) => {
                    const l = levels[f.id] ?? "none";
                    return (
                      <li key={f.id} className="space-y-2 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0"><p className="text-sm font-semibold">{f.label}</p><p className="text-xs text-muted">{f.hint}</p></div>
                          <div className="flex shrink-0 gap-0.5 rounded-xl bg-surface-2 p-0.5" role="group" aria-label={`Access to ${f.label}`}>
                            <button type="button" aria-pressed={l === "none"} onClick={() => setLevel(f.id, "none")} className={seg(l === "none")}>None</button>
                            {f.view && f.view.length > 0 && JSON.stringify(f.view) !== JSON.stringify(f.full) && <button type="button" aria-pressed={l === "view"} onClick={() => setLevel(f.id, "view")} className={seg(l === "view")}>View</button>}
                            <button type="button" aria-pressed={l === "full"} onClick={() => setLevel(f.id, "full")} className={seg(l === "full")}>{f.view && JSON.stringify(f.view) === JSON.stringify(f.full) ? "Allowed" : f.view ? "Full" : "Allowed"}</button>
                          </div>
                        </div>
                        {l === "full" && f.extras?.map((x) => (
                          <label key={x.permission} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!extras[x.permission]} onChange={(e) => setExtras((v) => ({ ...v, [x.permission]: e.target.checked }))} className="h-4 w-4 accent-[var(--brand)]" /> {x.label}</label>
                        ))}
                      </li>
                    );
                  })}
                </ul>

                <p className={`rounded-xl p-3 text-xs ${areas.length ? "bg-surface-2 text-muted" : "bg-amber-500/10 text-amber-700"}`}>
                  {areas.length ? <>Can use: <strong className="text-foreground">{areas.map((f) => `${f.label}${levels[f.id] === "view" ? " (view)" : ""}`).join(", ")}</strong>.</> : "Nothing is ticked. This person will only see the dashboard."}
                  {" "}Staff can never add or change accounts: that is for admins only.
                </p>
              </div>
            )}

            {error && catalog && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
            <button disabled={busy} className="w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-60">{busy ? "Saving…" : edit ? "Save changes" : "Create account"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
