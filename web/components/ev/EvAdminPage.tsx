"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { BatteryCharging, Download, Plug, Plus, Printer, Search, Settings2, X, Zap } from "lucide-react";
import PaySplit, { INITIAL_PAY, PayState, paymentsFor } from "../PaySplit";
import { ApiError } from "@/lib/api";
import { guard } from "@/lib/access";
import { rs } from "@/lib/bookings";
import { EvCharge, EvList, EvPort, EvProvider, addPort, cancelEv, deletePort, editPort, listEv, listPorts, mins, payEv, portLink, stopEv, testPort } from "@/lib/ev";
import { RecordSheet } from "../payments/EvCharging";

type Tab = "live" | "history" | "ports";
const field = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");
const TONE: Record<string, string> = { charging: "bg-amber-500/15 text-amber-700", unpaid: "bg-red-500/15 text-red-600", paid: "bg-brand/15 text-brand", cancelled: "bg-slate-500/15 text-slate-500" };
const LABEL: Record<string, string> = { charging: "Charging", unpaid: "Unpaid", paid: "Paid", cancelled: "Cancelled" };

function Card({ title, value, sub, tone }: { title: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="rounded-2xl bg-surface p-4 shadow-sm">
      <p className="text-xs text-muted">{title}</p>
      <p className={`text-xl font-bold ${tone ?? ""}`}>{value}</p>
      <p className="text-xs text-muted">{sub}</p>
    </div>
  );
}

// EV Charging: who is charging now, the history with payments, and the charging ports with the QR codes to print.
export default function EvAdminPage() {
  const [tab, setTab] = useState<Tab>("live");
  const [data, setData] = useState<EvList | null>(null);
  const [ports, setPorts] = useState<EvPort[] | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [pay, setPay] = useState<EvCharge | null>(null);
  const [record, setRecord] = useState(false);
  const [busy, setBusy] = useState("");
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      listEv(q, status).then((d) => { if (live) { setData(d); setError(""); } }).catch((e) => { if (live) setError(msg(e)); });
      listPorts().then((p) => { if (live) setPorts(p); }).catch(() => {});
    }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [q, status, tick]);

  // a live view: charging sessions change without anyone touching this page
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 10000);
    return () => clearInterval(t);
  }, [refresh]);

  async function act(key: string, fn: () => Promise<unknown>, confirm?: string) {
    if (!guard("payments.collect")) return;
    if (confirm && !window.confirm(confirm)) return;
    setBusy(key);
    setError("");
    try { await fn(); refresh(); } catch (e) { setError(msg(e)); } finally { setBusy(""); }
  }

  const s = data?.summary;
  const tabs: { id: Tab; label: string; n?: number }[] = [
    { id: "live", label: "Live", n: data?.active.length },
    { id: "history", label: "History" },
    { id: "ports", label: "Ports & QR", n: ports?.length },
  ];

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><BatteryCharging className="text-brand" /> EV Charging</h1>
          <p className="text-sm text-muted">Paid AC charging, {data ? rs(data.rate) : "Rs. 50"} per hour, counted in quarter hours. Customers scan the QR at a port in the app.</p>
        </div>
        <button onClick={() => guard("payments.collect") && setRecord(true)} className="flex items-center gap-1.5 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white"><Plug size={16} /> Record a walk-in charge</button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card title="Charging now" value={data ? String(data.active.length) : "—"} sub={ports ? `${ports.filter((p) => p.busy).length} of ${ports.filter((p) => p.isActive).length} ports in use` : " "} tone="text-amber-600" />
        <Card title="To collect" value={data ? rs(data.unpaid.amount) : "—"} sub={data ? `${data.unpaid.count} unpaid session${data.unpaid.count === 1 ? "" : "s"}` : " "} tone="text-red-600" />
        <Card title="Today (paid)" value={s ? rs(s.today.amount) : "—"} sub={s ? `${s.today.count} sessions · ${s.today.hours} h` : " "} tone="text-brand" />
        <Card title="Last 30 days (paid)" value={s ? rs(s.last30.amount) : "—"} sub={s ? `Cash ${rs(s.last30.cash)} · Online ${rs(s.last30.online)}` : " "} />
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-surface p-1 shadow-sm" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`rounded-xl py-2.5 text-sm font-semibold ${tab === t.id ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`}>
            {t.label}{t.n ? <span className="ml-1.5 text-xs opacity-80">{t.n}</span> : null}
          </button>
        ))}
      </div>

      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}

      {tab === "live" && (
        <div className="space-y-4">
          <section>
            <h2 className="mb-2 text-sm font-semibold">Charging now</h2>
            {data && data.active.length === 0 && <p className="rounded-2xl bg-surface py-10 text-center text-sm text-muted shadow-sm">Nobody is charging right now.</p>}
            <ul className="grid items-start gap-2 xl:grid-cols-2">
              {data?.active.map((r) => {
                const m = r.startedAt ? Math.max(1, Math.ceil((Date.now() - new Date(r.startedAt).getTime()) / 60000)) : 0;
                return (
                  <li key={r.id} className="flex items-center gap-3 rounded-2xl bg-surface p-4 shadow-sm">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-600"><Zap size={20} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{r.customerName || r.phone || "Customer"}{r.port ? ` · ${r.port}` : ""}</p>
                      <p className="text-xs text-muted">{r.phone} · started {when(r.startedAt)} · {mins(m)}</p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1.5">
                      <button disabled={busy === r.id} onClick={() => act(r.id, () => stopEv(r.id), `Stop charging for ${r.customerName ?? "this customer"} now and make the bill?`)} className="rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">Stop &amp; bill</button>
                      <button disabled={busy === r.id} onClick={() => act(r.id, () => cancelEv(r.id), "Cancel this session without a bill?")} className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-muted">Cancel</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
          <section>
            <h2 className="mb-2 text-sm font-semibold">Ports</h2>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {ports?.map((p) => (
                <li key={p.id} className="rounded-2xl bg-surface p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-2"><p className="font-semibold">{p.name}</p>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${!p.isActive ? "bg-slate-500/15 text-slate-500" : p.busy ? "bg-amber-500/15 text-amber-700" : "bg-brand/15 text-brand"}`}>{!p.isActive ? "Off" : p.busy ? "In use" : "Free"}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">{p.busy ? `${p.customerName ?? "Customer"} since ${when(p.startedAt)}` : p.note ?? " "}</p>
                </li>
              ))}
              {ports && ports.length === 0 && <li className="rounded-2xl bg-surface p-6 text-center text-sm text-muted shadow-sm sm:col-span-2">No charging ports yet. Add one in Ports &amp; QR, then print its QR code.</li>}
            </ul>
          </section>
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <label className="relative min-w-[12rem] flex-1">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone or vehicle" className={`${field} pl-10`} />
            </label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" className={`${field} max-w-[10rem]`}>
              <option value="">All statuses</option><option value="unpaid">Unpaid</option><option value="paid">Paid</option><option value="charging">Charging</option><option value="cancelled">Cancelled</option>
            </select>
          </div>
          {data && data.items.length === 0 && <p className="rounded-2xl bg-surface py-12 text-center text-sm text-muted shadow-sm">No charging sessions match.</p>}
          <ul className="grid items-start gap-2 xl:grid-cols-2">
            {data?.items.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-2xl bg-surface p-4 shadow-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{r.customerName || r.phone || "Walk-in"}{r.port ? ` · ${r.port}` : ""}</p>
                  <p className="truncate text-sm text-muted">{[r.phone, r.vehicle].filter(Boolean).join(" · ") || "No details"}</p>
                  <p className="text-xs text-muted">{when(r.startedAt ?? r.createdAt)} · {r.minutes ? mins(r.minutes) : `${r.hours} h`} · {r.source === "app" ? "App" : "Staff"}{r.status === "paid" ? ` · ${r.cashAmount > 0 && r.onlineAmount > 0 ? "Cash + Online" : r.onlineAmount > 0 ? "Online" : "Cash"}` : ""}</p>
                  <span className={`mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[r.status]}`}>{LABEL[r.status]}</span>
                </div>
                <div className="shrink-0 space-y-2 text-right">
                  <p className={`font-bold ${r.status === "cancelled" ? "text-muted line-through" : ""}`}>{rs(r.amount)}</p>
                  {r.status === "unpaid" && <button onClick={() => guard("payments.collect") && setPay(r)} className="rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white">Mark paid</button>}
                  {r.status === "unpaid" && <button disabled={busy === r.id} onClick={() => act(r.id, () => cancelEv(r.id), "Cancel this bill? The customer will not be charged.")} className="block w-full text-xs font-semibold text-muted underline">Cancel bill</button>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "ports" && <Ports ports={ports} onChanged={refresh} />}

      {pay && <PaySheet row={pay} onClose={() => setPay(null)} onDone={() => { setPay(null); refresh(); }} />}
      {record && data && <RecordSheet rate={data.rate} onClose={() => setRecord(false)} onDone={refresh} />}
    </div>
  );
}

function PaySheet({ row, onClose, onDone }: { row: EvCharge; onClose: () => void; onDone: () => void }) {
  const [pay, setPay] = useState<PayState>(INITIAL_PAY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ready = paymentsFor(row.amount, pay);

  async function save() {
    if (ready.problem) return setError(ready.problem);
    setBusy(true);
    setError("");
    const how = ready.payments ? { payments: ready.payments, fonepayQrId: ready.fonepayQrId } : { payment: ready.single === "cash" ? ("cash" as const) : ("online" as const), fonepayQrId: ready.fonepayQrId };
    try { await payEv(row.id, how); onDone(); } catch (e) { setError(msg(e)); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label="Collect EV charging payment" onClick={(e) => e.stopPropagation()} className="max-h-[94vh] w-full max-w-sm space-y-4 overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="flex items-start justify-between">
          <div><h2 className="text-lg font-bold">Collect EV charging</h2><p className="text-sm text-muted">{row.customerName || row.phone || "Customer"} · {mins(row.minutes)}</p></div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-surface-2"><X size={20} /></button>
        </div>
        <p className="text-3xl font-bold">{rs(row.amount)}</p>
        <PaySplit total={row.amount} value={pay} onChange={(v) => { setPay(v); setError(""); }} customerPhone={row.phone ?? undefined} />
        {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
        <button disabled={busy || !!ready.problem} onClick={save} className="w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-60">{busy ? "Saving…" : "Mark as paid"}</button>
      </div>
    </div>
  );
}

// One QR per port. The QR holds a link into the customer app, so a phone camera works as well as the in-app scanner.
function PortQr({ token, size = 200 }: { token: string; size?: number }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(portLink(token), { width: size * 2, margin: 1, errorCorrectionLevel: "M" }).then((u) => { if (live) setSrc(u); }).catch(() => {});
    return () => { live = false; };
  }, [token, size]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="Charging port QR code" width={size} height={size} /> : <span style={{ width: size, height: size }} className="block animate-pulse rounded-xl bg-surface-2" />;
}

function printPort(p: EvPort) {
  const w = window.open("", "_blank", "width=480,height=700");
  if (!w) return;
  QRCode.toDataURL(portLink(p.qrToken), { width: 720, margin: 1, errorCorrectionLevel: "M" }).then((u) => {
    w.document.write(`<!doctype html><title>${p.name}</title><body style="font-family:system-ui;text-align:center;padding:24px"><h1 style="margin:0">UNIQUE FUTSAL</h1><h2 style="margin:4px 0 16px">AC EV Charging</h2><img src="${u}" width="360" height="360"><h2 style="margin:16px 0 4px">${p.name.replace(/</g, "&lt;")}</h2><p style="font-size:18px;margin:4px 0">Scan with the Unique Futsal app to start charging</p><p style="color:#555">Rs. 50 per hour, paid at the venue</p><script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body>`);
    w.document.close();
  });
}

// A PNG of the port's QR with its name, for a sign or a sticker.
async function downloadPort(p: EvPort) {
  const qr = await QRCode.toDataURL(portLink(p.qrToken), { width: 900, margin: 2, errorCorrectionLevel: "M" });
  const img = new Image();
  img.src = qr;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = 1000;
  c.height = 1260;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#0c0b5d";
  g.textAlign = "center";
  g.font = "bold 64px sans-serif";
  g.fillText("UNIQUE FUTSAL", 500, 100);
  g.font = "bold 44px sans-serif";
  g.fillText("AC EV Charging", 500, 165);
  g.drawImage(img, 50, 200, 900, 900);
  g.font = "bold 52px sans-serif";
  g.fillText(p.name, 500, 1170);
  g.fillStyle = "#555";
  g.font = "32px sans-serif";
  g.fillText("Scan with the Unique Futsal app to start charging", 500, 1220);
  const a = document.createElement("a");
  a.href = c.toDataURL("image/png");
  a.download = `ev-port-${p.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
  a.click();
}

const PROVIDERS: { id: EvProvider; label: string; hint: string }[] = [
  { id: "manual", label: "Manual (record only)", hint: "Nothing is switched. The session and bill are recorded." },
  { id: "webhook", label: "Webhook (smart plug)", hint: "On every start and stop, Unique Futsal calls your bridge (Tuya Smart Plug via a bridge, Home Assistant, n8n or your own server) to switch the plug." },
];

// Which system switches this port's plug. The QR never changes when this is changed.
function ControllerSheet({ port, onClose, onSaved }: { port: EvPort; onClose: () => void; onSaved: () => void }) {
  const [provider, setProvider] = useState<EvProvider>(port.provider);
  const [url, setUrl] = useState(port.webhookUrl);
  const [secret, setSecret] = useState("");
  const [device, setDevice] = useState(port.deviceId);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  async function save() {
    if (!guard("payments.collect")) return;
    setBusy("save");
    setError("");
    setNote("");
    try {
      await editPort(port.id, { provider, webhookUrl: url.trim(), deviceId: device.trim(), ...(secret ? { webhookSecret: secret } : {}) });
      onSaved();
      setNote("Saved. The printed QR code is unchanged.");
      setSecret("");
    } catch (e) { setError(msg(e)); } finally { setBusy(""); }
  }
  async function test(action: "on" | "off") {
    if (!guard("payments.collect")) return;
    setBusy(action);
    setError("");
    setNote("");
    try { await testPort(port.id, action); setNote(`Test ${action} sent. Check the plug.`); } catch (e) { setError(msg(e)); } finally { setBusy(""); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label={`Controller for ${port.name}`} onClick={(e) => e.stopPropagation()} className="max-h-[94vh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="flex items-start justify-between">
          <div><h2 className="text-lg font-bold">Controller · {port.name}</h2><p className="text-sm text-muted">What switches this port&apos;s plug on and off.</p></div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-surface-2"><X size={20} /></button>
        </div>
        <div className="space-y-2">
          {PROVIDERS.map((p) => (
            <label key={p.id} className={`flex cursor-pointer gap-3 rounded-2xl border p-3 ${provider === p.id ? "border-brand bg-brand/5" : "border-line"}`}>
              <input type="radio" name="provider" checked={provider === p.id} onChange={() => setProvider(p.id)} className="mt-1 accent-[var(--brand)]" />
              <span><span className="block text-sm font-semibold">{p.label}</span><span className="block text-xs text-muted">{p.hint}</span></span>
            </label>
          ))}
        </div>
        {provider === "webhook" && (
          <div className="space-y-3">
            <label className="block text-sm font-medium">Webhook address<input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://bridge.example.com/ev" className={`${field} mt-1`} /></label>
            <label className="block text-sm font-medium">Secret <span className="font-normal text-muted">{port.hasSecret ? "(saved, type to replace)" : "(optional)"}</span>
              <input value={secret} onChange={(e) => setSecret(e.target.value)} type="password" autoComplete="new-password" placeholder="Used to sign every call (X-UF-Signature, HMAC SHA-256)" className={`${field} mt-1`} /></label>
            <label className="block text-sm font-medium">Device ID <span className="font-normal text-muted">(optional, sent to the bridge, e.g. the Tuya device id)</span><input value={device} onChange={(e) => setDevice(e.target.value)} className={`${field} mt-1`} /></label>
            <p className="rounded-xl bg-surface-2 p-3 text-xs text-muted">The bridge receives JSON: <code>{"{ action: \"on\" | \"off\", port, sessionId, customerName }"}</code>. Answer with any 2xx code once the plug is switched. If it does not answer, the customer is not charged for a start that failed.</p>
          </div>
        )}
        {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
        {note && <p role="status" className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-700">{note}</p>}
        <div className="flex flex-wrap gap-2">
          <button disabled={busy !== ""} onClick={save} className="flex-1 rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-60">{busy === "save" ? "Saving…" : "Save"}</button>
          <button disabled={busy !== ""} onClick={() => test("on")} className="rounded-xl bg-surface-2 px-4 py-3 text-sm font-semibold disabled:opacity-60">{busy === "on" ? "…" : "Test on"}</button>
          <button disabled={busy !== ""} onClick={() => test("off")} className="rounded-xl bg-surface-2 px-4 py-3 text-sm font-semibold disabled:opacity-60">{busy === "off" ? "…" : "Test off"}</button>
        </div>
        <p className="text-xs text-muted">Test uses the saved settings, so press Save first.</p>
      </div>
    </div>
  );
}

function Ports({ ports, onChanged }: { ports: EvPort[] | null; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ctl, setCtl] = useState<EvPort | null>(null);

  async function add() {
    if (!guard("payments.collect")) return;
    setBusy(true);
    setError("");
    try { await addPort({ name: name.trim(), note: note.trim() || undefined }); setName(""); setNote(""); onChanged(); } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  }
  async function run(fn: () => Promise<unknown>, confirm?: string) {
    if (!guard("payments.collect")) return;
    if (confirm && !window.confirm(confirm)) return;
    setError("");
    try { await fn(); onChanged(); } catch (e) { setError(msg(e)); }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); void add(); }} className="flex flex-wrap items-end gap-2 rounded-2xl bg-surface p-4 shadow-sm">
        <label className="min-w-[10rem] flex-1 text-sm font-medium">Port name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Port 1 (front gate)" className={`${field} mt-1`} /></label>
        <label className="min-w-[10rem] flex-1 text-sm font-medium">Note <span className="font-normal text-muted">(optional)</span><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} className={`${field} mt-1`} /></label>
        <button disabled={busy || name.trim().length < 2} className="flex items-center gap-1.5 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Plus size={16} /> Add port</button>
      </form>
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {ports && ports.length === 0 && <p className="rounded-2xl bg-surface py-10 text-center text-sm text-muted shadow-sm">Add your first charging port, then print its QR code and fix it at the station.</p>}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ports?.map((p) => (
          <li key={p.id} className={`rounded-2xl bg-surface p-4 shadow-sm ${p.isActive ? "" : "opacity-70"}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><p className="truncate font-semibold">{p.name}</p><p className="truncate text-xs text-muted">{p.note ?? "No note"}</p></div>
              <span className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[11px]" title="Port code (customers can type it if the camera fails)">{p.qrToken}</span>
            </div>
            <div className="my-3 grid place-items-center rounded-xl bg-white p-3"><PortQr token={p.qrToken} size={170} /></div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <button onClick={() => printPort(p)} className="flex items-center gap-1 rounded-full bg-brand px-3 py-1.5 text-white"><Printer size={13} /> Print QR</button>
              <button onClick={() => void downloadPort(p)} className="flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5"><Download size={13} /> PNG</button>
              <button onClick={() => setCtl(p)} className="flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5"><Settings2 size={13} /> Controller: {p.provider === "webhook" ? "Webhook" : "Manual"}</button>
              <button onClick={() => run(() => editPort(p.id, { isActive: !p.isActive }))} className="rounded-full bg-surface-2 px-3 py-1.5">{p.isActive ? "Switch off" : "Switch on"}</button>
              <button onClick={() => run(() => editPort(p.id, { newQr: true }), "Make a new QR code? The printed one will stop working.")} className="rounded-full bg-surface-2 px-3 py-1.5">New QR</button>
              <button onClick={() => run(() => deletePort(p.id), `Remove ${p.name}?`)} className="rounded-full bg-surface-2 px-3 py-1.5 text-red-600">Remove</button>
            </div>
          </li>
        ))}
      </ul>
      {ctl && <ControllerSheet port={ctl} onClose={() => setCtl(null)} onSaved={onChanged} />}
    </div>
  );
}
