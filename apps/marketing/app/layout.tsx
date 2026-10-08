import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { siteDescription, siteName, siteUrl } from "@/lib/site-config";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: siteName,
  title: {
    default: siteName,
    template: "%s — VALOO",
  },
  description: siteDescription,
  openGraph: {
    type: "website",
    locale: "tr_TR",
    siteName,
    title: siteName,
    description: siteDescription,
  },
  twitter: {
    card: "summary",
    title: siteName,
    description: siteDescription,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr" className={geist.variable}>
      <body>{children}</body>
    </html>
  );
}
