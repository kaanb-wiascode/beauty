"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { Modal } from "@/components/modal";
import { Alert, Button, Field, Spinner, TextInput } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";

type PurchaseOrderSummary = {
  id: string;
  supplierName: string | null;
  warehouseName: string;
  totalAmount: number | string;
};

type PurchaseOrderDetail = {
  order: {
    id: string;
    status: string;
    totalAmount: number | string;
    supplierId: string | null;
    supplierName: string | null;
    warehouseId: string;
    warehouseName: string;
    branchId: string | null;
    orderedAt: string | null;
    receivedAt: string | null;
    note: string | null;
  };
  items: Array<{
    id: string;
    productId: string;
    productName: string;
    sku: string | null;
    quantity: number | string;
    receivedQuantity: number | string;
    remainingQuantity: number | string;
    unitCost: number | string;
    lineTotal: number | string;
  }>;
};

type ReceiptResult = {
  receiptId: string;
  purchaseOrderId: string;
  supplierBillId: string;
  total: number;
  purchaseOrderStatus: "ORDERED" | "RECEIVED";
};

export function PurchaseOrderReceiptModal({
  order,
  onClose,
  onChanged,
}: {
  order: PurchaseOrderSummary | null;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const [detail, setDetail] = useState<PurchaseOrderDetail | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!order) return;
    setLoading(true);
    setError("");
    try {
      const next = await api<PurchaseOrderDetail>(`/procurement/purchase-orders/${order.id}`);
      setDetail(next);
      setQuantities(
        Object.fromEntries(
          next.items.map((item) => [
            item.id,
            Number(item.remainingQuantity) > 0 ? String(Number(item.remainingQuantity)) : "0",
          ]),
        ),
      );
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Satın alma siparişi kalemleri yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }, [order]);

  useEffect(() => {
    if (!order) {
      setDetail(null);
      setQuantities({});
      setInvoiceNumber("");
      setDueAt("");
      setNote("");
      setError("");
      return;
    }
    void load();
  }, [load, order]);

  const receiptTotal = useMemo(() => {
    if (!detail) return 0;
    return detail.items.reduce((sum, item) => {
      const quantity = Number(quantities[item.id] || 0);
      return sum + (Number.isFinite(quantity) ? quantity : 0) * Number(item.unitCost || 0);
    }, 0);
  }, [detail, quantities]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!order || !detail || saving) return;

    const items = detail.items
      .map((item) => ({
        purchaseOrderItemId: item.id,
        quantity: Number(quantities[item.id] || 0),
        remaining: Number(item.remainingQuantity || 0),
      }))
      .filter((item) => Number.isFinite(item.quantity) && item.quantity > 0);

    if (!items.length) {
      setError("Mal kabul için en az bir kalemde sıfırdan büyük miktar girilmelidir.");
      return;
    }
    if (items.some((item) => item.quantity > item.remaining)) {
      setError("Teslim miktarı kalan sipariş miktarını aşamaz.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const result = await api<ReceiptResult>(
        `/procurement/purchase-orders/${order.id}/receive`,
        {
          method: "POST",
          body: {
            items: items.map(({ purchaseOrderItemId, quantity }) => ({
              purchaseOrderItemId,
              quantity,
            })),
            invoiceNumber: invoiceNumber.trim() || undefined,
            dueAt: dueAt ? new Date(`${dueAt}T12:00:00`).toISOString() : undefined,
            note: note.trim() || undefined,
          },
        },
      );
      showToast(
        result.purchaseOrderStatus === "RECEIVED"
          ? `Mal kabul tamamlandı · ${formatMoney(result.total)}`
          : `Kısmi mal kabul kaydedildi · ${formatMoney(result.total)}`,
      );
      await onChanged();
      onClose();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Mal kabul işlemi tamamlanamadı.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={Boolean(order)}
      onClose={() => {
        if (!saving) onClose();
      }}
      title="Mal kabul"
      description={
        order
          ? `${order.supplierName || "Tedarikçi seçilmedi"} · ${order.warehouseName}`
          : undefined
      }
    >
      <div className="space-y-4">
        {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

        {loading && !detail ? (
          <Spinner label="Sipariş kalemleri yükleniyor..." />
        ) : detail ? (
          <form className="space-y-5" onSubmit={submit}>
            <div className="rounded-[16px] bg-[var(--surface-2)] px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--muted-soft)]">
                    Sipariş toplamı
                  </p>
                  <p className="mt-1 text-[14px] font-semibold text-[var(--ink)]">
                    {formatMoney(detail.order.totalAmount)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--muted-soft)]">
                    Bu kabul
                  </p>
                  <p className="mt-1 text-[14px] font-semibold text-[var(--accent)]">
                    {formatMoney(receiptTotal)}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {detail.items.map((item) => {
                const remaining = Number(item.remainingQuantity || 0);
                return (
                  <article
                    key={item.id}
                    className="grid gap-3 rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4 sm:grid-cols-[minmax(0,1fr)_120px] sm:items-end"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-[var(--ink)]">
                        {item.productName}
                      </p>
                      <p className="mt-1 text-[10px] text-[var(--muted-soft)]">
                        {item.sku ? `${item.sku} · ` : ""}Sipariş {formatQuantity(item.quantity)} · Alındı {formatQuantity(item.receivedQuantity)} · Kalan {formatQuantity(item.remainingQuantity)}
                      </p>
                      <p className="mt-2 text-[11px] font-medium text-[var(--muted)]">
                        Birim maliyet {formatMoney(item.unitCost)}
                      </p>
                    </div>
                    <Field label="Teslim miktarı">
                      <TextInput
                        type="number"
                        min="0"
                        max={String(remaining)}
                        step="0.001"
                        inputMode="decimal"
                        disabled={remaining <= 0 || saving}
                        value={quantities[item.id] ?? "0"}
                        onChange={(event) =>
                          setQuantities((current) => ({
                            ...current,
                            [item.id]: event.target.value,
                          }))
                        }
                      />
                    </Field>
                  </article>
                );
              })}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Fatura numarası">
                <TextInput
                  value={invoiceNumber}
                  maxLength={100}
                  disabled={saving}
                  onChange={(event) => setInvoiceNumber(event.target.value)}
                  placeholder="Opsiyonel"
                />
              </Field>
              <Field label="Vade tarihi">
                <TextInput
                  type="date"
                  value={dueAt}
                  disabled={saving}
                  onChange={(event) => setDueAt(event.target.value)}
                />
              </Field>
            </div>

            <Field label="Mal kabul notu">
              <TextInput
                value={note}
                maxLength={500}
                disabled={saving}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Opsiyonel"
              />
            </Field>

            <div className="rounded-[16px] bg-[var(--surface-2)] px-4 py-3 text-[11px] leading-5 text-[var(--muted)]">
              Mal kabul; stok miktarını ve ağırlıklı maliyeti günceller, GOODS_RECEIPT stok hareketi üretir, tedarikçi borcunu ve muhasebe fişini aynı transaction içinde oluşturur.
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <Button variant="secondary" onClick={onClose} disabled={saving}>
                Vazgeç
              </Button>
              <Button type="submit" disabled={saving || receiptTotal <= 0}>
                {saving ? "Kaydediliyor..." : "Mal kabulü kaydet"}
              </Button>
            </div>
          </form>
        ) : null}
      </div>
    </Modal>
  );
}

function formatMoney(value: number | string) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatQuantity(value: number | string) {
  return Number(value || 0).toLocaleString("tr-TR", {
    maximumFractionDigits: 3,
  });
}
