"use client";

import { useEffect, useState } from "react";
import { rs } from "@/lib/bookings";
import { ApiError } from "@/lib/api";
import { canDo } from "@/lib/auth";
import { HOURS, Pricing, SHIFTS, getPricing, priceMap, savePricing } from "@/lib/courts";
import { hourLabel } from "@/lib/slots";

const MIN = 100;
const MAX = 100000;
const field = "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand disabled:opacity-60";

export default function PricesTab() {
  const [saved, setSaved] = useState<Pricing | null>(null);
  const [edits, setEdits] = useState<Record<number, string>>({}); // hour -> typed price
  const [rateEdit, setRateEdit] = useState<string | null>(null);
  const [shiftBulk, setShiftBulk] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const editable = canDo("courts.write");

  useEffect(() => {
    let live = true;
    getPricing()
      .then((p) => { if (live) { setSaved(p); setEdits({}); setRateEdit(null); setError(""); } })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load prices"); });
    return () => { live = false; };
  }, [tick]);

  if (!saved) return <p className="py-10 text-center text-sm text-muted">{error || "Loading prices…"}</p>;

  const base = priceMap(saved);
  const shown = (h: number) => edits[h] ?? String(base[h]);
  const num = (s: string) => (/^\d+$/.test(s) ? Number(s) : NaN);
  const valid = (n: number) => Number.isInteger(n) && n >= MIN && n <= MAX;
  const changedHours = HOURS.filter((h) => edits[h] !== undefined && num(edits[h]) !== base[h]);
  const rateChanged = rateEdit !== null && num(rateEdit) !== saved.hourlyRate;
  const dirty = changedHours.length + (rateChanged ? 1 : 0);
  const bad = changedHours.some((h) => !valid(num(edits[h]))) || (rateChanged && !valid(num(rateEdit!)));

  const setHour = (h: number, v: string) => setEdits((e) => ({ ...e, [h]: v.replace(/\D/g, "") }));
  const applyShift = (hours: number[], id: string) => {
    const v = shiftBulk[id] ?? "";
    if (!valid(num(v))) return setError(`Enter a price between Rs. ${MIN} and Rs. ${MAX.toLocaleString("en-IN")} to apply to the shift.`);
    setError("");
    setEdits((e) => ({ ...e, ...Object.fromEntries(hours.map((h) => [h, v])) }));
  };

  async function save() {
    setBusy(true);
    setError("");
    setNote("");
    try {
      await savePricing({
        ...(rateChanged ? { hourlyRate: num(rateEdit!) } : {}),
        ...(changedHours.length ? { hours: changedHours.map((h) => ({ hour: h, price: num(edits[h]) })) } : {}),
      });
      setNote("Prices saved. Customers see the new prices straight away.");
      setTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the prices");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {!editable && <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">You can view prices. Only a manager or owner can change them.</p>}
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {note && <p className="rounded-xl bg-brand/10 p-3 text-sm text-brand" role="status">{note}</p>}

      {SHIFTS.map((s) => (
        <section key={s.id} className="rounded-2xl bg-surface p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-bold">{s.label} shift</h2>
              <p className="text-xs text-muted">{s.range}</p>
            </div>
            {editable && (
              <div className="flex items-center gap-2">
                <input aria-label={`Price for the whole ${s.label} shift`} inputMode="numeric" placeholder="Rs." value={shiftBulk[s.id] ?? ""} onChange={(e) => setShiftBulk((b) => ({ ...b, [s.id]: e.target.value.replace(/\D/g, "") }))} className={`${field} w-24 py-1.5`} />
                <button onClick={() => applyShift(s.hours, s.id)} className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold hover:bg-brand/10">Set all</button>
              </div>
            )}
          </div>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {s.hours.map((h) => {
              const changed = changedHours.includes(h);
              const invalid = edits[h] !== undefined && !valid(num(edits[h]));
              return (
                <li key={h} className={`rounded-xl border p-2.5 ${invalid ? "border-red-500" : changed ? "border-brand bg-brand/5" : "border-line"}`}>
                  <label className="block text-xs font-semibold text-muted">{hourLabel(h)}
                    <input inputMode="numeric" disabled={!editable} value={shown(h)} onChange={(e) => setHour(h, e.target.value)} aria-label={`Price at ${hourLabel(h)}`} className={`${field} mt-1 text-base font-bold`} />
                  </label>
                  {changed && !invalid && <p className="mt-1 text-[11px] text-muted">was {rs(base[h])}</p>}
                  {invalid && <p className="mt-1 text-[11px] text-red-600">Rs. {MIN} to {MAX.toLocaleString("en-IN")}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <section className="rounded-2xl bg-surface p-4 shadow-sm">
        <label className="block text-sm font-bold">Standard price
          <span className="block text-xs font-normal text-muted">Used for any hour that has no price of its own, such as late night.</span>
          <input inputMode="numeric" disabled={!editable} value={rateEdit ?? String(saved.hourlyRate)} onChange={(e) => setRateEdit(e.target.value.replace(/\D/g, ""))} className={`${field} mt-2 max-w-[10rem] text-base font-bold`} />
        </label>
      </section>

      <p className="text-xs text-muted">Prices are per hour. A game also earns loyalty points (price ÷ 100) and a free game costs price ÷ 10 points, so changing a price changes those too. Prices already booked do not change.</p>

      {editable && dirty > 0 && (
        <div className="sticky bottom-24 z-20 flex items-center justify-between gap-3 rounded-2xl bg-foreground p-3 text-background shadow-xl lg:bottom-4">
          <span className="text-sm font-semibold">{dirty} unsaved change{dirty > 1 ? "s" : ""}</span>
          <span className="flex gap-2">
            <button onClick={() => { setEdits({}); setRateEdit(null); setError(""); }} className="rounded-full px-3 py-1.5 text-sm font-semibold opacity-80">Discard</button>
            <button disabled={busy || bad} onClick={save} className="rounded-full bg-brand px-4 py-1.5 text-sm font-bold text-white disabled:opacity-50">{busy ? "Saving…" : "Save prices"}</button>
          </span>
        </div>
      )}
    </div>
  );
}
