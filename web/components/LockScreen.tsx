"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Delete, Loader2, Lock } from "lucide-react";
import { ApiError } from "@/lib/api";
import { checkLockCode, setLocked, useLocked } from "@/lib/lock";

// Covers the whole portal while it is locked. A person types the 4 digit code (on the keys below or on the keyboard) to open it.
// The code is checked by the server, which also limits wrong guesses. Locked stays on after a reload (lib/lock.ts).
export default function LockScreen({ onSignOut }: { onSignOut: () => void }) {
  const locked = useLocked();
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const busyRef = useRef(false);

  const submit = useCallback(async (c: string) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setErr("");
    try {
      await checkLockCode(c);
      setCode("");
      setLocked(false);
    } catch (e) {
      setErr(e instanceof ApiError || e instanceof Error ? e.message : "Could not check the code. Try again.");
      setShake(true);
      setTimeout(() => setShake(false), 450);
      setCode("");
    } finally { busyRef.current = false; setBusy(false); }
  }, []);

  const press = useCallback((d: string) => {
    if (busyRef.current) return;
    setErr("");
    setCode((c) => {
      if (c.length >= 4) return c;
      const next = c + d;
      if (next.length === 4) setTimeout(() => void submit(next), 120);
      return next;
    });
  }, [submit]);

  // keyboard: digits, Backspace
  useEffect(() => {
    if (!locked) return;
    const key = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") setCode((c) => c.slice(0, -1));
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [locked, press]);

  // while locked the page behind cannot scroll
  useEffect(() => {
    if (!locked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [locked]);

  if (!locked) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="Portal locked" className="fixed inset-0 z-[300] grid place-items-center overflow-y-auto bg-background p-6">
      <div className={`w-full max-w-xs text-center ${shake ? "animate-[uf-shake_0.4s_ease-in-out]" : ""}`}>
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-brand text-white shadow-lg"><Lock size={28} /></span>
        <h1 className="mt-4 text-xl font-bold">Portal locked</h1>
        <p className="mt-1 text-sm text-muted">Enter the 4 digit code to continue.</p>

        <div className="mt-5 flex justify-center gap-3" aria-label={`${code.length} of 4 digits entered`}>
          {[0, 1, 2, 3].map((i) => <span key={i} className={`h-3.5 w-3.5 rounded-full border-2 border-brand transition ${i < code.length ? "bg-brand" : "bg-transparent"}`} />)}
        </div>
        <p role="alert" className="mt-3 min-h-5 text-sm font-medium text-red-600">{err}</p>

        <div className="mt-2 grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button key={d} type="button" disabled={busy} onClick={() => press(d)} className="h-14 rounded-2xl bg-surface text-xl font-semibold shadow-sm ring-1 ring-line transition hover:bg-surface-2 active:scale-95 disabled:opacity-60">{d}</button>
          ))}
          <button type="button" onClick={onSignOut} className="h-14 rounded-2xl text-xs font-semibold text-muted hover:text-foreground">Sign out</button>
          <button type="button" disabled={busy} onClick={() => press("0")} className="h-14 rounded-2xl bg-surface text-xl font-semibold shadow-sm ring-1 ring-line transition hover:bg-surface-2 active:scale-95 disabled:opacity-60">0</button>
          <button type="button" disabled={busy} aria-label="Delete the last digit" onClick={() => setCode((c) => c.slice(0, -1))} className="grid h-14 place-items-center rounded-2xl text-muted hover:text-foreground">
            {busy ? <Loader2 size={20} className="animate-spin" /> : <Delete size={22} />}
          </button>
        </div>
      </div>
    </div>
  );
}
