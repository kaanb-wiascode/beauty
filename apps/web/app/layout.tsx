import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "./beauty-theme.css";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "VALOO",
    template: "%s | VALOO",
  },
  description: "Güzellik ve hizmet işletmeleri için operasyon, CRM ve ERP platformu.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className={inter.variable}>
      <body className="ambient-root">{children}</body>
    </html>
  );
}
