import Link from "next/link";
import { icons } from "@/components/icons";
import { groups, modules } from "@/lib/nav";

// Numbers stay "—" until the functional pages are connected to the API. No fake data.
const stats = ["Bookings today", "Revenue today", "Pending payments", "Arrivals on the way", "Disputes to resolve", "Refunds due"];

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted">Everything the customer app offers, ready to manage.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {stats.map((s) => (
          <div key={s} className="rounded-xl border border-line bg-surface p-4">
            <p className="text-2xl font-bold">—</p>
            <p className="text-xs text-muted">{s}</p>
          </div>
        ))}
      </div>

      {groups.map((g) => (
        <section key={g}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{g}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {modules.filter((m) => m.group === g).map((m) => {
              const Icon = icons[m.icon];
              const toBuild = m.endpoints.filter((x) => x.status === "needed").length;
              return (
                <Link key={m.slug} href={`/${m.slug}`} className="flex gap-3 rounded-xl border border-line bg-surface p-4 hover:border-brand">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand"><Icon size={20} /></span>
                  <span className="min-w-0">
                    <span className="block font-semibold">{m.title}</span>
                    <span className="block text-xs text-muted">{m.summary}</span>
                    {toBuild > 0 && <span className="mt-1 block text-[11px] text-amber-600">{toBuild} endpoint{toBuild > 1 ? "s" : ""} to build</span>}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
