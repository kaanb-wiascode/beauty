import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "VALOO",
    template: "%s — VALOO",
  },
  description:
    "Müşteri, operasyon, finans, ekip ve yönetim süreçlerini aynı çalışma ortamında buluşturan modüler işletme yönetim platformu.",
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
