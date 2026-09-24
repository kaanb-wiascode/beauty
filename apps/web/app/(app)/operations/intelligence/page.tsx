"use client";

import { useEffect, useState } from "react";

import { Alert, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasActiveBranch } from "@/lib/auth";
import { userLabel } from "@/lib/user-language";

type Risk = { score: number; level: "LOW" | "MEDIUM" | "HIGH"; reasons: string[]; suggestedAction: string };
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
type ManagerInsight = { code: string; severity: "INFO" | "WARNING" | "HIGH"; title: string; explanation: string; suggestedAction: string };
type Overview = {
  horizonHours: number;
  model: string;
  deterministicSchedulingRemainsAuthoritative: boolean;
  appointments: AppointmentInsight[];
  managerInsights: ManagerInsight[];
};

export default function OperationsIntelligencePage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasActiveBranch()) {
      setError("Operasyon zekâsı için önce aktif bir şube seçin.");
      setLoading(false);
      return;
    }
    api<Overview>("/operations/intelligence?hours=24")
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Operasyon zekâsı yüklenemedi."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="mx-auto max-w-[1420px] py-10"><Spinner label="Operasyon sinyalleri analiz ediliyor..." /></div>;

  return (
    <div className="mx-auto max-w-[1420px] space-y-5 pb-10">
      <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-soft)]">Operasyon içgörüleri</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">Yönetici İçgörüleri</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">Yaklaşan randevular için gelmeme ve gecikme risklerini görünür hale getirir. Bu göstergeler yalnızca yönetime destek olur; planlama, güvenlik, yetkinlik ve izin kuralları sistemdeki mevcut kurallara göre uygulanmaya devam eder.</p>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      {data ? (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5"><p className="text-xs text-[var(--muted)]">İncelenen pencere</p><p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{data.horizonHours} saat</p></div>
            <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5"><p className="text-xs text-[var(--muted)]">Yaklaşan randevu</p><p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{data.appointments.length}</p></div>
            <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5"><p className="text-xs text-[var(--muted)]">Analiz</p><p className="mt-2 text-sm font-semibold text-[var(--ink)]">Operasyon risk sinyalleri</p></div>
          </section>

          <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-[var(--ink)]">Yönetici içgörüleri</h2>
            <div className="mt-4 space-y-3">
              {data.managerInsights.length ? data.managerInsights.map((item) => (
                <div key={item.code} className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)] p-4">
                  <div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-[var(--line)] px-2 py-1 text-[10px] font-semibold">{userLabel(item.severity)}</span><p className="text-sm font-semibold text-[var(--ink)]">{item.title}</p></div>
                  <p className="mt-2 text-xs text-[var(--muted)]">{item.explanation}</p>
                  <p className="mt-2 text-xs font-medium text-[var(--ink)]">Aksiyon: {item.suggestedAction}</p>
                </div>
              )) : <p className="text-sm text-[var(--muted)]">Yaklaşan pencere için belirgin yönetici uyarısı yok.</p>}
            </div>
          </section>

          <section className="overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--surface)] shadow-sm">
            <div className="border-b border-[var(--line)] px-6 py-4"><h2 className="text-sm font-semibold text-[var(--ink)]">Randevu Risk Sinyalleri</h2></div>
            {data.appointments.length ? <div className="divide-y divide-[var(--line)]">{data.appointments.map((item) => (
              <div key={item.appointmentId} className="grid gap-4 px-6 py-4 lg:grid-cols-[1.2fr_1fr_1fr]">
                <div><p className="text-sm font-semibold text-[var(--ink)]">{item.customerName} · {item.serviceName}</p><p className="mt-1 text-xs text-[var(--muted)]">{new Date(item.startAt).toLocaleString("tr-TR")} · {item.staffName} · Onay: {item.confirmationStatus ? userLabel(item.confirmationStatus) : "Yok"}</p></div>
                <RiskCell label="No-show riski" risk={item.noShowRisk} />
                <RiskCell label="Gecikme riski" risk={item.delayRisk} />
              </div>
            ))}</div> : <div className="px-6 py-10 text-center text-sm text-[var(--muted)]">Önümüzdeki 24 saat için randevu bulunamadı.</div>}
          </section>
        </>
      ) : null}
    </div>
  );
}

function RiskCell({ label, risk }: { label: string; risk: Risk }) {
  return <div><div className="flex items-center gap-2"><p className="text-xs font-semibold text-[var(--ink)]">{label}</p><span className="rounded-full bg-[var(--surface-2)] px-2 py-1 text-[10px] font-semibold">{risk.level} · {risk.score}</span></div>{risk.reasons.length ? <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-[var(--muted)]">{risk.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : <p className="mt-2 text-xs text-[var(--muted)]">Belirgin risk sinyali yok.</p>}<p className="mt-2 text-xs font-medium text-[var(--ink)]">{risk.suggestedAction}</p></div>;
}
