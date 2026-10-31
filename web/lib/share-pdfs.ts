// The branded PDF pages the admin portal sends on WhatsApp: login details (customers and staff) and VIP codes.
// (Invoices are in components/WhatsAppInvoice.tsx, reports in lib/report-export.ts and lib/reports.ts.)
import { rs } from "@/lib/bookings";
import type { PdfSpec } from "@/lib/branded-pdf";

const first = (name: string | null | undefined) => (name ?? "").trim().split(" ")[0] || "";

// What a registered customer gets in the app (the welcome page lists these).
const WELCOME_BENEFITS = [
  "Book courts and Gamezone (PS5) from your phone, 10 days ahead.",
  "Pay at the venue or online with Fonepay, no details to retype.",
  "Earn loyalty points on every game and swap them for free games.",
  "Refer & Earn: book for another team and you both get points.",
  "Promo codes, special offers, Unique Club and membership plans.",
  "Create or join a team, challenge others, climb the leaderboard.",
  "Digital ID, booking history and a reminder 1 hour before games.",
];

/** A customer's mobile number and password: a new account, or a new password after staff changed it. */
export function customerLoginPdf(c: { name: string | null; phone: string; password: string; reset?: boolean }): PdfSpec {
  const hi = first(c.name);
  return {
    purpose: c.reset ? "NEW PASSWORD" : "WELCOME",
    title: c.reset ? "Your Unique Futsal password was changed" : "Welcome to Unique Futsal Family",
    subtitle: c.reset ? "Use the new password below to sign in." : `${hi ? `Hello ${hi}! ` : ""}Your account is ready. Here are your details.`,
    ...(c.reset ? {} : { benefitsTitle: "What you get as a registered member", benefits: WELCOME_BENEFITS }),
    ref: `ACCOUNT-${c.phone}`,
    to: { name: c.name || "Customer", phone: c.phone },
    rows: [{ label: "Mobile number", value: c.phone, big: true, half: true }, { label: c.reset ? "New password" : "Password", value: c.password, big: true, half: true }],
    ...(c.reset ? {} : { compact: true }),
    stepsTitle: "How to sign in",
    steps: ["Open the Unique Futsal app and tap Sign in.", "Enter the mobile number and password above.", c.reset ? "You can change the password any time from Profile." : "You can change the password any time from Profile."],
    note: "Keep this page private. Anyone who has it can sign in to this account.",
  };
}

/** A staff member's admin portal sign-in. */
export function staffLoginPdf(s: { email: string; password?: string; link?: string }): PdfSpec {
  return {
    purpose: "STAFF LOGIN", title: "Your admin portal sign-in", subtitle: "Unique Futsal staff account.",
    ref: "ADMIN PORTAL",
    rows: [{ label: "Email", value: s.email, big: true }, s.password ? { label: "Password", value: s.password, big: true } : { label: "Password", value: "Unchanged" }, ...(s.link ? [{ label: "Portal link", value: s.link, link: s.link }] : [])],
    stepsTitle: "How to sign in", steps: ["Open the portal link on your phone or computer.", "Enter your email and password.", s.password ? "Change your password after signing in (Settings > My password)." : "Use the password you already have."],
    ...(s.link ? { qr: { data: s.link, label: "Scan to open the portal" } } : {}),
    note: "Never share this page. Staff actions are recorded under your name.",
  };
}

/** A VIP discount code for one customer. */
export function vipCodePdf(v: { name: string | null; phone: string; code: string; type: "percent" | "flat"; value: number }): PdfSpec {
  const off = v.type === "percent" ? `${v.value}% off` : `${rs(v.value)} off`;
  return {
    purpose: "VIP CODE", title: `${first(v.name) ? first(v.name) + ", you are a VIP" : "You are a VIP"} at Unique Futsal`, subtitle: "A special code, just for you.",
    ref: `VIP-${v.phone}`, to: { name: v.name || "Customer", phone: v.phone },
    rows: [{ label: "Your VIP code", value: v.code, big: true }, { label: "Your discount", value: `${off} on every game` }],
    stepsTitle: "How to use it", steps: ["Open the Unique Futsal app and start a booking.", "Type your code in the promo box.", `The discount (${off}) is taken off every game you book.`],
    note: "This code is for you only and is linked to your account.",
  };
}
