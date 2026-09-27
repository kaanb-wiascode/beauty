"use client";

import { useEffect, useState } from "react";

import { CardInfo } from "@/components/card-info";
import { Alert, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasActiveBranch } from "@/lib/auth";
import { getCardHelp } from "@/lib/card-help";
import { userLabel } from "@/lib/user-language";

type Risk = {
  score: number;
  level: "LOW" | "MEDIUM" | "HIGH";
  reasons: string[];
  suggestedAction: string;
};

type AppointmentInsight = {
  appointmentId: string;
  customerName: string;
  staffName: string;
  serviceName: string;
  startAt: string;
  confirmationStatus: string | null;
  noShowRisk: Risk;
  delayRisk: Risk;
};

type ManagerInsight = {
  code: string;
  severity: "INFO" | "WARNING" | "HIGH";
  title: string;
  explanation: string;
  suggestedAction: string;
};

type Intelligence = {
  horizonHours: number;
  appointments: AppointmentInsight[];
  managerInsights: ManagerInsight[];
};

type Recommendation = {
  code: string;
  priority?: "INFO" | "MEDIUM" | "HIGH";
  title: string;
  explanation?: string;
  suggestedAction: string;
};

type DemandSlot = {
  serviceId: string;
  serviceName: string;
  isoDow: number;
  hourOfDay: number;
  expectedPerWeek: number;
  upcomingAppointments: number;
  demandGap: number;
  recommendation: string;
};

type Anomaly = {
  code: string;
  severity: "INFO" | "WARNING" | "HIGH";
  title: string;
  explanation: string;
  suggestedAction: string;
};

type Optimization = {
  automaticSchedulingEnabled: boolean;
  capacityRecommendations: Recommendation[];
  staffRecommendations: Recommendation[];
  demandAwareSlots: DemandSlot[];
  anomalies: Anomaly[];
  evidence: {
    activeStaff: number;
    staffUtilizationPercent: number;
    capacityUtilizationPercent: number;
  };
};

const DAYS = ["", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

export default function OperationsInsightsPage() {
  const [intelligence, setIntelligence] = useState<Intelligence | null>(null);
  const [optimization, setOptimization] = useState<Optimization | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasActiveBranch()) {
      setError("İçgörü ve öneriler için önce aktif bir şube seçin.");
      setLoading(false);
      return;
    }

    Promise.all([
      api<Intelligence>("/operations/intelligence?hours=24"),
      api<Optimization>("/operations/optimization?hours=24"),
    ])
      .then(([insights, recommendations]) => {
        setIntelligence(insights);
        setOptimization(recommendations);
      })
      .catch((err) =>
        setError(
          err instanceof ApiError
            ? err.message
            : "Operasyon içgörüleri ve önerileri yüklenemedi.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1420px] py-10">
        <Spinner label="Operasyon verileri analiz ediliyor..." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1420px] space-y-5 pb-10">
      <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-soft)]">
          Analiz ve planlama
        </p>
        <div className="mt-2 flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
            Operasyon İçgörüleri ve Önerileri
          </h1>
          <CardInfo help={getCardHelp("Operasyon İçgörüleri ve Önerileri")} />
        </div>
        <p className="mt-2 max-w-4xl text-sm text-[var(--muted)]">
          Yaklaşan randevu risklerini, personel ve kaynak kullanımını, kapasite
          ihtiyaçlarını ve talep eğilimlerini tek görünümde değerlendirin.
          Öneriler karar desteğidir; mevcut randevu, yetkinlik, izin ve kaynak
          kuralları uygulanmaya devam eder.
        </p>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      {intelligence && optimization ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Yaklaşan Randevu"
              value={String(intelligence.appointments.length)}
            />
            <Metric
              label="Aktif Personel"
              value={String(optimization.evidence.activeStaff)}
            />
            <Metric
              label="Personel Kullanımı"
              value={`%${optimization.evidence.staffUtilizationPercent}`}
            />
            <Metric
              label="Kaynak Kullanımı"
              value={`%${optimization.evidence.capacityUtilizationPercent}`}
            />
          </section>

          <section className="grid gap-5 xl:grid-cols-2">
            <Panel
              title="Yönetici İçgörüleri"
              items={intelligence.managerInsights}
              empty="Yaklaşan dönem için belirgin bir yönetici uyarısı bulunmuyor."
            />
            <Panel
              title="Kapasite Önerileri"
              items={optimization.capacityRecommendations}
              empty="Kritik bir kapasite önerisi bulunmuyor."
            />
            <Panel
              title="Personel Yük Dengeleme"
              items={optimization.staffRecommendations}
              empty="Belirgin bir personel yük dengesizliği bulunmuyor."
            />
            <Panel
              title="Olağandışı Durumlar"
              items={optimization.anomalies}
              empty="Belirgin olağandışı durum sinyali bulunmuyor."
            />
          </section>

          <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-[var(--ink)]">
                  Talebe Göre Uygun Saat Önerileri
                </h2>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Geçmiş talep ile önümüzdeki yedi günün mevcut randevuları
                  karşılaştırılır.
                </p>
              </div>
              <CardInfo help={getCardHelp("Talebe Göre Uygun Saat Önerileri")} />
            </div>
            <div className="mt-4 space-y-3">
              {optimization.demandAwareSlots.length ? (
                optimization.demandAwareSlots.map((item) => (
                  <article
                    key={`${item.serviceId}-${item.isoDow}-${item.hourOfDay}`}
                    className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)] p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[var(--ink)]">
                        {item.serviceName} · {DAYS[item.isoDow]}{" "}
                        {String(item.hourOfDay).padStart(2, "0")}:00
                      </p>
                      <span className="text-xs font-semibold text-[var(--ink)]">
                        Talep farkı {item.demandGap.toFixed(1)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      Haftalık beklenen: {item.expectedPerWeek} · Önümüzdeki 7
                      gün randevu: {item.upcomingAppointments}
                    </p>
                    <p className="mt-2 text-xs font-medium text-[var(--ink)]">
                      {item.recommendation}
                    </p>
                  </article>
                ))
              ) : (
                <p className="text-sm text-[var(--muted)]">
                  Belirgin bir uygun saat fırsatı bulunmuyor.
                </p>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--surface)] shadow-sm">
            <div className="border-b border-[var(--line)] px-6 py-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-sm font-semibold text-[var(--ink)]">
                  Randevu Risk Sinyalleri
                </h2>
                <CardInfo help={getCardHelp("Randevu Risk Sinyalleri")} />
              </div>
            </div>
            {intelligence.appointments.length ? (
              <div className="divide-y divide-[var(--line)]">
                {intelligence.appointments.map((item) => (
                  <div
                    key={item.appointmentId}
                    className="grid gap-4 px-6 py-4 lg:grid-cols-[1.2fr_1fr_1fr]"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[var(--ink)]">
                        {item.customerName} · {item.serviceName}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {new Date(item.startAt).toLocaleString("tr-TR")} ·{" "}
                        {item.staffName} · Onay:{" "}
                        {item.confirmationStatus
                          ? userLabel(item.confirmationStatus)
                          : "Yok"}
                      </p>
                    </div>
                    <RiskCell label="Gelmeme Riski" risk={item.noShowRisk} />
                    <RiskCell label="Gecikme Riski" risk={item.delayRisk} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-6 py-10 text-center text-sm text-[var(--muted)]">
                Önümüzdeki 24 saat için randevu bulunamadı.
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-[var(--muted)]">{label}</p>
        <CardInfo help={getCardHelp(label)} />
      </div>
      <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{value}</p>
    </div>
  );
}

function Panel({
  title,
  items,
  empty,
}: {
  title: string;
  items: Array<ManagerInsight | Recommendation | Anomaly>;
  empty: string;
}) {
  return (
    <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-[var(--ink)]">{title}</h2>
        <CardInfo help={getCardHelp(title)} />
      </div>
      <div className="mt-4 space-y-3">
        {items.length ? (
          items.map((item) => {
            const level =
              "severity" in item ? item.severity : "priority" in item ? item.priority : undefined;
            return (
              <article
                key={item.code}
                className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)] p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {level ? (
                    <span className="rounded-full border border-[var(--line)] px-2 py-1 text-[10px] font-semibold">
                      {userLabel(level)}
                    </span>
                  ) : null}
                  <p className="text-sm font-semibold text-[var(--ink)]">
                    {item.title}
                  </p>
                </div>
                {"explanation" in item && item.explanation ? (
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    {item.explanation}
                  </p>
                ) : null}
                <p className="mt-2 text-xs font-medium text-[var(--ink)]">
                  Öneri: {item.suggestedAction}
                </p>
              </article>
            );
          })
        ) : (
          <p className="text-sm text-[var(--muted)]">{empty}</p>
        )}
      </div>
    </section>
  );
}

function RiskCell({ label, risk }: { label: string; risk: Risk }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold text-[var(--ink)]">{label}</p>
        <span className="rounded-full bg-[var(--surface-2)] px-2 py-1 text-[10px] font-semibold">
          {userLabel(risk.level)} · {risk.score}
        </span>
      </div>
      {risk.reasons.length ? (
        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-[var(--muted)]">
          {risk.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-[var(--muted)]">
          Belirgin risk sinyali yok.
        </p>
      )}
      <p className="mt-2 text-xs font-medium text-[var(--ink)]">
        {risk.suggestedAction}
      </p>
    </div>
  );
}
