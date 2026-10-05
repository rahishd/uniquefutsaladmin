export function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>{children}</span>;
}
