"use client";

import { useEffect, useMemo, useState } from "react";

import { Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type Assignment = {
  id: string;
  executionId: string;
  staffId: string;
  staffName: string;
  role: "PRIMARY" | "ASSISTANT" | "HANDOFF";
  startedAt: string;
  endedAt: string | null;
  note: string | null;
  version: number;
};

type Staff = {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
};

type StaffResponse = {
  data: Staff[];
};

export function ExecutionStaffPanel({
  executionId,
  canUpdate,
  onChanged,
  onError,
}: {
  executionId: string;
  canUpdate: boolean;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [assignmentRows, staffRows] = await Promise.all([
        api<Assignment[]>(`/operations/service-executions/${executionId}/staff`),
        api<StaffResponse>("/staff?status=ACTIVE&limit=100&page=1"),
      ]);
      setAssignments(assignmentRows);
      setStaff(staffRows.data ?? []);
      if (!selectedStaffId && staffRows.data?.[0]) {
        setSelectedStaffId(staffRows.data[0].id);
      }
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Personel atamaları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executionId]);

  const activeAssignments = useMemo(
    () => assignments.filter((item) => !item.endedAt),
    [assignments],
  );
  const currentResponsible = [...activeAssignments]
    .reverse()
    .find((item) => item.role === "PRIMARY" || item.role === "HANDOFF");
  const availableStaff = staff.filter(
    (item) => !activeAssignments.some((assignment) => assignment.staffId === item.id),
  );

  async function addAssistant() {
    if (!canUpdate || !selectedStaffId || busy) return;
    setBusy(true);
    onError("");
    try {
      await api(`/operations/service-executions/${executionId}/staff`, {
        method: "POST",
        body: { staffId: selectedStaffId, role: "ASSISTANT" },
      });
      await load();
      await onChanged();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Yardımcı personel eklenemedi.");
    } finally {
      setBusy(false);
    }
  }

  async function handoff() {
    if (!canUpdate || !selectedStaffId || !currentResponsible || busy) return;
    if (!window.confirm("Hizmet sorumluluğu seçilen personele devredilsin mi?")) return;
    setBusy(true);
    onError("");
    try {
      await api(`/operations/service-executions/${executionId}/staff/handoff`, {
        method: "POST",
        body: {
          fromAssignmentId: currentResponsible.id,
          toStaffId: selectedStaffId,
          expectedVersion: currentResponsible.version,
        },
      });
      await load();
      await onChanged();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Personel devri yapılamadı.");
    } finally {
      setBusy(false);
    }
  }

  async function endAssignment(assignment: Assignment) {
    if (!canUpdate || busy || assignment.role === "PRIMARY") return;
    setBusy(true);
    onError("");
    try {
      await api(`/operations/service-executions/${executionId}/staff/${assignment.id}/end`, {
        method: "POST",
        body: { expectedVersion: assignment.version },
      });
      await load();
      await onChanged();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Personel ataması sonlandırılamadı.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="mt-3"><Spinner label="Personel sorumlulukları yükleniyor..." /></div>;
  }

  return (
    <div className="mt-3 rounded-[12px] border border-[var(--line)] p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-[var(--ink)]">Personel & Handoff</p>
          <p className="mt-1 text-[11px] text-[var(--muted)]">Aktif sorumluluk ve yardımcı personel geçmişi execution audit zincirinde korunur.</p>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {assignments.map((assignment) => (
          <div key={assignment.id} className="flex flex-col gap-2 rounded-[10px] bg-[var(--surface)] p-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium text-[var(--ink)]">{assignment.staffName || assignment.staffId.slice(0, 8)}</p>
              <p className="text-[11px] text-[var(--muted)]">
                {assignment.role} · {assignment.endedAt ? "Tamamlandı" : "Aktif"}
              </p>
            </div>
            {canUpdate && !assignment.endedAt && assignment.role !== "PRIMARY" ? (
              <Button variant="secondary" disabled={busy} onClick={() => void endAssignment(assignment)}>
                Atamayı Bitir
              </Button>
            ) : null}
          </div>
        ))}
      </div>

      {canUpdate && availableStaff.length > 0 ? (
        <div className="mt-3 flex flex-col gap-2 border-t border-[var(--line)] pt-3 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-[11px] font-semibold text-[var(--muted)]">Personel</span>
            <select
              className="min-h-10 w-full rounded-[10px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm"
              value={availableStaff.some((item) => item.id === selectedStaffId) ? selectedStaffId : availableStaff[0]?.id ?? ""}
              onChange={(event) => setSelectedStaffId(event.target.value)}
            >
              {availableStaff.map((item) => (
                <option key={item.id} value={item.id}>{item.firstName} {item.lastName}</option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => void addAssistant()}>Yardımcı Ekle</Button>
            {currentResponsible ? (
              <Button disabled={busy} onClick={() => void handoff()}>Sorumluluğu Devret</Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
