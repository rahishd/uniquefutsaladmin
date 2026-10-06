import { api } from "./api";

export type Venue = { name: string; phone: string; whatsapp: string; email: string; address: string; facebook: string; tiktok: string; mapEmbed: string };
export type SettingsData = {
  venue: Venue;
  wifi: { ssid: string; password: string; visible: boolean };
  booking: { advanceDeposit: number };
  integrations: {
    fonepay: { mode: "test" | "live"; configured: boolean; note: string };
    push: { configured: boolean };
    database: boolean;
    environment: "production" | "development";
  };
  server: { time: string };
  canEdit: boolean;
};

export const getSettings = () => api<SettingsData>("/admin/settings");
export const saveVenue = (v: Venue) => api<Venue>("/admin/settings/venue", { method: "PUT", body: JSON.stringify(v) });
export const saveWifi = (w: { ssid: string; password: string; visible: boolean }) => api<{ ssid: string; password: string; visible: boolean }>("/admin/settings/wifi", { method: "PUT", body: JSON.stringify(w) });
export const saveBooking = (b: { advanceDeposit: number }) => api<{ advanceDeposit: number }>("/admin/settings/booking", { method: "PUT", body: JSON.stringify(b) });
export const changePassword = (current: string, next: string) => api<null>("/admin/auth/change-password", { method: "POST", body: JSON.stringify({ current, next }) });
