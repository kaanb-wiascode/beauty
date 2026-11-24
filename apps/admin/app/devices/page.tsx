"use client";

import { useState } from "react";

interface DeviceRecord {
  id: string;
  tenantName: string;
  branchName: string;
  deviceIdentifier: string;
  deviceName: string;
  deviceType: "TABLET" | "MOBILE" | "DESKTOP";
  osInfo: string;
  browserInfo: string;
  lastIpAddress: string;
  isIpAllowed: boolean;
  status: "PENDING" | "APPROVED" | "BLOCKED" | "REVOKED";
  approvedByAdmin?: string;
  approvedAt?: string;
  createdAt: string;
}

const INITIAL_DEVICES: DeviceRecord[] = [
  {
    id: "dev-1",
    tenantName: "Elit Estetik & Klinik A.Ş.",
    branchName: "Kadıköy Şubesi",
    deviceIdentifier: "VALOO-DEV-9841",
    deviceName: "Kasa iPad Pro 11\" (Resepsiyon Masası)",
    deviceType: "TABLET",
    osInfo: "iPadOS 18.2",
    browserInfo: "Safari 18.0",
    lastIpAddress: "88.255.12.34",
    isIpAllowed: true,
    status: "PENDING",
    createdAt: "12 dakika önce",
  },
  {
    id: "dev-2",
    tenantName: "Lumiere Poliklinik",
    branchName: "Nişantaşı Şubesi",
    deviceIdentifier: "VALOO-DEV-7712",
    deviceName: "Windows 11 PC (Dr. Arda Özel Laptop)",
    deviceType: "DESKTOP",
    osInfo: "Windows 11 Pro",
    browserInfo: "Chrome 131.0",
    lastIpAddress: "176.24.8.1",
    isIpAllowed: false,
    status: "PENDING",
    createdAt: "34 dakika önce",
  },
  {
    id: "dev-3",
    tenantName: "Elit Estetik & Klinik A.Ş.",
    branchName: "Kadıköy Şubesi",
    deviceIdentifier: "VALOO-DEV-1002",
    deviceName: "Danışan Karşılama Tableti (Lobi Kiosk)",
    deviceType: "TABLET",
    osInfo: "iPadOS 18.1",
    browserInfo: "Valoo Kiosk App",
    lastIpAddress: "88.255.12.34",
    isIpAllowed: true,
    status: "APPROVED",
    approvedByAdmin: "Kaan Burak ATAMER",
    approvedAt: "10.11.2026",
    createdAt: "10.11.2026",
  },
  {
    id: "dev-4",
    tenantName: "Elit Estetik & Klinik A.Ş.",
    branchName: "Ataşehir Şubesi",
    deviceIdentifier: "VALOO-DEV-3401",
    deviceName: "Kasa Masaüstü PC (Muhasebe)",
    deviceType: "DESKTOP",
    osInfo: "Windows 11 Home",
    browserInfo: "Chrome 130",
    lastIpAddress: "88.255.88.19",
    isIpAllowed: true,
    status: "APPROVED",
    approvedByAdmin: "Kaan Burak ATAMER",
    approvedAt: "04.11.2026",
    createdAt: "04.11.2026",
  },
  {
    id: "dev-5",
    tenantName: "Bella Medikal Güzellik",
    branchName: "Bakırköy Şubesi",
    deviceIdentifier: "VALOO-DEV-6619",
    deviceName: "Şüpheli Android Cihaz (Bilinmeyen Kullanıcı)",
    deviceType: "MOBILE",
    osInfo: "Android 14",
    browserInfo: "Mobile Chrome",
    lastIpAddress: "195.175.44.110",
    isIpAllowed: false,
    status: "BLOCKED",
    approvedByAdmin: "Kaan Burak ATAMER",
    approvedAt: "01.11.2026",
    createdAt: "01.11.2026",
  },
];

export default function DevicesPage() {
  const [devices, setDevices] = useState<DeviceRecord[]>(INITIAL_DEVICES);
  const [activeTab, setActiveTab] = useState<"ALL" | "PENDING" | "APPROVED" | "BLOCKED">("PENDING");
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const handleApprove = (id: string) => {
    setDevices((prev) =>
      prev.map((d) =>
        d.id === id
          ? {
              ...d,
              status: "APPROVED",
              approvedByAdmin: "Kaan Burak ATAMER (Süper Admin)",
              approvedAt: "Şimdi",
            }
          : d
      )
    );
    setFeedbackMsg("Cihaz başarıyla onaylandı ve sisteme erişim yetkisi verildi.");
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const handleBlock = (id: string) => {
    setDevices((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: "BLOCKED" } : d))
    );
    setFeedbackMsg("Cihaz kalıcı olarak engellendi. Bu cihazdan gelen tüm istekler 403 ile reddedilecek.");
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const handleRevoke = (id: string) => {
    setDevices((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: "REVOKED" } : d))
    );
    setFeedbackMsg("Cihazın onay yetkisi iptal edildi (Remote Session Wipe uygulandı).");
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const filteredDevices = devices.filter((d) => {
    if (activeTab === "ALL") return true;
    return d.status === activeTab;
  });

  const pendingCount = devices.filter((d) => d.status === "PENDING").length;

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <span>🛡️</span>
            <span>Zero-Trust Cihaz Onay Masası</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Yetkisiz tablet ve bilgisayarların klinik verilerine erişmesini engelleyin. Cihazları yalnızca siz ve yetkili adminler onaylayabilir.
          </p>
        </div>

        <div className="px-3.5 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-semibold flex items-center gap-2">
          <span>🔒</span>
          <span>Yetki Politikası: Yalnızca Süper Admin ve Yetkilendirilmiş Roller</span>
        </div>
      </div>

      {feedbackMsg && (
        <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-200 text-xs font-semibold flex items-center justify-between animate-fade-in">
          <span>ℹ️ {feedbackMsg}</span>
          <button onClick={() => setFeedbackMsg(null)} className="text-blue-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab("PENDING")}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-2 ${
            activeTab === "PENDING"
              ? "bg-amber-500 text-slate-950 shadow"
              : "text-slate-400 hover:text-white bg-slate-900 border border-slate-800"
          }`}
        >
          <span>Onayınızı Bekleyenler</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-950/40 text-current">
            {pendingCount}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("APPROVED")}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
            activeTab === "APPROVED"
              ? "bg-emerald-600 text-white shadow"
              : "text-slate-400 hover:text-white bg-slate-900 border border-slate-800"
          }`}
        >
          Onaylı & Aktif Cihazlar
        </button>

        <button
          onClick={() => setActiveTab("BLOCKED")}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
            activeTab === "BLOCKED"
              ? "bg-rose-600 text-white shadow"
              : "text-slate-400 hover:text-white bg-slate-900 border border-slate-800"
          }`}
        >
          Engellenmiş Cihazlar
        </button>

        <button
          onClick={() => setActiveTab("ALL")}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
            activeTab === "ALL"
              ? "bg-blue-600 text-white shadow"
              : "text-slate-400 hover:text-white bg-slate-900 border border-slate-800"
          }`}
        >
          Tüm Kayıtlar ({devices.length})
        </button>
      </div>

      {/* Device List */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0e1626] text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
              <tr>
                <th className="py-3 px-5">Cihaz & Parmak İzi</th>
                <th className="py-3 px-4">Firma & Şube</th>
                <th className="py-3 px-4">İşletim & Tarayıcı</th>
                <th className="py-3 px-4">Bağlantı IP</th>
                <th className="py-3 px-4">IP Güvenlik Eşleşmesi</th>
                <th className="py-3 px-4">Durum</th>
                <th className="py-3 px-5 text-right">Eylemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredDevices.map((d) => (
                <tr key={d.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-4 px-5">
                    <div className="font-bold text-white flex items-center gap-2">
                      <span>{d.deviceType === "TABLET" ? "📱" : d.deviceType === "DESKTOP" ? "💻" : "📲"}</span>
                      <span>{d.deviceName}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                      ID: {d.deviceIdentifier}
                    </div>
                  </td>

                  <td className="py-4 px-4">
                    <div className="font-semibold text-slate-200">{d.tenantName}</div>
                    <div className="text-[10px] text-slate-400">{d.branchName}</div>
                  </td>

                  <td className="py-4 px-4 text-slate-300">
                    <div>{d.osInfo}</div>
                    <div className="text-[10px] text-slate-500">{d.browserInfo}</div>
                  </td>

                  <td className="py-4 px-4 font-mono text-slate-300">
                    {d.lastIpAddress}
                  </td>

                  <td className="py-4 px-4">
                    {d.isIpAllowed ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        <span>✓</span> Şube Sabit Wi-Fi
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                        <span>⚠️</span> Şube Dışı / Mobil
                      </span>
                    )}
                  </td>

                  <td className="py-4 px-4">
                    {d.status === "PENDING" && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                        ONAY BEKLİYOR
                      </span>
                    )}
                    {d.status === "APPROVED" && (
                      <div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          ONAYLI
                        </span>
                        <div className="text-[9px] text-slate-500 mt-1">
                          Onaylayan: {d.approvedByAdmin}
                        </div>
                      </div>
                    )}
                    {d.status === "BLOCKED" && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                        ENGELLİ
                      </span>
                    )}
                    {d.status === "REVOKED" && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-700 text-slate-300">
                        YETKİ İPTAL
                      </span>
                    )}
                  </td>

                  <td className="py-4 px-5 text-right space-x-2">
                    {d.status === "PENDING" && (
                      <>
                        <button
                          onClick={() => handleApprove(d.id)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold shadow-sm transition-colors"
                        >
                          Onayla
                        </button>
                        <button
                          onClick={() => handleBlock(d.id)}
                          className="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-600/40 rounded font-semibold transition-colors"
                        >
                          Reddet
                        </button>
                      </>
                    )}

                    {d.status === "APPROVED" && (
                      <button
                        onClick={() => handleRevoke(d.id)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-rose-900/40 text-slate-300 hover:text-rose-300 border border-slate-700 rounded font-semibold transition-colors"
                      >
                        Yetkiyi İptal Et (Wipe)
                      </button>
                    )}

                    {d.status === "BLOCKED" && (
                      <button
                        onClick={() => handleApprove(d.id)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold transition-colors"
                      >
                        Engeli Kaldır
                      </button>
                    )}
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
