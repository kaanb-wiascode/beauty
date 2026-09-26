"use client";

import { useEffect, useState } from "react";
import { CardInfo } from "@/components/card-info";

import { Alert, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { getCardHelp } from "@/lib/card-help";
import { hasActiveBranch } from "@/lib/auth";

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
  horizonHours: number;
  model: string;
  automaticSchedulingEnabled: boolean;
  capacityRecommendations: Recommendation[];
  staffRecommendations: Recommendation[];
  demandAwareSlots: DemandSlot[];
  anomalies: Anomaly[];
  evidence: {
    utilizationShiftAware: boolean;
    activeStaff: number;
    staffUtilizationPercent: number;
    capacityUtilizationPercent: number;
  };
};

const DAYS = ["", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

export default function OperationsOptimizationPage() {
  const [data, setData] = useState<Optimization | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasActiveBranch()) {
      setError("Optimizasyon önerileri için önce aktif bir şube seçin.");
      setLoading(false);
      return;
    }
    api<Optimization>("/operations/optimization?hours=24")
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Optimizasyon önerileri yüklenemedi."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="mx-auto max-w-[1420px] py-10"><Spinner label="Kapasite ve talep sinyalleri analiz ediliyor..." /></div>;
  }

  return (
    <div className="mx-auto max-w-[1420px] space-y-5 pb-10">
      <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-soft)]">Advanced Operations Intelligence</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">Optimizasyon Önerileri</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">Kapasite, personel yükü ve geçmiş talep sinyallerinden açıklanabilir öneriler üretir. Otomatik scheduling kapalıdır; tüm booking kararları conflict/izin/yetkinlik/resource kurallarından geçmeye devam eder.</p>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      {data ? <>
        <section className="grid gap-4 md:grid-cols-4">
          <Metric label="Aktif personel" value={String(data.evidence.activeStaff)} />
          <Metric label="Personel kullanım" value={`%${data.evidence.staffUtilizationPercent}`} />
          <Metric label="Kaynak kullanım" value={`%${data.evidence.capacityUtilizationPercent}`} />
          <Metric label="Otomatik planlama" value={data.automaticSchedulingEnabled ? "Açık" : "Kapalı"} />
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <Panel title="Kapasite Önerileri" items={data.capacityRecommendations} empty="Kritik kapasite önerisi yok." />
          <Panel title="Personel Yük Dengeleme" items={data.staffRecommendations} empty="Belirgin yük dengesizliği yok." />
        </section>

        <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-[var(--ink)]">Demand-aware Slot Adayları</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">Son 8 haftanın aynı gün/saat hizmet talebi ile önümüzdeki 7 günlük mevcut rezervasyonları karşılaştırır.</p>
          <div className="mt-4 space-y-3">
            {data.demandAwareSlots.length ? data.demandAwareSlots.map((item) => (
              <div key={`${item.serviceId}-${item.isoDow}-${item.hourOfDay}`} className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--ink)]">{item.serviceName} · {DAYS[item.isoDow]} {String(item.hourOfDay).padStart(2, "0")}:00</p>
                  <span className="text-xs font-semibold text-[var(--ink)]">Talep farkı {item.demandGap.toFixed(1)}</span>
                </div>
                <p className="mt-2 text-xs text-[var(--muted)]">Beklenen/hafta: {item.expectedPerWeek} · Gelecek 7 gün rezervasyon: {item.upcomingAppointments}</p>
                <p className="mt-2 text-xs font-medium text-[var(--ink)]">{item.recommendation}</p>
              </div>
            )) : <p className="text-sm text-[var(--muted)]">Belirgin demand-aware slot fırsatı yok.</p>}
          </div>
        </section>

        <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-[var(--ink)]">Anomali Sinyalleri</h2>
          <div className="mt-4 space-y-3">
            {data.anomalies.length ? data.anomalies.map((item) => (
              <div key={item.code} className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)] p-4">
                <div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-[var(--line)] px-2 py-1 text-[10px] font-semibold">{item.severity}</span><p className="text-sm font-semibold text-[var(--ink)]">{item.title}</p></div>
                <p className="mt-2 text-xs text-[var(--muted)]">{item.explanation}</p>
                <p className="mt-2 text-xs font-medium text-[var(--ink)]">Aksiyon: {item.suggestedAction}</p>
              </div>
            )) : <p className="text-sm text-[var(--muted)]">Belirgin anomali sinyali yok.</p>}
          </div>
        </section>
      </> : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5"><div className="flex items-start justify-between gap-3"><p className="text-xs text-[var(--muted)]">{label}</p><CardInfo help={getCardHelp(label)} /></div><p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{value}</p></div>;
}

function Panel({ title, items, empty }: { title: string; items: Recommendation[]; empty: string }) {
  return <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm"><div className="flex items-start justify-between gap-3"><h2 className="text-sm font-semibold text-[var(--ink)]">{title}</h2><CardInfo help={getCardHelp(title, "Operasyon verilerinden üretilen açıklanabilir önerileri gösterir.")} /></div><div className="mt-4 space-y-3">{items.length ? items.map((item) => <div key={item.code} className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)] p-4"><div className="flex items-center gap-2">{item.priority ? <span className="rounded-full border border-[var(--line)] px-2 py-1 text-[10px] font-semibold">{item.priority}</span> : null}<p className="text-sm font-semibold text-[var(--ink)]">{item.title}</p></div>{item.explanation ? <p className="mt-2 text-xs text-[var(--muted)]">{item.explanation}</p> : null}<p className="mt-2 text-xs font-medium text-[var(--ink)]">Aksiyon: {item.suggestedAction}</p></div>) : <p className="text-sm text-[var(--muted)]">{empty}</p>}</div></section>;
}
