// Branded Unique Futsal PDF pages (Design A: navy header band with the logo, orange accent, a chip saying what the page is for).
// Everything that is sent on WhatsApp or downloaded (invoices, login details, referrals, reports, booking details, ...) is made here, so
// every page looks the same and says what it is. THIS FILE IS IDENTICAL IN BOTH APPS (customer app and admin portal): change both.
//
//   buildPdf(spec)            -> the PDF as a Blob (A5 page, a few KB; more pages when the content is long)
//   downloadPdf(spec, name)   -> saves it on the device
//   sendPdfToWhatsApp(...)    -> on a phone: the share sheet with the PDF attached (pick WhatsApp); on a computer: downloads the PDF and
//                                opens the WhatsApp chat with a short note, so the person only has to attach the file.
// WhatsApp links can only carry text, never a file, which is why the PDF is shared or downloaded first.
import QRCode from "qrcode";
import { LOGO_WHITE } from "@/lib/pdf-brand";

export interface PdfRow {
  label: string;
  value: string;
  big?: boolean; // a highlighted box with large monospaced text (passwords, codes)
  link?: string; // the value is a tappable link
}
export interface PdfTable {
  head: string[]; // the first column is wide and left aligned, the last is right aligned, the ones between are centred
  rows: string[][];
  widths?: number[]; // widths in mm of every column except the first
}
export interface PdfBlock {
  heading?: string;
  rows?: PdfRow[];
  table?: PdfTable;
}
export interface PdfSpec {
  purpose: string; // the chip in the header: "INVOICE", "LOGIN DETAILS", "REFERRAL" ...
  title: string;
  subtitle?: string;
  ref?: string;
  date?: string; // defaults to now
  to?: { name: string; phone?: string };
  rows?: PdfRow[];
  table?: PdfTable;
  total?: { label: string; value: string };
  after?: PdfRow[]; // rows under the total (how it was paid, points earned)
  blocks?: PdfBlock[]; // more headed sections, for reports
  stepsTitle?: string;
  steps?: string[];
  qr?: { data: string; label: string };
  note?: string;
  stamp?: string; // a faint stamp such as "PAID"
  image?: { dataUrl: string; width: number; height: number; format?: "PNG" | "JPEG" }; // a picture, for example the Digital ID card (pixel size, only the shape matters)
}

const NAVY: [number, number, number] = [12, 11, 93];
const ORANGE: [number, number, number] = [245, 130, 42];
const INK: [number, number, number] = [15, 23, 42];
const MUTED: [number, number, number] = [100, 116, 139];
const LINE: [number, number, number] = [226, 232, 240];
const SOFT: [number, number, number] = [238, 243, 255];
const GREEN: [number, number, number] = [22, 163, 74];
const GOLD: [number, number, number] = [251, 191, 36];
const WHITE: [number, number, number] = [255, 255, 255];

export const VENUE = { name: "UNIQUE FUTSAL", tagline: "Connecting Players. Contributing Fitness", phone: "9811940018", email: "info.uniquefutsal@gmail.com", address: "Manigram Tilottama-05, Rupandehi, Nepal", whatsapp: "https://wa.me/9779811940018" };

const W = 148;
const H = 210;
const MX = 12; // side margin
const BOTTOM = 184; // content stops here; the footer sits below

// The built-in PDF fonts only know Latin letters. Anything else would print as garbage, so it is replaced.
export function pdfSafe(s: string | number | null | undefined): string {
  return String(s ?? "")
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...")
    .replace(/×/g, "x").replace(/₹|रू\.?/g, "Rs.").replace(/•/g, "-")
    .replace(/[^ -~ -ÿ\n]/g, "");
}

const stamp = (n: Date) => n.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });

export async function buildPdf(spec: PdfSpec): Promise<Blob> {
  const { jsPDF, GState } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a5", compress: true });
  const qr = spec.qr ? await QRCode.toDataURL(spec.qr.data, { margin: 1, width: 280, color: { dark: "#0c0b5d", light: "#ffffff" } }) : null;
  const when = spec.date ?? stamp(new Date());
  const t = (s: string | number | null | undefined) => pdfSafe(s);

  const text = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
  const fill = (c: [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
  const stroke = (c: [number, number, number]) => doc.setDrawColor(c[0], c[1], c[2]);
  const font = (style: "normal" | "bold", size: number, face: "helvetica" | "courier" = "helvetica") => doc.setFont(face, style).setFontSize(size);

  let y = 0;

  function firstHeader() {
    fill(NAVY); doc.rect(0, 0, W, 40, "F"); fill(ORANGE); doc.rect(0, 40, W, 1.4, "F");
    doc.addImage(LOGO_WHITE, "PNG", 10, 8, 22, 22);
    font("bold", 18); text(WHITE); doc.text(VENUE.name, 36, 19);
    font("normal", 7.4); text([200, 210, 255]); doc.text(VENUE.tagline, 36, 25);
    const chip = t(spec.purpose).toUpperCase();
    font("bold", 8);
    const cw = doc.getTextWidth(chip) + 9;
    fill(ORANGE); doc.roundedRect(W - 10 - cw, 8, cw, 7.6, 3.8, 3.8, "F");
    text(WHITE); doc.text(chip, W - 10 - cw / 2, 13.2, { align: "center" });
    font("normal", 7.6); text([200, 210, 255]);
    if (spec.ref) doc.text(t(spec.ref), W - 10, 22, { align: "right" });
    doc.text(when, W - 10, 26.5, { align: "right" });
    y = 55;
  }

  function slimHeader() {
    fill(NAVY); doc.rect(0, 0, W, 16, "F"); fill(ORANGE); doc.rect(0, 16, W, 0.8, "F");
    doc.addImage(LOGO_WHITE, "PNG", 8, 3.2, 9.5, 9.5);
    font("bold", 9); text(WHITE); doc.text(VENUE.name, 20, 9.6);
    font("bold", 7.4); text([200, 210, 255]); doc.text(t(spec.purpose).toUpperCase(), W - 10, 9.6, { align: "right" });
    y = 26;
  }

  firstHeader();

  const ensure = (h: number) => { if (y + h > BOTTOM) { doc.addPage(); slimHeader(); } };

  // ---------- pieces ----------
  function row(r: PdfRow) {
    const w = W - MX * 2;
    if (r.big) {
      ensure(22);
      fill(SOFT); stroke(NAVY); doc.setLineWidth(0.35); doc.roundedRect(MX, y, w, 17, 2.5, 2.5, "FD");
      font("bold", 6.6); text(MUTED); doc.text(t(r.label).toUpperCase(), MX + 4, y + 5.2);
      const v = t(r.value);
      let size = 15;
      font("bold", size, "courier"); text(NAVY);
      while (size > 7 && doc.getTextWidth(v) > w - 8) { size -= 0.5; doc.setFontSize(size); }
      doc.text(v, MX + 4, y + 13);
      y += 22.5;
      return;
    }
    font("normal", 8.3); text(MUTED);
    const label = t(r.label);
    font("bold", 9.2);
    const vl = doc.splitTextToSize(t(r.value), w * 0.62);
    ensure(vl.length * 4.4 + 4);
    font("normal", 8.3); text(MUTED); doc.text(label, MX, y);
    font("bold", 9.2); text(r.link ? [29, 78, 216] : INK);
    doc.text(vl, W - MX, y, { align: "right" });
    if (r.link) {
      const lw = Math.min(doc.getTextWidth(vl[0] ?? ""), w * 0.62);
      doc.link(W - MX - lw, y - 3.6, lw, vl.length * 4.4 + 1, { url: r.link });
    }
    y += Math.max(6.4, vl.length * 4.4 + 2);
    stroke(LINE); doc.setLineWidth(0.2); doc.line(MX, y - 3.4, W - MX, y - 3.4);
  }

  function table(tb: PdfTable) {
    const w = W - MX * 2;
    const n = tb.head.length;
    const mid = tb.widths ?? Array.from({ length: n - 1 }, (_, i) => (i === n - 2 ? 30 : 18));
    const firstW = w - mid.reduce((a, b) => a + b, 0);
    const xs: number[] = [MX]; // left edge of each column
    let acc = MX + firstW; for (const m of mid) { xs.push(acc); acc += m; }
    const widths = [firstW, ...mid];
    const fsz = n <= 3 ? 8.6 : n === 4 ? 8 : 7; // wider tables use smaller type
    const lh = fsz * 0.49;
    const head = () => {
      ensure(14);
      fill(SOFT); doc.roundedRect(MX, y - 4.2, w, 7, 1.5, 1.5, "F");
      font("bold", n >= 5 ? 6.2 : 7.2); text(NAVY);
      tb.head.forEach((h, i) => {
        const hh = t(h).toUpperCase();
        if (i === 0) doc.text(hh, xs[0] + 2.5, y);
        else if (i === n - 1) doc.text(hh, xs[i] + widths[i] - 2.5, y, { align: "right" });
        else doc.text(hh, xs[i] + widths[i] / 2, y, { align: "center" });
      });
      y += 6.2;
    };
    y += 2; head();
    for (const r of tb.rows) {
      font("normal", fsz);
      const lines = doc.splitTextToSize(t(r[0]), firstW - 5);
      const h = lines.length * lh + 2.4;
      if (y + h > BOTTOM) { doc.addPage(); slimHeader(); head(); }
      font("normal", fsz); text(INK);
      doc.text(lines, xs[0] + 2.5, y);
      for (let i = 1; i < n; i++) {
        const v = t(r[i] ?? "");
        text(v.startsWith("-") ? GREEN : INK);
        if (i === n - 1) doc.text(v, xs[i] + widths[i] - 2.5, y, { align: "right" });
        else doc.text(v, xs[i] + widths[i] / 2, y, { align: "center" });
      }
      y += h; stroke(LINE); doc.setLineWidth(0.2); doc.line(MX, y - 3.2, W - MX, y - 3.2);
    }
    y += 1;
  }

  function heading(s: string) {
    ensure(14);
    y += 3; font("bold", 10); text(NAVY); doc.text(t(s), MX, y); y += 5;
  }

  // ---------- content ----------
  const w = W - MX * 2;
  font("bold", 16); text(NAVY);
  const tl = doc.splitTextToSize(t(spec.title), w);
  doc.text(tl, MX, y); y += tl.length * 6.6;
  if (spec.subtitle) {
    font("normal", 9.5); text(MUTED);
    const sl = doc.splitTextToSize(t(spec.subtitle), w); doc.text(sl, MX, y); y += sl.length * 4.6 + 2.4;
  }
  if (spec.to) {
    y += 1.5; font("bold", 6.8); text(MUTED); doc.text("PREPARED FOR", MX, y); y += 4.6;
    font("bold", 11); text(INK); doc.text(t(spec.to.name) || "Customer", MX, y);
    if (spec.to.phone) { font("normal", 9); text(MUTED); doc.text(t(spec.to.phone), W - MX, y, { align: "right" }); }
    y += 7;
  }
  for (const r of spec.rows ?? []) row(r);
  if (spec.table) table(spec.table);
  if (spec.total) {
    ensure(18);
    fill(NAVY); doc.roundedRect(MX, y, w, 13, 2.5, 2.5, "F");
    font("bold", 9.5); text(WHITE); doc.text(t(spec.total.label).toUpperCase(), MX + 5, y + 8.2);
    font("bold", 15); text(GOLD); doc.text(t(spec.total.value), W - MX - 5, y + 8.8, { align: "right" });
    y += 17;
  }
  for (const r of spec.after ?? []) row(r);
  for (const b of spec.blocks ?? []) {
    if (b.heading) heading(b.heading);
    for (const r of b.rows ?? []) row(r);
    if (b.table) table(b.table);
  }
  if (spec.steps?.length) {
    ensure(34);
    y += 2; font("bold", 9.5); text(NAVY); doc.text(t(spec.stepsTitle ?? "Steps"), MX, y); y += 5.4;
    const sw = qr ? w - 34 : w;
    const top = y;
    spec.steps.forEach((s, i) => {
      fill(ORANGE); doc.circle(MX + 2.6, y - 1.1, 2.6, "F");
      font("bold", 7.4); text(WHITE); doc.text(String(i + 1), MX + 2.6, y + 0.2, { align: "center" });
      font("normal", 8.8); text(INK);
      const ls = doc.splitTextToSize(t(s), sw - 9); doc.text(ls, MX + 8, y); y += ls.length * 4.2 + 3.4;
    });
    if (qr && spec.qr) {
      doc.addImage(qr, "PNG", W - MX - 28, top - 2, 28, 28);
      font("normal", 6.2); text(MUTED);
      const ql = doc.splitTextToSize(t(spec.qr.label), 30); doc.text(ql, W - MX - 14, top + 29.2, { align: "center" });
      y = Math.max(y, top + 29 + ql.length * 2.6);
    }
  } else if (qr && spec.qr) {
    ensure(40);
    y += 2;
    doc.addImage(qr, "PNG", W / 2 - 16, y, 32, 32); y += 33;
    font("normal", 7); text(MUTED); doc.text(doc.splitTextToSize(t(spec.qr.label), w), W / 2, y + 2, { align: "center" }); y += 8;
  }
  if (spec.image) {
    const maxW = 100, maxH = 112;
    const k = Math.min(maxW / spec.image.width, maxH / spec.image.height);
    const iw = spec.image.width * k, ih = spec.image.height * k;
    ensure(ih + 4);
    y += 1; doc.addImage(spec.image.dataUrl, spec.image.format ?? "PNG", (W - iw) / 2, y, iw, ih); y += ih + 4;
  }
  if (spec.note) {
    font("normal", 7.8);
    const nl = doc.splitTextToSize(t(spec.note), w - 8);
    ensure(nl.length * 3.7 + 9);
    y += 2; fill([255, 247, 237]); stroke([253, 186, 116]); doc.setLineWidth(0.25);
    doc.roundedRect(MX, y, w, nl.length * 3.7 + 5, 2, 2, "FD"); text([124, 45, 18]); doc.text(nl, MX + 4, y + 5);
    y += nl.length * 3.7 + 8;
  }
  if (spec.stamp && doc.getNumberOfPages() === 1 && y < 170) {
    const g = new GState({ opacity: 0.2 });
    doc.saveGraphicsState(); doc.setGState(g);
    stroke(GREEN); doc.setLineWidth(1.2); font("bold", 26); text(GREEN);
    doc.text(t(spec.stamp).toUpperCase(), W - 62, Math.min(Math.max(y + 12, 150), 180), { angle: 14 });
    doc.restoreGraphicsState();
  }

  // ---------- footer on every page ----------
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    stroke(LINE); doc.setLineWidth(0.3); doc.line(MX, 191, W - MX, 191);
    font("bold", 7.5); text(NAVY); doc.text("Thank you for choosing Unique Futsal", W / 2, 196, { align: "center" });
    font("normal", 6.8); text(MUTED); doc.text(`${VENUE.address}  |  Call ${VENUE.phone}  |  ${VENUE.email}`, W / 2, 200.5, { align: "center" });
    if (pages > 1) { font("normal", 6.6); doc.text(`Page ${p} of ${pages}`, W - MX, 205, { align: "right" }); }
  }
  void H;
  return doc.output("blob");
}

/** A picture (for example a canvas card) as a data URL, to put in a PDF. */
export const blobToDataUrl = (b: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(new Error("Could not read the picture"));
  r.readAsDataURL(b);
});

/** "unique-futsal-invoice-uf-inv-4ckt9.pdf" */
export const pdfFileName = (...parts: (string | null | undefined)[]) =>
  `unique-futsal-${parts.filter(Boolean).join("-").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}.pdf`;

function saveBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 15000);
}

export async function downloadPdf(spec: PdfSpec, filename: string) {
  saveBlob(await buildPdf(spec), filename);
}

/** A Nepal mobile number (98XXXXXXXX) or a number that already has its country code, as WhatsApp wants it. */
export function waNumber(phone?: string | null): string {
  const d = String(phone ?? "").replace(/\D/g, "");
  if (d.length === 10 && d.startsWith("9")) return `977${d}`;
  return d.length >= 11 ? d : "";
}

export interface SendResult {
  mode: "shared" | "downloaded" | "cancelled";
  whatsappOpened: boolean; // false when the browser blocked the new tab: the person opens WhatsApp themselves
}

/**
 * Sends a branded PDF to WhatsApp. `message` is the short note that goes with it (what the page is and why), so the chat says what it is
 * before the file is opened. On a phone the share sheet takes the PDF itself; on a computer the PDF is downloaded and the chat opens
 * with the note ready, for the sender to attach the file.
 */
export async function sendPdfToWhatsApp(spec: PdfSpec, opts: { filename: string; message: string; phone?: string | null }): Promise<SendResult> {
  const blob = await buildPdf(spec);
  const file = new File([blob], opts.filename, { type: "application/pdf" });
  if (typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: opts.message, title: spec.purpose });
      return { mode: "shared", whatsappOpened: true };
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return { mode: "cancelled", whatsappOpened: false };
      // any other failure: fall through to the download
    }
  }
  saveBlob(blob, opts.filename);
  const to = waNumber(opts.phone);
  const url = `https://wa.me/${to}?text=${encodeURIComponent(`${opts.message}\n\n(The PDF "${opts.filename}" was saved on this device: attach it here.)`)}`;
  const w = window.open(url, "_blank", "noopener");
  return { mode: "downloaded", whatsappOpened: !!w };
}
