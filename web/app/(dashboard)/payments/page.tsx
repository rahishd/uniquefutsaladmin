import { redirect } from "next/navigation";

// Payments now lives on the Bookings page (the "Payments" switch). The old address still works and keeps its filters.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = new URLSearchParams({ tab: "payments" });
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string" && k !== "tab") q.set(k, v);
  redirect(`/bookings?${q.toString()}`);
}
