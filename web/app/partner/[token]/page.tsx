"use client";

import { useParams } from "next/navigation";
import PartnerDashboard from "@/components/marketplace/PartnerDashboard";

// A marketplace partner's private dashboard. Public: no sign-in, the secret in the address is the key.
export default function Page() {
  const { token } = useParams<{ token: string }>();
  return <PartnerDashboard token={token} />;
}
