import type { Metadata, Viewport } from "next";

import { Providers } from "@/components/providers";
import { PwaRegister } from "@/components/pwa-register";

import "./globals.css";

export const metadata: Metadata = {
  title: "Bills App v1",
  description: "Single-owner bills tracking app with Firestore",
  applicationName: "Bills App",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Bills App"
  },
  icons: {
    icon: [{ url: "/favicon.ico" }],
    apple: [{ url: "/apple-icon" }]
  }
};

export const viewport: Viewport = {
  themeColor: "#0f7d6f"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning><PwaRegister /><Providers>{children}</Providers></body>
    </html>
  );
}
