// The portrait Digital ID card, drawn on a canvas so it can be downloaded as a picture or shared (for example on WhatsApp).
// Like a school or staff ID: a navy top with the company mark and place, a round picture, the name, the details and the QR.
// Only the company name and place, the customer's name, picture and User ID (the contact number), the office number and the QR are on it.
// The same design is used in the customer app (lib/idcard.ts there): keep the two files identical.
import QRCode from "qrcode";

export const CARD_W = 800;
export const CARD_H = 1380;

const LOCATION = "Manigram, Tilottama-05, Rupandehi, Nepal"; // the venue, as in lib/site.ts
const OFFICE_PHONE = "9811940018"; // the venue's office number, as in lib/site.ts

const FONT = '"Segoe UI", system-ui, -apple-system, Arial, sans-serif';
const NAVY = "#0c0b5d";
const NAVY_2 = "#1d1c7e"; // a shade lighter: the picture ring and the sub-title
const MUTED = "#475569";
const GOLD = "#b45309"; // the Unique Club star on white
const PANEL = "#f1f4fb"; // the details panel

function round(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function fit(c: CanvasRenderingContext2D, text: string, maxW: number, start: number, weight = "700") {
  let size = start;
  do {
    c.font = `${weight} ${size}px ${FONT}`;
    size -= 2;
  } while (c.measureText(text).width > maxW && size > 20);
}

type Pt = [number, number];
function poly(c: CanvasRenderingContext2D, color: string | CanvasGradient, pts: Pt[]) {
  c.fillStyle = color;
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fill();
}

const loadImage = (src: string, cors = false) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // the card is still fine without it
    img.src = src;
  });

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "UF";

// a small map pin, its point at (x, y)
function pin(c: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  const r = size * 0.38;
  const cy = y - size + r;
  c.fillStyle = color;
  c.beginPath();
  c.arc(x, cy, r, Math.PI * 0.82, Math.PI * 0.18);
  c.lineTo(x, y);
  c.closePath();
  c.fill();
  c.fillStyle = NAVY;
  c.beginPath();
  c.arc(x, cy, r * 0.4, 0, Math.PI * 2);
  c.fill();
}

export async function drawIdCard(
  canvas: HTMLCanvasElement,
  card: { name: string; phone: string; payload: string; photo?: string | null; club?: { member: boolean; validUntil?: string | null } },
) {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const c = canvas.getContext("2d")!;
  const member = !!card.club?.member;
  const [logo, photo] = await Promise.all([loadImage("/logo-mark.png"), card.photo ? loadImage(card.photo, !card.photo.startsWith("data:")) : Promise.resolve(null)]);
  const cx = CARD_W / 2;

  // white card, clipped to its rounded shape
  c.save();
  round(c, 0, 0, CARD_W, CARD_H, 56);
  c.clip();
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, CARD_W, CARD_H);

  // navy top that comes down to a point behind the picture
  const top = c.createLinearGradient(0, 0, CARD_W, 580);
  top.addColorStop(0, "#0a0950");
  top.addColorStop(1, "#16167f");
  poly(c, top, [[0, 0], [CARD_W, 0], [CARD_W, 380], [cx, 580], [0, 380]]);
  c.restore();

  // the slot for a lanyard
  c.save();
  c.fillStyle = "#e5e7eb";
  round(c, cx - 100, 28, 200, 34, 17);
  c.fill();
  c.strokeStyle = "rgba(15,23,42,0.25)";
  c.lineWidth = 3;
  c.stroke();
  c.restore();

  // company mark, name and place
  c.textAlign = "center";
  if (logo) {
    const h = 92;
    const w = (logo.width / logo.height) * h;
    c.drawImage(tint(logo, "#ffffff"), cx - w / 2, 92, w, h);
  }
  c.fillStyle = "#ffffff";
  c.font = `800 62px ${FONT}`;
  c.fillText("UNIQUE FUTSAL", cx, 258);
  c.font = `500 25px ${FONT}`;
  const lw = c.measureText(LOCATION).width;
  pin(c, cx - lw / 2 - 18, 322, 26, "rgba(219,228,255,0.95)");
  c.fillStyle = "rgba(219,228,255,0.95)";
  c.fillText(LOCATION, cx + 12, 312);

  // round picture with a navy ring (the customer's own, or their initials)
  const cy = 520;
  const r = 130;
  c.save();
  c.shadowColor = "rgba(15,23,42,0.35)";
  c.shadowBlur = 22;
  c.shadowOffsetY = 8;
  c.fillStyle = "#ffffff";
  c.beginPath();
  c.arc(cx, cy, r + 20, 0, Math.PI * 2);
  c.fill();
  c.restore();
  c.fillStyle = NAVY_2;
  c.beginPath();
  c.arc(cx, cy, r + 10, 0, Math.PI * 2);
  c.fill();
  c.save();
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.clip();
  if (photo) {
    const s = Math.max((r * 2) / photo.width, (r * 2) / photo.height);
    c.drawImage(photo, cx - (photo.width * s) / 2, cy - (photo.height * s) / 2, photo.width * s, photo.height * s);
  } else {
    const g = c.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, NAVY);
    g.addColorStop(1, NAVY_2);
    c.fillStyle = g;
    c.fillRect(cx - r, cy - r, r * 2, r * 2);
    c.fillStyle = "#ffffff";
    c.textAlign = "center";
    c.font = `800 110px ${FONT}`;
    c.fillText(initials(card.name), cx, cy + 38);
  }
  c.restore();

  // name and what they are
  c.textAlign = "center";
  c.fillStyle = NAVY;
  fit(c, card.name, 660, 66, "800");
  c.fillText(card.name, cx, 744);
  c.fillStyle = member ? GOLD : NAVY_2;
  c.font = `700 34px ${FONT}`;
  c.fillText(member ? "★  Unique Club Member" : "Customer", cx, 792);

  // the details in one panel: label, value, with a thin line between rows
  const rows: [string, string][] = [["USER ID", card.phone], ["OFFICE CONTACT NO.", OFFICE_PHONE], ["CARD TYPE", member ? "Unique Club Member" : "Digital ID"]];
  if (member && card.club?.validUntil) rows.push(["VALID UNTIL", card.club.validUntil.slice(0, 10)]);
  const rowH = 58;
  const px = 70;
  const py = 836;
  const ph = rows.length * rowH + 20;
  c.fillStyle = PANEL;
  round(c, px, py, CARD_W - px * 2, ph, 26);
  c.fill();
  c.textAlign = "left";
  rows.forEach(([label, value], i) => {
    const y = py + 10 + i * rowH + 38;
    if (i > 0) {
      c.fillStyle = "rgba(12,11,93,0.12)";
      c.fillRect(px + 30, py + 10 + i * rowH, CARD_W - px * 2 - 60, 2);
    }
    c.fillStyle = MUTED;
    c.font = `600 21px ${FONT}`;
    c.fillText(label, px + 34, y);
    c.fillStyle = NAVY;
    c.font = `700 28px ${FONT}`;
    c.fillText(value, px + 300, y);
  });

  // the QR on the left and what to do on the right, centred on each other
  const panel = { x: 90, y: 1110, s: 210 };
  c.fillStyle = "#ffffff";
  round(c, panel.x, panel.y, panel.s, panel.s, 22);
  c.fill();
  c.lineWidth = 5;
  c.strokeStyle = NAVY;
  round(c, panel.x, panel.y, panel.s, panel.s, 22);
  c.stroke();
  const qr = document.createElement("canvas");
  await QRCode.toCanvas(qr, card.payload, { errorCorrectionLevel: "M", margin: 0, width: 174, color: { dark: NAVY, light: "#ffffff" } });
  c.drawImage(qr, panel.x + 18, panel.y + 18, 174, 174);

  const tx = panel.x + panel.s + 40;
  const mid = panel.y + panel.s / 2;
  c.fillStyle = NAVY;
  c.font = `800 32px ${FONT}`;
  c.fillText("Show this card", tx, mid - 18);
  c.fillText("at the venue", tx, mid + 24);
  c.fillStyle = MUTED;
  c.font = `500 22px ${FONT}`;
  c.fillText("Scan the QR to check in", tx, mid + 64);
}

function tint(img: HTMLImageElement, color: string): HTMLCanvasElement {
  const t = document.createElement("canvas");
  t.width = img.width;
  t.height = img.height;
  const x = t.getContext("2d")!;
  x.drawImage(img, 0, 0);
  x.globalCompositeOperation = "source-in";
  x.fillStyle = color;
  x.fillRect(0, 0, t.width, t.height);
  return t;
}

export const cardToBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not make the picture"))), "image/png"));
