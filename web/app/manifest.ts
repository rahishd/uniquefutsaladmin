import type { MetadataRoute } from "next";

// The admin portal can be installed to the phone's home screen: it then opens full screen, without the browser's address bar and buttons.
// On the shared domain the portal lives under NEXT_PUBLIC_BASE_PATH (see next.config.ts), so every address here carries it.
const base = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Unique Futsal Admin",
    short_name: "UF Admin",
    description: "Unique Futsal admin portal",
    id: `${base}/`,
    start_url: `${base}/`,
    scope: `${base}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#0c0b5d",
    theme_color: "#0c0b5d",
    icons: [
      { src: `${base}/icons/192`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${base}/icons/512`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${base}/icons/512`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
