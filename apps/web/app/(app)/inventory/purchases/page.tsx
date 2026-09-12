"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import {
  DataView,
  DataViewMeta,
  DataViewToolbar,
  FilterChip,
  SearchField,
  ToolbarSelect,
} from "@/components/data-view";
import { Modal } from "@/components/modal";
import { Alert, Button, Field, Select, Spinner, TextInput } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { PurchaseOrderApprovalModal } from "./purchase-order-approval-modal";

type PurchaseRequest = {
  id: string;
  productId?: string;
  productName: string;
  sku?: string | null;
  warehouseId?: string;
  warehouseName: string;
  currentQuantity: number | string;
  requestedQuantity: number | string;
  status: string;
  reason?: string | null;
  approvedAt?: string | null;
  convertedAt?: string | null;
  convertedPurchaseOrderId?: string | null;
  createdAt: string;
};

type PurchaseOrder = {
  id: string;
  status: string;
  totalAmount: number | string;
  orderedAt: string | null;
  receivedAt: string | null;
  supplierName: string | null;
  warehouseName: string;
  itemCount: number;
};

type Supplier = {
  id: string;
  name: string;
};

type ViewMode = "requests" | "orders";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Taslak",
  PENDING: "Onay bekliyor",
  APPROVED: "Onaylandı",
  ORDERED: "Sipariş verildi",
  RECEIVED: "Teslim alındı",
  CANCELLED: "İptal",
};

function statusTone(status: string) {
  return status === "RECEIVED"
    ? "bg-[var(--success-soft)] text-[var(--success)]"
    : status === "CANCELLED"
      ? "bg-[var(--danger-soft)] text-[var(--danger)]"
      : status === "PENDING"
        ? "bg-[var(--warning-soft)] text-[var(--warning)]"
        : status === "ORDERED"
          ? "bg-[var(--accent-soft)] text-[var(--accent)]"
          : "bg-[var(--surface-2)] text-[var(--muted)]";
}

export default function PurchasesPage() {
  const { showToast } = useToast();
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<ViewMode>("requests");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [convertTarget, setConvertTarget] = useState<PurchaseRequest | null>(null);
  const [approvalTarget, setApprovalTarget] = useState<PurchaseOrder | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [note, setNote] = useState("");
  const canWrite = hasPermission("inventory", "write");

  const load = useCallback(async (withSpinner = false) => {
    if (withSpinner) setLoading(true);
    setError("");
    try {
      const [requestRows, orderRows, supplierRows] = await Promise.all([
        api<PurchaseRequest[]>("/procurement/purchase-requests"),
        api<PurchaseOrder[]>("/inventory/purchase-orders"),
        api<Supplier[]>("/inventory/suppliers"),
      ]);
      setRequests(requestRows);
      setOrders(orderRows);
      setSuppliers(supplierRows);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Satın alma operasyonu yüklenemedi.",
      );
    } finally {
      if (withSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  const statuses = useMemo(() => {
    const rows = view === "requests" ? requests : orders;
    return Array.from(new Set(rows.map((row) => row.status))).sort();
  }, [orders, requests, view]);

  const visibleRequests = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr-TR");

    return requests.filter((row) => {
      if (status && row.status !== status) return false;
      if (!query) return true;

      return [
        row.productName,
        row.warehouseName,
        row.reason ?? "",
        row.sku ?? "",
        STATUS_LABELS[row.status] ?? row.status,
      ].some((value) => value.toLocaleLowerCase("tr-TR").includes(query));
    });
  }, [requests, search, status]);

  const visibleOrders = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr-TR");

    return orders.filter((row) => {
      if (status && row.status !== status) return false;
      if (!query) return true;

      return [
        row.supplierName ?? "",
        row.warehouseName,
        STATUS_LABELS[row.status] ?? row.status,
      ].some((value) => value.toLocaleLowerCase("tr-TR").includes(query));
    });
  }, [orders, search, status]);

  const pendingRequestCount = useMemo(
    () => requests.filter((row) => row.status === "PENDING").length,
    [requests],
  );

  const openOrderCount = useMemo(
    () =>
      orders.filter(
        (row) => row.status !== "RECEIVED" && row.status !== "CANCELLED",
      ).length,
    [orders],
  );

  const openOrderValue = useMemo(
    () =>
      orders
        .filter(
          (row) => row.status !== "RECEIVED" && row.status !== "CANCELLED",
        )
        .reduce((total, row) => total + Number(row.totalAmount || 0), 0),
    [orders],
  );

  function changeView(next: ViewMode) {
    setView(next);
    setSearch("");
    setStatus("");
  }

  function openConvert(request: PurchaseRequest) {
    setConvertTarget(request);
    setSupplierId(suppliers[0]?.id ?? "");
    setUnitCost("");
    setNote("");
    setError("");
  }

  function closeConvert() {
    if (busyId) return;
    setConvertTarget(null);
    setSupplierId("");
    setUnitCost("");
    setNote("");
  }

  async function approveRequest(id: string) {
    if (!canWrite || busyId) return;
    setBusyId(id);
    setError("");
    try {
      await api(`/procurement/purchase-requests/${id}/approve`, { method: "POST" });
      showToast("Satın alma talebi onaylandı.");
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Satın alma talebi onaylanamadı.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function submitApproval(id: string) {
    if (!canWrite || busyId) return;
    setBusyId(id);
    setError("");
    try {
      await api(`/procurement/purchase-orders/${id}/submit-approval`, {
        method: "POST",
      });
      showToast("Satın alma siparişi onay akışına gönderildi.");
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Onay akışı başlatılamadı.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function orderPurchaseOrder(id: string) {
    if (!canWrite || busyId) return;
    setBusyId(id);
    setError("");
    try {
      await api(`/procurement/purchase-orders/${id}/order`, { method: "POST" });
      showToast("Satın alma siparişi sipariş durumuna alındı.");
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Satın alma siparişi ilerletilemedi.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function convertRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!convertTarget || !canWrite || busyId) return;
    const numericCost = Number(unitCost);
    if (!supplierId || !Number.isFinite(numericCost) || numericCost < 0) {
      setError("Tedarikçi ve geçerli bir birim maliyet girilmelidir.");
      return;
    }

    setBusyId(convertTarget.id);
    setError("");
    try {
      await api(`/procurement/purchase-requests/${convertTarget.id}/convert`, {
        method: "POST",
        body: {
          supplierId,
          unitCost: numericCost,
          note: note.trim() || undefined,
        },
      });
      showToast("Satın alma talebi siparişe dönüştürüldü.");
      setConvertTarget(null);
      setSupplierId("");
      setUnitCost("");
      setNote("");
      setView("orders");
      setStatus("");
      setSearch("");
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Satın alma talebi siparişe dönüştürülemedi.",
      );
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="py-16">
        <Spinner label="Satın alma hazırlanıyor..." />
      </div>
    );
  }

  const visibleCount =
    view === "requests" ? visibleRequests.length : visibleOrders.length;
  const totalCount = view === "requests" ? requests.length : orders.length;

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--muted-soft)]">
            SATIN ALMA
          </p>
          <h1 className="text-[30px] font-semibold tracking-[-.035em] text-[var(--ink)]">
            Satın Alma Operasyonu
          </h1>
          <p className="mt-1 text-[14px] text-[var(--muted)]">
            Stok ihtiyaçlarını talepten siparişe kadar aynı operasyon yüzeyinde izleyin.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/inventory/supplier-network"
            className="inline-flex min-h-10 items-center justify-center rounded-[14px] bg-white/70 px-4 py-2.5 text-[13px] font-medium text-[var(--ink)] shadow-[inset_0_0_0_1px_var(--line)] transition-colors hover:bg-white"
          >
            Tedarikçi ağı
          </Link>
          <Link
            href="/inventory"
            className="inline-flex min-h-10 items-center justify-center rounded-[14px] bg-[var(--surface-2)] px-4 py-2.5 text-[13px] font-medium text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
          >
            Envantere dön
          </Link>
        </div>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      {!canWrite ? (
        <Alert tone="success">
          Bu görünüm salt okunur. Satın alma aksiyonları için inventory.write izni gerekir.
        </Alert>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Açık talep" value={String(pendingRequestCount)} />
        <Metric label="Açık sipariş" value={String(openOrderCount)} />
        <Metric label="Açık sipariş değeri" value={formatMoney(openOrderValue)} compact />
        <Metric label="Toplam sipariş" value={String(orders.length)} />
      </section>

      <DataView>
        <div className="flex flex-wrap gap-2 border-b border-[var(--line)] px-4 pt-4">
          <button
            type="button"
            onClick={() => changeView("requests")}
            className={`rounded-t-[12px] border-b-2 px-4 py-2.5 text-[12px] font-semibold transition ${
              view === "requests"
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
          >
            Satın alma talepleri · {requests.length}
          </button>
          <button
            type="button"
            onClick={() => changeView("orders")}
            className={`rounded-t-[12px] border-b-2 px-4 py-2.5 text-[12px] font-semibold transition ${
              view === "orders"
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
          >
            Satın alma siparişleri · {orders.length}
          </button>
        </div>

        <DataViewToolbar
          search={
            <SearchField
              value={search}
              placeholder={
                view === "requests"
                  ? "Ürün, lokasyon veya neden ara..."
                  : "Tedarikçi, lokasyon veya durum ara..."
              }
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setSearch("");
              }}
              aria-label="Satın alma kayıtlarında ara"
            />
          }
          actions={
            <ToolbarSelect
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label="Satın alma durumu"
            >
              <option value="">Tüm durumlar</option>
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value] ?? value}
                </option>
              ))}
            </ToolbarSelect>
          }
          filters={
            <>
              <FilterChip active={!status} count={totalCount} onClick={() => setStatus("")}>
                Tümü
              </FilterChip>
              {view === "requests" ? (
                <FilterChip
                  active={status === "PENDING"}
                  count={pendingRequestCount}
                  onClick={() => setStatus("PENDING")}
                >
                  Onay bekleyen
                </FilterChip>
              ) : (
                <FilterChip
                  active={status === "ORDERED"}
                  count={orders.filter((row) => row.status === "ORDERED").length}
                  onClick={() => setStatus("ORDERED")}
                >
                  Siparişte
                </FilterChip>
              )}
            </>
          }
        />

        {view === "requests" ? (
          <RequestList
            rows={visibleRequests}
            canWrite={canWrite}
            busyId={busyId}
            onApprove={approveRequest}
            onConvert={openConvert}
          />
        ) : (
          <OrderList
            rows={visibleOrders}
            canWrite={canWrite}
            busyId={busyId}
            onSubmitApproval={submitApproval}
            onOrder={orderPurchaseOrder}
            onOpenApproval={setApprovalTarget}
          />
        )}

        {!visibleCount ? (
          <div className="px-5 py-14 text-center">
            <p className="text-[13px] font-medium text-[var(--ink)]">
              Eşleşen satın alma kaydı yok.
            </p>
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              Arama veya durum filtresini değiştirerek tekrar deneyin.
            </p>
          </div>
        ) : null}

        <DataViewMeta>
          <span>{visibleCount} kayıt gösteriliyor</span>
          <span>Toplam {totalCount} kayıt</span>
        </DataViewMeta>
      </DataView>

      <PurchaseOrderApprovalModal
        order={approvalTarget}
        canWrite={canWrite}
        onClose={() => setApprovalTarget(null)}
        onChanged={() => load()}
      />

      <Modal
        open={Boolean(convertTarget)}
        onClose={closeConvert}
        title="Talebi siparişe dönüştür"
        description={
          convertTarget
            ? `${convertTarget.productName} için tedarikçi ve birim maliyet seçin.`
            : undefined
        }
      >
        <form className="space-y-4" onSubmit={convertRequest}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tedarikçi" required>
              <Select
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
                required
              >
                <option value="">Tedarikçi seçin</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Birim maliyet" required>
              <TextInput
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={unitCost}
                onChange={(event) => setUnitCost(event.target.value)}
                placeholder="0,00"
                required
              />
            </Field>
          </div>

          <Field label="Not">
            <TextInput
              value={note}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Opsiyonel satın alma notu"
            />
          </Field>

          {convertTarget ? (
            <div className="rounded-[16px] bg-[var(--surface-2)] px-4 py-3 text-[11px] leading-5 text-[var(--muted)]">
              Talep miktarı: {formatQuantity(convertTarget.requestedQuantity)} · Tahmini toplam:{" "}
              {unitCost && Number.isFinite(Number(unitCost))
                ? formatMoney(Number(unitCost) * Number(convertTarget.requestedQuantity || 0))
                : "—"}
            </div>
          ) : null}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={closeConvert} disabled={Boolean(busyId)}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={Boolean(busyId) || !suppliers.length}>
              {busyId ? "Dönüştürülüyor..." : "Sipariş oluştur"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function RequestList({
  rows,
  canWrite,
  busyId,
  onApprove,
  onConvert,
}: {
  rows: PurchaseRequest[];
  canWrite: boolean;
  busyId: string | null;
  onApprove: (id: string) => Promise<void>;
  onConvert: (request: PurchaseRequest) => void;
}) {
  return (
    <>
      <div className="hidden md:block">
        <div className="grid grid-cols-[1.4fr_.9fr_.6fr_.6fr_.8fr_auto] border-b border-[var(--line)] bg-[var(--surface-2)]/40 px-5 py-3 text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--muted-soft)]">
          <span>Ürün</span>
          <span>Lokasyon</span>
          <span>Mevcut</span>
          <span>Talep</span>
          <span>Durum</span>
          <span>Aksiyon</span>
        </div>

        <div className="divide-y divide-[var(--line)]">
          {rows.map((request) => (
            <div
              key={request.id}
              className="grid grid-cols-[1.4fr_.9fr_.6fr_.6fr_.8fr_auto] items-center gap-3 px-5 py-4"
            >
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-[var(--ink)]">
                  {request.productName}
                </div>
                <div className="mt-1 truncate text-[10px] text-[var(--muted-soft)]">
                  {request.reason || "Stok seviyesi düşük"}
                </div>
              </div>
              <span className="text-[12px] text-[var(--muted)]">
                {request.warehouseName}
              </span>
              <span className="text-[12px] text-[var(--muted)]">
                {formatQuantity(request.currentQuantity)}
              </span>
              <span className="text-[12px] font-semibold text-[var(--ink)]">
                {formatQuantity(request.requestedQuantity)}
              </span>
              <StatusBadge status={request.status} />
              <RequestAction
                request={request}
                canWrite={canWrite}
                busy={busyId === request.id}
                disabled={Boolean(busyId) && busyId !== request.id}
                onApprove={onApprove}
                onConvert={onConvert}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="divide-y divide-[var(--line)] md:hidden">
        {rows.map((request) => (
          <article key={request.id} className="space-y-3 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-[var(--ink)]">
                  {request.productName}
                </p>
                <p className="mt-1 text-[11px] text-[var(--muted)]">
                  {request.warehouseName}
                </p>
              </div>
              <StatusBadge status={request.status} />
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-[12px] bg-[var(--surface-2)]/55 p-3">
              <Quantity label="Mevcut" value={request.currentQuantity} />
              <Quantity label="Talep" value={request.requestedQuantity} accent />
            </div>
            <p className="text-[10px] leading-5 text-[var(--muted)]">
              {request.reason || "Stok seviyesi düşük"}
            </p>
            <RequestAction
              request={request}
              canWrite={canWrite}
              busy={busyId === request.id}
              disabled={Boolean(busyId) && busyId !== request.id}
              onApprove={onApprove}
              onConvert={onConvert}
            />
          </article>
        ))}
      </div>
    </>
  );
}

function RequestAction({
  request,
  canWrite,
  busy,
  disabled,
  onApprove,
  onConvert,
}: {
  request: PurchaseRequest;
  canWrite: boolean;
  busy: boolean;
  disabled: boolean;
  onApprove: (id: string) => Promise<void>;
  onConvert: (request: PurchaseRequest) => void;
}) {
  if (!canWrite) return <span className="text-[10px] text-[var(--muted-soft)]">Salt okunur</span>;
  if (request.status === "PENDING") {
    return (
      <Button
        variant="secondary"
        className="min-h-8 px-3 py-1.5 text-[11px]"
        disabled={busy || disabled}
        onClick={() => void onApprove(request.id)}
      >
        {busy ? "Onaylanıyor..." : "Onayla"}
      </Button>
    );
  }
  if (request.status === "APPROVED") {
    return (
      <Button
        className="min-h-8 px-3 py-1.5 text-[11px]"
        disabled={busy || disabled}
        onClick={() => onConvert(request)}
      >
        Siparişe dönüştür
      </Button>
    );
  }
  return <span className="text-[10px] text-[var(--muted-soft)]">—</span>;
}

function OrderList({
  rows,
  canWrite,
  busyId,
  onSubmitApproval,
  onOrder,
  onOpenApproval,
}: {
  rows: PurchaseOrder[];
  canWrite: boolean;
  busyId: string | null;
  onSubmitApproval: (id: string) => Promise<void>;
  onOrder: (id: string) => Promise<void>;
  onOpenApproval: (order: PurchaseOrder) => void;
}) {
  return (
    <>
      <div className="hidden md:block">
        <div className="grid grid-cols-[1.2fr_.9fr_.5fr_.75fr_.8fr_auto] border-b border-[var(--line)] bg-[var(--surface-2)]/40 px-5 py-3 text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--muted-soft)]">
          <span>Tedarikçi</span>
          <span>Lokasyon</span>
          <span>Kalem</span>
          <span>Tutar</span>
          <span>Durum</span>
          <span>Aksiyon</span>
        </div>
        <div className="divide-y divide-[var(--line)]">
          {rows.map((order) => (
            <div
              key={order.id}
              className="grid grid-cols-[1.2fr_.9fr_.5fr_.75fr_.8fr_auto] items-center gap-3 px-5 py-4"
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-[var(--ink)]">
                  {order.supplierName || "Tedarikçi seçilmedi"}
                </p>
                <p className="mt-1 font-mono text-[10px] text-[var(--muted-soft)]">
                  {shortId(order.id)}
                </p>
              </div>
              <span className="text-[12px] text-[var(--muted)]">
                {order.warehouseName}
              </span>
              <span className="text-[12px] text-[var(--muted)]">
                {order.itemCount}
              </span>
              <span className="text-[12px] font-semibold text-[var(--ink)]">
                {formatMoney(order.totalAmount)}
              </span>
              <div>
                <StatusBadge status={order.status} />
                <p className="mt-1.5 text-[9px] text-[var(--muted-soft)]">
                  {order.receivedAt
                    ? `Teslim ${formatDate(order.receivedAt)}`
                    : order.orderedAt
                      ? `Sipariş ${formatDate(order.orderedAt)}`
                      : "Henüz sipariş edilmedi"}
                </p>
              </div>
              <OrderAction
                order={order}
                canWrite={canWrite}
                busy={busyId === order.id}
                disabled={Boolean(busyId) && busyId !== order.id}
                onSubmitApproval={onSubmitApproval}
                onOrder={onOrder}
                onOpenApproval={onOpenApproval}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="divide-y divide-[var(--line)] md:hidden">
        {rows.map((order) => (
          <article key={order.id} className="space-y-3 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-[var(--ink)]">
                  {order.supplierName || "Tedarikçi seçilmedi"}
                </p>
                <p className="mt-1 text-[11px] text-[var(--muted)]">
                  {order.warehouseName}
                </p>
              </div>
              <StatusBadge status={order.status} />
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-[12px] bg-[var(--surface-2)]/55 p-3">
              <div>
                <p className="text-[9px] uppercase tracking-[.08em] text-[var(--muted-soft)]">
                  Kalem
                </p>
                <p className="mt-1 text-[12px] font-semibold text-[var(--ink)]">
                  {order.itemCount}
                </p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-[.08em] text-[var(--muted-soft)]">
                  Tutar
                </p>
                <p className="mt-1 text-[12px] font-semibold text-[var(--accent)]">
                  {formatMoney(order.totalAmount)}
                </p>
              </div>
            </div>
            <p className="text-[10px] text-[var(--muted-soft)]">
              {order.receivedAt
                ? `Teslim: ${formatDate(order.receivedAt)}`
                : order.orderedAt
                  ? `Sipariş: ${formatDate(order.orderedAt)}`
                  : "Henüz sipariş edilmedi"}
            </p>
            <OrderAction
              order={order}
              canWrite={canWrite}
              busy={busyId === order.id}
              disabled={Boolean(busyId) && busyId !== order.id}
              onSubmitApproval={onSubmitApproval}
              onOrder={onOrder}
              onOpenApproval={onOpenApproval}
            />
          </article>
        ))}
      </div>
    </>
  );
}

function OrderAction({
  order,
  canWrite,
  busy,
  disabled,
  onSubmitApproval,
  onOrder,
  onOpenApproval,
}: {
  order: PurchaseOrder;
  canWrite: boolean;
  busy: boolean;
  disabled: boolean;
  onSubmitApproval: (id: string) => Promise<void>;
  onOrder: (id: string) => Promise<void>;
  onOpenApproval: (order: PurchaseOrder) => void;
}) {
  if (!canWrite) {
    if (order.status === "PENDING") {
      return (
        <Button
          variant="ghost"
          className="min-h-8 px-3 py-1.5 text-[11px]"
          onClick={() => onOpenApproval(order)}
        >
          Onay akışı
        </Button>
      );
    }
    return <span className="text-[10px] text-[var(--muted-soft)]">Salt okunur</span>;
  }
  if (order.status === "DRAFT") {
    return (
      <Button
        variant="secondary"
        className="min-h-8 px-3 py-1.5 text-[11px]"
        disabled={busy || disabled}
        onClick={() => void onSubmitApproval(order.id)}
      >
        {busy ? "Gönderiliyor..." : "Onaya gönder"}
      </Button>
    );
  }
  if (order.status === "PENDING") {
    return (
      <Button
        variant="secondary"
        className="min-h-8 px-3 py-1.5 text-[11px]"
        disabled={busy || disabled}
        onClick={() => onOpenApproval(order)}
      >
        Onay akışı
      </Button>
    );
  }
  if (order.status === "APPROVED") {
    return (
      <Button
        className="min-h-8 px-3 py-1.5 text-[11px]"
        disabled={busy || disabled}
        onClick={() => void onOrder(order.id)}
      >
        {busy ? "İşleniyor..." : "Sipariş ver"}
      </Button>
    );
  }
  return <span className="text-[10px] text-[var(--muted-soft)]">—</span>;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex w-fit rounded-full px-2.5 py-1 text-[9px] font-semibold ${statusTone(status)}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function Quantity({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-[.08em] text-[var(--muted-soft)]">
        {label}
      </p>
      <p
        className={`mt-1 text-[12px] font-semibold ${
          accent ? "text-[var(--accent)]" : "text-[var(--ink)]"
        }`}
      >
        {formatQuantity(value)}
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--muted-soft)]">
        {label}
      </p>
      <p
        className={`mt-3 font-semibold tracking-[-.04em] text-[var(--ink)] ${
          compact ? "text-[17px]" : "text-[28px]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function formatQuantity(value: number | string) {
  return Number(value || 0).toLocaleString("tr-TR", {
    maximumFractionDigits: 3,
  });
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
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "short" }).format(date);
}

function shortId(value: string) {
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}
