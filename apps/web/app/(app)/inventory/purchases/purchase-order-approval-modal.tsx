"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Modal } from "@/components/modal";
import { Alert, Button, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";

type PurchaseOrderSummary = {
  id: string;
  supplierName: string | null;
  warehouseName: string;
  totalAmount: number | string;
};

type ApprovalLevel = {
  id: string;
  level: number;
  requiredRole: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  approvedByUserId: string | null;
  approvedAt: string | null;
};

type ApprovalState = {
  order: {
    id: string;
    status: string;
    totalAmount: number | string;
  };
  approvals: ApprovalLevel[];
};

const ROLE_LABELS: Record<string, string> = {
  MANAGER: "Yönetici",
  FINANCE: "Finans",
  DIRECTOR: "Direktör",
};

export function PurchaseOrderApprovalModal({
  order,
  canWrite,
  onClose,
  onChanged,
}: {
  order: PurchaseOrderSummary | null;
  canWrite: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const [state, setState] = useState<ApprovalState | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyLevel, setBusyLevel] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!order) return;
    setLoading(true);
    setError("");
    try {
      const next = await api<ApprovalState>(
        `/procurement/purchase-orders/${order.id}/approvals`,
      );
      setState(next);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Satın Alma Siparişi Onay Akışı Yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }, [order]);

  useEffect(() => {
    if (!order) {
      setState(null);
      setError("");
      return;
    }
    void load();
  }, [load, order]);

  const actionableLevel = useMemo(() => {
    if (!state) return null;
    return (
      state.approvals.find((approval, index) => {
        if (approval.status !== "PENDING") return false;
        return state.approvals
          .slice(0, index)
          .every((previous) => previous.status === "APPROVED");
      }) ?? null
    );
  }, [state]);

  async function decide(level: number, decision: "approve" | "reject") {
    if (!order || !canWrite || busyLevel !== null) return;
    setBusyLevel(level);
    setError("");
    try {
      const next = await api<ApprovalState>(
        `/procurement/purchase-orders/${order.id}/approvals/${level}/${decision}`,
        { method: "POST" },
      );
      setState(next);
      showToast(
        decision === "approve"
          ? `Onay Seviyesi ${level} Tamamlandı.`
          : `Onay Seviyesi ${level} Reddedildi.`,
      );
      await onChanged();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : decision === "approve"
            ? "Onay İşlemi Tamamlanamadı."
            : "Red İşlemi Tamamlanamadı.",
      );
    } finally {
      setBusyLevel(null);
    }
  }

  return (
    <Modal
      open={Boolean(order)}
      onClose={() => {
        if (busyLevel === null) onClose();
      }}
      title="Satın Alma Onay Akışı"
      description={
        order
          ? `${order.supplierName || "Tedarikçi Seçilmedi"} · ${order.warehouseName} · ${formatMoney(order.totalAmount)}`
          : undefined
      }
    >
      <div className="space-y-4">
        {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

        {loading && !state ? (
          <Spinner label="Onay Akışı Yükleniyor..." />
        ) : state ? (
          <>
            <div className="rounded-[16px] bg-[var(--surface-2)] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--muted-soft)]">
                Sipariş Durumu
              </p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-[13px] font-semibold text-[var(--ink)]">
                  {statusLabel(state.order.status)}
                </span>
                <span className="text-[12px] font-semibold text-[var(--accent)]">
                  {formatMoney(state.order.totalAmount)}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              {state.approvals.map((approval) => {
                const actionable = actionableLevel?.id === approval.id;
                return (
                  <article
                    key={approval.id}
                    className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--muted-soft)]">
                          Seviye {approval.level}
                        </p>
                        <p className="mt-1 text-[14px] font-semibold text-[var(--ink)]">
                          {ROLE_LABELS[approval.requiredRole] ?? approval.requiredRole}
                        </p>
                      </div>
                      <ApprovalBadge status={approval.status} />
                    </div>

                    <p className="mt-3 text-[11px] leading-5 text-[var(--muted)]">
                      {approval.status === "APPROVED"
                        ? `Tamamlandı${approval.approvedAt ? ` · ${formatDate(approval.approvedAt)}` : ""}`
                        : approval.status === "REJECTED"
                          ? `Reddedildi${approval.approvedAt ? ` · ${formatDate(approval.approvedAt)}` : ""}`
                          : actionable
                            ? "Sıradaki Aktif Onay Seviyesi. Sistem Rol Ve Şube Yetkilerini Otomatik Olarak Doğrular."
                            : "Önceki Onay Seviyelerinin Tamamlanması Bekleniyor."}
                    </p>

                    {actionable && canWrite && state.order.status === "PENDING" ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          disabled={busyLevel !== null}
                          onClick={() => void decide(approval.level, "approve")}
                        >
                          {busyLevel === approval.level ? "İşleniyor..." : "Onayla"}
                        </Button>
                        <Button
                          variant="danger"
                          disabled={busyLevel !== null}
                          onClick={() => void decide(approval.level, "reject")}
                        >
                          Reddet
                        </Button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>

            {!canWrite ? (
              <div className="rounded-[16px] bg-[var(--surface-2)] px-4 py-3 text-[11px] leading-5 text-[var(--muted)]">
                Onay Seviyelerini Görüntüleyebilirsiniz. Karar Vermek İçin Gerekli Yetkiye Sahip Olmanız Gerekir.
              </div>
            ) : null}
          </>
        ) : null}

        <div className="flex justify-end pt-1">
          <Button variant="secondary" onClick={onClose} disabled={busyLevel !== null}>
            Kapat
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ApprovalBadge({ status }: { status: ApprovalLevel["status"] }) {
  const tone =
    status === "APPROVED"
      ? "bg-[var(--success-soft)] text-[var(--success)]"
      : status === "REJECTED"
        ? "bg-[var(--danger-soft)] text-[var(--danger)]"
        : "bg-[var(--warning-soft)] text-[var(--warning)]";
  return (
    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${tone}`}>
      {status === "APPROVED" ? "Onaylandı" : status === "REJECTED" ? "Reddedildi" : "Bekliyor"}
    </span>
  );
}

function statusLabel(status: string) {
  if (status === "APPROVED") return "Onaylandı";
  if (status === "PENDING") return "Onay Bekliyor";
  if (status === "ORDERED") return "Sipariş Verildi";
  if (status === "CANCELLED") return "İptal Edildi";
  return status;
}

function formatMoney(value: number | string) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
