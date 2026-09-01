import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./beauty-theme.css";

const inter = localFont({
  src: "./fonts/Inter[opsz,wght].ttf",
  weight: "100 900",
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Beauty ERP",
  description: "Beauty salon management system",
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
