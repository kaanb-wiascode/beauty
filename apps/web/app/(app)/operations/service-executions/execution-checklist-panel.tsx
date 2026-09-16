"use client";

import { useEffect, useState } from "react";

import { Alert, Button, Spinner, TextInput } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type ChecklistItem = {
  id: string;
  executionId: string;
  templateId: string;
  templateVersion: number;
  itemCode: string;
  title: string;
  description: string | null;
  sortOrder: number;
  isRequired: boolean;
  status: "PENDING" | "COMPLETED" | "NA";
  note: string | null;
  completedAt: string | null;
  version: number;
};

type ExecutionChecklist = {
  executionId: string;
  executionStatus: "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  templateId: string | null;
  templateVersion: number | null;
  requiredCount: number;
  requiredCompletedCount: number;
  completionBlocked: boolean;
  items: ChecklistItem[];
};

export function ExecutionChecklistPanel({
  executionId,
  canUpdate,
  onChanged,
}: {
  executionId: string;
  canUpdate: boolean;
  onChanged?: (completionBlocked: boolean) => void;
}) {
  const [checklist, setChecklist] = useState<ExecutionChecklist | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await api<ExecutionChecklist>(
        `/operations/service-checklists/executions/${executionId}`,
      );
      setChecklist(result);
      setNotes(
        Object.fromEntries(
          result.items.map((item) => [item.id, item.note ?? ""]),
        ),
      );
      onChanged?.(result.completionBlocked);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Hizmet checklist'i yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // Execution identity determines the immutable checklist snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executionId]);

  async function updateItem(item: ChecklistItem, status: "COMPLETED" | "NA") {
    if (!canUpdate) return;
    setBusyItemId(item.id);
    setError("");
    try {
      await api(
        `/operations/service-checklists/executions/${executionId}/items/${item.id}`,
        {
          method: "PATCH",
          body: {
            status,
            note: notes[item.id]?.trim() || null,
            expectedVersion: item.version,
          },
        },
      );
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Checklist maddesi güncellenemedi.",
      );
    } finally {
      setBusyItemId(null);
    }
  }

  if (loading) {
    return (
      <div className="mt-3 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] p-3">
        <Spinner label="SOP checklist yükleniyor..." />
      </div>
    );
  }

  if (!checklist) return null;

  if (!checklist.items.length) {
    return (
      <div className="mt-3 rounded-[14px] border border-dashed border-[var(--line)] p-3 text-xs text-[var(--muted)]">
        Bu hizmet için aktif SOP / checklist tanımlı değil.
      </div>
    );
  }

  const editable = canUpdate && checklist.executionStatus === "IN_PROGRESS";

  return (
    <div className="mt-3 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-[var(--ink)]">SOP / Hizmet Checklist</p>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            Versiyon {checklist.templateVersion} · zorunlu {checklist.requiredCompletedCount}/{checklist.requiredCount}
          </p>
        </div>
        <span
          className={
            checklist.completionBlocked
              ? "rounded-full bg-[var(--surface-2)] px-3 py-1 text-[11px] font-semibold text-[#8f3d3d]"
              : "rounded-full bg-[var(--surface-2)] px-3 py-1 text-[11px] font-semibold text-[#2d6a49]"
          }
        >
          {checklist.completionBlocked ? "Zorunlu adımlar bekliyor" : "Checklist hazır"}
        </span>
      </div>

      {error ? (
        <div className="mt-3">
          <Alert onClose={() => setError("")}>{error}</Alert>
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        {checklist.items.map((item) => (
          <div
            key={item.id}
            className="rounded-[12px] bg-[var(--surface-2)] p-3"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold text-[var(--ink)]">
                    {item.title}
                  </p>
                  <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
                    {item.isRequired ? "Zorunlu" : "Opsiyonel"}
                  </span>
                  {item.status !== "PENDING" ? (
                    <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] font-semibold text-[var(--ink)]">
                      {item.status === "COMPLETED" ? "Tamamlandı" : "Uygulanamaz"}
                    </span>
                  ) : null}
                </div>
                {item.description ? (
                  <p className="mt-1 text-[11px] text-[var(--muted)]">
                    {item.description}
                  </p>
                ) : null}
                <div className="mt-2 max-w-xl">
                  <TextInput
                    value={notes[item.id] ?? ""}
                    disabled={!editable || item.status !== "PENDING"}
                    onChange={(event) =>
                      setNotes((current) => ({
                        ...current,
                        [item.id]: event.target.value,
                      }))
                    }
                    placeholder="İsteğe bağlı uygulama notu"
                  />
                </div>
              </div>

              {editable && item.status === "PENDING" ? (
                <div className="flex shrink-0 flex-wrap gap-2">
                  {!item.isRequired ? (
                    <Button
                      variant="secondary"
                      disabled={Boolean(busyItemId)}
                      onClick={() => void updateItem(item, "NA")}
                    >
                      Uygulanamaz
                    </Button>
                  ) : null}
                  <Button
                    disabled={Boolean(busyItemId)}
                    onClick={() => void updateItem(item, "COMPLETED")}
                  >
                    {busyItemId === item.id ? "Kaydediliyor..." : "Tamamla"}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
