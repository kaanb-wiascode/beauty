"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { FinanceEmpty, FinanceMetric, FinancePanel } from "@/components/finance-view";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";

type Overview = {
  windowDays: number;
  assignments: {
    total: number;
    completed: number;
    open: number;
    expired: number;
    overdue: number;
    completionRate: number | null;
  };
  reviews: { open: number; overdue: number; completed: number };
  competency: {
    requirements: number;
    gaps: number;
    profiledStaff: number;
    averageScore: number | null;
  };
  complianceTrend: Array<{
    periodStart: string;
    periodEnd: string;
    trainingCompliance: number | null;
    qualityScore: number | null;
    sourceCount: number;
  }>;
};

type StaffRisk = {
  staffId: string;
  firstName: string;
  lastName: string;
  branchId: string;
  requirements: number;
  gaps: number;
  openAssignments: number;
  overdueAssignments: number;
  openReviews: number;
  overdueReviews: number;
  riskScore: number;
};

function shortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("tr-TR", { month: "short", year: "numeric" }).format(date);
}

export default function TrainingAnalyticsPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [staffRisk, setStaffRisk] = useState<StaffRisk[]>([]);
  const [days, setDays] = useState(90);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [summary, risk] = await Promise.all([
        api<Overview>(withQuery("/training/analytics/overview", { days })),
        api<StaffRisk[]>(withQuery("/training/analytics/staff-risk", { limit: 25 })),
      ]);
      setOverview(summary);
      setStaffRisk(risk ?? []);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Learning analytics verileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !overview) {
    return <div className="flex min-h-[420px] items-center justify-center"><Spinner label="Learning Analytics hazırlanıyor..." /></div>;
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--muted-soft)]">Eğitim & Yetkinlik Analitiği</p>
          <h1 className="mt-1 text-[32px] font-semibold tracking-[-0.045em] text-[var(--ink)]">Learning Analytics</h1>
          <p className="mt-2 max-w-[820px] text-[13px] leading-6 text-[var(--muted)]">
            Eğitim tamamlama, gecikme, yetkinlik açığı, recurring review yükü ve Quality Score içindeki Training Compliance sinyalini tek yönetici görünümünde izleyin.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[30, 90, 180, 365].map((value) => (
            <Button key={value} variant={days === value ? "primary" : "secondary"} onClick={() => setDays(value)} disabled={loading}>
              {value} gün
            </Button>
          ))}
        </div>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      {overview ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <FinanceMetric
              label="Tamamlama Oranı"
              value={overview.assignments.completionRate == null ? "—" : `%${overview.assignments.completionRate}`}
              detail={`${overview.assignments.completed}/${overview.assignments.total} atama tamamlandı`}
              tone="success"
            />
            <FinanceMetric
              label="Gecikmiş Eğitim"
              value={overview.assignments.overdue}
              detail={`${overview.assignments.open} açık atama`}
              tone={overview.assignments.overdue ? "danger" : "success"}
            />
            <FinanceMetric
              label="Yetkinlik Açığı"
              value={overview.competency.gaps}
              detail={`${overview.competency.requirements} aktif gereksinim · ${overview.competency.profiledStaff} personel`}
              tone={overview.competency.gaps ? "warning" : "success"}
            />
            <FinanceMetric
              label="Gecikmiş Review"
              value={overview.reviews.overdue}
              detail={`${overview.reviews.open} açık review`}
              tone={overview.reviews.overdue ? "danger" : "neutral"}
            />
          </section>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
            <FinancePanel title="Training Compliance Trendi" description="Branch Quality Score run'larında kullanılan gerçek Training Compliance boyutu.">
              {overview.complianceTrend.length ? (
                <div className="space-y-3">
                  {overview.complianceTrend.map((item) => {
                    const compliance = Number(item.trainingCompliance ?? 0);
                    return (
                      <div key={`${item.periodStart}-${item.periodEnd}`} className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-[11px] font-semibold text-[var(--ink)]">{shortDate(item.periodStart)}</p>
                            <p className="mt-1 text-[10px] text-[var(--muted-soft)]">{item.sourceCount} vadeli eğitim ataması</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[16px] font-semibold text-[var(--ink)]">%{compliance}</p>
                            <p className="text-[10px] text-[var(--muted-soft)]">Quality {item.qualityScore ?? "—"}</p>
                          </div>
                        </div>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
                          <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(Math.max(compliance, 0), 100)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : <FinanceEmpty title="Compliance trendi oluşmadı" description="Quality Score run'larında Training Compliance boyutu hesaplandığında dönemsel trend burada görünür." />}
            </FinancePanel>

            <FinancePanel title="Yetkinlik Sağlığı" description="Aktif competency profile gereksinimleri ve son assessment kanıtları.">
              <div className="space-y-4">
                <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-soft)]">Ortalama Yetkinlik Skoru</p>
                  <p className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-[var(--ink)]">{overview.competency.averageScore ?? "—"}</p>
                  <p className="mt-2 text-[11px] text-[var(--muted)]">Aktif profillerdeki son assessment skorlarının ortalaması.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-[16px] bg-[var(--surface-2)] p-4">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-soft)]">Gap</p>
                    <p className="mt-1 text-[20px] font-semibold text-[var(--ink)]">{overview.competency.gaps}</p>
                  </div>
                  <div className="rounded-[16px] bg-[var(--surface-2)] p-4">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-soft)]">Tamamlanan Review</p>
                    <p className="mt-1 text-[20px] font-semibold text-[var(--ink)]">{overview.reviews.completed}</p>
                  </div>
                </div>
              </div>
            </FinancePanel>
          </div>

          <FinancePanel title="Personel Gelişim Risk Sıralaması" description="Yetkinlik gap, gecikmiş eğitim ve gecikmiş review sinyallerinin açıklanabilir operasyonel sıralaması.">
            {staffRisk.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left">
                  <thead>
                    <tr className="border-b border-[var(--line)] text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-soft)]">
                      <th className="px-4 py-3">Personel</th><th className="px-4 py-3">Gap</th><th className="px-4 py-3">Açık Eğitim</th><th className="px-4 py-3">Gecikmiş Eğitim</th><th className="px-4 py-3">Gecikmiş Review</th><th className="px-4 py-3 text-right">Risk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {staffRisk.map((item) => (
                      <tr key={item.staffId} className="text-[11px] text-[var(--muted)]">
                        <td className="px-4 py-4"><Link className="font-semibold text-[var(--ink)] hover:text-[var(--accent)]" href={`/training/staff/${item.staffId}`}>{item.firstName} {item.lastName}</Link></td>
                        <td className="px-4 py-4">{item.gaps}/{item.requirements}</td>
                        <td className="px-4 py-4">{item.openAssignments}</td>
                        <td className="px-4 py-4">{item.overdueAssignments}</td>
                        <td className="px-4 py-4">{item.overdueReviews}</td>
                        <td className="px-4 py-4 text-right font-semibold text-[var(--ink)]">{item.riskScore}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <FinanceEmpty title="Risk sıralaması yok" description="Aktif competency profile atamaları oluştuğunda personel gelişim sinyalleri burada sıralanır." />}
          </FinancePanel>
        </>
      ) : null}
    </div>
  );
}
