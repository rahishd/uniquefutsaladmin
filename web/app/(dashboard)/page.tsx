import { redirect } from "next/navigation";

// The landing page is Overview (the old tile dashboard lives at /dashboard, under More).
export default function Page() {
  redirect("/overview");
}
