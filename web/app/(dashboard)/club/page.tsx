import { redirect } from "next/navigation";

// Unique Club now lives on the Membership page (the "Unique Club" switch). The old address still works.
export default function Page() {
  redirect("/membership?tab=club");
}
