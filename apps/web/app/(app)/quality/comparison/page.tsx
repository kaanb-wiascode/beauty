"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { FinanceEmpty, FinanceMetric, FinancePanel } from "@/components/finance-view";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";

type QualitySignal = {
  branchId: string;
  branchName: string;
  findingCount: number;
  highRiskFindings: number;
  openFindings: number;
  capaCount: number;
  ineffectiveCapas: number;
  completedInspections: number;
  averageInspectionScore: number | null;
};

type QualityScore = {
  branchId: string;
  branchName: string;
  branchCode: string;
  finalScore: number | null;
  baseScore: number | null;
  findingPenalty: number | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  calculatedAt?: string | null;
  trainingCompliance: number | null;
  trainingSourceCount: number | null;
};

type TrainingSignal = {
  branchId: string;
  branchName: string;
  branchCode: string;
  assignmentCount: number;
  completedAssignments: number;
  overdueAssignments: number;
  completionRate: number | null;
  openReviews: number;
  overdueReviews: number;
  profiledStaff: number;
  requirements: number;
  gaps: number;
  averageCompetencyScore: number | null;
};

type Row = {
  branchId: string;
  branchName: string;
  branchCode?: string;
  quality?: QualitySignal;
  score?: QualityScore;
  training?: TrainingSignal;
};

function formatScore(value?: number | null) {
  return value == null ? "—" : Number(value).toFixed(1);
}

function signalTone(value: number, warning: number, danger: number) {
  if (value >= danger) return "bg-[var(--danger-soft)] text-[var(--danger)]";
  if (value >= warning) return "bg-[var(--warning-soft)] text-[var(--warning)]";
  return "bg-[var(--success-soft)] text-[var(--success)]";
}

export default function QualityLearningComparisonPage() {
  const [days, setDays] = useState(90);
  const [quality, setQuality] = useState<QualitySignal[]>([]);
  const [scores, setScores] = useState<QualityScore[]>([]);
  const [training, setTraining] = useState<TrainingSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [qualityRows, scoreRows, trainingRows] = await Promise.all([
        api<QualitySignal[]>(withQuery("/quality/analytics/branch-signals", { days })),
        api<QualityScore[]>("/quality/analytics/branch-scores"),
        api<TrainingSignal[]>(withQuery("/training/analytics/branch-signals", { days })),
      ]);
      setQuality(qualityRows ?? []);
      setScores(scoreRows ?? []);
      setTraining(trainingRows ?? []);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Şube karşılaştırma verileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo<Row[]>(() => {
    const map = new Map<string, Row>();
    for (const item of quality) map.set(item.branchId, { branchId: item.branchId, branchName: item.branchName, quality: item });
    for (const item of scores) {
      const current = map.get(item.branchId) ?? { branchId: item.branchId, branchName: item.branchName };
      map.set(item.branchId, { ...current, branchName: current.branchName || item.branchName, branchCode: item.branchCode, score: item });
    }
    for (const item of training) {
      const current = map.get(item.branchId) ?? { branchId: item.branchId, branchName: item.branchName };
      map.set(item.branchId, { ...current, branchName: current.branchName || item.branchName, branchCode: current.branchCode || item.branchCode, training: item });
    }
    return Array.from(map.values()).sort((a, b) => {
      const qualityA = a.score?.finalScore ?? Number.NEGATIVE_INFINITY;
      const qualityB = b.score?.finalScore ?? Number.NEGATIVE_INFINITY;
      if (qualityA !== qualityB) return qualityB - qualityA;
      return a.branchName.localeCompare(b.branchName, "tr-TR");
    });
  }, [quality, scores, training]);

  const summary = useMemo(() => {
    const qualityScores = rows.map((item) => item.score?.finalScore).filter((value): value is number => value != null).map(Number);
    const completionRates = rows.map((item) => item.training?.completionRate).filter((value): value is number => value != null).map(Number);
    return {
      branches: rows.length,
      averageQuality: qualityScores.length ? Math.round((qualityScores.reduce((sum, value) => sum + value, 0) / qualityScores.length) * 10) / 10 : null,
      averageCompletion: completionRates.length ? Math.round((completionRates.reduce((sum, value) => sum + value, 0) / completionRates.length) * 10) / 10 : null,
      highRiskFindings: rows.reduce((sum, item) => sum + Number(item.quality?.highRiskFindings ?? 0), 0),
      gaps: rows.reduce((sum, item) => sum + Number(item.training?.gaps ?? 0), 0),
    };
  }, [rows]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--muted-soft)]">Çok Şubeli Kalite & Gelişim</p>
          <h1 className="mt-1 text-[32px] font-semibold tracking-[-0.045em] text-[var(--ink)]">Branch Comparison Cockpit</h1>
          <p className="mt-2 max-w-[880px] text-[13px] leading-6 text-[var(--muted)]">
            Şubelerin kalite, Training Compliance, eğitim tamamlama, gecikme ve yetkinlik açığı sinyallerini yan yana inceleyin. Değerler mevcut domain metriklerinden gelir; ek bir gizli karma skor üretilmez.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[30, 90, 180, 365].map((value) => (
            <Button key={value} variant={days === value ? "primary" : "secondary"} onClick={() => setDays(value)} disabled={loading}>
              {value} gün
            </Button>
          ))}
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>Yenile</Button>
        </div>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      {loading && !rows.length ? (
        <div className="flex min-h-[380px] items-center justify-center"><Spinner label="Şube karşılaştırması hazırlanıyor..." /></div>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <FinanceMetric label="Karşılaştırılan Şube" value={summary.branches} detail={`${days} günlük operasyon penceresi`} tone="info" />
            <FinanceMetric label="Ortalama Quality Score" value={summary.averageQuality == null ? "—" : summary.averageQuality} detail="Persisted son Branch Quality Score" tone="info" />
            <FinanceMetric label="Ortalama Eğitim Tamamlama" value={summary.averageCompletion == null ? "—" : `%${summary.averageCompletion}`} detail={`${summary.highRiskFindings} yüksek/kritik bulgu`} tone={summary.highRiskFindings ? "warning" : "success"} />
            <FinanceMetric label="Toplam Yetkinlik Açığı" value={summary.gaps} detail="Aktif competency profile gereksinimleri" tone={summary.gaps ? "warning" : "success"} />
          </section>

          <FinancePanel title="Şube Karşılaştırması" description="Quality ve Training bounded context'lerinin branch-level sinyalleri aynı satırda birleştirilir.">
            {rows.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px] text-left">
                  <thead>
                    <tr className="border-b border-[var(--line)] text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-soft)]">
                      <th className="px-4 py-3">Şube</th>
                      <th className="px-4 py-3">Quality Score</th>
                      <th className="px-4 py-3">Training Compliance</th>
                      <th className="px-4 py-3">Inspection</th>
                      <th className="px-4 py-3">Riskli Bulgu</th>
                      <th className="px-4 py-3">Eğitim Tamamlama</th>
                      <th className="px-4 py-3">Gecikmiş Eğitim</th>
                      <th className="px-4 py-3">Competency Gap</th>
                      <th className="px-4 py-3">Gecikmiş Review</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {rows.map((row) => {
                      const highRisk = Number(row.quality?.highRiskFindings ?? 0);
                      const overdueTraining = Number(row.training?.overdueAssignments ?? 0);
                      const gaps = Number(row.training?.gaps ?? 0);
                      const overdueReviews = Number(row.training?.overdueReviews ?? 0);
                      return (
                        <tr key={row.branchId} className="text-[11px] text-[var(--muted)]">
                          <td className="px-4 py-4">
                            <p className="font-semibold text-[var(--ink)]">{row.branchName}</p>
                            <p className="mt-1 text-[9px] text-[var(--muted-soft)]">{row.branchCode || row.branchId}</p>
                          </td>
                          <td className="px-4 py-4 font-semibold text-[var(--ink)]">{formatScore(row.score?.finalScore)}</td>
                          <td className="px-4 py-4">{row.score?.trainingCompliance == null ? "—" : `%${formatScore(row.score.trainingCompliance)}`}</td>
                          <td className="px-4 py-4">{formatScore(row.quality?.averageInspectionScore)}</td>
                          <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${signalTone(highRisk, 1, 3)}`}>{highRisk}</span></td>
                          <td className="px-4 py-4">{row.training?.completionRate == null ? "—" : `%${formatScore(row.training.completionRate)}`}</td>
                          <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${signalTone(overdueTraining, 1, 3)}`}>{overdueTraining}</span></td>
                          <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${signalTone(gaps, 1, 5)}`}>{gaps}</span></td>
                          <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${signalTone(overdueReviews, 1, 3)}`}>{overdueReviews}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <FinanceEmpty title="Karşılaştırılacak şube verisi yok" description="Aktif şubelerde Quality ve Training sinyalleri oluştuğunda karşılaştırma burada görünür." />}
          </FinancePanel>
        </>
      )}
    </div>
  );
}
