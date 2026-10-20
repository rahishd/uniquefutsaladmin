import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ConfirmHost from "@/components/ConfirmHost";
import InstallPrompt from "@/components/InstallPrompt";
import NoZoom from "@/components/NoZoom";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Unique Futsal Admin",
  description: "Unique Futsal admin portal",
  // installed to the home screen it opens full screen; the navy header runs under the status bar
  appleWebApp: { capable: true, title: "UF Admin", statusBarStyle: "black-translucent" },
};

// An app, not a web page: fixed size, no zoom (pinch zoom on iPhone is also stopped in components/NoZoom.tsx)
export const viewport: Viewport = {
  themeColor: "#0c0b5d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <ConfirmHost />
        <NoZoom />
        <InstallPrompt />
      </body>
    </html>
  );
}
