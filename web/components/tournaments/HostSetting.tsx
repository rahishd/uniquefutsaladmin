"use client";

import { useState } from "react";

// One whole-number setting of the tournament that the host edits (entry fee, maximum teams): a box, a Save button and the answer.
export default function HostSetting({ id, label, hint, prefix, saved, noun, save, doneText }: {
  id: string; label: string; hint: string; prefix?: string; saved: number; noun: string;
  save: (n: number) => Promise<number>; doneText: (n: number) => string;
}) {
  const [value, setValue] = useState<string | null>(null); // null = showing the saved number, not being edited
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const shown = value ?? String(saved);
  const changed = value !== null && value !== String(saved);

  async function run() {
    if (value === null) return;
    const n = value === "" ? 0 : Number(value);
    if (!Number.isInteger(n) || n < 0) { setError(`Enter the ${noun} as a whole number (0 for none).`); return; }
    setBusy(true); setError(""); setNote("");
    try { const r = await save(n); setValue(null); setNote(doneText(r)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save"); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold">{label} <span className="font-normal text-muted">({hint})</span></label>
      <div className="flex flex-wrap items-center gap-2">
        {prefix && <span className="text-sm font-semibold">{prefix}</span>}
        <input id={id} inputMode="numeric" value={shown} onChange={(e) => { setValue(e.target.value.replace(/\D/g, "").slice(0, 7)); setError(""); setNote(""); }} className="w-32 rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
        <button type="button" onClick={run} disabled={busy || !changed} className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
        {changed && <button type="button" onClick={() => setValue(null)} className="text-sm font-semibold text-muted">Cancel</button>}
      </div>
      {note && <p role="status" className="text-xs font-medium text-brand">{note}</p>}
      {error && <p role="alert" className="text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
