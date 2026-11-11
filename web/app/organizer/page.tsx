import type { Viewport } from "next";
import OrganizerApp from "@/components/organizer/OrganizerApp";

// The phone's status bar and browser bar take the same navy as the app's own header, so the top of the screen is one colour.
export const viewport: Viewport = { themeColor: "#0b1f4d" };

// The Tournament Organizer app: its own sign-in and its own menu, nothing of the admin portal around it.
export default function Page() {
  return <OrganizerApp />;
}
