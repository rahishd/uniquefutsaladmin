"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

// Dark mode switch for the top bar. With nothing chosen the portal follows the device (light or dark); once the person presses this
// the choice is remembered on this device (localStorage "uf-admin-theme") and set on <html data-theme="light|dark"> (see globals.css).
// The layout sets the saved theme before the first paint, so there is no flash.
const KEY = "uf-admin-theme";
type Theme = "light" | "dark";

const systemTheme = (): Theme => (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null); // null until the browser has been asked (keeps the first render the same on server and browser)

  useEffect(() => {
    const t = setTimeout(() => {
      let saved: string | null = null;
      try { saved = localStorage.getItem(KEY); } catch { /* blocked: follows the device */ }
      setTheme(saved === "light" || saved === "dark" ? saved : systemTheme());
    }, 0);
    return () => clearTimeout(t);
  }, []);

  function flip() {
    const next: Theme = (theme ?? systemTheme()) === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch { /* not remembered */ }
  }

  const dark = theme === "dark";
  return (
    <button type="button" onClick={flip} title={dark ? "Switch to light mode" : "Switch to dark mode"} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} aria-pressed={dark}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-(--nav-tile) text-(--nav-ink) shadow-sm ring-1 ring-(--nav-ink)/15 transition hover:bg-(--nav-tile-hover) hover:shadow md:h-11 md:w-11 md:rounded-2xl">
      {dark ? <Sun size={18} className="md:h-[22px] md:w-[22px]" /> : <Moon size={18} className="md:h-[22px] md:w-[22px]" />}
    </button>
  );
}
