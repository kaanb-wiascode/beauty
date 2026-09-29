"use client";

import { EnterpriseDataPage } from "@/components/enterprise-data-page";

export default function CfoPlanningPage() {
  const now = new Date();
  const year = now.getFullYear();
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const asOf = now.toISOString().slice(0, 10);

  return (
    <EnterpriseDataPage
      eyebrow="Finans Yönetimi · Planlama ve Kârlılık"
      title="Finans Planlama ve Kârlılık"
      description="Bütçe, maliyet merkezi, kârlılık, nakit senaryoları ve finansal sağlık göstergelerini tek merkezden yönetin."
      sections={[
        { title: "Kârlılık Özeti", path: `/profitability/summary?from=${from}&to=${to}` },
        { title: "Şube Kârlılığı", path: `/profitability/branches?from=${from}&to=${to}` },
        { title: "Hizmet Kârlılığı", path: `/profitability/services?from=${from}&to=${to}` },
        { title: "Personel Kârlılığı", path: `/profitability/staff?from=${from}&to=${to}` },
        { title: "Net Kârlılık Özeti", path: `/profitability/net/summary?from=${from}&to=${to}` },
        { title: "Net Şube Kârlılığı", path: `/profitability/net/branches?from=${from}&to=${to}` },
        { title: "Net Hizmet Kârlılığı", path: `/profitability/net/services?from=${from}&to=${to}` },
        { title: "Net Personel Kârlılığı", path: `/profitability/net/staff?from=${from}&to=${to}` },
        { title: "Net Müşteri Kârlılığı", path: `/profitability/net/customers?from=${from}&to=${to}` },
        { title: "Maliyet Merkezleri", path: "/profitability/cost-centers" },
        { title: "Dağıtılmamış Giderler", path: `/profitability/cost-centers/unallocated-expenses?from=${from}&to=${to}` },
        { title: "Bütçeler", path: `/profitability/budgets?from=${from}&to=${to}` },
        { title: "Bütçe / Gerçekleşen", path: `/profitability/budgets/actual-vs-budget?from=${from}&to=${to}` },
        { title: "Aylık Bütçe Performansı", path: `/profitability/budgets/monthly?year=${year}` },
        { title: "Yılbaşından Bugüne Bütçe", path: `/profitability/budgets/ytd?year=${year}&asOf=${asOf}` },
        { title: "Yuvarlanan Tahmin", path: `/profitability/budgets/forecast?from=${from}&to=${to}&asOf=${asOf}` },
        { title: "Nakit Akışı Senaryoları", path: `/profitability/cash-flow/scenarios?start=${asOf}` },
        { title: "Hazine Ayarları", path: "/profitability/treasury/settings" },
        { title: "Hazine Uyarıları", path: `/profitability/treasury/alerts?start=${asOf}` },
        { title: "Gecikmiş Alacak Stresi", path: `/profitability/treasury/receivables/stress?asOf=${asOf}` },
        { title: "Ödeme Öncelikleri", path: `/profitability/treasury/payments/priorities?asOf=${asOf}` },
        { title: "Çalışma Sermayesi", path: `/profitability/cfo/working-capital?asOf=${asOf}` },
        { title: "Nakit Dayanma Süresi", path: `/profitability/cfo/cash-runway?asOf=${asOf}` },
        { title: "Finans Yönetim Paneli", path: `/profitability/cfo/dashboard?asOf=${asOf}` },
        { title: "Finansal Sağlık Eşikleri", path: "/profitability/cfo/health/thresholds" },
        { title: "Finansal Sağlık", path: `/profitability/cfo/health?asOf=${asOf}` },
        { title: "Yönetim Uyarıları", path: `/profitability/cfo/executive-alerts?asOf=${asOf}` },
        { title: "Şube Finans Sıralaması", path: "/profitability/cfo/branches/ranking?limit=100" },
        { title: "Finans Trend Uyarıları", path: `/profitability/cfo/trend-alerts?asOf=${asOf}` },
        { title: "Yönetici Finans Özeti", path: `/profitability/cfo/executive-summary?asOf=${asOf}` },
        { title: "Finans Görev Özeti", path: "/profitability/cfo/actions/summary" },
        { title: "Finans Görev Politikası", path: "/profitability/cfo/actions/policy" },
        { title: "Finans Görev Yanıt Süreleri", path: `/profitability/cfo/actions/sla?asOf=${asOf}` },
        { title: "Finansal Sağlık Trendi", path: `/profitability/cfo/health/trend?asOf=${asOf}` },
        { title: "Finansal Sağlık Önerileri", path: `/profitability/cfo/health/recommendations?asOf=${asOf}` },
      ]}
      actions={[
        {
          label: "Finansal Sağlık Anlık Görüntüsü Al",
          path: `/profitability/cfo/health/snapshots?asOf=${asOf}`,
          success: "Finansal sağlık anlık görüntüsü kaydedildi.",
        },
      ]}
      forms={[
        {
          title: "Maliyet Merkezi Oluştur",
          description: "Örneğin Merkez Ofis, Pazarlama veya Şube Operasyonları gibi giderlerinizi takip edeceğiniz bir alan oluşturun.",
          path: "/profitability/cost-centers",
          fields: [
            { name: "code", label: "Kısa Ad", placeholder: "Örn. MERKEZ", required: true },
            { name: "name", label: "Maliyet Merkezi Adı", placeholder: "Örn. Merkez Ofis", required: true },
          ],
        },

        {
          title: "Nakit Güvenlik Ayarlarını Güncelle",
          path: "/profitability/treasury/settings",
          fields: [
            { name: "minimumLiquidity", label: "Korunacak Minimum Nakit", type: "number", required: true },
            { name: "warningBufferPercent", label: "Erken Uyarı Payı (%)", type: "number" },
            { name: "reportingCurrency", label: "Raporlarda Gösterilecek Para Birimi", defaultValue: "TRY", placeholder: "TRY, EUR, USD" },
          ],
        },
        {
          title: "Finansal Sağlık Eşiklerini Güncelle",
          path: "/profitability/cfo/health/thresholds",
          fields: [
            { name: "minimumHealthScore", label: "Minimum Finansal Sağlık Puanı", type: "number" },
            { name: "minimumRunwayWeeks", label: "Minimum Nakit Dayanma Haftası", type: "number" },
            { name: "maximumDsoDays", label: "En Fazla Ortalama Tahsilat Süresi (gün)", type: "number" },
            { name: "minimumNetWorkingCapital", label: "Minimum Net Çalışma Sermayesi", type: "number" },
            { name: "maximumOverdueReceivableRatio", label: "En Fazla Gecikmiş Alacak Oranı (%)", type: "number" },
            { name: "maximumLiquidityAlerts", label: "En Fazla Aktif Likidite Uyarısı", type: "number" },
          ],
        },
        {
          title: "Finans Görev Sürelerini Güncelle",
          path: "/profitability/cfo/actions/policy",
          fields: [
            { name: "criticalHours", label: "Kritik Görev Süresi (saat)", type: "number" },
            { name: "highHours", label: "Yüksek Görev Süresi (saat)", type: "number" },
            { name: "mediumHours", label: "Orta Görev Süresi (saat)", type: "number" },
            { name: "lowHours", label: "Düşük Görev Süresi (saat)", type: "number" },
            { name: "escalationGraceHours", label: "Gecikme Sonrası Ek Süre (saat)", type: "number" },
          ],
        },

      ]}
    />
  );
}
