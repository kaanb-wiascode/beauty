"use client";

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

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Onay bekliyor",
  APPROVED: "Onaylandı",
  ORDERED: "Sipariş verildi",
  RECEIVED: "Teslim alındı",
  CANCELLED: "İptal",
};

export default function PurchasesPage() {
  const [rows, setRows] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    api<PurchaseRequest[]>("/inventory/purchase-requests")
      .then(setRows)
      .catch((requestError) =>
        setError(
          requestError instanceof ApiError
            ? requestError.message
            : "Satın alma talepleri yüklenemedi.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  const statuses = useMemo(
    () => Array.from(new Set(rows.map((row) => row.status))).sort(),
    [rows],
  );

  const visibleRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr-TR");

    return rows.filter((row) => {
      if (status && row.status !== status) return false;
      if (!query) return true;

      return [
        row.productName,
        row.warehouseName,
        row.reason ?? "",
        STATUS_LABELS[row.status] ?? row.status,
      ].some((value) => value.toLocaleLowerCase("tr-TR").includes(query));
    });
  }, [rows, search, status]);

  const pendingCount = useMemo(
    () => rows.filter((row) => row.status === "PENDING").length,
    [rows],
  );

  if (loading) {
    return (
      <div className="py-16">
        <Spinner label="Satın alma hazırlanıyor..." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
      <header>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--muted-soft)]">
          SATIN ALMA
        </p>
        <h1 className="text-[30px] font-semibold tracking-[-.035em] text-[var(--ink)]">
          Satın Alma Talepleri
        </h1>
        <p className="mt-1 text-[14px] text-[var(--muted)]">
          Kritik stoklardan oluşan satın alma ihtiyaçlarını izleyin.
        </p>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <DataView>
        <DataViewToolbar
          search={
            <SearchField
              value={search}
              placeholder="Ürün, lokasyon veya neden ara..."
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setSearch("");
              }}
              aria-label="Satın alma taleplerinde ara"
            />
          }
          actions={
            <ToolbarSelect
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label="Talep durumu"
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
              <FilterChip active={!status} count={rows.length} onClick={() => setStatus("")}>
                Tümü
              </FilterChip>
              <FilterChip
                active={status === "PENDING"}
                count={pendingCount}
                onClick={() => setStatus("PENDING")}
              >
                Onay bekleyen
              </FilterChip>
            </>
          }
        />

        <div className="hidden md:block">
          <div className="grid grid-cols-[1.5fr_1fr_.7fr_.7fr_.9fr] border-b border-[var(--line)] bg-[var(--surface-2)]/40 px-5 py-3 text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--muted-soft)]">
            <span>Ürün</span>
            <span>Lokasyon</span>
            <span>Mevcut</span>
            <span>Talep</span>
            <span>Durum</span>
          </div>

          <div className="divide-y divide-[var(--line)]">
            {visibleRows.map((request) => (
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
                <span className="text-[12px] text-[var(--muted)]">{request.warehouseName}</span>
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
          {visibleRows.map((request) => (
            <article key={request.id} className="space-y-3 px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-[var(--ink)]">
                    {request.productName}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--muted)]">{request.warehouseName}</p>
                </div>
                <StatusBadge status={request.status} />
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-[12px] bg-[var(--surface-2)]/55 p-3">
                <div>
                  <p className="text-[9px] uppercase tracking-[.08em] text-[var(--muted-soft)]">Mevcut</p>
                  <p className="mt-1 text-[12px] font-semibold text-[var(--ink)]">
                    {formatQuantity(request.currentQuantity)}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-[.08em] text-[var(--muted-soft)]">Talep</p>
                  <p className="mt-1 text-[12px] font-semibold text-[var(--accent)]">
                    {formatQuantity(request.requestedQuantity)}
                  </p>
                </div>
              </div>
              <p className="text-[10px] leading-5 text-[var(--muted)]">
                {request.reason || "Stok seviyesi düşük"}
              </p>
            </article>
          ))}
        </div>

        {!visibleRows.length ? (
          <div className="px-5 py-14 text-center">
            <p className="text-[13px] font-medium text-[var(--ink)]">Eşleşen satın alma talebi yok.</p>
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              Arama veya durum filtresini değiştirerek tekrar deneyin.
            </p>
          </div>
        ) : null}

        <DataViewMeta>
          <span>{visibleRows.length} kayıt gösteriliyor</span>
          <span>Toplam {rows.length} talep</span>
        </DataViewMeta>
      </DataView>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "RECEIVED"
      ? "bg-[var(--success-soft)] text-[var(--success)]"
      : status === "CANCELLED"
        ? "bg-[var(--danger-soft)] text-[var(--danger)]"
        : status === "PENDING"
          ? "bg-[var(--warning-soft)] text-[var(--warning)]"
          : "bg-[var(--accent-soft)] text-[var(--accent)]";

  return (
    <span className={`w-fit rounded-full px-2.5 py-1 text-[9px] font-semibold ${tone}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function formatQuantity(value: number | string) {
  return Number(value || 0).toLocaleString("tr-TR", { maximumFractionDigits: 3 });
}
