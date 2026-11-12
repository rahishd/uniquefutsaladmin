"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { canSeePage } from "@/lib/access";

// The landing page: the portal opens on Slots (after signing in, reopening or reloading the portal's own address). An account that may not open
// Slots goes to the Dashboard, and then to Overview.
export default function Page() {
  const router = useRouter();
  useEffect(() => {
    router.replace(canSeePage("slots") ? "/slots" : canSeePage("dashboard") ? "/dashboard" : "/overview");
  }, [router]);
  return null;
}
