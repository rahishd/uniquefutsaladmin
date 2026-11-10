"use client";

import { Check, Crown, ShieldCheck, UserRound, X } from "lucide-react";
import type { Catalog } from "@/lib/staff";

// "Roles and what they can do": the quick starts (and Owner, Admin) side by side with the actions added most recently.
// Everything here is read from the server's list of permissions, so it always matches what is really enforced.
type Row = { feature: string; what: string; needs: string[]; any?: boolean };
const RECENT: Row[] = [
  { feature: "Birthdays today", what: "See customers whose birthday is today", needs: ["content.view"] },
  { feature: "Birthday wishes", what: "Send a wish, with an optional promo code gift", needs: ["content.birthdays"] },
  { feature: "Verify Documents", what: "See bill and document codes, look a code up", needs: ["verify.view"] },
  { feature: "Document codes", what: "Make or withdraw a code for a school, bank or college", needs: ["verify.manage"] },
  { feature: "Bill code on invoices", what: "Get a bill's verification code (counter, payments, Gamezone, verify team)", needs: ["verify.view", "inventory.sell", "payments.view", "payments.collect", "gamezone.collect"], any: true },
  { feature: "Notices with a link", what: "Send a notice that opens a page or website when tapped", needs: ["notifications.send"] },
  { feature: "Service funds: withdraw", what: "Take money out of the Charity Fund, turf fund or other service", needs: ["servicefunds.withdraw"] },
  { feature: "Letter Head", what: "Make a letter on the letter head, send it as a PDF, set the Regd no. and website", needs: ["letterhead.make"] },
  { feature: "Digital ID scan", what: "Scan or search a customer's Digital ID and see their details", needs: ["digitalid.scan"] },
  { feature: "Membership attendance", what: "Mark a member's attendance after a Digital ID scan", needs: ["digitalid.attendance"] },
  { feature: "Membership plans", what: "Add or edit membership plans and prices", needs: ["membership.create", "membership.edit"], any: true },
  { feature: "VIP codes", what: "Give, change or remove a customer's VIP code and send it as a PDF", needs: ["vip.manage"] },
  { feature: "Children's Academy: classes", what: "Add, edit or cancel classes and choose when guardians see them", needs: ["academy.sessions"] },
  { feature: "Children's Academy: children", what: "Mark attendance or cancel an enrolment", needs: ["academy.enrollments"] },
  { feature: "Children's Academy: terms", what: "Edit the Terms & Conditions guardians accept", needs: ["academy.terms"] },
  { feature: "Refer & Earn", what: "Approve or reject referrals and adjust their points", needs: ["refer.review", "refer.adjust"], any: true },
  { feature: "Tournament host link", what: "Create or revoke the match-day link for a host", needs: ["tournaments.share"] },
  { feature: "Team registrations", what: "Approve or reject team registrations for a tournament", needs: ["tournaments.registrations"] },
  { feature: "Tournament bill", what: "Add goods and charges, receive payments, send the bill as a PDF", needs: ["tournaments.bill"] },
  { feature: "Sell goods and send the invoice", what: "Counter sales, and the invoice sent on WhatsApp as a PDF", needs: ["inventory.sell"] },
  { feature: "Collect a payment", what: "Mark a booking or due as paid, cash or Fonepay", needs: ["payments.collect"] },
  { feature: "Court prices and blocked hours", what: "Edit prices, block or unblock hours", needs: ["courts.price", "courts.block"], any: true },
  { feature: "Gift cards", what: "Cancel a gift and refund the buyer", needs: ["giftcards.refund"] },
  { feature: "Reports and PDFs", what: "View reports and send or download them as a PDF", needs: ["reports.view"] },
  { feature: "Staff accounts", what: "Add, edit, disable staff and choose what they may do", needs: ["staff.manage"] },
];

export default function RolesOverview({ catalog }: { catalog: Catalog }) {
  const has = (perms: string[], row: Row) => (row.any ? row.needs.some((n) => perms.includes(n)) : row.needs.every((n) => perms.includes(n)));
  const roles = [
    { id: "owner", label: "Owner", hint: "Everything, including accounts", perms: [...catalog.assignable, "staff.manage"], Icon: Crown },
    { id: "admin", label: "Admin", hint: "Everything except accounts", perms: catalog.assignable, Icon: ShieldCheck },
    ...catalog.presets.filter((p) => p.id !== "manager").map((p) => ({ id: p.id, label: p.label, hint: p.hint, perms: p.permissions, Icon: UserRound })),
  ];

  return (
    <section aria-label="Roles and what they can do" className="space-y-3">
      <div>
        <h2 className="text-lg font-bold">Roles and what they can do</h2>
        <p className="text-sm text-muted">The quick starts when you add staff, and who can do each action. You can still tick or untick anything for a person.</p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {roles.map((r) => {
          const has2 = new Set(r.perms);
          const used = catalog.sections.filter((s) => s.permissions.some((p) => has2.has(p.key)));
          return (
            <li key={r.id} className="space-y-2 rounded-2xl bg-surface p-4 shadow-sm">
              <p className="flex items-center gap-2 font-semibold"><r.Icon size={16} className="text-brand" /> {r.label}</p>
              <p className="text-xs text-muted">{r.hint}</p>
              <div className="flex flex-wrap gap-1.5">
                {r.id === "owner" || r.id === "admin"
                  ? <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">All {catalog.sections.length} areas{r.id === "owner" ? " + accounts" : ""}</span>
                  : used.map((s) => {
                      const n = s.permissions.filter((p) => has2.has(p.key)).length;
                      return <span key={s.id} className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium">{s.label}{n < s.permissions.length ? ` ${n}/${s.permissions.length}` : ""}</span>;
                    })}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="overflow-x-auto rounded-2xl bg-surface shadow-sm">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-semibold">Newest actions</th>
              {roles.map((r) => <th key={r.id} className="px-2 py-3 text-center font-semibold">{r.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {RECENT.map((row) => (
              <tr key={row.feature} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5"><span className="block font-medium">{row.feature}</span><span className="block text-xs text-muted">{row.what}</span></td>
                {roles.map((r) => (
                  <td key={r.id} className="px-2 py-2.5 text-center">
                    {has(r.perms, row) ? <Check size={16} className="mx-auto text-emerald-600" aria-label="Allowed" /> : <X size={16} className="mx-auto text-muted/50" aria-label="Not allowed" />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
