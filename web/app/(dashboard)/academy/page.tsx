import { redirect } from "next/navigation";

// The Children's Academy now lives on the Membership page (the "Children's Academy" switch). The old address still works.
export default function Page() {
  redirect("/membership?tab=academy");
}
