// Highlights the record a live notification pointed at: the page marks rows with data-hl="<record key>", and a link with
// ?hl=<key> scrolls to that row and pulses it for 5 seconds, or until the next click anywhere. The page may still be loading,
// so it looks for the row for a few seconds before giving up.
import { useEffect } from "react";

export function useHighlight(ready = true) {
  useEffect(() => {
    if (!ready || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("hl");
    if (!id) return;
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
  }, [ready]);
}
