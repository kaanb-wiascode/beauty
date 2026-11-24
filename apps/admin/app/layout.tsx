import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "VALOO — Superadmin Platform Kontrol Kulesi",
  description: "B2B SaaS Multi-Tenant Platform Control Plane & Zero-Trust Security Center",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body className="flex h-screen overflow-hidden bg-[#0a0f1d] text-slate-100">
        {/* Sidebar */}
        <aside className="w-64 flex flex-col border-r border-slate-800 bg-[#0d1424] select-none">
          {/* Brand */}
          <div className="h-16 flex items-center px-6 border-b border-slate-800 gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-cyan-400 flex items-center justify-center font-black text-white text-lg shadow-lg shadow-blue-500/20">
              V
            </div>
            <div>
              <div className="font-bold text-sm tracking-wide text-white flex items-center gap-1.5">
                VALOO
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  Control
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-medium">SaaS Platform Admin</div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto custom-scrollbar text-sm font-medium">
            <div className="px-3 pb-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Yönetim & Operasyon
            </div>

            <Link
              href="/"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <span>📊</span>
              <span>Genel Bakış (KPI)</span>
            </Link>

            <Link
              href="/tenants"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <span>🏢</span>
              <span>Firma (Tenant) Yönetimi</span>
            </Link>

            <Link
              href="/modules"
              className="flex items-center justify-between px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span>🧩</span>
                <span>Modül Kataloğu (Satış)</span>
              </div>
              <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded font-mono">
                À La Carte
              </span>
            </Link>

            <div className="pt-5 px-3 pb-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Zero-Trust Güvenlik
            </div>

            <Link
              href="/devices"
              className="flex items-center justify-between px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span>🛡️</span>
                <span>Cihaz Onay Masası</span>
              </div>
              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-mono font-bold">
                2 Bekleyen
              </span>
            </Link>

            <Link
              href="/ips"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <span>🌐</span>
              <span>Şube Sabit IP Kalkanı</span>
            </Link>

            <Link
              href="/audit"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <span>📜</span>
              <span>Adli Audit & DLP Logları</span>
            </Link>

            <div className="pt-5 px-3 pb-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Altyapı & Destek
            </div>

            <Link
              href="/health"
              className="flex items-center justify-between px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span>🩺</span>
                <span>Sistem Sağlığı & Kriz</span>
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            </Link>

            <Link
              href="/support"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <span>🎧</span>
              <span>Çift Onaylı "Login As"</span>
            </Link>
          </nav>

          {/* Superadmin Footer info */}
          <div className="p-4 border-t border-slate-800 bg-[#090e1a]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-xs font-bold text-white shadow">
                KB
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-white truncate">Kaan Burak ATAMER</div>
                <div className="text-[10px] text-amber-400 font-medium">Süper Yetkili Admin</div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Workspace Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Top Bar */}
          <header className="h-16 border-b border-slate-800 bg-[#0d1424]/80 backdrop-blur-md flex items-center justify-between px-8 z-10">
            <div className="flex items-center gap-4 flex-1 max-w-lg">
              <div className="relative w-full">
                <span className="absolute left-3 top-2.5 text-slate-500 text-xs">🔍</span>
                <input
                  type="text"
                  placeholder="Firma adı, IP adresi, Cihaz ID (#DEV-...) veya vergi no ara..."
                  className="w-full bg-slate-900/90 border border-slate-700/80 rounded-lg pl-8 pr-4 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Device Approval Notice Badge */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                <span>2 Cihaz Onayınızı Bekliyor</span>
              </div>

              {/* Server Status Pill */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>API & DB: Normal (24ms)</span>
              </div>
            </div>
          </header>

          {/* Page Content */}
          <main className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-[#0a0f1d]">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
