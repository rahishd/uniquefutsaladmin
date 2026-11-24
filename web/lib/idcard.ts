// The portrait Digital ID card, drawn on a canvas so it can be downloaded as a picture or shared (for example on WhatsApp).
// Simple and easy to scan: a slim navy top with the company mark, the customer's round picture, the name, what they are, the User ID (the
// contact number) and a BIG QR code, with the venue's office number in small text under the QR for a lost card.
// The same design is used in the customer app (lib/idcard.ts there): keep the two files identical.
import QRCode from "qrcode";

export const CARD_W = 800;
export const CARD_H = 1580;

const OFFICE_PHONE = "9811940018"; // the venue's office number, as in lib/site.ts
const ADDRESS = "Tilottama-5, Manigram, Rupandehi"; // the venue's place, shown small under the contact number

const FONT = '"Segoe UI", system-ui, -apple-system, Arial, sans-serif';
const NAVY = "#0c0b5d";
const NAVY_2 = "#1d1c7e"; // a shade lighter: the picture ring and the sub-title
const MUTED = "#475569";
const GOLD = "#b45309"; // the Unique Club star on white

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

  // slim navy top that comes down to a point behind the picture
  const top = c.createLinearGradient(0, 0, CARD_W, 440);
  top.addColorStop(0, "#0a0950");
  top.addColorStop(1, "#16167f");
  poly(c, top, [[0, 0], [CARD_W, 0], [CARD_W, 250], [cx, 440], [0, 250]]);
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

  // company mark and name
  c.textAlign = "center";
  if (logo) {
    const h = 74;
    const w = (logo.width / logo.height) * h;
    c.drawImage(tint(logo, "#ffffff"), cx - w / 2, 86, w, h);
  }
  c.fillStyle = "#ffffff";
  c.font = `800 50px ${FONT}`;
  c.fillText("UNIQUE FUTSAL", cx, 214);

  // round picture with a navy ring (the customer's own, or their initials)
  const cy = 392;
  const r = 118;
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
    c.font = `800 100px ${FONT}`;
    c.fillText(initials(card.name), cx, cy + 35);
  }
  c.restore();

  // name, what they are, and the User ID
  c.textAlign = "center";
  c.fillStyle = NAVY;
  fit(c, card.name, 680, 64, "800");
  c.fillText(card.name, cx, 598);
  c.fillStyle = member ? GOLD : NAVY_2;
  c.font = `700 32px ${FONT}`;
  c.fillText(member ? "★  Unique Club Member" : "Customer", cx, 644);
  c.fillStyle = MUTED;
  c.font = `600 22px ${FONT}`;
  c.fillText("USER ID", cx, 722);
  c.fillStyle = NAVY;
  c.font = `800 42px ${FONT}`;
  c.fillText(card.phone, cx, 770);
  if (member && card.club?.validUntil) {
    c.fillStyle = MUTED;
    c.font = `500 22px ${FONT}`;
    c.fillText(`Valid until ${card.club.validUntil.slice(0, 10)}`, cx, 806);
  }

  // what to do with it, just above the QR
  c.textAlign = "center";
  c.fillStyle = NAVY_2;
  c.font = `700 28px ${FONT}`;
  c.fillText("Show this at the venue", cx, 862);

  // the BIG QR code, centred, with a navy frame
  const size = 540;
  const px = (CARD_W - size) / 2;
  const py = 888;
  c.fillStyle = "#ffffff";
  round(c, px, py, size, size, 30);
  c.fill();
  c.lineWidth = 6;
  c.strokeStyle = NAVY;
  round(c, px, py, size, size, 30);
  c.stroke();
  const pad = 34;
  const qrSize = size - pad * 2;
  const qr = document.createElement("canvas");
  await QRCode.toCanvas(qr, card.payload, { errorCorrectionLevel: "M", margin: 0, width: qrSize, color: { dark: NAVY, light: "#ffffff" } });
  c.drawImage(qr, px + pad, py + pad, qrSize, qrSize);

  // who to call when the card is lost or found (the venue's office number): small, in ONE row under the QR, with the place below it
  const label = "If lost & found, contact";
  const gap = 12;
  c.font = `600 21px ${FONT}`;
  const lw = c.measureText(label).width;
  c.font = `800 28px ${FONT}`;
  const nw = c.measureText(OFFICE_PHONE).width;
  const rowY = py + size + 62;
  const x0 = cx - (lw + gap + nw) / 2;
  c.textAlign = "left";
  c.fillStyle = MUTED;
  c.font = `600 21px ${FONT}`;
  c.fillText(label, x0, rowY);
  c.fillStyle = NAVY;
  c.font = `800 28px ${FONT}`;
  c.fillText(OFFICE_PHONE, x0 + lw + gap, rowY + 1);
  c.textAlign = "center";
  c.fillStyle = MUTED;
  c.font = `500 21px ${FONT}`;
  c.fillText(ADDRESS, cx, rowY + 42);
  c.textAlign = "left";
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
