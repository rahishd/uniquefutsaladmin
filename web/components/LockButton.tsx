"use client";

import { useEffect, useRef, useState } from "react";
import { KeyRound, Loader2, Lock, X } from "lucide-react";
import { ApiError } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { LockInfo, getLockInfo, removeLockCode, saveLockCode, setLocked } from "@/lib/lock";

// The Lock button in the sidebar. Pressing it covers the portal until the 4 digit code is entered (components/LockScreen.tsx).
// Anyone can lock. Only the Owner or an Admin sees the panel to set, change or switch off the code.
const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");

export default function LockButton() {
  const [info, setInfo] = useState<LockInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const isAdmin = ["owner", "admin"].includes(currentAdmin()?.role ?? "");

  async function load() {
    try { const i = await getLockInfo(); setInfo(i); return i; } catch { return null; }
  }
  useEffect(() => {
    let live = true;
    getLockInfo().then((i) => { if (live) setInfo(i); }).catch(() => {});
    return () => { live = false; };
  }, []);

  // close the panel on an outside click or Escape
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  async function press() {
    setNote(""); setErr("");
    const i = (await load()) ?? info;
    if (isAdmin) { setOpen((o) => !o); return; } // the Owner or an Admin gets the panel (lock now, set or change the code)
    if (i && !i.hasCode) { setNote("No lock code is set yet. Ask the Owner or an Admin to set one."); setOpen(true); return; }
    setLocked(true);
  }

  async function save() {
    if (!/^\d{4}$/.test(code)) return setErr("The code must be exactly 4 digits.");
    setBusy(true); setErr("");
    try { await saveLockCode(code); setCode(""); setInfo((i) => ({ canManage: true, ...i, hasCode: true })); setNote("Lock code saved."); }
    catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setErr("");
    try { await removeLockCode(); setInfo((i) => ({ canManage: true, ...i, hasCode: false })); setNote("Lock code removed. Nobody can lock the portal until a new code is set."); }
    catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={press} title="Lock the portal" aria-label="Lock the portal" aria-expanded={open}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-(--nav-tile) text-(--nav-ink) shadow-sm ring-1 ring-(--nav-ink)/15 transition hover:bg-(--nav-tile-hover) hover:shadow md:h-11 md:w-11 md:rounded-2xl">
        <Lock size={18} className="md:h-[22px] md:w-[22px]" />
      </button>

      {open && (
        <div role="dialog" aria-label="Portal lock" className="absolute bottom-12 left-0 z-50 w-[min(18rem,calc(100vw-2rem))] space-y-3 rounded-2xl border border-line bg-surface p-4 text-foreground shadow-xl md:bottom-14">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold">Portal lock</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-muted"><X size={16} /></button>
          </div>
          {note && <p role="status" className="rounded-xl bg-surface-2 p-2.5 text-xs text-muted">{note}</p>}

          {isAdmin ? (
            <>
              <button type="button" disabled={!info?.hasCode} onClick={() => { setOpen(false); setLocked(true); }} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                <Lock size={16} /> Lock now
              </button>
              {!info?.hasCode && <p className="text-xs text-muted">Set a 4 digit code first. Staff will use it to unlock.</p>}
              <div className="border-t border-line pt-3">
                <label htmlFor="lock-code" className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted"><KeyRound size={13} /> {info?.hasCode ? "Change the 4 digit code" : "Set a 4 digit code"}</label>
                <div className="flex gap-2">
                  <input id="lock-code" value={code} inputMode="numeric" maxLength={4} autoComplete="off" placeholder="0000" onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 4)); setErr(""); }}
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-center font-mono text-base tracking-[0.5em] outline-none focus:border-brand" />
                  <button type="button" disabled={busy || code.length !== 4} onClick={save} className="flex shrink-0 items-center gap-1 rounded-xl bg-brand px-3 text-sm font-semibold text-white disabled:opacity-50">{busy && <Loader2 size={14} className="animate-spin" />} Save</button>
                </div>
                {err && <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">{err}</p>}
                {info?.hasCode && <button type="button" disabled={busy} onClick={remove} className="mt-2 text-xs font-semibold text-red-600">Switch the lock off (remove the code)</button>}
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
