"use client";

import { useState } from "react";

interface ModuleItem {
  id: string;
  code: string;
  name: string;
  category: "CORE" | "OPERATIONS" | "FINANCE" | "MARKETING" | "CLINICAL" | "INTELLIGENCE";
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  isCore: boolean;
  isActive: boolean;
  activeTenantsCount: number;
}

const INITIAL_MODULES: ModuleItem[] = [
  {
    id: "mod-1",
    code: "CORE_CRM",
    name: "Çekirdek Randevu & Müşteri CRM",
    category: "CORE",
    description: "Müşteri kartları, randevu takvimi, temel seans takibi ve servis listesi.",
    monthlyPrice: 0,
    yearlyPrice: 0,
    isCore: true,
    isActive: true,
    activeTenantsCount: 42,
  },
  {
    id: "mod-2",
    code: "INVENTORY",
    name: "Gelişmiş Stok & Sarf Tüketimi",
    category: "OPERATIONS",
    description: "Kritik stok uyarıları, seans başı sarf malzeme düşümü, depo transferleri ve tedarikçi siparişleri.",
    monthlyPrice: 1450,
    yearlyPrice: 14500,
    isCore: false,
    isActive: true,
    activeTenantsCount: 36,
  },
  {
    id: "mod-3",
    code: "HR_PAYROLL",
    name: "İK, Vardiya & Prim Bordrosu",
    category: "OPERATIONS",
    description: "Personel vardiya planlaması, hakediş ve prim hesaplama motoru, izin ve avans takibi.",
    monthlyPrice: 1850,
    yearlyPrice: 18500,
    isCore: false,
    isActive: true,
    activeTenantsCount: 29,
  },
  {
    id: "mod-4",
    code: "ACCOUNTING",
    name: "Ön Muhasebe & e-Fatura/e-Arşiv",
    category: "FINANCE",
    description: "Kasa/Banka takibi, cari hesap ekstresi, entegratör üzerinden otomatik e-Fatura/e-Arşiv kesimi.",
    monthlyPrice: 2200,
    yearlyPrice: 22000,
    isCore: false,
    isActive: true,
    activeTenantsCount: 21,
  },
  {
    id: "mod-5",
    code: "MARKETING_AUTOMATION",
    name: "Sadakat, Puan & WhatsApp/SMS Motoru",
    category: "MARKETING",
    description: "Otomatik randevu hatırlatma, gelmeyen müşteriyi geri kazanma, Google harita yorum kampanyaları.",
    monthlyPrice: 1200,
    yearlyPrice: 12000,
    isCore: false,
    isActive: true,
    activeTenantsCount: 38,
  },
  {
    id: "mod-6",
    code: "CLINICAL_MEDIA",
    name: "Öncesi/Sonrası Stüdyo & KVKK Onam Formu",
    category: "CLINICAL",
    description: "Danışan fotoğraflarını seans seans kıyaslama, iPad üzerinden dijital ıslak imza ve medikal onay formları.",
    monthlyPrice: 1650,
    yearlyPrice: 16500,
    isCore: false,
    isActive: true,
    activeTenantsCount: 25,
  },
  {
    id: "mod-7",
    code: "CUSTOMER_PORTAL",
    name: "Müşteri Online Randevu & Ödeme Portalı",
    category: "MARKETING",
    description: "Danışanların webden veya mobilden kendi randevularını alması, paket seanslarını görmesi ve online ödemesi.",
    monthlyPrice: 1100,
    yearlyPrice: 11000,
    isCore: false,
    isActive: true,
    activeTenantsCount: 19,
  },
  {
    id: "mod-8",
    code: "AI_ASSISTANT",
    name: "Yapay Zeka Akıllı Randevu & Cilt Asistanı",
    category: "INTELLIGENCE",
    description: "WhatsApp üzerinden otomatik randevu yazan ve müşteri sorularını yanıtlayan yapay zeka botu.",
    monthlyPrice: 2750,
    yearlyPrice: 27500,
    isCore: false,
    isActive: true,
    activeTenantsCount: 14,
  },
];

export default function ModulesPage() {
  const [modules, setModules] = useState<ModuleItem[]>(INITIAL_MODULES);
  const [selectedTenant, setSelectedTenant] = useState("Elit Estetik & Klinik A.Ş.");
  const [tenantModulesState, setTenantModulesState] = useState<Record<string, boolean>>({
    CORE_CRM: true,
    INVENTORY: true,
    HR_PAYROLL: true,
    ACCOUNTING: false,
    MARKETING_AUTOMATION: true,
    CLINICAL_MEDIA: true,
    CUSTOMER_PORTAL: false,
    AI_ASSISTANT: false,
  });

  const toggleTenantModule = (code: string) => {
    if (code === "CORE_CRM") return; // Çekirdek modül kapatılamaz
    setTenantModulesState((prev) => ({
      ...prev,
      [code]: !prev[code],
    }));
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <span>🧩</span>
            <span>Dinamik Modül Kataloğu & À La Carte Satış</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Uygulamayı modül modül tanımlayın, fiyatlandırın ve firmalara tek tıkla açıp kapatın.
          </p>
        </div>

        <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-indigo-500/20 transition-all">
          + Yeni Modül Tanımla
        </button>
      </div>

      {/* Dynamic Tenant Entitlements Simulation Box */}
      <div className="bg-[#111827] border border-indigo-500/30 rounded-xl p-6 shadow-xl shadow-indigo-500/5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-800">
          <div>
            <span className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider">
              Canlı Modül Açma / Kapama Anahtarı
            </span>
            <h2 className="text-lg font-bold text-white mt-0.5">
              Firma Bazlı Modül Yetkilendirmesi (Entitlements)
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Bir modülü kapattığınız an, o firmanın ekranından menü kaybolur ve backend API istekleri anında 403 ile engellenir.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">İşlem Yapılan Firma:</span>
            <select
              value={selectedTenant}
              onChange={(e) => setSelectedTenant(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-medium focus:outline-none focus:border-indigo-500"
            >
              <option value="Elit Estetik & Klinik A.Ş.">Elit Estetik & Klinik A.Ş.</option>
              <option value="Lumiere Poliklinik">Lumiere Poliklinik</option>
              <option value="Bella Medikal Güzellik">Bella Medikal Güzellik</option>
              <option value="Nova Derma Poliklinik">Nova Derma Poliklinik</option>
            </select>
          </div>
        </div>

        {/* Module Switch Grid for Selected Tenant */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          {modules.map((m) => {
            const isEnabled = tenantModulesState[m.code] ?? false;
            return (
              <div
                key={m.code}
                className={`p-4 rounded-xl border transition-all ${
                  isEnabled
                    ? "bg-slate-900/90 border-indigo-500/50 shadow-sm"
                    : "bg-slate-950/60 border-slate-800 opacity-60"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-bold text-xs text-white">{m.name}</div>
                  <button
                    onClick={() => toggleTenantModule(m.code)}
                    disabled={m.isCore}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      isEnabled ? "bg-indigo-600" : "bg-slate-700"
                    } ${m.isCore ? "cursor-not-allowed opacity-75" : ""}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                        isEnabled ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                <div className="text-[11px] text-slate-400 mt-2 line-clamp-2">
                  {m.description}
                </div>

                <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-slate-300">
                    {m.isCore ? "Zorunlu Çekirdek" : `+₺${m.monthlyPrice.toLocaleString("tr-TR")}/ay`}
                  </span>
                  <span
                    className={`font-semibold px-2 py-0.5 rounded text-[10px] ${
                      isEnabled
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                        : "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                    }`}
                  >
                    {isEnabled ? "AKTİF" : "KAPALI"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-800">
          <button className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-md shadow-emerald-500/20 transition-all">
            💾 Bu Firmanın Lisans Değişikliklerini Anında Kaydet
          </button>
        </div>
      </div>

      {/* Global Module Catalog Table */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">Tüm Sistem Modül Kataloğu & Fiyatlandırma</h2>
          <span className="text-xs text-slate-400">Toplam 8 Tanımlı Modül</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0e1626] text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
              <tr>
                <th className="py-3 px-5">Modül Adı & Kodu</th>
                <th className="py-3 px-4">Kategori</th>
                <th className="py-3 px-4">Aylık Fiyat</th>
                <th className="py-3 px-4">Yıllık Fiyat</th>
                <th className="py-3 px-4">Penetrasyon</th>
                <th className="py-3 px-4">Durum</th>
                <th className="py-3 px-5 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {modules.map((m) => (
                <tr key={m.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3.5 px-5">
                    <div className="font-bold text-white">{m.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{m.code}</div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                      {m.category}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-semibold text-slate-200">
                    {m.isCore ? "Dahil (₺0)" : `₺${m.monthlyPrice.toLocaleString("tr-TR")}`}
                  </td>
                  <td className="py-3.5 px-4 text-slate-400">
                    {m.isCore ? "-" : `₺${m.yearlyPrice.toLocaleString("tr-TR")}`}
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-slate-200">{m.activeTenantsCount} Firma</div>
                    <div className="text-[10px] text-slate-500">
                      %{Math.round((m.activeTenantsCount / 42) * 100)}
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      SATIŞTA
                    </span>
                  </td>
                  <td className="py-3.5 px-5 text-right">
                    <button className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded transition-colors mr-2">
                      Düzenle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
