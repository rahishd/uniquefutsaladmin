import { redirect } from "next/navigation";

// Notifications now live in Pop-Ups and Site Content (the "Notifications" tab). The old address still works.
export default function Page() {
  redirect("/content?tab=notifications");
}
