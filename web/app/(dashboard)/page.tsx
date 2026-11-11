import { redirect } from "next/navigation";

// The landing page is the Dashboard (Overview and Reports is one click away in the top bar).
export default function Page() {
  redirect("/dashboard");
}
