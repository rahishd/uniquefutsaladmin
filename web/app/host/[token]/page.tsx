"use client";

import { useParams } from "next/navigation";
import HostPage from "@/components/tournaments/HostPage";

// The private match-day link. Public: no staff sign-in, the secret in the address is the key.
export default function Page() {
  const { token } = useParams<{ token: string }>();
  return <HostPage token={token} />;
}
