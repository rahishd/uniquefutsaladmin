"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, HelpCircle } from "lucide-react";
import { ConfirmRequest, describeConfirm, registerConfirmHost } from "@/lib/confirm";

// The confirmation dialog shown inside the app (see lib/confirm.ts). Requests that arrive together wait their turn.
export default function ConfirmHost() {
  const [queue, setQueue] = useState<ConfirmRequest[]>([]);
  const titleId = useId();
  const textId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => registerConfirmHost((r) => {
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) opener.current = document.activeElement;
    setQueue((q) => [...q, r]);
  }), []);

  const current = queue[0];
  const d = current ? describeConfirm(current.message, current) : null;

  function answer(value: boolean) {
    if (!current) return;
    current.resolve(value);
    setQueue((q) => q.slice(1));
    if (queue.length <= 1 && opener.current instanceof HTMLElement) opener.current.focus();
  }

  // the safe choice has the focus: Cancel for something destructive, the confirm button otherwise
  useEffect(() => {
    if (!current) return;
    (describeConfirm(current.message, current).danger ? cancelRef.current : okRef.current)?.focus();
  }, [current]);

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); answer(false); }
      if (e.key === "Tab") {
        // keep the focus between the two buttons
        const a = cancelRef.current, b = okRef.current;
        if (!a || !b) return;
        const on = document.activeElement;
        if (e.shiftKey && on === a) { e.preventDefault(); b.focus(); }
        else if (!e.shiftKey && on === b) { e.preventDefault(); a.focus(); }
        else if (on !== a && on !== b) { e.preventDefault(); a.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // answer only reads the current request
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  if (!current || !d) return null;
  const Icon = d.danger ? AlertTriangle : HelpCircle;

  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/45 p-4 sm:items-center" onMouseDown={(e) => { if (e.target === e.currentTarget) answer(false); }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={textId} className="w-full max-w-md rounded-3xl bg-surface p-5 text-foreground shadow-2xl">
        <div className="flex items-start gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${d.danger ? "bg-red-500/12 text-red-600" : "bg-brand/10 text-brand"}`}><Icon size={20} /></span>
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-bold">{d.title}</h2>
            <p id={textId} className="mt-1 whitespace-pre-line break-words text-sm text-muted">{current.message}</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button ref={cancelRef} type="button" onClick={() => answer(false)} className="rounded-full border border-line bg-surface py-2.5 text-sm font-semibold">{d.cancelLabel}</button>
          <button ref={okRef} type="button" onClick={() => answer(true)} className={`rounded-full py-2.5 text-sm font-semibold text-white ${d.danger ? "bg-red-600 hover:bg-red-700" : "bg-brand"}`}>{d.confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
