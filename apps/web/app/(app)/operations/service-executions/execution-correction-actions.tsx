"use client";

import { useState } from "react";

import { Button } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type ExecutionCorrectionTarget = {
  id: string;
  status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  version: number;
  appointmentStatus: string | null;
};

export function ExecutionCorrectionActions({
  execution,
  canUpdate,
  onChanged,
  onError,
}: {
  execution: ExecutionCorrectionTarget;
  canUpdate: boolean;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function run(action: "cancel" | "reverse-completion") {
    if (!canUpdate || busy) return;
    const reasonLabel = window.prompt(
      action === "cancel"
        ? "İcra iptal nedenini yazın:"
        : "Tamamlama geri alma nedenini yazın:",
    )?.trim();
    if (!reasonLabel) return;

    const confirmed = window.confirm(
      action === "cancel"
        ? "Bu hizmet icrası iptal edilecek. Devam edilsin mi?"
        : "Tamamlanmış hizmet icrası CANCELLED durumuna alınacak. Bu işlem yalnız downstream kayıt oluşmadıysa yapılabilir. Devam edilsin mi?",
    );
    if (!confirmed) return;

    setBusy(true);
    onError("");
    try {
      await api(`/operations/service-executions/${execution.id}/${action}`, {
        method: "POST",
        body: {
          expectedVersion: execution.version,
          reasonCode: action === "cancel" ? "MANUAL_CANCEL" : "MANUAL_REVERSAL",
          reasonLabel,
        },
      });
      await onChanged();
    } catch (err) {
      onError(
        err instanceof ApiError
          ? err.message
          : "Hizmet düzeltme işlemi tamamlanamadı.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!canUpdate || execution.status === "CANCELLED") return null;

  if (execution.status === "IN_PROGRESS") {
    return (
      <Button variant="secondary" disabled={busy} onClick={() => void run("cancel")}>
        {busy ? "İptal Ediliyor..." : "İcrayı İptal Et"}
      </Button>
    );
  }

  if (execution.status === "COMPLETED" && execution.appointmentStatus !== "COMPLETED") {
    return (
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => void run("reverse-completion")}
      >
        {busy ? "Geri Alınıyor..." : "Tamamlamayı Geri Al"}
      </Button>
    );
  }

  return null;
}
