"use client";

import { useParams } from "next/navigation";
import TournamentDetail from "@/components/tournaments/TournamentDetail";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <TournamentDetail id={id} />;
}
