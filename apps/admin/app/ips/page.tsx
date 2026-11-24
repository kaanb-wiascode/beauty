"use client";

import { useState } from "react";

interface AllowedIpRecord {
  id: string;
  tenantName: string;
  branchName: string;
  ipAddress: string;
  label: string;
  strictMode: boolean;
  isActive: boolean;
  createdAt: string;
}

const INITIAL_IPS: AllowedIpRecord[] = [
  {
    id: "ip-1",
    tenantName: "Elit Estetik & Klinik A.Ş.",
    branchName: "Kadıköy Merkez Şube",
    ipAddress: "88.255.12.34",
    label: "Kadıköy Şubesi Statik Fiber Wi-Fi",
    strictMode: true,
    isActive: true,
    createdAt: "01.11.2026",
  },
  {
    id: "ip-2",
    tenantName: "Elit Estetik & Klinik A.Ş.",
    branchName: "Ataşehir Şubesi",
    ipAddress: "88.255.88.19",
    label: "Ataşehir Şube Kasa Hattı",
    strictMode: true,
    isActive: true,
    createdAt: "04.11.2026",
  },
  {
    id: "ip-3",
    tenantName: "Lumiere Poliklinik",
    branchName: "Nişantaşı Şubesi",
    ipAddress: "212.156.40.82",
    label: "Nişantaşı Klinik İnterneti",
    strictMode: false,
    isActive: true,
    createdAt: "05.11.2026",
  },
  {
    id: "ip-4",
    tenantName: "Bella Medikal Güzellik",
    branchName: "Bakırköy Şube",
    ipAddress: "195.175.44.110",
    label: "Bakırköy Resepsiyon Sabit IP",
    strictMode: true,
    isActive: true,
    createdAt: "12.11.2026",
  },
];

export default function IpsPage() {
  const [ips, setIps] = useState<AllowedIpRecord[]>(INITIAL_IPS);
  const [newIp, setNewIp] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [selectedTenant, setSelectedTenant] = useState("Elit Estetik & Klinik A.Ş.");
  const [selectedBranch, setSelectedBranch] = useState("Bağdat Caddesi Şubesi");

  const handleAddIp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIp || !newLabel) return;

    const newRecord: AllowedIpRecord = {
      id: `ip-${Date.now()}`,
      tenantName: selectedTenant,
      branchName: selectedBranch,
      ipAddress: newIp.trim(),
      label: newLabel.trim(),
      strictMode: true,
      isActive: true,
      createdAt: "Şimdi",
    };

    setIps([newRecord, ...ips]);
    setNewIp("");
    setNewLabel("");
  };

  const toggleIpStatus = (id: string) => {
    setIps((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isActive: !item.isActive } : item))
    );
  };

  const deleteIp = (id: string) => {
    setIps((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <span>🌐</span>
            <span>Şube Sabit IP & Coğrafi Güvenlik Kalkanı</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Klinik çalışanlarının sadece şubenin izinli internet ağından sisteme bağlanmasını sağlayın (Evden veya yabancı ağlardan müşteri verisi çekilmesini engeller).
          </p>
        </div>
      </div>

      {/* Add IP Form */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl p-6 shadow-sm">
        <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <span>+</span>
          <span>Kliniğe Yeni Sabit IP Tanımla</span>
        </h2>

        <form onSubmit={handleAddIp} className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          <div>
            <label className="block text-slate-400 mb-1.5 font-medium">Hedef Firma</label>
            <select
              value={selectedTenant}
              onChange={(e) => setSelectedTenant(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
            >
              <option value="Elit Estetik & Klinik A.Ş.">Elit Estetik & Klinik A.Ş.</option>
              <option value="Lumiere Poliklinik">Lumiere Poliklinik</option>
              <option value="Bella Medikal Güzellik">Bella Medikal Güzellik</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1.5 font-medium">Şube / Lokasyon</label>
            <input
              type="text"
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
              placeholder="Örn: Kadıköy Şubesi"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1.5 font-medium">Sabit IP / CIDR Bloğu</label>
            <input
              type="text"
              value={newIp}
              onChange={(e) => setNewIp(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white font-mono"
              placeholder="Örn: 88.255.12.34"
              required
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1.5 font-medium">Açıklama / Hat Etiketi</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
                placeholder="Örn: Şube Fiber Wi-Fi"
                required
              />
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors whitespace-nowrap"
              >
                Ekle
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* IP Table */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">Tanımlı Şube IP Kalkanları</h2>
          <span className="text-xs text-slate-400">{ips.length} Aktif IP Kuralı</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0e1626] text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
              <tr>
                <th className="py-3 px-5">Firma & Şube</th>
                <th className="py-3 px-4">Sabit IP Adresi</th>
                <th className="py-3 px-4">Etiket</th>
                <th className="py-3 px-4">Güvenlik Modu</th>
                <th className="py-3 px-4">Durum</th>
                <th className="py-3 px-5 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {ips.map((ip) => (
                <tr key={ip.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-4 px-5">
                    <div className="font-bold text-white">{ip.tenantName}</div>
                    <div className="text-[10px] text-slate-400">{ip.branchName}</div>
                  </td>

                  <td className="py-4 px-4 font-mono font-bold text-cyan-400">
                    {ip.ipAddress}
                  </td>

                  <td className="py-4 px-4 text-slate-300">
                    {ip.label}
                  </td>

                  <td className="py-4 px-4">
                    {ip.strictMode ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-300 border border-rose-500/30">
                        🔒 KATI MOD (Sadece Bu IP)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400">
                        ESNEK MOD
                      </span>
                    )}
                  </td>

                  <td className="py-4 px-4">
                    <button
                      onClick={() => toggleIpStatus(ip.id)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        ip.isActive
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                          : "bg-slate-800 text-slate-500 border border-slate-700"
                      }`}
                    >
                      {ip.isActive ? "AKTİF KORUMA" : "DEVRE DIŞI"}
                    </button>
                  </td>

                  <td className="py-4 px-5 text-right">
                    <button
                      onClick={() => deleteIp(ip.id)}
                      className="px-2.5 py-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                    >
                      Kaldır
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
