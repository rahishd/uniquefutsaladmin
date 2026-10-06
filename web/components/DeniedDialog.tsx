"use client";

import { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { DENIED_EVENT } from "@/lib/access";

// Shown when someone clicks something their account is not allowed to do.
export default function DeniedDialog() {
  const [open, setOpen] = useState(false);
  const ok = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(DENIED_EVENT, show);
    return () => window.removeEventListener(DENIED_EVENT, show);
  }, []);

  useEffect(() => {
    if (!open) return;
    ok.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/50 p-4" onClick={() => setOpen(false)}>
      <div role="alertdialog" aria-labelledby="denied-title" aria-describedby="denied-text" onClick={(e) => e.stopPropagation()} className="w-full max-w-sm space-y-3 rounded-3xl bg-surface p-6 text-center shadow-2xl">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-500/15 text-amber-600"><Lock size={26} /></span>
        <h2 id="denied-title" className="text-lg font-bold">You can&apos;t do this</h2>
        <p id="denied-text" className="text-sm text-muted">This feature is only accessible to the Owner. Please contact him.</p>
        <button ref={ok} onClick={() => setOpen(false)} className="w-full rounded-xl bg-brand py-3 font-semibold text-white">OK</button>
      </div>
    </div>
  );
}
