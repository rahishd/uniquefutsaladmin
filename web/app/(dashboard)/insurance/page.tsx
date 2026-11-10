import { redirect } from "next/navigation";

// Insurance Claims now live on the Wheelchair & Health Insurance page (the "Insurance Claims" switch). The old address still works,
// and keeps what a notification adds to it (for example ?hl= to highlight a claim).
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = new URLSearchParams({ tab: "insurance" });
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string" && k !== "tab") q.set(k, v);
  redirect(`/wheelchair?${q}`);
}
