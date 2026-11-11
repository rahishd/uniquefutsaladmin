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
  themeColor: "#0b1f4d",
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
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* the light or dark choice saved on this device (components/ThemeToggle.tsx), applied before the first paint so there is no flash */}
        <script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('uf-admin-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}" }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <ConfirmHost />
        <NoZoom />
        <InstallPrompt />
      </body>
    </html>
  );
}
