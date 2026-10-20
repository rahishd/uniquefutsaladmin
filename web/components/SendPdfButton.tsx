"use client";

import { useState } from "react";
import { Download, Loader2, MessageCircle } from "lucide-react";
import { downloadPdf, pdfFileName, sendPdfToWhatsApp, type PdfSpec } from "@/lib/branded-pdf";

// A button that turns what is on screen into a branded Unique Futsal PDF and sends it on WhatsApp (or downloads it).
// THIS FILE IS IDENTICAL IN BOTH APPS (customer app and admin portal): change both.
//   mode "whatsapp": phone = share sheet with the PDF; computer = PDF is saved and the WhatsApp chat opens with a short note.
//   mode "download": just saves the PDF.
// `build` makes the PDF content when the button is pressed (so it always shows the latest data) and may fetch more first.
export default function SendPdfButton({
  label, build, filename, message, phone, mode = "whatsapp", className = "", disabled, wrapperClassName = "", onDone, children,
}: {
  label: string; // ignored when children are given
  children?: React.ReactNode; // your own button content (the points tile, for example); a busy button stays disabled
  build: () => PdfSpec | Promise<PdfSpec>;
  filename: string | ((spec: PdfSpec) => string);
  message: string | ((spec: PdfSpec) => string); // the short note that goes with the PDF in the chat (what it is and why)
  phone?: string | null;
  mode?: "whatsapp" | "download";
  className?: string;
  disabled?: boolean;
  wrapperClassName?: string;
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const Icon = mode === "download" ? Download : MessageCircle;

  async function go() {
    if (busy) return;
    setBusy(true);
    setNote("");
    try {
      const spec = await build();
      const name = typeof filename === "function" ? filename(spec) : filename;
      if (mode === "download") {
        await downloadPdf(spec, name);
        setNote("PDF saved.");
      } else {
        const r = await sendPdfToWhatsApp(spec, { filename: name, phone, message: typeof message === "function" ? message(spec) : message });
        if (r.mode === "downloaded") setNote(r.whatsappOpened ? "PDF saved. Attach it in the WhatsApp chat that just opened." : "PDF saved. Open WhatsApp and attach it.");
        else if (r.mode === "shared") setNote("Choose WhatsApp to send it.");
      }
      onDone?.();
    } catch {
      setNote("Could not make the PDF. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={`block ${wrapperClassName}`}>
      <button type="button" onClick={go} disabled={busy || disabled} aria-busy={busy} className={`${className} disabled:opacity-60`}>
        {children ?? (<>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
          {busy ? "Making the PDF…" : label}
        </>)}
      </button>
      {note && <span role="status" className="mt-1 block text-center text-[11px] text-slate-500">{note}</span>}
    </span>
  );
}

export { pdfFileName };
