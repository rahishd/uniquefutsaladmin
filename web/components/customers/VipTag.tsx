import { Crown } from "lucide-react";

// The gold "VIP" tag shown on a customer who has been given a VIP privilege.
export default function VipTag() {
  return (
    <span title="VIP privilege" className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 px-2 py-0.5 text-[11px] font-black tracking-wide text-amber-950 shadow-sm">
      <Crown size={11} strokeWidth={2.5} /> VIP
    </span>
  );
}
