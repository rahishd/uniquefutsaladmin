"use client";

import { useEffect } from "react";

// The portal is an app, not a web page: pinching or double-tapping must not zoom it in or out. iPhone ignores the viewport's
// "no zoom" setting for pinches, so the pinch gestures are stopped here; double-tap zoom is stopped in globals.css.
export default function NoZoom() {
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    const pinch = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };
    document.addEventListener("gesturestart", stop);
    document.addEventListener("gesturechange", stop);
    document.addEventListener("gestureend", stop);
    document.addEventListener("touchmove", pinch, { passive: false });
    return () => {
      document.removeEventListener("gesturestart", stop);
      document.removeEventListener("gesturechange", stop);
      document.removeEventListener("gestureend", stop);
      document.removeEventListener("touchmove", pinch);
    };
  }, []);
  return null;
}
