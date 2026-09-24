"use client";

import { useEffect, useState } from "react";

import { Alert, Button, Spinner, TextInput } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { userLabel } from "@/lib/user-language";

type ConsumableLine = {
  productId: string;
  productName: string;
  sku: string | null;
  unit: string;
  expectedQuantity: number;
  recordedActualQuantity: number | null;
  plannedActualQuantity: number;
  postedQuantity: number;
  varianceQuantity: number;
  posted: boolean;
  version: number;
};

type ConsumableSummary = {
  executionId: string;
  executionStatus: "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  appointmentId: string;
  postingStatus: "NOT_REQUIRED" | "PENDING" | "POSTED";
  expectedLineCount: number;
  movementCount: number;
  lines: ConsumableLine[];
};

function quantityLabel(value: number, unit: string) {
  return `${value.toLocaleString("tr-TR", { maximumFractionDigits: 3 })} ${userLabel(unit)}`;
}

export function ExecutionConsumablesPanel({
  executionId,
  canUpdate,
}: {
  executionId: string;
  canUpdate: boolean;
}) {
  const [summary, setSummary] = useState<ConsumableSummary | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const next = await api<ConsumableSummary>(
        `/operations/consumables/executions/${executionId}`,
      );
      setSummary(next);
      setDrafts(
        Object.fromEntries(
          next.lines.map((line) => [
            line.productId,
            String(line.recordedActualQuantity ?? line.expectedQuantity),
          ]),
        ),
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Sarf malzeme tüketimi yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // Execution identity determines the snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executionId]);

  async function saveActual(line: ConsumableLine) {
    const actualQuantity = Number(drafts[line.productId]);
    if (!Number.isFinite(actualQuantity) || actualQuantity < 0) {
      setError("Gerçek kullanım miktarı sıfır veya daha büyük olmalıdır.");
      return;
    }

    setBusyProductId(line.productId);
    setError("");
    try {
      await api(
        `/operations/consumables/executions/${executionId}/products/${line.productId}`,
        {
          method: "PATCH",
          body: {
            actualQuantity,
            expectedVersion: line.version,
          },
        },
      );
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Gerçek sarf miktarı kaydedilemedi.",
      );
    } finally {
      setBusyProductId(null);
    }
  }

  if (loading) {
    return (
      <div className="mt-3 rounded-[14px] border border-[var(--line)] p-3">
        <Spinner label="Sarf malzemeler yükleniyor..." />
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="mt-3 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-[var(--ink)]">Sarf Malzeme Tüketimi</p>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            Gerçek kullanım girilmezse hizmet başlangıcında kaydedilen beklenen miktar stoktan düşülür.
          </p>
        </div>
        <span className="rounded-full bg-[var(--surface-2)] px-3 py-1 text-[11px] font-semibold text-[var(--ink)]">
          {summary.postingStatus === "POSTED"
            ? "Stok işlendi"
            : summary.postingStatus === "NOT_REQUIRED"
              ? "Sarf gerekmiyor"
              : "Stok işlemi bekliyor"}
        </span>
      </div>

      {error ? (
        <div className="mt-3">
          <Alert onClose={() => setError("")}>{error}</Alert>
        </div>
      ) : null}

      {summary.lines.length ? (
        <div className="mt-3 space-y-2">
          {summary.lines.map((line) => (
            <div
              key={line.productId}
              className="grid gap-3 rounded-[12px] bg-[var(--surface-2)] p-3 lg:grid-cols-[minmax(0,1fr)_120px_180px_120px_auto] lg:items-center"
            >
              <div>
                <p className="text-xs font-semibold text-[var(--ink)]">
                  {line.productName}
                </p>
                <p className="mt-1 text-[11px] text-[var(--muted)]">
                  {line.sku ?? "Stok kodu yok"}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted-soft)]">
                  Beklenen
                </p>
                <p className="mt-1 text-xs font-semibold text-[var(--ink)]">
                  {quantityLabel(line.expectedQuantity, line.unit)}
                </p>
              </div>
              <label>
                <span className="mb-1 block text-[10px] uppercase tracking-[0.08em] text-[var(--muted-soft)]">
                  Gerçek
                </span>
                <TextInput
                  type="number"
                  min="0"
                  step="0.001"
                  disabled={!canUpdate || summary.postingStatus === "POSTED"}
                  value={drafts[line.productId] ?? ""}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [line.productId]: event.target.value,
                    }))
                  }
                />
              </label>
              <div>
                <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted-soft)]">
                  Sapma
                </p>
                <p className="mt-1 text-xs font-semibold text-[var(--ink)]">
                  {line.varianceQuantity > 0 ? "+" : ""}
                  {quantityLabel(line.varianceQuantity, line.unit)}
                </p>
                {summary.postingStatus === "POSTED" ? (
                  <p className="mt-1 text-[10px] text-[var(--muted)]">
                    Stok: {quantityLabel(line.postedQuantity, line.unit)}
                  </p>
                ) : null}
              </div>
              {summary.postingStatus !== "POSTED" && canUpdate ? (
                <Button
                  variant="secondary"
                  disabled={Boolean(busyProductId)}
                  onClick={() => void saveActual(line)}
                >
                  {busyProductId === line.productId ? "Kaydediliyor..." : "Gerçeği Kaydet"}
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-[12px] bg-[var(--surface-2)] p-3 text-xs text-[var(--muted)]">
          Bu hizmet için sarf malzeme reçetesi tanımlı değil.
        </p>
      )}
    </div>
  );
}
