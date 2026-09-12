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

type InventoryMovement = {
  id: string;
  productName: string;
  warehouseName: string;
  type: string;
  quantity: number | string;
  unit: string;
  unitCost?: number | string;
  note?: string;
  createdAt: string;
};

type MovementFilter = "ALL" | "IN" | "OUT";

const MOVEMENT_LABELS: Record<string, string> = {
  PURCHASE: "Satın Alma",
  SERVICE_CONSUMPTION: "Hizmet Tüketimi",
  TRANSFER_IN: "Transfer Girişi",
  TRANSFER_OUT: "Transfer Çıkışı",
  ADJUSTMENT_IN: "Stok Girişi",
  ADJUSTMENT_OUT: "Stok Çıkışı",
  DAMAGE: "Hasar",
  EXPIRED: "Son Kullanma",
  RETURN: "İade",
};

const UNIT_LABELS: Record<string, string> = {
  UNIT: "Adet",
  ML: "Ml",
  LITER: "Lt",
  GRAM: "Gr",
  KG: "Kg",
  METER: "M",
  PAIR: "Çift",
  BOX: "Kutu",
};

const OUT_TYPES = new Set([
  "TRANSFER_OUT",
  "SERVICE_CONSUMPTION",
  "ADJUSTMENT_OUT",
  "DAMAGE",
  "EXPIRED",
]);

export default function MovementsPage() {
  const [rows, setRows] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<MovementFilter>("ALL");
  const [movementType, setMovementType] = useState("");

  useEffect(() => {
    api<InventoryMovement[]>("/inventory/movements")
      .then(setRows)
      .catch((requestError) =>
        setError(requestError instanceof ApiError ? requestError.message : "Hareketler Yüklenemedi."),
      )
      .finally(() => setLoading(false));
  }, []);

  const movementTypes = useMemo(
    () => Array.from(new Set(rows.map((row) => row.type))).sort(),
    [rows],
  );

  const visibleRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr-TR");

    return rows.filter((row) => {
      const isOut = OUT_TYPES.has(row.type);
      if (direction === "IN" && isOut) return false;
      if (direction === "OUT" && !isOut) return false;
      if (movementType && row.type !== movementType) return false;
      if (!query) return true;

      return [
        row.productName,
        row.warehouseName,
        MOVEMENT_LABELS[row.type] ?? row.type,
        row.note ?? "",
      ].some((value) => value.toLocaleLowerCase("tr-TR").includes(query));
    });
  }, [direction, movementType, rows, search]);

  const incomingCount = useMemo(() => rows.filter((row) => !OUT_TYPES.has(row.type)).length, [rows]);
  const outgoingCount = rows.length - incomingCount;

  if (loading) {
    return (
      <div className="py-16">
        <Spinner label="Stok Hareketleri Hazırlanıyor..." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
      <header>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--muted-soft)]">
          Envanter
        </p>
        <h1 className="text-[30px] font-semibold tracking-[-.035em] text-[var(--ink)]">
          Stok Hareketleri
        </h1>
        <p className="mt-1 text-[14px] text-[var(--muted)]">
          Envanterde Gerçekleşen Tüm Giriş, Çıkış Ve Tüketimleri İzleyin.
        </p>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <DataView>
        <DataViewToolbar
          search={
            <SearchField
              value={search}
              placeholder="Ürün, Lokasyon Veya Açıklama Ara..."
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setSearch("");
              }}
              aria-label="Stok Hareketlerinde Ara"
            />
          }
          actions={
            <ToolbarSelect
              value={movementType}
              onChange={(event) => setMovementType(event.target.value)}
              aria-label="Hareket Tipi"
            >
              <option value="">Tüm İşlem Tipleri</option>
              {movementTypes.map((type) => (
                <option key={type} value={type}>
                  {MOVEMENT_LABELS[type] ?? type}
                </option>
              ))}
            </ToolbarSelect>
          }
          filters={
            <>
              <FilterChip active={direction === "ALL"} count={rows.length} onClick={() => setDirection("ALL")}>
                Tümü
              </FilterChip>
              <FilterChip active={direction === "IN"} count={incomingCount} onClick={() => setDirection("IN")}>
                Girişler
              </FilterChip>
              <FilterChip active={direction === "OUT"} count={outgoingCount} onClick={() => setDirection("OUT")}>
                Çıkışlar
              </FilterChip>
            </>
          }
        />

        <div className="hidden md:block">
          <div className="grid grid-cols-[1.3fr_1fr_.8fr_.8fr_1.4fr] border-b border-[var(--line)] bg-[var(--surface-2)]/40 px-5 py-3 text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--muted-soft)]">
            <span>Ürün</span>
            <span>Lokasyon</span>
            <span>İşlem</span>
            <span>Miktar</span>
            <span>Tarih / Açıklama</span>
          </div>

          <div className="divide-y divide-[var(--line)]">
            {visibleRows.map((movement) => (
              <MovementRow key={movement.id} movement={movement} />
            ))}
          </div>
        </div>

        <div className="divide-y divide-[var(--line)] md:hidden">
          {visibleRows.map((movement) => (
            <MovementCard key={movement.id} movement={movement} />
          ))}
        </div>

        {!visibleRows.length ? (
          <div className="px-5 py-14 text-center">
            <p className="text-[13px] font-medium text-[var(--ink)]">Eşleşen Stok Hareketi Yok.</p>
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              Arama Veya Filtreleri Değiştirerek Tekrar Deneyin.
            </p>
          </div>
        ) : null}

        <DataViewMeta>
          <span>{visibleRows.length} Kayıt Gösteriliyor</span>
          <span>Toplam {rows.length} Hareket</span>
        </DataViewMeta>
      </DataView>
    </div>
  );
}

function MovementRow({ movement }: { movement: InventoryMovement }) {
  const isOut = OUT_TYPES.has(movement.type);

  return (
    <div className="grid grid-cols-[1.3fr_1fr_.8fr_.8fr_1.4fr] items-center px-5 py-4">
      <div className="text-[13px] font-semibold text-[var(--ink)]">{movement.productName}</div>
      <span className="text-[12px] text-[var(--muted)]">{movement.warehouseName}</span>
      <MovementBadge type={movement.type} />
      <span className={isOut ? "text-[12px] font-semibold text-[var(--danger)]" : "text-[12px] font-semibold text-[var(--success)]"}>
        {isOut ? "-" : "+"}{formatQuantity(movement.quantity)} {UNIT_LABELS[movement.unit] ?? movement.unit}
      </span>
      <div className="min-w-0">
        <div className="text-[11px] text-[var(--muted)]">{formatDateTime(movement.createdAt)}</div>
        <div className="mt-1 truncate text-[10px] text-[var(--muted-soft)]">{movement.note || "—"}</div>
      </div>
    </div>
  );
}

function MovementCard({ movement }: { movement: InventoryMovement }) {
  const isOut = OUT_TYPES.has(movement.type);

  return (
    <article className="space-y-3 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-[var(--ink)]">{movement.productName}</p>
          <p className="mt-1 text-[11px] text-[var(--muted)]">{movement.warehouseName}</p>
        </div>
        <MovementBadge type={movement.type} />
      </div>
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <span className={isOut ? "font-semibold text-[var(--danger)]" : "font-semibold text-[var(--success)]"}>
          {isOut ? "-" : "+"}{formatQuantity(movement.quantity)} {UNIT_LABELS[movement.unit] ?? movement.unit}
        </span>
        <span className="text-[var(--muted-soft)]">{formatDateTime(movement.createdAt)}</span>
      </div>
      {movement.note ? <p className="text-[10px] leading-5 text-[var(--muted)]">{movement.note}</p> : null}
    </article>
  );
}

function MovementBadge({ type }: { type: string }) {
  return (
    <span className="w-fit rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[9px] font-semibold text-[var(--accent)]">
      {MOVEMENT_LABELS[type] ?? type}
    </span>
  );
}

function formatQuantity(value: number | string) {
  return Number(value || 0).toLocaleString("tr-TR", { maximumFractionDigits: 3 });
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
