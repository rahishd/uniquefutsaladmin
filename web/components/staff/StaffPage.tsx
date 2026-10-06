"use client";

import { useEffect, useState } from "react";
import { Crown, Pencil, Plus, ShieldCheck, UserRound } from "lucide-react";
import { Badge } from "../bookings/Badge";
import Switch from "../Switch";
import AccountSheet from "./AccountSheet";
import { ApiError } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { ago } from "@/lib/complaints";
import { Account, Catalog, ROLE_LABEL, getCatalog, levelsOf, listStaff, updateStaff } from "@/lib/staff";

// Short text about what a staff account can use, for example "Bookings, Payments (view) and 3 more".
function summary(a: Account, c: Catalog | null) {
  if (a.accountType === "admin") return "All access";
  if (!c) return "";
  const { levels } = levelsOf(c.features, a.effective);
  const areas = c.features.filter((f) => levels[f.id] !== "none").map((f) => `${f.label.split(",")[0].split(" &")[0]}${levels[f.id] === "view" ? " (view)" : ""}`);
  if (areas.length === 0) return "Dashboard only";
  return areas.length <= 4 ? areas.join(", ") : `${areas.slice(0, 3).join(", ")} and ${areas.length - 3} more`;
}

export default function StaffPage() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState<"new" | Account | null>(null);
  const [tick, setTick] = useState(0);
  const me = currentAdmin();

  useEffect(() => {
    let live = true;
    listStaff()
      .then((a) => { if (live) { setAccounts(a); setError(""); } })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load accounts"); });
    getCatalog().then((c) => { if (live) setCatalog(c); }).catch(() => {});
    return () => { live = false; };
  }, [tick]);

  async function toggle(a: Account) {
    if (!window.confirm(a.isActive ? `Disable ${a.name}? They are signed out at once and cannot sign in until you enable the account again.` : `Enable ${a.name}?`)) return;
    try {
      await updateStaff(a.id, { isActive: !a.isActive });
      setTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not change the account");
    }
  }

  const admins = accounts?.filter((a) => a.accountType === "admin") ?? [];
  const staff = accounts?.filter((a) => a.accountType === "staff") ?? [];
  const isOwner = me?.role === "owner";

  const card = (a: Account) => {
    const mine = a.id === me?.id;
    const locked = a.role === "owner" && !isOwner; // only the owner changes the owner
    const Icon = a.role === "owner" ? Crown : a.accountType === "admin" ? ShieldCheck : UserRound;
    return (
      <li key={a.id} className={`space-y-2 rounded-2xl bg-surface p-4 shadow-sm ${a.isActive ? "" : "opacity-70"}`}>
        <div className="flex items-start gap-3">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${a.accountType === "admin" ? "bg-brand/15 text-brand" : "bg-blue-500/15 text-blue-600"}`}><Icon size={20} /></span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              {a.name}
              <Badge tone={a.role === "owner" ? "bg-amber-400/20 text-amber-700" : a.accountType === "admin" ? "bg-brand/15 text-brand" : "bg-blue-500/15 text-blue-600"}>{ROLE_LABEL(a)}</Badge>
              {mine && <Badge tone="bg-surface-2 text-muted">You</Badge>}
              {!a.isActive && <Badge tone="bg-red-500/15 text-red-600">Disabled</Badge>}
              {a.legacyRole && <Badge tone="bg-amber-500/15 text-amber-700">Older role</Badge>}
            </p>
            <p className="truncate text-sm text-muted">{a.email}</p>
          </div>
        </div>
        <p className="text-sm"><span className="text-muted">Can use: </span><strong>{summary(a, catalog)}</strong></p>
        <div className="flex items-center justify-between gap-2 border-t border-line pt-2">
          <span className="text-xs text-muted">{a.lastLoginAt ? `Last signed in ${ago(a.lastLoginAt)}` : "Has not signed in yet"}</span>
          {!locked && (
            <span className="flex items-center gap-3">
              <button onClick={() => setSheet(a)} className="flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold"><Pencil size={13} /> {a.accountType === "staff" ? "Edit access" : "Edit"}</button>
              {!mine && <Switch on={a.isActive} label={`${a.isActive ? "Disable" : "Enable"} ${a.name}`} onChange={() => toggle(a)} />}
            </span>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Staff &amp; Roles</h1>
          <p className="text-sm text-muted">Admins can do everything. For staff, you choose exactly what each person can see and do.</p>
        </div>
        <button onClick={() => setSheet("new")} className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16} /> Add account</button>
      </div>

      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {!accounts && !error && <p className="py-10 text-center text-sm text-muted">Loading accounts…</p>}

      {accounts && (
        <>
          <section className="space-y-2">
            <h2 className="px-1 text-sm font-bold">Admins <span className="font-normal text-muted">· all access ({admins.length})</span></h2>
            <ul className="space-y-2">{admins.map(card)}</ul>
          </section>
          <section className="space-y-2">
            <h2 className="px-1 text-sm font-bold">Staff <span className="font-normal text-muted">· access you choose ({staff.length})</span></h2>
            {staff.length === 0 && <p className="rounded-2xl bg-surface py-8 text-center text-sm text-muted shadow-sm">No staff accounts yet. Add one and tick what they may do.</p>}
            <ul className="space-y-2">{staff.map(card)}</ul>
          </section>
        </>
      )}

      {sheet && <AccountSheet edit={sheet === "new" ? null : sheet} onClose={() => setSheet(null)} onSaved={() => setTick((t) => t + 1)} />}
    </div>
  );
}
