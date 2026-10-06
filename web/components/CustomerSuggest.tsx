"use client";

import { useEffect, useRef, useState } from "react";
import { findCustomer } from "@/lib/slots";

export type Picked = { phoneNumber: string; name: string | null };

// A text box that suggests registered customers while staff type their mobile number (or name). Choosing one fills the mobile number
// and the name in the form (onPick); typing freely still works for guests.
export default function CustomerSuggest({ value, onChange, onPick, by, className, placeholder, autoFocus }: {
  value: string; onChange: (v: string) => void; onPick: (c: Picked) => void; by: "phone" | "name"; className?: string; placeholder?: string; autoFocus?: boolean;
}) {
  const [items, setItems] = useState<Picked[]>([]);
  const [open, setOpen] = useState(false);
  const typed = useRef(false); // suggestions only after the staff member types, not when a pick fills the box

  useEffect(() => {
    const q = value.trim();
    if (!typed.current || q.length < (by === "phone" ? 3 : 2)) { setItems([]); return; }
    let live = true;
    const t = setTimeout(() => {
      findCustomer(q, 6).then((r) => { if (live) { setItems(r.items.slice(0, 6)); setOpen(true); } }).catch(() => live && setItems([]));
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [value, by]);

  return (
    <div className="relative" onBlur={() => setTimeout(() => setOpen(false), 150)}>
      <input className={className} value={value} autoFocus={autoFocus} placeholder={placeholder} inputMode={by === "phone" ? "numeric" : undefined} maxLength={by === "phone" ? 10 : undefined}
        autoComplete="off" onFocus={() => items.length > 0 && setOpen(true)}
        onChange={(e) => { typed.current = true; onChange(by === "phone" ? e.target.value.replace(/\D/g, "") : e.target.value); }} />
      {open && items.length > 0 && (
        <ul role="listbox" className="absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-lg">
          {items.map((c) => (
            <li key={c.phoneNumber}>
              <button type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()}
                onClick={() => { typed.current = false; setItems([]); setOpen(false); onPick({ phoneNumber: c.phoneNumber, name: c.name }); }}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2">
                <span className="truncate font-medium">{c.name ?? "Registered customer"}</span>
                <span className="shrink-0 text-xs text-muted">{c.phoneNumber}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
