// The portrait Digital ID card, drawn on a canvas so it can be downloaded as a picture or shared (for example on WhatsApp).
// Only the company name, the customer's name, picture and contact number, and the QR are on it. The same design is used in the
// customer app (lib/idcard.ts there): keep the two files identical.
import QRCode from "qrcode";

export const CARD_W = 800;
export const CARD_H = 1300;

const FONT = '"Segoe UI", system-ui, -apple-system, Arial, sans-serif';
const NAVY = "#0c0b5d";
const INK = "#1f2d4a";
const ORANGE = "#e8734a";
const AMBER = "#fb9a1b";
const YELLOW = "#f6c00a";
const PALE = "#fcd978";

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

// the corner shapes are drawn in a 1000 x 1600 grid and scaled to the card
type Pt = [number, number];
function poly(c: CanvasRenderingContext2D, color: string, pts: Pt[]) {
  c.fillStyle = color;
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo((x / 1000) * CARD_W, (y / 1600) * CARD_H) : c.moveTo((x / 1000) * CARD_W, (y / 1600) * CARD_H)));
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

  // white card with a faint cool tint, clipped to its rounded shape
  c.save();
  round(c, 0, 0, CARD_W, CARD_H, 56);
  c.clip();
  const bg = c.createLinearGradient(0, 0, CARD_W, CARD_H);
  bg.addColorStop(0, "#ffffff");
  bg.addColorStop(1, "#f1f3f8");
  c.fillStyle = bg;
  c.fillRect(0, 0, CARD_W, CARD_H);

  // orange / amber / yellow corner shapes, top-left and bottom-right
  poly(c, AMBER, [[0, 0], [40, -10], [335, 235], [0, 470]]);
  poly(c, ORANGE, [[40, -10], [640, -10], [335, 235]]);
  poly(c, YELLOW, [[0, 470], [335, 235], [208, 480]]);
  poly(c, PALE, [[0, 490], [208, 480], [0, 560]]);
  poly(c, ORANGE, [[690, 1610], [890, 1465], [1010, 1610]]);
  poly(c, AMBER, [[890, 1465], [1010, 1330], [1010, 1610]]);
  poly(c, YELLOW, [[940, 1290], [1010, 1280], [1010, 1370], [960, 1345]]);
  c.restore();

  // company mark, top right
  c.textAlign = "right";
  c.fillStyle = NAVY;
  c.font = `800 38px ${FONT}`;
  c.fillText("Unique", 590, 118);
  c.fillText("Futsal", 590, 162);
  if (logo) {
    const h = 96;
    const w = (logo.width / logo.height) * h;
    c.drawImage(logo, 612, 82, w, h);
  }

  // round picture with an orange ring (the customer's own, or their initials)
  const cx = CARD_W / 2;
  const cy = 392;
  const r = 128;
  c.save();
  c.shadowColor = "rgba(31,45,74,0.25)";
  c.shadowBlur = 24;
  c.shadowOffsetY = 8;
  c.fillStyle = ORANGE;
  c.beginPath();
  c.arc(cx, cy, r + 16, 0, Math.PI * 2);
  c.fill();
  c.restore();
  c.save();
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.clip();
  if (photo) {
    const s = Math.max((r * 2) / photo.width, (r * 2) / photo.height);
    c.drawImage(photo, cx - (photo.width * s) / 2, cy - (photo.height * s) / 2, photo.width * s, photo.height * s);
  } else {
    const g = c.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, "#0a0950");
    g.addColorStop(1, "#3a2bb8");
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
  c.fillStyle = INK;
  fit(c, card.name, 640, 68, "800");
  c.fillText(card.name, cx, 620);
  c.fillStyle = member ? "#d98a00" : INK;
  c.font = `${member ? 700 : 500} 40px ${FONT}`;
  c.fillText(member ? "★  Unique Club Member" : "Digital ID", cx, 676);

  // contact number
  c.fillStyle = INK;
  c.font = `500 38px ${FONT}`;
  c.fillText(card.phone, cx, 750);

  // QR in a white panel with an orange edge (the barcode spot of an ID card)
  const panel = { x: 190, y: 790, s: 420 };
  c.save();
  c.shadowColor = "rgba(31,45,74,0.22)";
  c.shadowBlur = 28;
  c.shadowOffsetY = 10;
  c.fillStyle = "#ffffff";
  round(c, panel.x, panel.y, panel.s, panel.s, 32);
  c.fill();
  c.restore();
  c.lineWidth = 6;
  c.strokeStyle = ORANGE;
  round(c, panel.x, panel.y, panel.s, panel.s, 32);
  c.stroke();
  const qr = document.createElement("canvas");
  await QRCode.toCanvas(qr, card.payload, { errorCorrectionLevel: "M", margin: 0, width: 360, color: { dark: NAVY, light: "#ffffff" } });
  c.drawImage(qr, panel.x + 30, panel.y + 30, 360, 360);

  c.fillStyle = "rgba(31,45,74,0.65)";
  c.font = `500 26px ${FONT}`;
  c.fillText("Show this card at the venue", cx, 1250);
}

export const cardToBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not make the picture"))), "image/png"));
