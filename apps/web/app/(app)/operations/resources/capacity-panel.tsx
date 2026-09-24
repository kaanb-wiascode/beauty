"use client";

import { useEffect, useState } from "react";

import { Alert, Button, Spinner, TextInput } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasActiveBranch } from "@/lib/auth";
import { userLabel } from "@/lib/user-language";

type CapacityCategory = {
  resourceType: "ROOM" | "ASSET";
  category: string;
  totalResources: number;
  unavailableResources: number;
  blockedMinutes: number;
  capacityMinutes: number;
  allocatedMinutes: number;
  remainingMinutes: number;
  utilizationPercent: number;
};

type CapacityBottleneck = {
  resourceType: "ROOM" | "ASSET";
  category: string;
  utilizationPercent: number;
  remainingMinutes: number;
  blockedMinutes: number;
  unavailableResources: number;
  reason: "NO_AVAILABLE_CAPACITY" | "CRITICAL_UTILIZATION" | "HIGH_UTILIZATION";
};

type CapacitySummary = {
  from: string;
  to: string;
  windowMinutes: number;
  totals: {
    resources: number;
    unavailableResources: number;
    blockedMinutes: number;
    capacityMinutes: number;
    allocatedMinutes: number;
    remainingMinutes: number;
    utilizationPercent: number;
  };
  categories: CapacityCategory[];
  bottlenecks: CapacityBottleneck[];
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

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} dk`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} sa ${rest} dk` : `${hours} sa`;
}

const reasonLabel: Record<CapacityBottleneck["reason"], string> = {
  NO_AVAILABLE_CAPACITY: "Kullanılabilir kapasite yok",
  CRITICAL_UTILIZATION: "Kritik kullanım",
  HIGH_UTILIZATION: "Yüksek kullanım",
};

export function OperationsCapacityPanel() {
  const [window, setWindow] = useState(initialWindow);
  const [summary, setSummary] = useState<CapacitySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadCapacity() {
    if (!hasActiveBranch()) return;
    const from = new Date(window.from);
    const to = new Date(window.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      setError("Kapasite başlangıç ve bitiş aralığı geçerli olmalıdır.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      setSummary(
        await api<CapacitySummary>(
          withQuery("/operations/resources/capacity", {
            from: from.toISOString(),
            to: to.toISOString(),
          }),
        ),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kapasite analizi yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCapacity();
    // The initial window is intentionally loaded once. Subsequent queries are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-soft)]">
            Kapasite planlaması
          </p>
          <h2 className="mt-2 text-lg font-semibold text-[var(--ink)]">Kaynak Kapasitesi</h2>
          <p className="mt-1 max-w-2xl text-xs text-[var(--muted)]">
            Seçilen zaman aralığında oda ve ekipmanların gerçek rezervasyon yükünü gösterir. Hazırlık, temizlik ve planlı kullanım dışı süreler kapasite hesabına dahildir.
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
          <Button disabled={loading} onClick={() => void loadCapacity()}>
            {loading ? "Hesaplanıyor..." : "Kapasiteyi Hesapla"}
          </Button>
        </div>
      </div>

      {error ? <div className="mt-4"><Alert onClose={() => setError("")}>{error}</Alert></div> : null}
      {loading && !summary ? <div className="py-8"><Spinner label="Kapasite hesaplanıyor..." /></div> : null}

      {summary ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <Metric label="Kaynak" value={String(summary.totals.resources)} />
            <Metric label="Kullanım" value={`%${summary.totals.utilizationPercent.toLocaleString("tr-TR")}`} />
            <Metric label="Rezerve" value={formatMinutes(summary.totals.allocatedMinutes)} />
            <Metric label="Bloklu" value={formatMinutes(summary.totals.blockedMinutes)} />
            <Metric label="Kalan" value={formatMinutes(summary.totals.remainingMinutes)} />
            <Metric label="Kullanılamaz" value={String(summary.totals.unavailableResources)} />
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="overflow-hidden rounded-[18px] border border-[var(--line)]">
              <div className="grid grid-cols-[minmax(0,1fr)_80px_90px_90px_100px] gap-3 border-b border-[var(--line)] bg-[var(--surface-2)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-soft)]">
                <span>Kategori</span><span>Kaynak</span><span>Kullanım</span><span>Bloklu</span><span>Kalan</span>
              </div>
              {summary.categories.length ? summary.categories.map((category) => (
                <div key={`${category.resourceType}:${category.category}`} className="grid grid-cols-[minmax(0,1fr)_80px_90px_90px_100px] gap-3 border-b border-[var(--line)] px-4 py-3 text-xs last:border-b-0">
                  <div><p className="font-semibold text-[var(--ink)]">{userLabel(category.category)}</p><p className="mt-1 text-[var(--muted)]">{category.resourceType === "ROOM" ? "Oda / Kabin" : "Cihaz / Ekipman"}{category.unavailableResources ? ` · ${category.unavailableResources} kullanılamaz` : ""}</p></div>
                  <span className="text-[var(--muted)]">{category.totalResources}</span>
                  <span className="font-semibold text-[var(--ink)]">%{category.utilizationPercent.toLocaleString("tr-TR")}</span>
                  <span className="text-[var(--muted)]">{formatMinutes(category.blockedMinutes)}</span>
                  <span className="text-[var(--muted)]">{formatMinutes(category.remainingMinutes)}</span>
                </div>
              )) : <div className="px-4 py-8 text-center text-sm text-[var(--muted)]">Bu şubede hesaplanabilir kaynak bulunmuyor.</div>}
            </div>

            <div className="rounded-[18px] border border-[var(--line)] p-4">
              <h3 className="text-sm font-semibold text-[var(--ink)]">Darboğazlar</h3>
              <p className="mt-1 text-xs text-[var(--muted)]">%80 üzeri kullanım veya kapasitesiz kaynak grupları.</p>
              <div className="mt-4 space-y-3">
                {summary.bottlenecks.length ? summary.bottlenecks.map((item) => (
                  <div key={`${item.resourceType}:${item.category}`} className="rounded-[14px] bg-[var(--surface-2)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="text-xs font-semibold text-[var(--ink)]">{userLabel(item.category)}</p><p className="mt-1 text-[11px] text-[var(--muted)]">{reasonLabel[item.reason]}</p></div>
                      <span className="text-xs font-semibold text-[var(--ink)]">%{item.utilizationPercent.toLocaleString("tr-TR")}</span>
                    </div>
                    <p className="mt-2 text-[11px] text-[var(--muted)]">Kalan {formatMinutes(item.remainingMinutes)}{item.blockedMinutes ? ` · ${formatMinutes(item.blockedMinutes)} bloklu` : ""}{item.unavailableResources ? ` · ${item.unavailableResources} kaynak kullanılamaz` : ""}</p>
                  </div>
                )) : <p className="rounded-[14px] bg-[var(--surface-2)] p-3 text-xs text-[var(--muted)]">Seçilen aralıkta kritik kaynak darboğazı yok.</p>}
              </div>
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
