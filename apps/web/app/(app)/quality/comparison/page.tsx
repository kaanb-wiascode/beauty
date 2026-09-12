"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { FinanceEmpty, FinanceMetric, FinancePanel } from "@/components/finance-view";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type ComparisonRow = {
  branchId: string;
  branchName: string;
  branchCode: string;
  overallScore: number;
  inspectionScore: number;
  complaintScore: number;
  trainingCompliance: number;
  sampleCount: number;
};

type ComparisonResponse = {
  periodStart: string;
  periodEnd: string;
  branchCount: number;
  averageOverallScore: number;
  averageTrainingCompliance: number;
  rows: ComparisonRow[];
};

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(parsed) : "—";
}

function date(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

export default function QualityComparisonPage() {
  const [data, setData] = useState<ComparisonResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api<ComparisonResponse>("/quality/comparison"));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Kalite Karşılaştırması Yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => [...(data?.rows ?? [])].sort((a, b) => b.overallScore - a.overallScore), [data]);
  const best = rows[0];
  const lowest = rows[rows.length - 1];

  if (loading && !data) {
    return <div className="flex min-h-[420px] items-center justify-center"><Spinner label="Kalite Karşılaştırması Hazırlanıyor..." /></div>;
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--muted-soft)]">Kalite Ve Gelişim</p>
          <h1 className="mt-1 text-[32px] font-semibold tracking-[-0.045em] text-[var(--ink)]">Kalite Ve Gelişim Karşılaştırması</h1>
          <p className="mt-2 max-w-[820px] text-[13px] leading-6 text-[var(--muted)]">
            Şubeleri Kalite Puanı, Denetim Sonuçları, Müşteri Şikayetleri Ve Eğitim Tamamlama Oranına Göre Karşılaştırın.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>{loading ? "Yükleniyor..." : "Verileri Yenile"}</Button>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <FinanceMetric label="Şube Sayısı" value={data?.branchCount ?? rows.length} detail="Karşılaştırılan Şube" />
        <FinanceMetric label="Ortalama Kalite Puanı" value={number(data?.averageOverallScore)} detail="Tüm Şubeler" tone="info" />
        <FinanceMetric label="Ortalama Eğitim Tamamlama" value={`%${number(data?.averageTrainingCompliance)}`} detail="Tüm Şubeler" tone="success" />
        <FinanceMetric label="En Güçlü Şube" value={best?.branchName ?? "—"} detail={best ? `Puan ${number(best.overallScore)}` : "Veri Yok"} tone="success" />
        <FinanceMetric label="Gelişim Gerektiren Şube" value={lowest?.branchName ?? "—"} detail={lowest ? `Puan ${number(lowest.overallScore)}` : "Veri Yok"} tone="warning" />
      </section>

      <FinancePanel
        title="Şube Karşılaştırması"
        description={data ? `${date(data.periodStart)} - ${date(data.periodEnd)} Dönemi` : "Seçili Dönem"}
      >
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead>
                <tr className="border-b border-[var(--line)] text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-soft)]">
                  <th className="px-4 py-3">Sıra</th>
                  <th className="px-4 py-3">Şube</th>
                  <th className="px-4 py-3">Kalite Puanı</th>
                  <th className="px-4 py-3">Denetim Puanı</th>
                  <th className="px-4 py-3">Şikayet Puanı</th>
                  <th className="px-4 py-3">Eğitim Tamamlama</th>
                  <th className="px-4 py-3">Değerlendirilen Kayıt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {rows.map((row, index) => (
                  <tr key={row.branchId} className="text-[11px] text-[var(--muted)]">
                    <td className="px-4 py-4 font-semibold text-[var(--muted-soft)]">#{index + 1}</td>
                    <td className="px-4 py-4"><p className="font-semibold text-[var(--ink)]">{row.branchName}</p><p className="mt-1 text-[9px] text-[var(--muted-soft)]">{row.branchCode}</p></td>
                    <td className="px-4 py-4 font-semibold text-[var(--ink)]">{number(row.overallScore)}</td>
                    <td className="px-4 py-4">{number(row.inspectionScore)}</td>
                    <td className="px-4 py-4">{number(row.complaintScore)}</td>
                    <td className="px-4 py-4">%{number(row.trainingCompliance)}</td>
                    <td className="px-4 py-4">{row.sampleCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <FinanceEmpty title="Karşılaştırma Verisi Bulunmuyor" description="Şube Kalite Verileri Oluştuğunda Karşılaştırma Burada Görünür." />}
      </FinancePanel>
    </div>
  );
}
