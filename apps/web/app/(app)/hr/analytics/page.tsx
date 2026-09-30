"use client";

import { EnterpriseDataPage } from "@/components/enterprise-data-page";

export default function HRAnalyticsPage() {
  const now = new Date();
  const path = `/hr/analytics?year=${now.getFullYear()}&month=${now.getMonth() + 1}`;

  return (
    <EnterpriseDataPage
      eyebrow="İnsan Kaynakları"
      title="İK Analizi"
      description="Çalışan sayısı, çalışma süreleri, izinler ve bordro sonuçlarını aynı dönem için birlikte görüntüleyin."
      sections={[
        {
          title: "Çalışan Durumu",
          description: "Aktif ve arşivlenmiş çalışan sayılarını gösterir.",
          path,
          dataKey: "headcount",
        },
        {
          title: "Çalışma ve Puantaj",
          description: "Toplam çalışma süresi, fazla mesai ve devamsızlık kayıtlarını gösterir.",
          path,
          dataKey: "attendance",
        },
        {
          title: "İzin Durumu",
          description: "Bekleyen ve onaylanan izin taleplerini ve kullanılan izin günlerini gösterir.",
          path,
          dataKey: "leaves",
        },
        {
          title: "Bordro Özeti",
          description: "Çalışan sayısı, toplam ücret ve işveren maliyetini seçili dönem için gösterir.",
          path,
          dataKey: "payroll",
        },
      ]}
    />
  );
}
