// The portrait Digital ID card, drawn on a canvas so it can be downloaded as a picture or shared (for example on WhatsApp).
// Only the company name, the customer's name and contact number, and the QR are on it. The same design is used in the
// customer app (lib/idcard.ts there): keep the two files identical.
import QRCode from "qrcode";

export const CARD_W = 800;
export const CARD_H = 1200;

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
    c.font = `${weight} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    size -= 2;
  } while (c.measureText(text).width > maxW && size > 20);
}

export async function drawIdCard(canvas: HTMLCanvasElement, card: { name: string; phone: string; payload: string }) {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const c = canvas.getContext("2d")!;
  const bg = c.createLinearGradient(0, 0, CARD_W, CARD_H);
  bg.addColorStop(0, "#0c0b5d");
  bg.addColorStop(1, "#2a2aa8");
  c.fillStyle = bg;
  round(c, 0, 0, CARD_W, CARD_H, 56);
  c.fill();

  // orange band
  c.fillStyle = "#ff8a2a";
  c.fillRect(0, 250, CARD_W, 10);

  c.textAlign = "center";
  c.fillStyle = "#ffffff";
  fit(c, "UNIQUE FUTSAL", 640, 76, "800");
  c.fillText("UNIQUE FUTSAL", CARD_W / 2, 140);
  c.fillStyle = "rgba(255,255,255,0.7)";
  c.font = '600 32px system-ui, -apple-system, "Segoe UI", sans-serif';
  c.fillText("DIGITAL ID", CARD_W / 2, 205);

  // QR panel
  const panel = { x: 110, y: 330, s: 580 };
  c.fillStyle = "#ffffff";
  round(c, panel.x, panel.y, panel.s, panel.s, 40);
  c.fill();
  const qr = document.createElement("canvas");
  await QRCode.toCanvas(qr, card.payload, { errorCorrectionLevel: "M", margin: 0, width: 500, color: { dark: "#0c0b5d", light: "#ffffff" } });
  c.drawImage(qr, panel.x + 40, panel.y + 40, 500, 500);

  // name and number
  c.fillStyle = "#ffffff";
  fit(c, card.name, 660, 64);
  c.fillText(card.name, CARD_W / 2, 1000);
  c.fillStyle = "#ffb067";
  c.font = '600 46px system-ui, -apple-system, "Segoe UI", sans-serif';
  c.fillText(card.phone, CARD_W / 2, 1070);

  c.fillStyle = "rgba(255,255,255,0.55)";
  c.font = '500 26px system-ui, -apple-system, "Segoe UI", sans-serif';
  c.fillText("Show this card at the venue", CARD_W / 2, 1140);
}

export const cardToBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not make the picture"))), "image/png"));
