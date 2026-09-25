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
      description="Bütçe, maliyet merkezi, net kârlılık, nakit senaryoları, finansal sağlık ve yönetim politikalarını backend verileriyle tek merkezden yönetin."
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
        { title: "CFO Dashboard", path: `/profitability/cfo/dashboard?asOf=${asOf}` },
        { title: "Finansal Sağlık Eşikleri", path: "/profitability/cfo/health/thresholds" },
        { title: "Finansal Sağlık", path: `/profitability/cfo/health?asOf=${asOf}` },
        { title: "Yönetim Uyarıları", path: `/profitability/cfo/executive-alerts?asOf=${asOf}` },
        { title: "Şube Finans Sıralaması", path: "/profitability/cfo/branches/ranking?limit=100" },
        { title: "Finans Trend Uyarıları", path: `/profitability/cfo/trend-alerts?asOf=${asOf}` },
        { title: "Yönetici Finans Özeti", path: `/profitability/cfo/executive-summary?asOf=${asOf}` },
        { title: "Finans Görev Özeti", path: "/profitability/cfo/actions/summary" },
        { title: "Finans Görev Politikası", path: "/profitability/cfo/actions/policy" },
        { title: "Finans Görev SLA", path: `/profitability/cfo/actions/sla?asOf=${asOf}` },
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
          path: "/profitability/cost-centers",
          fields: [
            { name: "code", label: "Kod", required: true },
            { name: "name", label: "Ad", required: true },
          ],
        },
        {
          title: "Maliyet Merkezi Dağılımı Kaydet",
          path: "/profitability/cost-centers/{id}/allocations",
          fields: [
            { name: "id", label: "Maliyet Merkezi ID", required: true },
            {
              name: "allocations",
              label: "Şube Dağılımları",
              type: "json",
              required: true,
              placeholder: '[{"branchId":"UUID","percent":100}]',
            },
          ],
        },
        {
          title: "Muhasebe Satırına Maliyet Merkezi Ata",
          path: "/profitability/journal-lines/{journalEntryLineId}/cost-center",
          fields: [
            { name: "journalEntryLineId", label: "Yevmiye Satırı ID", required: true },
            { name: "costCenterId", label: "Maliyet Merkezi ID", required: true },
          ],
        },
        {
          title: "Bütçe Kaydet",
          path: "/profitability/budgets",
          fields: [
            { name: "targetType", label: "Hedef Türü", type: "select", required: true, options: [{ value: "BRANCH", label: "Şube" }, { value: "COST_CENTER", label: "Maliyet Merkezi" }] },
            { name: "targetId", label: "Hedef ID", required: true },
            { name: "metricType", label: "Bütçe Türü", type: "select", required: true, options: [{ value: "REVENUE", label: "Gelir" }, { value: "EXPENSE", label: "Gider" }] },
            { name: "periodStart", label: "Başlangıç", type: "date", required: true, defaultValue: from },
            { name: "periodEnd", label: "Bitiş", type: "date", required: true, defaultValue: to },
            { name: "amount", label: "Tutar", type: "number", required: true },
            { name: "note", label: "Not", type: "textarea" },
          ],
        },
        {
          title: "Hazine Risk Ayarlarını Güncelle",
          path: "/profitability/treasury/settings",
          fields: [
            { name: "minimumLiquidity", label: "Minimum Likidite", type: "number", required: true },
            { name: "warningBufferPercent", label: "Uyarı Tamponu (%)", type: "number" },
            { name: "reportingCurrency", label: "Raporlama Para Birimi", defaultValue: "TRY" },
          ],
        },
        {
          title: "Finansal Sağlık Eşiklerini Güncelle",
          path: "/profitability/cfo/health/thresholds",
          fields: [
            { name: "minimumHealthScore", label: "Minimum Sağlık Skoru", type: "number" },
            { name: "minimumRunwayWeeks", label: "Minimum Nakit Dayanma Haftası", type: "number" },
            { name: "maximumDsoDays", label: "Maksimum Tahsilat Günü", type: "number" },
            { name: "minimumNetWorkingCapital", label: "Minimum Net Çalışma Sermayesi", type: "number" },
            { name: "maximumOverdueReceivableRatio", label: "Maksimum Gecikmiş Alacak Oranı (%)", type: "number" },
            { name: "maximumLiquidityAlerts", label: "Maksimum Likidite Uyarısı", type: "number" },
          ],
        },
        {
          title: "Finans Görev Politikası Güncelle",
          path: "/profitability/cfo/actions/policy",
          fields: [
            { name: "criticalHours", label: "Kritik Görev Süresi (saat)", type: "number" },
            { name: "highHours", label: "Yüksek Görev Süresi (saat)", type: "number" },
            { name: "mediumHours", label: "Orta Görev Süresi (saat)", type: "number" },
            { name: "lowHours", label: "Düşük Görev Süresi (saat)", type: "number" },
            { name: "escalationGraceHours", label: "Eskalasyon Ek Süresi (saat)", type: "number" },
          ],
        },
        {
          title: "Personel Komisyon Oranı Güncelle",
          path: "/profitability/staff/{staffId}/commission",
          fields: [
            { name: "staffId", label: "Personel ID", required: true },
            { name: "rate", label: "Komisyon Oranı (%)", type: "number", required: true },
          ],
        },
        {
          title: "Satış Kalemini Randevuya Bağla",
          path: "/profitability/sale-items/{saleItemId}/attribute",
          fields: [
            { name: "saleItemId", label: "Satış Kalemi ID", required: true },
            { name: "appointmentId", label: "Randevu ID", required: true },
          ],
        },
      ]}
    />
  );
}
