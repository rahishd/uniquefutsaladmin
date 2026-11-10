import { redirect } from "next/navigation";

// Corporate Network now lives in Site Content (the "Corporate Network" tab). The old address still works.
export default function Page() {
  redirect("/content");
}
