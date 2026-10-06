import { api } from "./api";

export type NoticeType = "general" | "promo" | "tournament";
export type Audience = "all" | "captains" | "customer";

export const TYPES: { id: NoticeType; label: string; hint: string }[] = [
  { id: "general", label: "General", hint: "News, closures, reminders. Everyone gets it." },
  { id: "promo", label: "Promo", hint: "Offers. Customers who turned promo notices off are skipped." },
  { id: "tournament", label: "Tournament", hint: "Tournament news. Shows on the Tournaments tile." },
];

export const AUDIENCES: { id: Audience; label: string }[] = [
  { id: "all", label: "All customers" },
  { id: "captains", label: "Team captains" },
  { id: "customer", label: "One customer" },
];

// Pages in the customer app a notice can open when tapped.
export const LINKS: { href: string; label: string }[] = [
  { href: "", label: "Nothing (just the message)" },
  { href: "/promos", label: "Promos" },
  { href: "/book", label: "Book a game" },
  { href: "/tournaments", label: "Tournaments" },
  { href: "/member", label: "Membership" },
  { href: "/gamezone", label: "Gamezone" },
  { href: "/opponent", label: "Opponent" },
];

export type Draft = { type: NoticeType; audience: Audience; phone: string; title: string; message: string; href: string };

export type Sent = {
  id: string; at: string; by: string; type: NoticeType; title: string; message: string; href: string | null;
  audience: Audience; phone: string | null; sent: number; read: number;
};

export const reach = (d: Pick<Draft, "type" | "audience" | "phone">) => {
  const qs = new URLSearchParams({ type: d.type, audience: d.audience });
  if (d.audience === "customer" && d.phone) qs.set("phone", d.phone);
  return api<{ reach: number; skippedOptOut: number }>(`/admin/notifications/reach?${qs}`);
};

export const sendNotice = (d: Draft) =>
  api<{ sent: number; skippedOptOut: number }>("/admin/notifications/broadcast", {
    method: "POST",
    body: JSON.stringify({ type: d.type, audience: d.audience, title: d.title.trim(), message: d.message.trim(), ...(d.href ? { href: d.href } : {}), ...(d.audience === "customer" ? { phone: d.phone } : {}) }),
  });

export const history = () => api<Sent[]>("/admin/notifications/history");
