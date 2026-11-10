import { redirect } from "next/navigation";

// VIP Privilege now lives on the Promocodes & VIP page (the "VIP Privilege" switch). The old address still works.
export default function Page() {
  redirect("/promos?tab=vip");
}
