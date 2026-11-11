"use client";

import { useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { guard } from "@/lib/access";
import { ApiError } from "@/lib/api";
import { downloadContactsExcel } from "@/lib/tournaments";

// An Excel icon that downloads contacts (captain name and phone, with the event name, dates and hours).
//  - with a tournamentId: that event's captains (and its host);
//  - without: every tournament, and all customers too when the account may export customers.
// `iconOnly` makes it a small round icon button (next to a phone number); otherwise it carries a label.
export default function ExportContactsButton({ tournamentId, label, iconOnly = false, title }: { tournamentId?: string; label?: string; iconOnly?: boolean; title?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const tip = title ?? label ?? "Export to Excel";

  async function go() {
    if (busy || !guard("tournaments.registrations")) return;
    setBusy(true); setErr("");
    try { await downloadContactsExcel(tournamentId); }
    catch (e) { setErr(e instanceof ApiError || e instanceof Error ? e.message : "Could not export"); }
    finally { setBusy(false); }
  }

  const Icon = busy ? Loader2 : FileSpreadsheet;
  return (
    <span className="relative inline-flex">
      <button type="button" onClick={go} disabled={busy} title={tip} aria-label={tip}
        className={iconOnly
          ? "grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line text-emerald-700 hover:bg-emerald-500/10 disabled:opacity-60"
          : "flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-500/10 disabled:opacity-60"}>
        <Icon size={iconOnly ? 18 : 17} className={busy ? "animate-spin" : ""} /> {!iconOnly && (label ?? "Export")}
      </button>
      {err && <span role="alert" className="absolute left-0 top-full z-20 mt-1 w-56 rounded-xl bg-surface p-2 text-xs font-medium text-red-600 shadow-lg">{err}</span>}
    </span>
  );
}
