import { api } from "./api";

export type Place = "header" | "footer" | "inline" | "popup";
export type AdState = "live" | "paused" | "scheduled" | "ended" | "waiting";
export type Freq = "session" | "day" | "always";

export type Photo = { id: string; title: string; caption: string | null; orientation: "landscape" | "portrait" | "square"; visible: boolean; sortOrder: number; imageUrl: string };
export type Ad = {
  id: string; title: string; imageUrl: string; linkUrl: string | null; placement: Place; displaySeconds: number; popupDelaySeconds: number; popupFrequency: Freq;
  startDate: string | null; endDate: string | null; dailyStart: string | null; dailyEnd: string | null; days: number[]; priority: number; active: boolean;
  impressions: number; clicks: number; status: AdState;
};
export type AdInput = {
  title: string; placement: Place; linkUrl: string | null; displaySeconds: number; popupDelaySeconds: number; popupFrequency: Freq;
  startDate: string | null; endDate: string | null; dailyStart: string | null; dailyEnd: string | null; days: number[]; priority: number; active: boolean;
};
export type Overview = { photos: number; hiddenPhotos: number; ads: number; liveAds: number; liveByPlace: Record<Place, number>; impressions: number; clicks: number };

export const PLACES: { id: Place; label: string; hint: string; size: string }[] = [
  { id: "header", label: "Header", hint: "A slim banner under the company bar, on every page", size: "1200 x 185 px (wide strip)" },
  { id: "footer", label: "Footer", hint: "A banner at the bottom of every page", size: "1200 x 210 px (wide strip)" },
  { id: "inline", label: "In the Home page", hint: "A larger banner between the sections of Home", size: "1280 x 560 px (16:7)" },
  { id: "popup", label: "Pop-up", hint: "Opens over the screen; the customer can close it", size: "1080 x 1350 px (portrait) or 1080 x 1080 px" },
];
export const placeLabel = (p: Place) => PLACES.find((x) => x.id === p)!.label;

export const STATE: Record<AdState, { label: string; tone: string }> = {
  live: { label: "Live now", tone: "bg-brand/15 text-brand" },
  waiting: { label: "Not in its hours today", tone: "bg-blue-500/15 text-blue-600" },
  scheduled: { label: "Scheduled", tone: "bg-amber-500/15 text-amber-600" },
  ended: { label: "Ended", tone: "bg-slate-500/15 text-slate-500" },
  paused: { label: "Paused", tone: "bg-slate-500/15 text-slate-500" },
};

// Previews come from this portal own server (the customer app serves the same pictures from /api/content/media/:id).
const API = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5100/api").replace(/\/+$/, "");
export const picUrl = (p: string) => `${API}/admin/media/${p.split("/").pop()}`;

export const overview = () => api<Overview>("/admin/content/overview");

export const listPhotos = () => api<Photo[]>("/admin/content/gallery");
export const addPhoto = (b: { title: string; caption?: string; image: string }) => api<Photo>("/admin/content/gallery", { method: "POST", body: JSON.stringify(b) });
export const editPhoto = (id: string, b: Partial<{ title: string; caption: string | null; visible: boolean }>) => api<Photo>(`/admin/content/gallery/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const reorderPhotos = (ids: string[]) => api<null>("/admin/content/gallery/reorder", { method: "POST", body: JSON.stringify({ ids }) });
export const deletePhoto = (id: string) => api<null>(`/admin/content/gallery/${id}`, { method: "DELETE" });

export const listAds = () => api<Ad[]>("/admin/content/ads");
export const addAd = (b: AdInput & { image: string }) => api<Ad>("/admin/content/ads", { method: "POST", body: JSON.stringify(b) });
export const editAd = (id: string, b: Partial<AdInput> & { image?: string }) => api<Ad>(`/admin/content/ads/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteAd = (id: string) => api<null>(`/admin/content/ads/${id}`, { method: "DELETE" });

// Shrinks a picture in the browser before upload: longest side 1600px, JPEG. Phone photos are several MB; this is a few hundred KB.
export async function shrink(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) throw new Error("Please choose a JPG, PNG or WebP picture.");
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error("That picture could not be opened.");
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * scale));
  c.height = Math.max(1, Math.round(bmp.height * scale));
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Your browser could not prepare the picture.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c.toDataURL("image/jpeg", 0.85);
}

export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function clock(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
export function dayLabel(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
export function minutes(t: string) { return Number(t.slice(0, 2)) * 60 + Number(t.slice(3)); }
export function addMinutes(t: string, add: number) {
  const m = (minutes(t) + add) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
export function spanText(a: string, b: string) {
  const mins = (minutes(b) - minutes(a) + 1440) % 1440;
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${h ? `${h} hour${h > 1 ? "s" : ""}` : ""}${h && m ? " " : ""}${m ? `${m} min` : ""}`;
}

export function scheduleText(a: Pick<Ad, "startDate" | "endDate" | "dailyStart" | "dailyEnd" | "days">) {
  const parts: string[] = [];
  parts.push(a.dailyStart && a.dailyEnd ? `${clock(a.dailyStart)} to ${clock(a.dailyEnd)} (${spanText(a.dailyStart, a.dailyEnd)})` : "All day");
  parts.push(a.days.length === 0 || a.days.length === 7 ? "every day" : a.days.map((d) => DAYS[d]).join(", "));
  if (a.startDate || a.endDate) parts.push(`${a.startDate ? dayLabel(a.startDate) : "now"} to ${a.endDate ? dayLabel(a.endDate) : "no end"}`);
  return parts.join(" · ");
}
