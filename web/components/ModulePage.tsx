import { icons } from "./icons";
import type { Module } from "@/lib/nav";

const List = ({ title, items }: { title: string; items: string[] }) =>
  items.length === 0 ? null : (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      <ul className="space-y-1.5 text-sm text-muted">
        {items.map((i) => <li key={i} className="flex gap-2"><span className="text-brand">•</span>{i}</li>)}
      </ul>
    </section>
  );

// Placeholder for a module whose functional page has not been built yet.
export default function ModulePage({ module: m }: { module: Module }) {
  const Icon = icons[m.icon];
  const ready = m.endpoints.filter((x) => x.status === "ready").length;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"><Icon size={24} /></span>
        <div>
          <h1 className="text-2xl font-bold">{m.title}</h1>
          <p className="text-sm text-muted">{m.summary}</p>
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-line bg-surface-2 p-4 text-sm text-muted">
        This section is ready for its functional page. {ready} of {m.endpoints.length} API endpoints already exist.
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <List title="What customers do in the app" items={m.clientFeatures} />
        <List title="What staff will do here" items={m.adminTasks} />
      </div>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">API</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr><th className="py-1 pr-3">Method</th><th className="pr-3">Path</th><th className="pr-3">Purpose</th><th>Status</th></tr>
            </thead>
            <tbody>
              {m.endpoints.map((x) => (
                <tr key={x.method + x.path} className="border-t border-line">
                  <td className="py-2 pr-3 font-mono text-xs">{x.method}</td>
                  <td className="pr-3 font-mono text-xs">{x.path}</td>
                  <td className="pr-3 text-muted">{x.note}</td>
                  <td>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${x.status === "ready" ? "bg-brand/10 text-brand" : "bg-amber-500/15 text-amber-600"}`}>
                      {x.status === "ready" ? "Exists" : "To build"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
