"use client";

import { useEffect, useState } from "react";

import { Alert, Button, Spinner, TextInput } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasActiveBranch } from "@/lib/auth";

type StaffMetric = {
  staffId: string;
  staffName: string;
  capacityMinutes: number;
  bookedMinutes: number;
  availableMinutes: number;
  utilizationPercent: number;
  appointmentCount: number;
};

type ServiceMetric = {
  serviceId: string;
  serviceName: string;
  bookedMinutes: number;
  appointmentCount: number;
  shareOfBookedMinutesPercent: number;
};

type UtilizationSummary = {
  from: string;
  to: string;
  windowMinutes: number;
  availabilityBasis: "REQUEST_WINDOW";
  shiftAware: false;
  totals: {
    activeStaff: number;
    capacityMinutes: number;
    bookedMinutes: number;
    availableMinutes: number;
    utilizationPercent: number;
  };
  staff: StaffMetric[];
  services: ServiceMetric[];
};

function toLocalInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function initialWindow() {
  const from = new Date();
  from.setMinutes(0, 0, 0);
  const to = new Date(from.getTime() + 8 * 60 * 60 * 1000);
  return { from: toLocalInput(from), to: toLocalInput(to) };
}

function minutes(value: number) {
  if (value < 60) return `${value} dk`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return rest ? `${hours} sa ${rest} dk` : `${hours} sa`;
}

export function OperationsUtilizationPanel() {
  const [window, setWindow] = useState(initialWindow);
  const [summary, setSummary] = useState<UtilizationSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    if (!hasActiveBranch()) return;
    const from = new Date(window.from);
    const to = new Date(window.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      setError("Kullanım başlangıç ve bitiş aralığı geçerli olmalıdır.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      setSummary(
        await api<UtilizationSummary>(
          withQuery("/operations/utilization", {
            from: from.toISOString(),
            to: to.toISOString(),
          }),
        ),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kullanım metrikleri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // Initial requested window is intentionally loaded once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-soft)]">
            Utilization Engine
          </p>
          <h2 className="mt-2 text-lg font-semibold text-[var(--ink)]">
            Personel ve Hizmet Kullanımı
          </h2>
          <p className="mt-1 max-w-3xl text-xs text-[var(--muted)]">
            Seçilen zaman penceresindeki aktif personel kapasitesini ve appointment-backed kullanımını gösterir. Bu ilk sürüm shift/leave-aware değildir; denominator seçilen pencerenin tamamıdır.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[190px_190px_auto]">
          <TextInput
            type="datetime-local"
            value={window.from}
            onChange={(event) => setWindow((current) => ({ ...current, from: event.target.value }))}
          />
          <TextInput
            type="datetime-local"
            value={window.to}
            onChange={(event) => setWindow((current) => ({ ...current, to: event.target.value }))}
          />
          <Button disabled={loading} onClick={() => void load()}>
            {loading ? "Hesaplanıyor..." : "Kullanımı Hesapla"}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="mt-4">
          <Alert onClose={() => setError("")}>{error}</Alert>
        </div>
      ) : null}
      {loading && !summary ? (
        <div className="py-8">
          <Spinner label="Kullanım metrikleri hesaplanıyor..." />
        </div>
      ) : null}

      {summary ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Metric label="Aktif Personel" value={String(summary.totals.activeStaff)} />
            <Metric label="Personel Kullanımı" value={`%${summary.totals.utilizationPercent.toLocaleString("tr-TR")}`} />
            <Metric label="Planlı Süre" value={minutes(summary.totals.bookedMinutes)} />
            <Metric label="Boş Kapasite" value={minutes(summary.totals.availableMinutes)} />
            <Metric label="Baz" value="Seçilen Pencere" />
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <div className="overflow-hidden rounded-[18px] border border-[var(--line)]">
              <div className="border-b border-[var(--line)] bg-[var(--surface-2)] px-4 py-3">
                <h3 className="text-sm font-semibold text-[var(--ink)]">Personel Kullanımı</h3>
              </div>
              {summary.staff.length ? (
                <div className="divide-y divide-[var(--line)]">
                  {summary.staff.map((member) => (
                    <div key={member.staffId} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_90px_110px] sm:items-center">
                      <div>
                        <p className="text-xs font-semibold text-[var(--ink)]">{member.staffName}</p>
                        <p className="mt-1 text-[11px] text-[var(--muted)]">
                          {member.appointmentCount} randevu · {minutes(member.bookedMinutes)} planlı
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-[var(--ink)]">%{member.utilizationPercent.toLocaleString("tr-TR")}</span>
                      <span className="text-[11px] text-[var(--muted)]">{minutes(member.availableMinutes)} boş</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-4 py-8 text-center text-sm text-[var(--muted)]">Aktif personel bulunmuyor.</p>
              )}
            </div>

            <div className="overflow-hidden rounded-[18px] border border-[var(--line)]">
              <div className="border-b border-[var(--line)] bg-[var(--surface-2)] px-4 py-3">
                <h3 className="text-sm font-semibold text-[var(--ink)]">Hizmet Talep Dağılımı</h3>
              </div>
              {summary.services.length ? (
                <div className="divide-y divide-[var(--line)]">
                  {summary.services.map((service) => (
                    <div key={service.serviceId} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_90px_100px] sm:items-center">
                      <div>
                        <p className="text-xs font-semibold text-[var(--ink)]">{service.serviceName}</p>
                        <p className="mt-1 text-[11px] text-[var(--muted)]">{service.appointmentCount} randevu · {minutes(service.bookedMinutes)}</p>
                      </div>
                      <span className="text-xs font-semibold text-[var(--ink)]">%{service.shareOfBookedMinutesPercent.toLocaleString("tr-TR")}</span>
                      <span className="text-[11px] text-[var(--muted)]">talep payı</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-4 py-8 text-center text-sm text-[var(--muted)]">Seçilen aralıkta operasyonel randevu yok.</p>
              )}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] bg-[var(--surface-2)] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-soft)]">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[var(--ink)]">{value}</p>
    </div>
  );
}
