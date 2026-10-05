"use client";

import { useEffect, useState } from "react";
import { Plus, Star, X } from "lucide-react";
import { rs } from "@/lib/bookings";
import { ApiError } from "@/lib/api";
import { canDo } from "@/lib/auth";
import { M_LENGTHS, M_SHIFTS, MLength, MPlan, MPlanInput, MShift, getPlans, savePlan } from "@/lib/courts";

const field = "w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-sm outline-none focus:border-brand";

type Draft = {
  id: string | null; name: string; description: string; perks: string; featured: boolean; isActive: boolean;
  cells: Record<MShift, Record<MLength, { price: string; discount: string }>>;
};

const emptyCells = (): Draft["cells"] =>
  Object.fromEntries(M_SHIFTS.map((s) => [s.id, Object.fromEntries(M_LENGTHS.map((l) => [l.id, { price: "", discount: "" }]))])) as Draft["cells"];

function toDraft(p?: MPlan): Draft {
  const cells = emptyCells();
  if (p) for (const s of M_SHIFTS) for (const l of M_LENGTHS) {
    const c = p.matrix[s.id][l.id];
    cells[s.id][l.id] = { price: c.price === null ? "" : String(c.price), discount: c.discount ? String(c.discount) : "" };
  }
  return { id: p?.id ?? null, name: p?.name ?? "", description: p?.description ?? "", perks: p?.perks.join("\n") ?? "", featured: p?.featured ?? false, isActive: p?.isActive ?? true, cells };
}

const num = (s: string) => (s === "" ? null : /^\d+$/.test(s) ? Number(s) : NaN);

function cellError(price: string, discount: string): string {
  const p = num(price);
  const d = num(discount) ?? 0;
  if (Number.isNaN(p) || Number.isNaN(d)) return "Numbers only";
  if (p === null) return discount ? "Enter a price first" : "";
  if (p < 100) return "At least Rs. 100";
  if (d >= p) return "Discount is too big";
  return "";
}

function Editor({ plan, onClose, onSaved }: { plan?: MPlan; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<Draft>(() => toDraft(plan));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const setCell = (s: MShift, l: MLength, k: "price" | "discount", v: string) =>
    setD((x) => ({ ...x, cells: { ...x.cells, [s]: { ...x.cells[s], [l]: { ...x.cells[s][l], [k]: v.replace(/\D/g, "") } } } }));

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setError("");
    if (d.name.trim().length < 2) return setError("Give the plan a name.");
    const anyBad = M_SHIFTS.some((s) => M_LENGTHS.some((l) => cellError(d.cells[s.id][l.id].price, d.cells[s.id][l.id].discount)));
    if (anyBad) return setError("Fix the prices marked in red.");
    const matrix = Object.fromEntries(M_SHIFTS.map((s) => [s.id, Object.fromEntries(M_LENGTHS.map((l) => {
      const c = d.cells[s.id][l.id];
      return [l.id, { price: num(c.price), discount: num(c.discount) ?? 0 }];
    }))])) as MPlanInput["matrix"];
    const body: MPlanInput = {
      name: d.name.trim(), description: d.description.trim() || null, featured: d.featured, isActive: d.isActive, matrix,
      perks: d.perks.split("\n").map((x) => x.trim()).filter(Boolean),
    };
    setBusy(true);
    try {
      await savePlan(d.id, body);
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the plan");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} aria-label="Membership plan" className="max-h-[94vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-bold">{d.id ? "Edit plan" : "New membership plan"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-surface-2"><X size={22} /></button>
        </div>

        <label className="block text-sm font-medium">Plan name
          <input value={d.name} maxLength={60} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="e.g. Premium" className={`${field} mt-1`} />
        </label>
        <label className="block text-sm font-medium">Short description <span className="font-normal text-muted">(optional)</span>
          <input value={d.description} maxLength={300} onChange={(e) => setD({ ...d, description: e.target.value })} className={`${field} mt-1`} />
        </label>
        <label className="block text-sm font-medium">Perks <span className="font-normal text-muted">(one per line)</span>
          <textarea value={d.perks} rows={3} onChange={(e) => setD({ ...d, perks: e.target.value })} placeholder={"Priority booking\nFree water"} className={`${field} mt-1`} />
        </label>

        <div className="space-y-3">
          <p className="text-sm font-bold">Prices <span className="font-normal text-muted">(leave a price empty if that option is not offered)</span></p>
          {M_SHIFTS.map((s) => (
            <fieldset key={s.id} className="rounded-xl border border-line p-3">
              <legend className="px-1 text-sm font-bold">{s.label} <span className="font-normal text-muted">· {s.hint}</span></legend>
              <div className="grid grid-cols-3 gap-2">
                {M_LENGTHS.map((l) => {
                  const c = d.cells[s.id][l.id];
                  const err = cellError(c.price, c.discount);
                  const pays = num(c.price) !== null && !err ? (num(c.price) as number) - (num(c.discount) ?? 0) : null;
                  return (
                    <div key={l.id} className="space-y-1.5">
                      <p className="text-center text-xs font-semibold text-muted">{l.label}</p>
                      <input inputMode="numeric" value={c.price} onChange={(e) => setCell(s.id, l.id, "price", e.target.value)} placeholder="Price" aria-label={`${s.label} ${l.label} price`} className={`${field} ${err ? "border-red-500" : ""}`} />
                      <input inputMode="numeric" value={c.discount} onChange={(e) => setCell(s.id, l.id, "discount", e.target.value)} placeholder="Off" aria-label={`${s.label} ${l.label} discount`} className={`${field} py-1.5 text-xs`} />
                      <p className={`min-h-[1rem] text-center text-[11px] ${err ? "text-red-600" : "text-muted"}`}>{err || (pays !== null ? `pays ${rs(pays)}` : "not offered")}</p>
                    </div>
                  );
                })}
              </div>
            </fieldset>
          ))}
          <p className="text-xs text-muted">&ldquo;Off&rdquo; is a rupee discount taken from the price. The customer pays the price minus the discount. A 4 PM – 8 PM slot is never offered for memberships.</p>
        </div>

        <div className="space-y-2">
          <label className="flex items-center justify-between rounded-xl border border-line p-3 text-sm font-medium">
            Active (shown to customers)
            <input type="checkbox" checked={d.isActive} onChange={(e) => setD({ ...d, isActive: e.target.checked })} className="h-5 w-5 accent-[var(--brand)]" />
          </label>
          <label className="flex items-center justify-between rounded-xl border border-line p-3 text-sm font-medium">
            Featured (highlight this plan)
            <input type="checkbox" checked={d.featured} onChange={(e) => setD({ ...d, featured: e.target.checked })} className="h-5 w-5 accent-[var(--brand)]" />
          </label>
        </div>

        {d.id && <p className="text-xs text-muted">New prices apply to new requests. Members who already bought keep the price they paid.</p>}
        {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-60">{busy ? "Saving…" : d.id ? "Save plan" : "Create plan"}</button>
      </form>
    </div>
  );
}

export default function MembershipTab() {
  const [plans, setPlans] = useState<MPlan[] | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState<MPlan | "new" | null>(null);
  const editable = canDo("membership.write");

  useEffect(() => {
    let live = true;
    getPlans()
      .then((p) => { if (live) { setPlans(p); setError(""); } })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load plans"); });
    return () => { live = false; };
  }, [tick]);

  return (
    <div className="space-y-4">
      {!editable && <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">You can view membership plans. Only a manager or owner can change them.</p>}
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {note && <p className="rounded-xl bg-brand/10 p-3 text-sm text-brand" role="status">{note}</p>}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">Each plan has a price for Morning, Day and Evening, for 1, 3 and 6 months.</p>
        {editable && <button onClick={() => setEditing("new")} className="flex shrink-0 items-center gap-1 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"><Plus size={16} /> New plan</button>}
      </div>

      {!plans && !error && <p className="py-8 text-center text-sm text-muted">Loading plans…</p>}
      {plans && plans.length === 0 && <p className="rounded-2xl bg-surface py-10 text-center text-sm text-muted shadow-sm">No membership plans yet.</p>}

      <ul className="space-y-3">
        {plans?.map((p) => (
          <li key={p.id} className={`rounded-2xl bg-surface p-4 shadow-sm ${p.isActive ? "" : "opacity-70"}`}>
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-bold">
                  {p.name}
                  {p.featured && <span className="flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-0.5 text-xs font-semibold text-orange-600"><Star size={12} /> Featured</span>}
                  {!p.isActive && <span className="rounded-full bg-slate-500/15 px-2 py-0.5 text-xs font-semibold text-slate-500">Inactive</span>}
                </p>
                {p.description && <p className="text-xs text-muted">{p.description}</p>}
                <p className="text-xs text-muted">{p.activeSubscribers} active member{p.activeSubscribers === 1 ? "" : "s"}</p>
              </div>
              {editable && <button onClick={() => setEditing(p)} className="shrink-0 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold hover:bg-brand/10">Edit</button>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[19rem] text-center text-sm">
                <thead className="text-xs text-muted">
                  <tr><th className="pb-1 text-left font-semibold">Shift</th>{M_LENGTHS.map((l) => <th key={l.id} className="pb-1 font-semibold">{l.label}</th>)}</tr>
                </thead>
                <tbody>
                  {M_SHIFTS.map((s) => (
                    <tr key={s.id} className="border-t border-line">
                      <td className="py-2 text-left font-semibold">{s.label}</td>
                      {M_LENGTHS.map((l) => {
                        const c = p.matrix[s.id][l.id];
                        return (
                          <td key={l.id} className="py-2">
                            {c.customerPays === null ? <span className="text-muted">–</span> : <>
                              <span className="font-bold">{rs(c.customerPays)}</span>
                              {c.discount > 0 && <span className="block text-[11px] text-muted line-through">{rs(c.price as number)}</span>}
                            </>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </li>
        ))}
      </ul>

      <p className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-700">
        1 and 3 month prices are used by the customer app today. 6 month prices are saved here but the customer app will only show them once it is updated to offer 6 months.
      </p>

      {editing && <Editor plan={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setNote("Plan saved."); setEditing(null); setTick((t) => t + 1); }} />}
    </div>
  );
}
