"use client";

import Link from "next/link";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { icons } from "@/components/icons";
import { groups, modules } from "@/lib/nav";

const quick = ["bookings", "arrivals", "payments", "customers"];

// Numbers stay "—" until the functional pages are connected to the API. No fake data.
const attention = [
  { label: "Pending payments", icon: "wallet", href: "/payments" },
  { label: "Arrivals", icon: "bell", href: "/arrivals" },
  { label: "Disputes", icon: "scale", href: "/disputes" },
  { label: "Refunds due", icon: "receipt", href: "/payments" },
];

function Tile({ href, label, Icon, badge }: { href: string; label: string; Icon: React.ElementType; badge?: string }) {
  return (
    <Link href={href} className="flex flex-col items-center gap-2 text-center text-[13px] font-medium leading-tight">
      <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-surface-2 text-foreground/75">
        <Icon size={26} strokeWidth={1.6} />
        {badge && <span className="absolute -right-2 -top-2 rounded-full bg-brand px-1.5 text-[11px] font-bold text-white">{badge}</span>}
      </span>
      <span className="text-foreground/80">{label}</span>
    </Link>
  );
}

const Card = ({ title, children }: { title?: string; children: React.ReactNode }) => (
  <section className="rounded-2xl bg-surface p-5 shadow-sm">
    {title && <h2 className="mb-4 text-lg font-semibold">{title}</h2>}
    <div className="grid grid-cols-4 gap-x-2 gap-y-5">{children}</div>
  </section>
);

export default function Home() {
  const [hidden, setHidden] = useState(false);
  const val = hidden ? "XXXX.XX" : "—";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* green curve behind the summary card */}
      <div className="-mx-4 -mt-4 h-14 rounded-b-[2rem] bg-brand lg:-mx-8 lg:-mt-8" />

      <section className="-mt-12 overflow-hidden rounded-2xl bg-surface shadow-sm">
        <div className="relative grid grid-cols-2 bg-surface-2 px-5 py-4">
          <div>
            <p className="text-xs text-muted">NPR · Revenue today</p>
            <p className="text-xl font-bold">{val}</p>
          </div>
          <div className="pl-6">
            <p className="text-xs text-muted">Bookings today</p>
            <p className="text-xl font-bold">{val}</p>
          </div>
          <button onClick={() => setHidden((h) => !h)} aria-label={hidden ? "Show numbers" : "Hide numbers"} className="absolute left-1/2 top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-surface shadow">
            {hidden ? <EyeOff size={22} /> : <Eye size={22} />}
          </button>
        </div>
        <div className="grid grid-cols-4 gap-2 px-3 py-4">
          {quick.map((slug) => {
            const m = modules.find((x) => x.slug === slug)!;
            return <Tile key={slug} href={`/${slug}`} label={m.title} Icon={icons[m.icon]} />;
          })}
        </div>
      </section>

      <Card title="Needs attention">
        {attention.map((a) => <Tile key={a.label} href={a.href} label={a.label} Icon={icons[a.icon]} badge="—" />)}
      </Card>

      {groups.map((g) => (
        <Card key={g} title={g}>
          {modules.filter((m) => m.group === g).map((m) => <Tile key={m.slug} href={`/${m.slug}`} label={m.title} Icon={icons[m.icon]} />)}
        </Card>
      ))}
    </div>
  );
}
