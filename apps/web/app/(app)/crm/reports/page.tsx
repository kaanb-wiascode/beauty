"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CardInfo } from "@/components/card-info";
import { Alert, GlassCard, PageHeader, Spinner, TextInput } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { getCardHelp } from "@/lib/card-help";

type DailyReport = {
  date: string;
  leadCount: number;
  contactedCount: number;
  qualifiedCount: number;
  convertedCount: number;
  lostLeadCount: number;
  opportunityCount: number;
  openOpportunityCount: number;
  wonCount: number;
  lostOpportunityCount: number;
  pipelineValue: number;
  wonValue: number;
  leadConversionRate: number;
  winRate: number;
};

type SalespersonReport = {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  leadCount: number;
  interactionCount: number;
  opportunityCount: number;
  wonCount: number;
  lostCount: number;
  wonValue: number;
  actualSalesValue: number;
  completedFollowUpCount: number;
  overdueFollowUpCount: number;
  leadToOpportunityRate: number;
  winRate: number;
};

function dateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}
function money(value: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value);
}

export default function CrmReportsPage() {
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 29); return dateInput(d); });
  const [to, setTo] = useState(() => dateInput(new Date()));
  const [daily, setDaily] = useState<DailyReport[]>([]);
  const [salespeople, setSalespeople] = useState<SalespersonReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const fromDate = new Date(`${from}T00:00:00`).toISOString();
      const toDate = new Date(`${to}T23:59:59`).toISOString();
      const query = new URLSearchParams({ from: fromDate, to: toDate });
      const [dailyRows, salespersonRows] = await Promise.all([
        api<DailyReport[]>(`/crm/operations/reports/daily?${query}`),
        api<SalespersonReport[]>(`/crm/operations/reports/salespeople?${query}`),
      ]);
      setDaily(dailyRows);
      setSalespeople(salespersonRows);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "CRM raporları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => daily.reduce((acc, row) => ({
    leads: acc.leads + row.leadCount,
    opportunities: acc.opportunities + row.opportunityCount,
    won: acc.won + row.wonCount,
    wonValue: acc.wonValue + row.wonValue,
  }), { leads: 0, opportunities: 0, won: 0, wonValue: 0 }), [daily]);

  const salespersonTotals = useMemo(() => salespeople.reduce((acc, row) => ({
    interactions: acc.interactions + row.interactionCount,
    actualSalesValue: acc.actualSalesValue + row.actualSalesValue,
    completedFollowUps: acc.completedFollowUps + row.completedFollowUpCount,
    overdueFollowUps: acc.overdueFollowUps + row.overdueFollowUpCount,
  }), { interactions: 0, actualSalesValue: 0, completedFollowUps: 0, overdueFollowUps: 0 }), [salespeople]);

  if (loading && !daily.length && !salespeople.length) return <Spinner label="CRM raporları hazırlanıyor..." />;

  const cards = [
    ["Potansiyel Müşteri", totals.leads, "Seçilen tarih aralığında oluşturulan potansiyel müşteri sayısı."],
    ["Görüşme", salespersonTotals.interactions, "Satış ekibi tarafından kaydedilen müşteri görüşmelerinin toplamı."],
    ["Satış Fırsatı", totals.opportunities, "Seçilen dönemde oluşturulan satış fırsatlarının toplamı."],
    ["Kazanılan Fırsat", totals.won, "Kazanıldı durumuna geçen satış fırsatlarının toplamı."],
    ["Gerçekleşen Satış", money(salespersonTotals.actualSalesValue), "CRM fırsatlarından gerçek satış kaydına dönüşen toplam satış tutarı."],
    ["Geciken Takip", salespersonTotals.overdueFollowUps, "Halen açık ve son zamanı geçmiş müşteri takiplerinin toplamı."],
  ] as const;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="CRM Raporları"
        description="Satış ekibinin müşteri kazanımı, görüşme, fırsat, takip ve gerçekleşen satış performansını inceleyin."
      />

      <div className="grid gap-3 sm:grid-cols-[180px_180px_1fr] sm:items-end">
        <label><span className="mb-1.5 block text-[10px] text-[var(--muted)]">Başlangıç tarihi</span><TextInput type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label><span className="mb-1.5 block text-[10px] text-[var(--muted)]">Bitiş tarihi</span><TextInput type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <p className="text-[10px] text-[var(--muted)]">Raporlar kullanıcının CRM veri erişim kapsamına göre otomatik filtrelenir.</p>
      </div>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {cards.map(([label, value, detail]) => (
          <GlassCard key={label} className="p-4">
            <div className="flex items-start gap-2">
              <CardInfo help={getCardHelp(label, detail)} />
              <p className="text-[10px] font-medium text-[var(--muted)]">{label}</p>
            </div>
            <strong className="mt-3 block text-[22px] font-semibold tracking-[-.04em]">{value}</strong>
          </GlassCard>
        ))}
      </section>

      <GlassCard className="p-0">
        <div className="border-b border-[var(--line)] px-5 py-4">
          <div className="flex items-start gap-2">
            <CardInfo help={getCardHelp("Satışçı Performansı", "Satış ekibi üyelerinin müşteri, görüşme, fırsat, takip ve gerçekleşen satış sonuçlarını kullanıcı bazında karşılaştırır.")} />
            <div><h2 className="text-[15px] font-semibold">Satışçı Performansı</h2><p className="mt-1 text-[10px] text-[var(--muted)]">Kullanıcı bazında CRM ve satış sonuçları</p></div>
          </div>
        </div>
        {salespeople.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left">
              <thead className="border-b border-[var(--line)] bg-[var(--surface-2)]/45 text-[9px] uppercase tracking-[.06em] text-[var(--muted)]">
                <tr>
                  <th className="px-5 py-3">Satışçı</th>
                  <th className="px-3 py-3">Pot. Müşteri</th>
                  <th className="px-3 py-3">Görüşme</th>
                  <th className="px-3 py-3">Fırsat</th>
                  <th className="px-3 py-3">Kazanılan</th>
                  <th className="px-3 py-3">Müşteri → Fırsat</th>
                  <th className="px-3 py-3">Kazanma Oranı</th>
                  <th className="px-3 py-3">Gerçek Satış</th>
                  <th className="px-3 py-3">Tamamlanan Takip</th>
                  <th className="px-3 py-3">Geciken Takip</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {salespeople.map((row) => (
                  <tr key={row.userId} className="text-[11px]">
                    <td className="px-5 py-4"><p className="font-semibold">{[row.firstName, row.lastName].filter(Boolean).join(" ") || "Kullanıcı"}</p><p className="mt-1 text-[9px] text-[var(--muted)]">{row.email || "—"}</p></td>
                    <td className="px-3 py-4">{row.leadCount}</td>
                    <td className="px-3 py-4">{row.interactionCount}</td>
                    <td className="px-3 py-4">{row.opportunityCount}</td>
                    <td className="px-3 py-4">{row.wonCount}</td>
                    <td className="px-3 py-4">%{row.leadToOpportunityRate}</td>
                    <td className="px-3 py-4">%{row.winRate}</td>
                    <td className="px-3 py-4 font-semibold">{money(row.actualSalesValue)}</td>
                    <td className="px-3 py-4">{row.completedFollowUpCount}</td>
                    <td className="px-3 py-4">{row.overdueFollowUpCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="px-5 py-10 text-center text-[12px] text-[var(--muted)]">Seçilen tarih aralığında satışçı performans verisi bulunmuyor.</div>}
      </GlassCard>

      <GlassCard className="p-0">
        <div className="border-b border-[var(--line)] px-5 py-4">
          <div className="flex items-start gap-2">
            <CardInfo help={getCardHelp("Günlük CRM Hareketleri", "Potansiyel müşteri, fırsat ve satış sonuçlarının seçilen tarih aralığındaki günlük değişimini gösterir.")} />
            <div><h2 className="text-[15px] font-semibold">Günlük CRM Hareketleri</h2><p className="mt-1 text-[10px] text-[var(--muted)]">Gün bazında satış süreci hareketleri</p></div>
          </div>
        </div>
        {daily.length ? <div className="divide-y divide-[var(--line)]">{daily.map((row) => <div key={row.date} className="grid gap-2 px-5 py-3.5 sm:grid-cols-[130px_repeat(5,1fr)] sm:items-center">
          <strong className="text-[11px]">{new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(row.date + "T12:00:00"))}</strong>
          <div><p className="text-[9px] text-[var(--muted)]">Pot. Müşteri</p><span className="text-[11px]">{row.leadCount}</span></div>
          <div><p className="text-[9px] text-[var(--muted)]">Fırsat</p><span className="text-[11px]">{row.opportunityCount}</span></div>
          <div><p className="text-[9px] text-[var(--muted)]">Kazanılan</p><span className="text-[11px]">{row.wonCount}</span></div>
          <div><p className="text-[9px] text-[var(--muted)]">Kazanma</p><span className="text-[11px]">%{row.winRate}</span></div>
          <div><p className="text-[9px] text-[var(--muted)]">Kazanılan değer</p><span className="text-[11px]">{money(row.wonValue)}</span></div>
        </div>)}</div> : <div className="px-5 py-10 text-center text-[12px] text-[var(--muted)]">Günlük CRM hareketi bulunmuyor.</div>}
      </GlassCard>
    </div>
  );
}
