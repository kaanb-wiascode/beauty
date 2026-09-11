"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { DataView, DataViewMeta } from "@/components/data-view";
import { FinanceEmpty, FinanceMetric, FinancePanel, FinanceStatus } from "@/components/finance-view";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type Integration = { id: string; displayName: string; provider: string; kind: string; status: string };
type Health = {
  integrationId: string;
  healthy: boolean;
  status: string;
  runtimeReady: boolean;
  hasCredentials: boolean;
  lastError: string | null;
  consent: { expiresAt: string | null; expired: boolean; expiringSoon: boolean };
  sync: {
    lastSyncAt: string | null;
    lastStatus: string | null;
    lastCompletedAt: string | null;
    stale: boolean;
    staleAfterHours: number;
    activeRun: null | {
      id: string;
      startedAt: string | null;
      heartbeatAt: string | null;
      stale: boolean;
      staleAfterMinutes: number;
    };
  };
  observability: {
    windowHours: number;
    attempts: number;
    successes: number;
    failures: number;
    successRate: number | null;
    averageDurationMs: number;
    staleRecoveries: number;
    lastRecoveredAt: string | null;
  };
  banking: null | {
    activeAccountCount: number;
    inactiveAccountCount: number;
    latestBalanceAsOf: string | null;
    currentBalancesByCurrency: Record<string, string | number>;
    latestTransactionAt: string | null;
    unmatchedTransactionCount: number;
    transactionWatermark: string | null;
    transactionOverlapHours: number | null;
  };
};
type AlertState = {
  integrationId: string;
  state: "HEALTHY" | "WARNING" | "CRITICAL";
  thresholds: Record<string, number>;
  alerts: Array<{ code: string; severity: "WARNING" | "CRITICAL"; message: string }>;
};
type AuditLog = {
  id: string;
  action: string;
  entityId: string | null;
  outcome: "SUCCESS" | "FAILED";
  route: string | null;
  method: string | null;
  errorMessage: string | null;
  actorUserId: string | null;
  actorRoleId: string | null;
  createdAt: string;
};

export default function IntegrationOperationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [selected, setSelected] = useState("");
  const [health, setHealth] = useState<Health | null>(null);
  const [alerts, setAlerts] = useState<AlertState | null>(null);
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const loadIntegrations = useCallback(async () => {
    try {
      const rows = await api<Integration[]>("/financial-integrations");
      setIntegrations(rows);
      setSelected((current) => current || rows[0]?.id || "");
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Entegrasyon listesi yüklenemedi.");
    } finally {
      setInitialLoading(false);
    }
  }, []);

  const loadSelected = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const [nextHealth, nextAlerts, nextAudit] = await Promise.all([
        api<Health>(`/financial-integrations/${id}/health`),
        api<AlertState>(`/financial-integrations/${id}/alerts`),
        api<AuditLog[]>(`/financial-integrations/audit-logs?entityId=${encodeURIComponent(id)}&limit=50`),
      ]);
      setHealth(nextHealth);
      setAlerts(nextAlerts);
      setAudit(nextAudit);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Operasyon verileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadIntegrations();
  }, [loadIntegrations]);

  useEffect(() => {
    if (selected) void loadSelected(selected);
  }, [selected, loadSelected]);

  const current = useMemo(
    () => integrations.find((integration) => integration.id === selected) ?? null,
    [integrations, selected],
  );

  if (initialLoading && !integrations.length) {
    return (
      <div className="mx-auto max-w-[1500px] py-20">
        <Spinner label="Entegrasyon operasyonları hazırlanıyor..." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-12">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[var(--muted-soft)]">FİNANS & CFO</p>
          <h1 className="mt-2 text-[34px] font-semibold tracking-[-.045em] text-[var(--ink)]">Entegrasyon Operasyonları</h1>
          <p className="mt-2 max-w-3xl text-[14px] leading-6 text-[var(--muted)]">
            Provider health, sync heartbeat, production alert eşikleri ve audit kayıtlarını tek operasyon ekranında izleyin.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            className="control h-11 min-w-[260px]"
            aria-label="Entegrasyon seç"
          >
            {integrations.map((integration) => (
              <option key={integration.id} value={integration.id}>
                {integration.displayName} · {integration.provider}
              </option>
            ))}
          </select>
          <Button disabled={!selected || loading} onClick={() => void loadSelected(selected)}>
            {loading ? "Yükleniyor…" : "Yenile"}
          </Button>
        </div>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      {current && health && alerts ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <FinanceMetric label="Alert State" value={alerts.state} detail={`${alerts.alerts.length} aktif alarm`} tone={alertTone(alerts.state)} />
            <FinanceMetric label="Sync Success" value={health.observability.successRate == null ? "—" : `%${health.observability.successRate}`} detail={`${health.observability.attempts} deneme / ${health.observability.windowHours}s`} tone={health.observability.failures ? "warning" : "success"} />
            <FinanceMetric label="Ort. Süre" value={duration(health.observability.averageDurationMs)} detail={`${health.observability.failures} başarısız sync`} />
            <FinanceMetric label="Stale Recovery" value={String(health.observability.staleRecoveries)} detail={health.observability.lastRecoveredAt ? dateTime(health.observability.lastRecoveredAt) : "Son pencere"} />
            <FinanceMetric label="Unmatched Bank" value={String(health.banking?.unmatchedTransactionCount ?? 0)} detail="Mutabakat bekleyen" tone={(health.banking?.unmatchedTransactionCount ?? 0) > 0 ? "warning" : "neutral"} />
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
            <FinancePanel
              title="Health & Sync Runtime"
              description={`${current.displayName} · ${current.provider}`}
              actions={<FinanceStatus status={health.healthy ? "PROCESSED" : "RETRY_PENDING"} label={health.healthy ? "HEALTHY" : "ATTENTION"} />}
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Info label="Integration Status" value={health.status} />
                <Info label="Runtime" value={health.runtimeReady ? "Ready" : "Partial"} />
                <Info label="Credentials" value={health.hasCredentials ? "Configured" : "Missing"} />
                <Info label="Last Sync" value={dateTime(health.sync.lastSyncAt)} />
                <Info label="Last Status" value={health.sync.lastStatus ?? "—"} />
                <Info label="Sync Stale" value={health.sync.stale ? `Evet · ${health.sync.staleAfterHours}s eşik` : "Hayır"} />
              </div>

              <div className="mt-5 rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)]/45 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--muted-soft)]">Active Run</p>
                {health.sync.activeRun ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <Info label="Started" value={dateTime(health.sync.activeRun.startedAt)} />
                    <Info label="Heartbeat" value={dateTime(health.sync.activeRun.heartbeatAt)} />
                    <Info label="State" value={health.sync.activeRun.stale ? `STALE · ${health.sync.activeRun.staleAfterMinutes} dk eşik` : "RUNNING · heartbeat fresh"} />
                  </div>
                ) : (
                  <FinanceEmpty>Aktif sync yok.</FinanceEmpty>
                )}
              </div>

              {health.banking ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Info label="Active Accounts" value={String(health.banking.activeAccountCount)} />
                  <Info label="Inactive Accounts" value={String(health.banking.inactiveAccountCount)} />
                  <Info label="Watermark" value={dateTime(health.banking.transactionWatermark)} />
                  <Info label="Overlap" value={health.banking.transactionOverlapHours == null ? "—" : `${health.banking.transactionOverlapHours} saat`} />
                </div>
              ) : null}

              {health.lastError ? (
                <div className="mt-4 rounded-[14px] border border-[rgba(180,60,60,.18)] bg-[var(--danger-soft)] p-3 text-[11px] leading-5 text-[var(--danger)]">
                  {health.lastError}
                </div>
              ) : null}
            </FinancePanel>

            <FinancePanel
              title="Production Alerts"
              description="Eşik ihlalleri deterministik kurallardan üretilir."
              actions={<FinanceStatus status={alerts.state === "HEALTHY" ? "PROCESSED" : alerts.state === "CRITICAL" ? "FAILED" : "RETRY_PENDING"} label={alerts.state} />}
            >
              <div className="space-y-2">
                {alerts.alerts.length ? (
                  alerts.alerts.map((alert) => (
                    <div key={alert.code} className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)]/45 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] font-semibold text-[var(--ink)]">{alert.code}</p>
                        <FinanceStatus status={alert.severity === "CRITICAL" ? "FAILED" : "RETRY_PENDING"} label={alert.severity} />
                      </div>
                      <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">{alert.message}</p>
                    </div>
                  ))
                ) : (
                  <FinanceEmpty>Aktif production alarmı yok.</FinanceEmpty>
                )}
              </div>

              <div className="mt-5 border-t border-[var(--line)] pt-4">
                <p className="text-[11px] font-semibold text-[var(--ink)]">Aktif eşikler</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {Object.entries(alerts.thresholds).map(([key, value]) => (
                    <div key={key} className="rounded-[12px] bg-[var(--surface-2)] px-3 py-2">
                      <p className="truncate text-[9px] text-[var(--muted-soft)]">{key}</p>
                      <p className="mt-0.5 text-[11px] font-semibold text-[var(--ink)]">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </FinancePanel>
          </section>

          <FinancePanel title="Audit Timeline" description="Bu entegrasyon için son 50 mutation kaydı; credential değerleri audit log’a yazılmaz.">
            <DataView>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--line)] bg-[var(--surface-2)]/40 text-[10px] uppercase tracking-[.08em] text-[var(--muted-soft)]">
                      <th className="px-3 py-3">Zaman</th><th className="px-3 py-3">Action</th><th className="px-3 py-3">Sonuç</th><th className="px-3 py-3">Method</th><th className="px-3 py-3">Actor</th><th className="px-3 py-3">Hata</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.map((row) => (
                      <tr key={row.id} className="border-b border-[var(--line)] last:border-0">
                        <td className="px-3 py-3 text-[var(--muted)]">{dateTime(row.createdAt)}</td>
                        <td className="px-3 py-3 font-medium text-[var(--ink)]">{row.action}</td>
                        <td className="px-3 py-3"><FinanceStatus status={row.outcome === "SUCCESS" ? "PROCESSED" : "FAILED"} label={row.outcome} /></td>
                        <td className="px-3 py-3 text-[var(--muted)]">{row.method ?? "—"}</td>
                        <td className="px-3 py-3 text-[var(--muted)]">{row.actorUserId ? row.actorUserId.slice(0, 8) : "system"}</td>
                        <td className="max-w-[320px] truncate px-3 py-3 text-[var(--danger)]" title={row.errorMessage ?? undefined}>{row.errorMessage ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!audit.length ? <FinanceEmpty>Audit kaydı yok.</FinanceEmpty> : null}
              <DataViewMeta><span>{audit.length} kayıt</span><span>Son 50 mutation</span></DataViewMeta>
            </DataView>
          </FinancePanel>
        </>
      ) : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3 py-3">
      <p className="text-[9px] uppercase tracking-[.08em] text-[var(--muted-soft)]">{label}</p>
      <p className="mt-1 break-words text-[11px] font-semibold text-[var(--ink)]">{value}</p>
    </div>
  );
}

function dateTime(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function duration(ms: number) {
  if (!ms) return "0 sn";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} sn`;
  return `${(ms / 60000).toFixed(1)} dk`;
}

function alertTone(state: AlertState["state"]): "success" | "warning" | "danger" {
  if (state === "HEALTHY") return "success";
  if (state === "CRITICAL") return "danger";
  return "warning";
}
