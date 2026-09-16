"use client";

import { useEffect, useMemo, useState } from "react";

import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Visit } from "@/lib/types";
import { ExecutionChecklistPanel } from "./service-executions/execution-checklist-panel";
import { ExecutionConsumablesPanel } from "./service-executions/execution-consumables-panel";
import { ExecutionCorrectionActions } from "./service-executions/execution-correction-actions";
import { ExecutionStaffPanel } from "./service-executions/execution-staff-panel";
import { WalkInExecutionLauncher } from "./service-executions/walk-in-execution-launcher";

type ServiceExecution = {
  id: string;
  visitId: string;
  appointmentId: string | null;
  walkInCommercialContextId: string | null;
  saleItemId: string | null;
  source: "APPOINTMENT" | "WALK_IN";
  serviceId: string;
  staffId: string;
  roomId: string | null;
  assetId: string | null;
  status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  startedAt: string;
  completedAt: string | null;
  note: string | null;
  completionNote: string | null;
  version: number;
  appointmentStatus: "SCHEDULED" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW" | null;
  packageSessionId: string | null;
  packageSessionStatus: "AVAILABLE" | "RESERVED" | "CONSUMED" | "CANCELLED" | null;
  walkInSaleId: string | null;
  walkInSaleStatus: string | null;
  walkInServiceDescription: string | null;
};

export function ServiceExecutionPanel({
  visit,
  canUpdate,
  onChanged,
}: {
  visit: Visit;
  canUpdate: boolean;
  onChanged: () => Promise<void>;
}) {
  const appointmentIds = visit.appointmentIds ?? [];
  const [executions, setExecutions] = useState<ServiceExecution[]>([]);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState(
    appointmentIds[0] ?? "",
  );
  const [checklistBlocked, setChecklistBlocked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setExecutions(
        await api<ServiceExecution[]>(
          `/operations/service-executions/visits/${visit.id}`,
        ),
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Hizmet icra kayıtları yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // Visit identity drives the execution list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visit.id]);

  const executableAppointmentIds = useMemo(
    () =>
      appointmentIds.filter(
        (appointmentId) =>
          !executions.some(
            (execution) =>
              execution.appointmentId === appointmentId &&
              execution.status !== "CANCELLED",
          ),
      ),
    [appointmentIds, executions],
  );

  const allCompleted =
    appointmentIds.length > 0 &&
    appointmentIds.every((appointmentId) =>
      executions.some(
        (execution) =>
          execution.appointmentId === appointmentId &&
          execution.status === "COMPLETED",
      ),
    );

  const handoffsCompleted =
    allCompleted &&
    executions
      .filter((execution) => execution.status === "COMPLETED")
      .every(
        (execution) =>
          execution.appointmentStatus === "COMPLETED" &&
          (!execution.packageSessionId || execution.packageSessionStatus === "CONSUMED"),
      );

  const walkInExecutions = executions.filter(
    (execution) => execution.source === "WALK_IN" && execution.status !== "CANCELLED",
  );
  const walkInCompleted =
    visit.source === "WALK_IN" &&
    walkInExecutions.length > 0 &&
    walkInExecutions.every((execution) => execution.status === "COMPLETED");
  const serviceFlowCompleted =
    visit.source === "WALK_IN" ? walkInCompleted : handoffsCompleted;

  async function startExecution() {
    const appointmentId = selectedAppointmentId || executableAppointmentIds[0];
    if (!appointmentId || !canUpdate) return;
    setBusyId(`start:${appointmentId}`);
    setError("");
    try {
      await api(`/operations/service-executions/visits/${visit.id}/start`, {
        method: "POST",
        body: { appointmentId },
      });
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Hizmet başlatılamadı.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function completeExecution(execution: ServiceExecution) {
    if (!canUpdate || checklistBlocked[execution.id] !== false) return;
    setBusyId(`execution:${execution.id}`);
    setError("");
    try {
      await api(`/operations/service-executions/${execution.id}/complete`, {
        method: "POST",
        body: { expectedVersion: execution.version },
      });
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Hizmet tamamlanamadı.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function completeAppointment(execution: ServiceExecution) {
    if (!canUpdate || execution.status !== "COMPLETED" || !execution.appointmentId) return;
    setBusyId(`appointment:${execution.id}`);
    setError("");
    try {
      await api(
        `/operations/service-executions/${execution.id}/complete-appointment`,
        { method: "POST" },
      );
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Randevu tamamlanamadı.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function consumePackageSession(execution: ServiceExecution) {
    if (
      !canUpdate ||
      execution.appointmentStatus !== "COMPLETED" ||
      !execution.packageSessionId ||
      execution.packageSessionStatus !== "RESERVED"
    ) {
      return;
    }

    setBusyId(`session:${execution.packageSessionId}`);
    setError("");
    try {
      await api(`/sessions/${execution.packageSessionId}/consume`, {
        method: "POST",
      });
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Paket seansı tüketilemedi.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function completeVisitService() {
    if (!canUpdate || !serviceFlowCompleted) return;
    setBusyId(`visit:${visit.id}`);
    setError("");
    try {
      await api(`/visits/${visit.id}/transition`, {
        method: "POST",
        body: {
          toStatus: "SERVICE_COMPLETED",
          expectedVersion: visit.version,
        },
      });
      await onChanged();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Ziyaret hizmet durumu tamamlanamadı.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-soft)]">
            Service Execution
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Fiziksel hizmet, personel sorumluluğu, SOP checklist, sarf tüketimi ve ticari handoff ayrı ve izlenebilir aksiyonlardır.
          </p>
        </div>
        {serviceFlowCompleted ? (
          <span className="rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs font-semibold text-[#2d6a49]">
            Checkout için hizmet akışı hazır
          </span>
        ) : allCompleted && visit.source === "APPOINTMENT" ? (
          <span className="rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs font-semibold text-[var(--ink)]">
            Handoff bekleniyor
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="mt-3">
          <Alert onClose={() => setError("")}>{error}</Alert>
        </div>
      ) : null}

      {loading ? (
        <div className="py-5">
          <Spinner label="Hizmet kayıtları yükleniyor..." />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {executions.map((execution) => (
            <div
              key={execution.id}
              className="rounded-[14px] bg-[var(--surface-2)] p-3"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold text-[var(--ink)]">
                    {execution.source === "WALK_IN"
                      ? `Walk-in · ${execution.walkInServiceDescription ?? execution.serviceId.slice(0, 8)}`
                      : `Randevu ${execution.appointmentId?.slice(0, 8) ?? "-"}`}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--muted)]">
                    {execution.status === "IN_PROGRESS"
                      ? "Hizmet devam ediyor"
                      : execution.status === "COMPLETED"
                        ? "Hizmet tamamlandı"
                        : "Hizmet iptal edildi"}
                    {execution.roomId ? ` · Oda ${execution.roomId.slice(0, 8)}` : ""}
                    {execution.assetId ? ` · Cihaz ${execution.assetId.slice(0, 8)}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {execution.status === "IN_PROGRESS" && canUpdate ? (
                    <Button
                      disabled={
                        busyId === `execution:${execution.id}` ||
                        checklistBlocked[execution.id] !== false
                      }
                      onClick={() => void completeExecution(execution)}
                    >
                      {busyId === `execution:${execution.id}`
                        ? "Tamamlanıyor..."
                        : checklistBlocked[execution.id] !== false
                          ? "Checklist Bekliyor"
                          : "Hizmeti Tamamla"}
                    </Button>
                  ) : null}
                  <ExecutionCorrectionActions
                    execution={execution}
                    canUpdate={canUpdate}
                    onChanged={load}
                    onError={setError}
                  />
                </div>
              </div>

              {execution.status !== "CANCELLED" ? (
                <ExecutionStaffPanel
                  executionId={execution.id}
                  canUpdate={canUpdate && execution.status === "IN_PROGRESS"}
                  onChanged={load}
                  onError={setError}
                />
              ) : null}

              {execution.status !== "CANCELLED" ? (
                <ExecutionChecklistPanel
                  executionId={execution.id}
                  canUpdate={canUpdate && execution.status === "IN_PROGRESS"}
                  onChanged={(blocked) =>
                    setChecklistBlocked((current) => ({
                      ...current,
                      [execution.id]: blocked,
                    }))
                  }
                />
              ) : null}

              {execution.status === "COMPLETED" ? (
                <>
                  <ExecutionConsumablesPanel
                    executionId={execution.id}
                    canUpdate={canUpdate && execution.appointmentStatus !== "COMPLETED"}
                  />
                  <div className="mt-3 flex flex-col gap-3 border-t border-[var(--line)] pt-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-[11px] text-[var(--muted)]">
                      {execution.source === "WALK_IN" ? (
                        <>
                          <p>Ticari kaynak: Satış {execution.walkInSaleId?.slice(0, 8) ?? "-"}</p>
                          <p className="mt-1">Satış durumu: {execution.walkInSaleStatus ?? "Bilinmiyor"}</p>
                        </>
                      ) : (
                        <>
                          <p>
                            Randevu: {execution.appointmentStatus === "COMPLETED" ? "Tamamlandı" : execution.appointmentStatus ?? "Bilinmiyor"}
                          </p>
                          {execution.packageSessionId ? (
                            <p className="mt-1">
                              Paket seansı: {execution.packageSessionStatus === "CONSUMED" ? "Tüketildi" : execution.packageSessionStatus ?? "Bilinmiyor"}
                            </p>
                          ) : (
                            <p className="mt-1">Paket seansı: Yok</p>
                          )}
                        </>
                      )}
                    </div>
                    {canUpdate && execution.source === "APPOINTMENT" ? (
                      <div className="flex flex-wrap gap-2">
                        {execution.appointmentStatus !== "COMPLETED" ? (
                          <Button
                            variant="secondary"
                            disabled={Boolean(busyId)}
                            onClick={() => void completeAppointment(execution)}
                          >
                            {busyId === `appointment:${execution.id}`
                              ? "Randevu Tamamlanıyor..."
                              : "Randevuyu Tamamla ve Stoğu İşle"}
                          </Button>
                        ) : null}
                        {execution.appointmentStatus === "COMPLETED" &&
                        execution.packageSessionId &&
                        execution.packageSessionStatus === "RESERVED" ? (
                          <Button
                            disabled={Boolean(busyId)}
                            onClick={() => void consumePackageSession(execution)}
                          >
                            {busyId === `session:${execution.packageSessionId}`
                              ? "Seans Tüketiliyor..."
                              : "Paket Seansını Tüket"}
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          ))}

          {visit.source === "WALK_IN" && visit.status === "IN_SERVICE" ? (
            <WalkInExecutionLauncher
              visitId={visit.id}
              canUpdate={canUpdate}
              onChanged={load}
              onError={setError}
            />
          ) : null}

          {visit.source === "APPOINTMENT" && executableAppointmentIds.length && visit.status === "IN_SERVICE" ? (
            <div className="flex flex-col gap-3 rounded-[14px] border border-dashed border-[var(--line)] p-3 sm:flex-row sm:items-end">
              <label className="min-w-0 flex-1">
                <span className="mb-2 block text-xs font-semibold text-[var(--muted)]">
                  Başlatılacak randevu
                </span>
                <select
                  className="min-h-11 w-full rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm"
                  value={
                    executableAppointmentIds.includes(selectedAppointmentId)
                      ? selectedAppointmentId
                      : executableAppointmentIds[0]
                  }
                  onChange={(event) => setSelectedAppointmentId(event.target.value)}
                >
                  {executableAppointmentIds.map((appointmentId) => (
                    <option key={appointmentId} value={appointmentId}>
                      Randevu {appointmentId.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                disabled={!canUpdate || Boolean(busyId)}
                onClick={() => void startExecution()}
              >
                {busyId?.startsWith("start:") ? "Başlatılıyor..." : "Hizmeti Başlat"}
              </Button>
            </div>
          ) : null}

          {allCompleted && !handoffsCompleted && visit.source === "APPOINTMENT" ? (
            <p className="rounded-[14px] border border-dashed border-[var(--line)] p-3 text-xs text-[var(--muted)]">
              Ziyaret hizmetini tamamlamadan önce her hizmet için SOP/checklist kanıtını, sarf kontrolünü ve randevu handoff’unu tamamlayın; bağlı paket seansı varsa ayrıca tüketin.
            </p>
          ) : null}

          {serviceFlowCompleted && visit.status === "IN_SERVICE" && canUpdate ? (
            <div className="flex justify-end">
              <Button
                disabled={busyId === `visit:${visit.id}`}
                onClick={() => void completeVisitService()}
              >
                {busyId === `visit:${visit.id}`
                  ? "Ziyaret Güncelleniyor..."
                  : "Ziyaret Hizmetini Tamamla"}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
