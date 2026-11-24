import Link from "next/link";

export default function DashboardPage() {
  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Page Title & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            SaaS Platform Kontrol Kulesi
            <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-medium px-2.5 py-0.5 rounded-full">
              Tüm Sistemler Canlı
            </span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Çoklu firma yönetimi, modüler lisanslama, Zero-Trust cihaz onayları ve altyapı sağlığı.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/tenants"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2"
          >
            <span>+</span>
            <span>Yeni Firma (Tenant) Oluştur</span>
          </Link>
          <Link
            href="/devices"
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition-all"
          >
            🛡️ Cihaz Onay Masası
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Aktif Firma (Tenant)</span>
            <span className="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-bold">+18%</span>
          </div>
          <div className="text-2xl font-bold text-white mt-2">42 Firma</div>
          <div className="text-[11px] text-slate-400 mt-2 flex items-center gap-1">
            <span className="text-slate-300 font-semibold">124</span> Şube • <span className="text-slate-300 font-semibold">680</span> Personel
          </div>
        </div>

        <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Aylık Tekrarlayan Gelir (MRR)</span>
            <span className="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-bold">+24%</span>
          </div>
          <div className="text-2xl font-bold text-white mt-2">₺248.500</div>
          <div className="text-[11px] text-slate-400 mt-2">
            Ortalama Lisans: <span className="text-slate-300 font-semibold">₺5.910 / ay</span>
          </div>
        </div>

        <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Zero-Trust Cihaz Güvenliği</span>
            <span className="text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded font-bold">2 Onay Bekliyor</span>
          </div>
          <div className="text-2xl font-bold text-white mt-2">312 Onaylı Cihaz</div>
          <div className="text-[11px] text-slate-400 mt-2">
            Katı IP Koruması: <span className="text-emerald-400 font-semibold">38 Firmada Aktif</span>
          </div>
        </div>

        <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Modüler Satış Hacmi</span>
            <span className="text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded font-bold">8 Modül</span>
          </div>
          <div className="text-2xl font-bold text-white mt-2">168 Aktif Eklenti</div>
          <div className="text-[11px] text-slate-400 mt-2">
            En popüler: <span className="text-slate-300 font-semibold">Gelişmiş Stok & İK</span>
          </div>
        </div>
      </div>

      {/* Critical Security Approval Queue (Sizin ve Yetkililerinizin Onaylayacağı Cihazlar) */}
      <div className="bg-[#111827] border border-amber-500/30 rounded-xl overflow-hidden shadow-lg shadow-amber-500/5">
        <div className="p-5 border-b border-slate-800 bg-gradient-to-r from-amber-500/10 via-transparent to-transparent flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">🛡️</span>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                Onayınızı Bekleyen Cihazlar (Zero-Trust Kalkanı)
                <span className="px-2 py-0.5 text-[10px] bg-amber-500 text-slate-950 font-extrabold rounded-full">
                  2 YENİ
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Klinik çalışanları sizin onayınız olmadan sisteme kesinlikle giriş yapamaz.
              </p>
            </div>
          </div>
          <Link href="/devices" className="text-xs text-amber-400 hover:text-amber-300 font-semibold">
            Tüm Cihazları Yönet →
          </Link>
        </div>

        <div className="divide-y divide-slate-800/80">
          {/* Device 1 */}
          <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-800/20 transition-colors">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-lg border border-slate-700">
                📱
              </div>
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  iPad Pro 11&quot; (Resepsiyon Masası)
                  <span className="text-[10px] font-mono bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                    #DEV-9841
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Firma: <span className="text-slate-200 font-semibold">Elit Estetik & Klinik A.Ş.</span> (Kadıköy Şubesi)
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-3">
                  <span>İşletim: iPadOS 18.2</span>
                  <span>IP: 88.255.12.34 (Şube Wi-Fi İle Eşleşiyor ✅)</span>
                  <span>İstek: 12 dk önce</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end md:self-auto">
              <button className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-1.5">
                <span>✓</span>
                <span>Yetkilendir (Onayla)</span>
              </button>
              <button className="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-600/40 text-xs font-semibold rounded-lg transition-colors">
                Reddet & Blokla
              </button>
            </div>
          </div>

          {/* Device 2 */}
          <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-800/20 transition-colors">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-lg border border-slate-700">
                💻
              </div>
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  Windows 11 PC (Dr. Arda Özel Laptop)
                  <span className="text-[10px] font-mono bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                    #DEV-7712
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Firma: <span className="text-slate-200 font-semibold">Lumiere Poliklinik</span> (Nişantaşı Şubesi)
                </div>
                <div className="text-[11px] text-amber-400/90 mt-0.5 flex items-center gap-3">
                  <span>İşletim: Windows 11 Chrome</span>
                  <span>⚠️ IP: 176.24.8.1 (Şube Dışı Ev/Mobil İnternet)</span>
                  <span>İstek: 34 dk önce</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end md:self-auto">
              <button className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-1.5">
                <span>✓</span>
                <span>Yetkilendir (Onayla)</span>
              </button>
              <button className="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-600/40 text-xs font-semibold rounded-lg transition-colors">
                Reddet & Blokla
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Layout: Modüler Lisans Dağılımı & Sistem Sağlığı */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Modüler Satış Dağılımı */}
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>🧩</span>
              <span>Modül Kataloğu Satış Durumu</span>
            </h3>
            <Link href="/modules" className="text-xs text-blue-400 hover:text-blue-300">
              Kataloğu Düzenle →
            </Link>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/60 border border-slate-800">
              <div>
                <div className="font-semibold text-white">Çekirdek Randevu & Müşteri CRM</div>
                <div className="text-slate-400 text-[11px]">Temel Modül (Tüm paketlerde zorunlu)</div>
              </div>
              <div className="text-right">
                <span className="text-emerald-400 font-bold">42 / 42 Firma</span>
                <div className="text-[10px] text-slate-500">%100 Penetrasyon</div>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/60 border border-slate-800">
              <div>
                <div className="font-semibold text-white">Gelişmiş Stok & Sarf Malzeme Takibi</div>
                <div className="text-slate-400 text-[11px]">Ek Modül (+₺1.450 / ay)</div>
              </div>
              <div className="text-right">
                <span className="text-indigo-400 font-bold">36 Firma</span>
                <div className="text-[10px] text-slate-500">₺52.200 / ay MRR</div>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/60 border border-slate-800">
              <div>
                <div className="font-semibold text-white">İK, Personel Vardiya & Prim Bordro</div>
                <div className="text-slate-400 text-[11px]">Ek Modül (+₺1.850 / ay)</div>
              </div>
              <div className="text-right">
                <span className="text-indigo-400 font-bold">29 Firma</span>
                <div className="text-[10px] text-slate-500">₺53.650 / ay MRR</div>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/60 border border-slate-800">
              <div>
                <div className="font-semibold text-white">Ön Muhasebe & e-Fatura/e-Arşiv</div>
                <div className="text-slate-400 text-[11px]">Ek Modül (+₺2.200 / ay)</div>
              </div>
              <div className="text-right">
                <span className="text-indigo-400 font-bold">21 Firma</span>
                <div className="text-[10px] text-slate-500">₺46.200 / ay MRR</div>
              </div>
            </div>
          </div>
        </div>

        {/* Canlı Altyapı Telemetrisi */}
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>🩺</span>
              <span>Canlı Altyapı & Veritabanı Telemetrisi</span>
            </h3>
            <span className="text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded font-mono">
              Uptime: %99.98
            </span>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">PostgreSQL Bağlantı Havuzu (Connection Pool)</span>
                <span className="text-slate-200 font-mono font-semibold">14 / 100 Aktif (%14)</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full w-[14%]"></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Redis Bellek & Oturum Önbelleği</span>
                <span className="text-slate-200 font-mono font-semibold">284 MB / 4 GB (%7.1)</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2">
                <div className="bg-indigo-500 h-2 rounded-full w-[7.1%]"></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">API P95 Yanıt Süresi</span>
                <span className="text-emerald-400 font-mono font-semibold">18 ms (Çok Hızlı)</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2">
                <div className="bg-emerald-500 h-2 rounded-full w-[18%]"></div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
              <span className="text-slate-400">Bekleyen Arka Plan Görevi (Workers):</span>
              <span className="text-slate-200 font-mono font-semibold">0 Bekleyen (Kuyruk Temiz)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
