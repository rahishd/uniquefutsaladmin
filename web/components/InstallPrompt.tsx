"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, MoreVertical, PlusSquare, X } from "lucide-react";

// Installing the portal to the home screen is what removes the browser's address bar and buttons. Shown on phones until the portal is
// installed; "Not now" hides it for this visit only. A browser cannot install by itself: Android installs with one tap, an iPhone opens
// the Share sheet, where "Add to Home Screen" is one row away.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "uf-admin-install-dismissed-visit";
const base = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");

const standalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const ios = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const android = () => /Android/i.test(navigator.userAgent);
const dismissedNow = () => {
  try { return sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
};

export default function InstallPrompt() {
  const [mode, setMode] = useState<"android" | "android-menu" | "ios" | null>(null);
  const [hint, setHint] = useState(false);
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = useCallback(() => {
    if (standalone() || dismissedNow()) return;
    if (timer.current) clearTimeout(timer.current);
    if (ios()) timer.current = setTimeout(() => setMode("ios"), 1500);
    else if (deferred.current) timer.current = setTimeout(() => setMode("android"), 1500);
    else if (android()) timer.current = setTimeout(() => setMode(deferred.current ? "android" : "android-menu"), 4000);
  }, []);

  useEffect(() => {
    // some Android browsers only offer the install button once a service worker is running
    navigator.serviceWorker?.register(`${base}/admin-sw.js`).catch(() => {});
    const onBefore = (e: Event) => { e.preventDefault(); deferred.current = e as BeforeInstallPromptEvent; open(); };
    const onInstalled = () => { deferred.current = null; setMode(null); };
    window.addEventListener("beforeinstallprompt", onBefore);
    window.addEventListener("appinstalled", onInstalled);
    open();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener("beforeinstallprompt", onBefore);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [open]);

  function dismiss() {
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* storage blocked */ }
    setMode(null);
  }

  async function install() {
    const evt = deferred.current;
    if (!evt) return;
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    deferred.current = null;
    if (outcome === "dismissed") dismiss();
    else setMode(null);
  }

  async function iosDownload() {
    setHint(true);
    try {
      await navigator.share?.({ title: "Unique Futsal Admin", url: window.location.origin + base + "/" });
    } catch {
      // closed without choosing: the hint stays so they can try again
    }
  }

  if (!mode) return null;

  return (
    <div role="dialog" aria-label="Install Unique Futsal Admin" className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-[60] px-4 lg:hidden">
      <div className="relative mx-auto max-w-sm rounded-3xl bg-white p-5 text-slate-800 shadow-2xl ring-1 ring-slate-200">
        <button type="button" onClick={dismiss} aria-label="Close" className="absolute right-4 top-4 text-slate-400"><X size={18} /></button>
        <div className="flex items-center gap-3 pr-6">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#0c0b5d] text-base font-bold text-white shadow-md">UF</span>
          <div>
            <p className="font-semibold">Get the Admin app</p>
            <p className="text-xs text-slate-500">Open it full screen from your home screen, without the browser bars.</p>
          </div>
        </div>

        {mode === "android-menu" && (
          <p className="mt-4 flex items-center gap-2 rounded-2xl bg-blue-50 px-3 py-2.5 text-sm text-slate-700">
            <MoreVertical size={18} className="shrink-0 text-[#0c0b5d]" aria-hidden />
            <span>Open the browser menu and choose <b>Install app</b> or <b>Add to Home screen</b>.</span>
          </p>
        )}
        {mode === "ios" && hint && (
          <p className="mt-4 flex items-center gap-2 rounded-2xl bg-blue-50 px-3 py-2.5 text-sm text-slate-700">
            <PlusSquare size={18} className="shrink-0 text-[#0c0b5d]" aria-hidden />
            <span>Choose <b>Add to Home Screen</b>, then tap <b>Add</b>.</span>
          </p>
        )}

        <div className="mt-4 flex gap-3">
          <button type="button" onClick={dismiss} className="flex-1 rounded-full bg-slate-100 py-3 text-sm font-medium text-slate-600">{mode === "android-menu" ? "Got it" : "Not now"}</button>
          {mode === "android" && (
            <button type="button" onClick={install} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#0c0b5d] py-3 text-sm font-semibold text-white"><Download size={16} /> Download app</button>
          )}
          {mode === "ios" && (
            <button type="button" onClick={iosDownload} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#0c0b5d] py-3 text-sm font-semibold text-white"><Download size={16} /> Download now</button>
          )}
        </div>
      </div>
    </div>
  );
}
