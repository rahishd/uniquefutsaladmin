// Highlights the record a live notification pointed at: the page marks rows with data-hl="<record key>", and a link with
// ?hl=<key> scrolls to that row and pulses it for 5 seconds, or until the next click anywhere. The page may still be loading,
// so it looks for the row for a few seconds before giving up. When the notification is opened while staff are already on that
// page (nothing remounts), nudgeHighlight() tells the page to look again.
import { useEffect, useState } from "react";

const NUDGE = "uf-highlight-nudge";
export const nudgeHighlight = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event(NUDGE)); };

export function useHighlight(ready = true) {
  const [nudged, setNudged] = useState(0);
  useEffect(() => {
    const on = () => setNudged((n) => n + 1);
    window.addEventListener(NUDGE, on);
    return () => window.removeEventListener(NUDGE, on);
  }, []);

  useEffect(() => {
    if (!ready || typeof window === "undefined") return;
    if (nudged === 0 && !new URLSearchParams(window.location.search).get("hl")) return;
    let el: HTMLElement | null = null;
    let t: ReturnType<typeof setTimeout> | undefined;
    let arm: ReturnType<typeof setTimeout> | undefined;
    const off = () => {
      el?.classList.remove("uf-hl");
      clearTimeout(t);
      document.removeEventListener("pointerdown", off);
    };
    const started = Date.now();
    const look = setInterval(() => {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("hl");
      // after a nudge the address may take a moment to change
      if (!id) { if (Date.now() - started > 2000) clearInterval(look); return; }
      el = document.querySelector<HTMLElement>(`[data-hl="${CSS.escape(id)}"]`);
      if (!el && Date.now() - started < 6000) return;
      clearInterval(look);
      // take ?hl off the address so a refresh does not flash it again
      params.delete("hl");
      const rest = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("uf-hl");
      t = setTimeout(off, 5000);
      // a short delay so the click that opened the page does not clear it at once
      arm = setTimeout(() => document.addEventListener("pointerdown", off), 300);
    }, 250);
    return () => { clearInterval(look); clearTimeout(arm); off(); };
  }, [ready, nudged]);
}
