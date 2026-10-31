// Letter Head: an A4 Unique Futsal letter (logo and company details on top, verification card in the left footer).
// Every letter gets its own verification number, so anyone can check it at uniquefutsal.com/verify and staff can withdraw it in Verify Documents.
// This is a full A4 letter, not the A5 card of lib/branded-pdf.ts, so it has its own drawing code and shares only the small helpers.
import { api } from "./api";
import { withBase } from "./base";
import { pdfFileName, pdfSafe, waNumber } from "./branded-pdf";

export type Company = { name: string; address: string; phone: string; email: string; website: string; panNo: string };
export type Sender = { org: string; regNo: string; phone: string; address: string; website: string; name: string; designation: string };
export type Letter = { date: string; subject: string; dear: string; body: string; sender: Sender };

export const getCompany = () => api<Company>("/admin/letter-head");
export const saveCompany = (b: { panNo: string; website: string }) => api<Company>("/admin/letter-head", { method: "PUT", body: JSON.stringify(b) });

/** A date from a date box ("2026-10-31") as it is printed: 31 October 2026. */
export const longDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export type IssuedLetter = { letter: { dear: string; body: string; sender: Sender } | null; id: string; code: string; ref: string; date: string; subject: string; receiver: string; issuedBy: string | null; revoked: boolean; createdAt: string };
export const issueLetter = (b: { subject: string; receiver: string; details: string; date: string; letter?: { dear: string; body: string; sender: Sender } }) =>
  api<{ code: string; ref: string }>("/admin/letter-head/issue", { method: "POST", body: JSON.stringify(b) });
export const listLetters = (q: string) => api<IssuedLetter[]>(`/admin/letter-head/letters?q=${encodeURIComponent(q)}`);

// A letter is kept to one page: at most 150 words in the body.
export const MAX_WORDS = 150;
export const countWords = (s: string) => (s.match(/\S+/g) ?? []).length;
export function limitWords(s: string, max = MAX_WORDS): string {
  const re = /\S+/g;
  let n = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) if (++n === max) return s.slice(0, m.index + m[0].length);
  return s;
}

export const letterFileName = (l: Letter) => pdfFileName("letter-head", l.subject);
export const letterMessage = (l: Letter, code: string, ref: string) => `Letter from Unique Futsal: ${l.subject}. Reference No ${ref}. Verification number ${code}, check it at uniquefutsal.com/verify`;

type Rgb = [number, number, number];
const NAVY: Rgb = [12, 11, 93];
const INK: Rgb = [15, 23, 42];
const MUTED: Rgb = [100, 116, 139];
const WHITE: Rgb = [255, 255, 255];

const W = 210;
const MX = 18; // side margin
const TOP = 50; // content starts here, under the header
const BOTTOM = 272; // and stops here, above the footer
const LINE = 5.4; // body line height

// A logo picture drawn at a fixed size, so the PDF stays small (the white one for the header, the coloured one for the watermark).
async function logoData(file: string, px: number): Promise<string> {
  const img = new Image();
  img.src = withBase(file);
  await img.decode();
  const c = document.createElement("canvas");
  c.width = c.height = px;
  const g = c.getContext("2d");
  if (!g) throw new Error("Could not draw the logo");
  g.drawImage(img, 0, 0, px, px);
  return c.toDataURL("image/png");
}

export async function buildLetter(company: Company, letter: Letter, code: string, ref: string): Promise<Blob> {
  const { jsPDF, GState } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const [logo, mark] = await Promise.all([logoData("/letterhead-logo-white.png", 400), logoData("/letterhead-logo.png", 360)]);
  const t = (s: string | null | undefined) => pdfSafe(s).trim();

  const text = (c: Rgb) => doc.setTextColor(c[0], c[1], c[2]);
  const fill = (c: Rgb) => doc.setFillColor(c[0], c[1], c[2]);
  const stroke = (c: Rgb) => doc.setDrawColor(c[0], c[1], c[2]);
  const font = (style: "normal" | "bold", size: number, face: "helvetica" | "courier" = "helvetica") => doc.setFont(face, style).setFontSize(size);

  // a filled shape from its corners
  function shape(c: Rgb, pts: [number, number][]) {
    fill(c);
    doc.lines(pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]), pts[0][0], pts[0][1], [1, 1], "F", true);
  }

  // Everything fixed on a page.
  function page() {
    // the logo in the middle of the page, very faint, under everything else
    doc.saveGraphicsState();
    doc.setGState(new GState({ opacity: 0.07 }));
    doc.addImage(mark, "PNG", 50, 97, 110, 110, "mark");
    doc.restoreGraphicsState();

    // a straight navy box across the top: logo, name and numbers, then the contact row
    fill(NAVY); doc.rect(0, 0, W, 40, "F");
    doc.addImage(logo, "PNG", 14, 5, 22, 22, "logo");
    let nameSize = 16.5;
    font("bold", nameSize);
    while (nameSize > 12 && doc.getTextWidth(t(company.name).toUpperCase()) > 56) { nameSize -= 0.5; doc.setFontSize(nameSize); }
    text(WHITE); doc.text(t(company.name).toUpperCase(), 41, 16 + nameSize * 0.127);

    // the registration number, level with the company name
    font("bold", 6.4); text([190, 200, 245]); doc.text("REGD NO", W - 14, 11, { align: "right" });
    font("bold", 11); text(WHITE); doc.text(t(company.panNo) || "-", W - 14, 16.6, { align: "right" });
    font("normal", 8); text([225, 230, 255]); doc.text(`Reference No: ${t(ref)}`, W - 14, 22, { align: "right" });

    // the contact row, inside the box
    const details = [["T", t(company.phone)], ["pin", t(company.address)], ["@", t(company.email)], ["W", t(company.website)]];
    const cy = 33;
    let size = 8.6;
    font("normal", size);
    const room = () => W - 28 - details.reduce((a, [, v]) => a + doc.getTextWidth(v) + 6, 0);
    while (size > 6 && room() < 10) { size -= 0.2; doc.setFontSize(size); }
    let dx = 14;
    for (const [k, v] of details) {
      if (k === "pin") {
        fill(WHITE); doc.circle(dx + 2.2, cy - 0.6, 1.9, "F");
        shape(WHITE, [[dx + 0.6, cy + 0.1], [dx + 3.8, cy + 0.1], [dx + 2.2, cy + 3.1]]);
        fill(NAVY); doc.circle(dx + 2.2, cy - 0.6, 0.7, "F");
      } else {
        fill(WHITE); doc.circle(dx + 2.2, cy, 2.2, "F");
        font("bold", 6.2); text(NAVY); doc.text(k, dx + 2.2, cy + 1.1, { align: "center" });
      }
      font("normal", size); text(WHITE); doc.text(v, dx + 6, cy + 1.1);
      dx += 6 + doc.getTextWidth(v) + room() / (details.length - 1);
    }
    stroke(NAVY); doc.setLineWidth(0.4); 
    // a navy block along the bottom with the verification line
    fill(NAVY); doc.rect(0, 281, W, 16, "F");
    font("bold", 10); text(WHITE); doc.text(`Verify this document at www.uniquefutsal.com   |   Verification No: ${code}`, W / 2, 290.4, { align: "center" });
  }

  page();
  let y = TOP;
  const ensure = (h: number) => { if (y + h > BOTTOM) { doc.addPage(); page(); y = TOP; } };

  // the date, on the right, with clear space before the receiver
  const s = letter.sender;
  font("normal", 10.5); text(INK); doc.text(longDate(letter.date), W - 14, y, { align: "right" });
  y += 12;

  // who the letter is for
  const named = t(s.name) || t(s.org);
  const rest = [s.address, s.phone, s.website, s.regNo && `Registration No: ${s.regNo}`].filter((l) => t(l));
  if (named || t(s.designation) || rest.length) {
    font("normal", 10); text(INK); doc.text("To,", MX, y); y += 5.6;
    if (named) { font("bold", 11.5); text(NAVY); doc.text(named, MX, y); y += 5; }
    if (t(s.designation)) { font("normal", 9.6); text(MUTED); doc.text(t(s.designation), MX, y); y += 4.8; }
    if (t(s.name) && t(s.org)) { font("bold", 9.8); text(INK); doc.text(t(s.org), MX, y); y += 4.8; }
    font("normal", 9.6); text(INK);
    for (const l of rest) { doc.text(doc.splitTextToSize(t(l), 120)[0], MX, y); y += 4.8; }
    y += 7;
  }

  const w = W - MX * 2;
  font("bold", 11); text(NAVY);
  const subject = doc.splitTextToSize(`Subject: ${t(letter.subject)}`, w) as string[];
  doc.text(subject, MX, y);
  y += subject.length * 5.2 + 4;

  font("normal", 10.4); text(INK);
  if (t(letter.dear)) { font("bold", 10.4); doc.text(`Dear ${t(letter.dear)},`, MX, y); y += LINE * 1.7; font("normal", 10.4); }

  for (const para of t(letter.body).split(/\n/)) {
    if (!para.trim()) { y += LINE * 0.6; continue; }
    for (const line of doc.splitTextToSize(`     ${para.trim()}`, w) as string[]) {
      ensure(LINE);
      font("normal", 10.4); text(INK); doc.text(line, MX, y);
      y += LINE;
    }
  }

  // sign-off: the company's own signature, with room for a signature and a stamp
  ensure(42);
  y += 6;
  font("normal", 10.4); text(INK); doc.text("Sincerely,", MX, y);
  y += 22;
  stroke(MUTED); doc.setLineWidth(0.2); doc.line(MX, y - 5, MX + 55, y - 5);
  font("bold", 10.4); text(NAVY); doc.text("Authorized Signatory", MX, y); y += 5;
  font("normal", 9.6); text(INK); doc.text(t(company.name), MX, y);

  return doc.output("blob");
}

export function saveLetter(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 15000);
}

/** The same steps as sendPdfToWhatsApp: a phone shares the PDF itself, a computer saves it and opens the chat for it to be attached. */
export async function sendLetterToWhatsApp(blob: Blob, opts: { filename: string; message: string; phone?: string }): Promise<string> {
  const file = new File([blob], opts.filename, { type: "application/pdf" });
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: opts.message, title: "Letter Head" });
      return "Choose WhatsApp to send it.";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "";
    }
  }
  saveLetter(blob, opts.filename);
  const url = `https://wa.me/${waNumber(opts.phone)}?text=${encodeURIComponent(`${opts.message}\n\n(The PDF "${opts.filename}" was saved on this device: attach it here.)`)}`;
  return window.open(url, "_blank", "noopener") ? "PDF saved. Attach it in the WhatsApp chat that just opened." : "PDF saved. Open WhatsApp and attach it.";
}

// History: which years and months have letters, and the letters of one month (each with its text)
export type HistoryYear = { year: number; months: number[]; total: number };
export const historySummary = () => api<HistoryYear[]>("/admin/letter-head/history/summary");
export const historyMonth = (year: number, month: number) => api<IssuedLetter[]>(`/admin/letter-head/history?year=${year}&month=${month}`);
