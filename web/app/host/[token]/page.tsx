import { redirect } from "next/navigation";

// The old match-day link. Tournament managers now sign in to the Tournament Organizer app with the Unique Futsal ID the venue made for them.
export default function Page() {
  redirect("/organizer");
}
