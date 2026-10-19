// Small building blocks shared by the Digital ID scan page and its result.
export function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
      <div>
        <h3 className="font-bold">{title}</h3>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export const Tile = ({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: string }) => (
  <div className="rounded-xl bg-surface-2 p-3">
    <p className="text-xs text-muted">{label}</p>
    <p className={`text-lg font-bold ${tone ?? ""}`}>{value}</p>
    {sub && <p className="text-[11px] text-muted">{sub}</p>}
  </div>
);

export const Empty = ({ children }: { children: React.ReactNode }) => <p className="rounded-xl bg-surface-2 p-3 text-center text-sm text-muted">{children}</p>;
