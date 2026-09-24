"use client";

import { useEffect, useMemo, useState } from "react";

import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { getCardHelp } from "@/lib/card-help";
import { hasActiveBranch } from "@/lib/auth";

type AlertSeverity = "INFO" | "WARNING" | "HIGH" | "CRITICAL";
type OperationsAlert = {
  id: string;
  type: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  sourceType: string;
  sourceId: string;
  startedAt: string;
  ageMinutes: number;
  suggestedAction: string;
  customerId: string | null;
  customerName: string | null;
  staffId: string | null;
  staffName: string | null;
  resourceId: string | null;
  resourceName: string | null;
};
type AlertResponse = {
  generatedAt: string;
  thresholds: { waitingMinutes: number; checkoutMinutes: number };
  counts: Record<AlertSeverity, number>;
  alerts: OperationsAlert[];
};

const severityLabel: Record<AlertSeverity, string> = {
  INFO: "Bilgi",
  WARNING: "Uyarı",
  HIGH: "Yüksek",
  CRITICAL: "Kritik",
};

const typeLabel: Record<string, string> = {
  WAITING_TOO_LONG: "Bekleme",
  SERVICE_OVERRUN: "Süre Aşımı",
  CHECKOUT_STALE: "Checkout",
  ROOM_ATTENTION: "Oda",
  DEVICE_UNAVAILABLE: "Cihaz",
  RESOURCE_APPOINTMENT_IMPACT: "Kaynak Çakışması",
  UPCOMING_STOCK_SHORTAGE: "Stok Riski",
  ACTIVE_INCIDENT: "Incident",
};

function ageLabel(minutes: number) {
  if (minutes < 60) return `${minutes} dk`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} sa ${rest} dk` : `${hours} sa`;
}

export default function OperationsAlertsPage() {
  const [data, setData] = useState<AlertResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [severity, setSeverity] = useState<AlertSeverity | "ALL">("ALL");

  async function load() {
    if (!hasActiveBranch()) {
      setData(null);
      setError("Canlı uyarılar için önce aktif bir şube seçin.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setData(await api<AlertResponse>("/operations/alerts"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Canlı operasyon uyarıları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const visibleAlerts = useMemo(
    () => data?.alerts.filter((item) => severity === "ALL" || item.severity === severity) ?? [],
    [data, severity],
  );

  if (loading && !data) {
    return <div className="mx-auto max-w-[1420px] py-10"><Spinner label="Canlı uyarılar hazırlanıyor..." /></div>;
  }

  return (
    <div className="mx-auto max-w-[1420px] space-y-5 pb-10">
      <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-soft)]">Live Exceptions</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">Canlı Uyarılar & İstisnalar</h1>
            <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">Visit, randevu, oda/cihaz, incident ve Inventory verilerinden türetilen anlık operasyon sinyalleri. Uyarılar ayrı bir doğruluk kaynağı değildir; her kart ilgili business kaydının mevcut durumunu açıklar.</p>
          </div>
          <Button variant="secondary" disabled={loading} onClick={() => void load()}>{loading ? "Yenileniyor..." : "Şimdi Yenile"}</Button>
        </div>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      {data ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(["CRITICAL", "HIGH", "WARNING", "INFO"] as AlertSeverity[]).map((level) => (
            <div key={level} className="relative">
              <button
                type="button"
                onClick={() => setSeverity((current) => current === level ? "ALL" : level)}
                className="w-full rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 text-left shadow-sm transition hover:bg-[var(--surface-2)]"
              >
                <p className="pr-7 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-soft)]">{severityLabel[level]}</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)]">{data.counts[level]}</p>
              </button>
              <div className="absolute right-4 top-4 z-20">
                <CardInfo help={getCardHelp(severityLabel[level], "Bu önem seviyesindeki aktif operasyon uyarılarının sayısını gösterir.")} />
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <section className="overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--surface)] shadow-sm">
        <div className="flex flex-col gap-2 border-b border-[var(--line)] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-sm font-semibold text-[var(--ink)]">Aktif İstisnalar</h2><p className="mt-1 text-xs text-[var(--muted)]">{severity === "ALL" ? "Tüm önem seviyeleri" : `${severityLabel[severity]} filtresi`} · 60 saniyede otomatik yenilenir</p></div>
          {severity !== "ALL" ? <button type="button" className="text-xs font-semibold text-[var(--accent)]" onClick={() => setSeverity("ALL")}>Filtreyi temizle</button> : null}
        </div>
        {visibleAlerts.length ? (
          <div className="divide-y divide-[var(--line)]">
            {visibleAlerts.map((item) => (
              <article key={item.id} className="px-6 py-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[var(--surface-2)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{severityLabel[item.severity]}</span>
                      <span className="text-xs font-medium text-[var(--muted)]">{typeLabel[item.type] ?? item.type}</span>
                      <span className="text-xs text-[var(--muted-soft)]">{ageLabel(item.ageMinutes)}</span>
                    </div>
                    <h3 className="mt-2 text-sm font-semibold text-[var(--ink)]">{item.title}</h3>
                    <p className="mt-1 text-sm text-[var(--muted)]">{item.message}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted-soft)]">
                      {item.customerName ? <span>Müşteri: {item.customerName}</span> : null}
                      {item.staffName ? <span>Personel: {item.staffName}</span> : null}
                      {item.resourceName ? <span>Kaynak: {item.resourceName}</span> : null}
                      <span>Kaynak: {item.sourceType} · {item.sourceId.slice(0, 8)}</span>
                    </div>
                    <p className="mt-3 rounded-[12px] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--ink)]"><span className="font-semibold">Önerilen aksiyon:</span> {item.suggestedAction}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="px-6 py-12 text-center"><p className="text-sm font-medium text-[var(--ink)]">Aktif istisna yok</p><p className="mt-1 text-xs text-[var(--muted)]">Mevcut filtre ve eşiklere göre müdahale gerektiren operasyon sinyali bulunmuyor.</p></div>
        )}
      </section>
    </div>
  );
}
