"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import Switch from "../Switch";
import { rs } from "@/lib/bookings";
import { ApiError } from "@/lib/api";
import { canDo } from "@/lib/auth";
import { DEFAULT_GZ_PLANS, GzCatalog, GzItem, GzPlan, addConsole, addGame, getGzCatalog, patchConsole, patchGame, saveGzPlan } from "@/lib/courts";

const field = "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand disabled:opacity-60";

// Consoles and games share this list: name, on/off switch, rename, and an add form.
function CatalogList({ title, hint, singular, items, editable, onAdd, onToggle, onRename }: {
  title: string; hint: string; singular: string; items: GzItem[]; editable: boolean;
  onAdd: (name: string) => Promise<void>; onToggle: (i: GzItem) => Promise<void>; onRename: (i: GzItem, name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <section className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
      <div>
        <h2 className="font-bold">{title}</h2>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      {items.length === 0 && <p className="text-sm text-muted">None yet.</p>}
      <ul className="divide-y divide-line">
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-3 py-2.5">
            {editing === i.id ? (
              <form className="flex flex-1 gap-2" onSubmit={async (e) => { e.preventDefault(); if (draft.trim().length >= 2 && draft.trim() !== i.name) await onRename(i, draft.trim()); setEditing(null); }}>
                <input autoFocus value={draft} maxLength={40} onChange={(e) => setDraft(e.target.value)} className={field} aria-label={`Rename ${i.name}`} />
                <button className="rounded-full bg-brand px-3 text-xs font-semibold text-white">Save</button>
              </form>
            ) : (
              <>
                <span className={`min-w-0 flex-1 truncate text-sm font-semibold ${i.active ? "" : "text-muted line-through"}`}>{i.name}</span>
                {!i.active && <span className="text-xs text-muted">Hidden</span>}
                {editable && <button onClick={() => { setEditing(i.id); setDraft(i.name); }} aria-label={`Rename ${i.name}`} className="rounded-full p-2 hover:bg-surface-2"><Pencil size={15} /></button>}
                <Switch on={i.active} disabled={!editable} onChange={() => onToggle(i)} label={`${i.name} is ${i.active ? "shown" : "hidden"} in the app`} />
              </>
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (name.trim().length < 2) return; await onAdd(name.trim()); setName(""); }}>
          <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={`New ${singular}`} className={field} aria-label={`New ${singular} name`} />
          <button className="flex shrink-0 items-center gap-1 rounded-xl bg-brand px-4 text-sm font-semibold text-white"><Plus size={16} /> Add</button>
        </form>
      )}
    </section>
  );
}

export default function GamezoneTab() {
  const [cat, setCat] = useState<GzCatalog | null>(null);
  const [rates, setRates] = useState<Record<number, { label: string; rate: string }>>({});
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const editable = canDo("gamezone.write");

  useEffect(() => {
    let live = true;
    getGzCatalog()
      .then((c) => { if (live) { setCat(c); setRates({}); setError(""); } })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load Gamezone"); });
    return () => { live = false; };
  }, [tick]);

  if (!cat) return <p className="py-10 text-center text-sm text-muted">{error || "Loading Gamezone…"}</p>;

  const saved = (cat.plans.length ? cat.plans : DEFAULT_GZ_PLANS) as GzPlan[];
  const notSaved = cat.plans.length === 0;
  const shown = (p: GzPlan) => rates[p.players] ?? { label: p.label, rate: String(p.ratePerPersonHour) };
  const rateOk = (s: string) => /^\d+$/.test(s) && Number(s) >= 50 && Number(s) <= 100000;
  const changed = saved.filter((p) => { const s = shown(p); return notSaved || s.label !== p.label || Number(s.rate) !== p.ratePerPersonHour; }).filter((p) => notSaved ? true : rates[p.players] !== undefined);
  const bad = changed.some((p) => !rateOk(shown(p).rate) || shown(p).label.trim().length < 2);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setError("");
    setNote("");
    try { await fn(); if (ok) setNote(ok); setTick((t) => t + 1); } catch (e) { setError(e instanceof ApiError ? e.message : "That did not save"); }
  };

  async function saveRates() {
    setBusy(true);
    await run(async () => { for (const p of notSaved ? saved : changed) { const s = shown(p); await saveGzPlan({ players: p.players, label: s.label.trim(), ratePerPersonHour: Number(s.rate) }); } }, "Rates saved. New Gamezone bookings use them straight away.");
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      {!editable && <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">You can view Gamezone prices. Only staff with Gamezone access can change them.</p>}
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {note && <p className="rounded-xl bg-brand/10 p-3 text-sm text-brand" role="status">{note}</p>}

      <section className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
        <div>
          <h2 className="font-bold">PS5 rates</h2>
          <p className="text-xs text-muted">Price per person per hour. A booking costs rate × players × hours.</p>
          {notSaved && <p className="mt-1 text-xs text-amber-600">These are the app&apos;s starting rates. They are saved when you press Save rates.</p>}
        </div>
        <ul className="space-y-2">
          {saved.map((p) => {
            const s = shown(p);
            const invalid = rates[p.players] !== undefined && !rateOk(s.rate);
            return (
              <li key={p.players} className="grid grid-cols-[1fr_7rem] items-end gap-3 rounded-xl border border-line p-3">
                <label className="block text-xs font-semibold text-muted">{p.players} {p.players === 1 ? "player" : "players"} · name
                  <input disabled={!editable} value={s.label} maxLength={30} onChange={(e) => setRates((r) => ({ ...r, [p.players]: { ...s, label: e.target.value } }))} className={`${field} mt-1 text-base font-bold`} />
                </label>
                <label className="block text-xs font-semibold text-muted">Rs. / person
                  <input disabled={!editable} inputMode="numeric" value={s.rate} onChange={(e) => setRates((r) => ({ ...r, [p.players]: { ...s, rate: e.target.value.replace(/\D/g, "") } }))} className={`${field} mt-1 text-base font-bold ${invalid ? "border-red-500" : ""}`} aria-label={`Rate for ${p.players} players`} />
                </label>
                <p className="col-span-2 text-xs text-muted">{invalid ? <span className="text-red-600">Enter Rs. 50 to Rs. 100,000.</span> : <>One hour for {p.players} {p.players === 1 ? "player" : "players"} costs <strong>{rs(Number(s.rate || 0) * p.players)}</strong>.</>}</p>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted">Sessions run 10 AM to 10 PM, 1 to 4 hours, for 1, 2 or 4 players. Those limits are set in the customer app.</p>
        {editable && (notSaved || changed.length > 0) && (
          <div className="flex justify-end gap-2">
            {!notSaved && <button onClick={() => { setRates({}); setError(""); }} className="rounded-full px-3 py-2 text-sm font-semibold text-muted">Discard</button>}
            <button disabled={busy || bad} onClick={saveRates} className="rounded-full bg-brand px-5 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? "Saving…" : "Save rates"}</button>
          </div>
        )}
      </section>

      <CatalogList title="Consoles" hint="Customers pick a console first. Hide one to stop new bookings on it (existing bookings stay)." singular="console" items={cat.consoles} editable={editable}
        onAdd={(n) => run(() => addConsole(n), "Console added.")} onToggle={(i) => run(() => patchConsole(i.id, { active: !i.active }))} onRename={(i, n) => run(() => patchConsole(i.id, { name: n }))} />
      <CatalogList title="Games" hint="The game list customers choose from when they book." singular="game" items={cat.games} editable={editable}
        onAdd={(n) => run(() => addGame(n), "Game added.")} onToggle={(i) => run(() => patchGame(i.id, { active: !i.active }))} onRename={(i, n) => run(() => patchGame(i.id, { name: n }))} />
    </div>
  );
}
