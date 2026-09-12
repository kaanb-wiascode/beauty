"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  DataView,
  DataViewMeta,
  DataViewToolbar,
  FilterChip,
  SearchField,
  ToolbarSelect,
} from "@/components/data-view";
import { Alert, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type PurchaseRequest = {
  id: string;
  productName: string;
  warehouseName: string;
  currentQuantity: number | string;
  requestedQuantity: number | string;
  status: string;
  reason?: string;
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
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<ViewMode>("requests");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    Promise.all([
      api<PurchaseRequest[]>("/inventory/purchase-requests"),
      api<PurchaseOrder[]>("/inventory/purchase-orders"),
    ])
      .then(([requestRows, orderRows]) => {
        setRequests(requestRows);
        setOrders(orderRows);
      })
      .catch((requestError) =>
        setError(
          requestError instanceof ApiError
            ? requestError.message
            : "Satın alma operasyonu yüklenemedi.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

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
          <RequestList rows={visibleRequests} />
        ) : (
          <OrderList rows={visibleOrders} />
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
    </div>
  );
}

function RequestList({ rows }: { rows: PurchaseRequest[] }) {
  return (
    <>
      <div className="hidden md:block">
        <div className="grid grid-cols-[1.5fr_1fr_.7fr_.7fr_.9fr] border-b border-[var(--line)] bg-[var(--surface-2)]/40 px-5 py-3 text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--muted-soft)]">
          <span>Ürün</span>
          <span>Lokasyon</span>
          <span>Mevcut</span>
          <span>Talep</span>
          <span>Durum</span>
        </div>

        <div className="divide-y divide-[var(--line)]">
          {rows.map((request) => (
            <div
              key={request.id}
              className="grid grid-cols-[1.5fr_1fr_.7fr_.7fr_.9fr] items-center px-5 py-4"
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
          </article>
        ))}
      </div>
    </>
  );
}

function OrderList({ rows }: { rows: PurchaseOrder[] }) {
  return (
    <>
      <div className="hidden md:block">
        <div className="grid grid-cols-[1.3fr_1fr_.55fr_.85fr_.9fr] border-b border-[var(--line)] bg-[var(--surface-2)]/40 px-5 py-3 text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--muted-soft)]">
          <span>Tedarikçi</span>
          <span>Lokasyon</span>
          <span>Kalem</span>
          <span>Tutar</span>
          <span>Durum</span>
        </div>
        <div className="divide-y divide-[var(--line)]">
          {rows.map((order) => (
            <div
              key={order.id}
              className="grid grid-cols-[1.3fr_1fr_.55fr_.85fr_.9fr] items-center px-5 py-4"
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
          </article>
        ))}
      </div>
    </>
  );
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
