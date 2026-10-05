import { notFound } from "next/navigation";
import ModulePage from "@/components/ModulePage";
import { findModule, modules } from "@/lib/nav";

// Generic placeholder for every module in lib/nav.ts. A real folder (app/(dashboard)/bookings/page.tsx) overrides it.
export const dynamicParams = false;

export function generateStaticParams() {
  return modules.map((m) => ({ section: m.slug }));
}

export default async function SectionPage({ params }: PageProps<"/[section]">) {
  const { section } = await params;
  const m = findModule(section);
  if (!m) notFound();
  return <ModulePage module={m} />;
}
