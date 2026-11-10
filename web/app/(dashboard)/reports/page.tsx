import { redirect } from "next/navigation";

// Reports now live on the Overview page (the "Reports" switch). The old address still works.
export default function Page() {
  redirect("/overview?tab=reports");
}
