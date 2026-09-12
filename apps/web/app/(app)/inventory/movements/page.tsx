"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  DataView,
  DataViewMeta,
  DataViewToolbar,
  FilterChip,
  SearchField,
  ToolbarSelect,
} from "@/components/data-view";
import {
  Alert,
  Button,
  Field,
  Modal,
  Select,
  Spinner,
  TextArea,
  TextInput,
} from "@/components/ui";
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

type Warehouse = {
  id: string;
  name: string;
  type: string;
  branchId: string | null;
};

type InventoryOverview = {
  warehouses: Warehouse[];
};

type Product = {
  id: string;
  name: string;
  sku?: string | null;
  unit: string;
};

type StockLine = {
  warehouseId: string;
  productId: string;
  quantity: number | string;
  unitCost: number | string;
};

type AdjustmentType = "ADJUSTMENT_IN" | "ADJUSTMENT_OUT" | "DAMAGE" | "EXPIRED";
type MovementFilter = "ALL" | "IN" | "OUT";

type AdjustmentForm = {
  warehouseId: string;
  productId: string;
  type: AdjustmentType;
  quantity: string;
  unitCost: string;
  reason: string;
};

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

const ADJUSTMENT_LABELS: Record<AdjustmentType, string> = {
  ADJUSTMENT_IN: "Manuel Stok Girişi",
  ADJUSTMENT_OUT: "Manuel Stok Çıkışı",
  DAMAGE: "Hasarlı Ürün Çıkışı",
  EXPIRED: "Süresi Dolan Ürün Çıkışı",
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

const EMPTY_ADJUSTMENT: AdjustmentForm = {
  warehouseId: "",
  productId: "",
  type: "ADJUSTMENT_IN",
  quantity: "",
  unitCost: "",
  reason: "",
};

export default function MovementsPage() {
  const [rows, setRows] = useState<InventoryMovement[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stockLines, setStockLines] = useState<StockLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<MovementFilter>("ALL");
  const [movementType, setMovementType] = useState("");
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [adjustment, setAdjustment] = useState<AdjustmentForm>(EMPTY_ADJUSTMENT);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [movementRows, overview, productRows, detailRows] = await Promise.all([
        api<InventoryMovement[]>("/inventory/movements"),
        api<InventoryOverview>("/inventory/overview"),
        api<Product[]>("/inventory/products"),
        api<StockLine[]>("/inventory/accounting/valuation/detail"),
      ]);
      setRows(movementRows);
      setWarehouses(overview.warehouses ?? []);
      setProducts(productRows);
      setStockLines(detailRows);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Stok Hareketleri Yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
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

  const selectedProduct = products.find((product) => product.id === adjustment.productId);
  const selectedStock = stockLines.find(
    (line) => line.warehouseId === adjustment.warehouseId && line.productId === adjustment.productId,
  );
  const availableQuantity = Number(selectedStock?.quantity ?? 0);
  const currentUnitCost = Number(selectedStock?.unitCost ?? 0);
  const outboundAdjustment = adjustment.type !== "ADJUSTMENT_IN";

  function openAdjustment() {
    setAdjustment({
      ...EMPTY_ADJUSTMENT,
      warehouseId: warehouses.length === 1 ? warehouses[0].id : "",
    });
    setError("");
    setNotice("");
    setAdjustmentOpen(true);
  }

  async function submitAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const quantity = Number(adjustment.quantity);
    const unitCost = Number(adjustment.unitCost || 0);
    if (!adjustment.warehouseId || !adjustment.productId) {
      setError("Stok Düzeltmesi İçin Depo Ve Ürün Seçin.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Miktar Sıfırdan Büyük Olmalıdır.");
      return;
    }
    if (outboundAdjustment && quantity > availableQuantity) {
      setError("Çıkış Miktarı Mevcut Stoktan Fazla Olamaz.");
      return;
    }
    if (!adjustment.reason.trim()) {
      setError("Stok Düzeltme Nedenini Yazın.");
      return;
    }
    if (adjustment.type === "ADJUSTMENT_IN" && (!Number.isFinite(unitCost) || unitCost < 0)) {
      setError("Birim Maliyet Sıfırdan Küçük Olamaz.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api("/inventory/accounting/adjustments", {
        method: "POST",
        body: {
          warehouseId: adjustment.warehouseId,
          type: adjustment.type,
          reason: adjustment.reason.trim(),
          items: [
            {
              productId: adjustment.productId,
              quantity,
              ...(adjustment.type === "ADJUSTMENT_IN" ? { unitCost } : {}),
            },
          ],
        },
      });
      setAdjustmentOpen(false);
      setAdjustment(EMPTY_ADJUSTMENT);
      setNotice("Stok Düzeltmesi Başarıyla Muhasebeleştirildi.");
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Stok Düzeltmesi Kaydedilemedi.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="py-16">
        <Spinner label="Stok Hareketleri Hazırlanıyor..." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--muted-soft)]">
            Envanter
          </p>
          <h1 className="text-[30px] font-semibold tracking-[-.035em] text-[var(--ink)]">
            Stok Hareketleri
          </h1>
          <p className="mt-1 text-[14px] text-[var(--muted)]">
            Envanterde Gerçekleşen Tüm Giriş, Çıkış Ve Tüketimleri İzleyin.
          </p>
        </div>
        <Button onClick={openAdjustment}>Yeni Stok Düzeltmesi</Button>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice("")}>{notice}</Alert> : null}

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

      <Modal
        open={adjustmentOpen}
        onClose={() => setAdjustmentOpen(false)}
        title="Yeni Stok Düzeltmesi"
        description="Manuel Stok Girişlerini, Çıkışlarını, Hasarlı Ve Süresi Dolan Ürünleri Muhasebe Kaydıyla Birlikte İşleyin."
      >
        <form className="space-y-5" onSubmit={submitAdjustment}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Depo" required>
              <Select
                required
                value={adjustment.warehouseId}
                onChange={(event) =>
                  setAdjustment((current) => ({
                    ...current,
                    warehouseId: event.target.value,
                    productId: "",
                  }))
                }
              >
                <option value="">Depo Seçin</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                ))}
              </Select>
            </Field>

            <Field label="İşlem Türü" required>
              <Select
                required
                value={adjustment.type}
                onChange={(event) =>
                  setAdjustment((current) => ({
                    ...current,
                    type: event.target.value as AdjustmentType,
                  }))
                }
              >
                {(Object.keys(ADJUSTMENT_LABELS) as AdjustmentType[]).map((type) => (
                  <option key={type} value={type}>{ADJUSTMENT_LABELS[type]}</option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Ürün" required>
            <Select
              required
              disabled={!adjustment.warehouseId}
              value={adjustment.productId}
              onChange={(event) =>
                setAdjustment((current) => ({ ...current, productId: event.target.value }))
              }
            >
              <option value="">Ürün Seçin</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}{product.sku ? ` · ${product.sku}` : ""}
                </option>
              ))}
            </Select>
          </Field>

          {selectedProduct ? (
            <div className="rounded-[16px] bg-[var(--surface-2)] px-4 py-3 text-[11px] text-[var(--muted)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Mevcut Stok</span>
                <strong className="text-[var(--ink)]">
                  {formatQuantity(availableQuantity)} {UNIT_LABELS[selectedProduct.unit] ?? selectedProduct.unit}
                </strong>
              </div>
              {currentUnitCost > 0 ? (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span>Mevcut Birim Maliyet</span>
                  <strong className="text-[var(--ink)]">{currentUnitCost.toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}</strong>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Miktar" required>
              <TextInput
                required
                type="number"
                min="0.001"
                step="0.001"
                value={adjustment.quantity}
                onChange={(event) =>
                  setAdjustment((current) => ({ ...current, quantity: event.target.value }))
                }
                placeholder="0"
              />
            </Field>

            {adjustment.type === "ADJUSTMENT_IN" ? (
              <Field label="Birim Maliyet">
                <TextInput
                  type="number"
                  min="0"
                  step="0.01"
                  value={adjustment.unitCost}
                  onChange={(event) =>
                    setAdjustment((current) => ({ ...current, unitCost: event.target.value }))
                  }
                  placeholder={currentUnitCost ? String(currentUnitCost) : "0,00"}
                />
              </Field>
            ) : (
              <div className="flex items-end pb-2 text-[11px] leading-5 text-[var(--muted)]">
                Çıkış İşlemlerinde Mevcut Stok Maliyeti Otomatik Kullanılır.
              </div>
            )}
          </div>

          <Field label="Düzeltme Nedeni" required>
            <TextArea
              required
              rows={3}
              maxLength={500}
              value={adjustment.reason}
              onChange={(event) =>
                setAdjustment((current) => ({ ...current, reason: event.target.value }))
              }
              placeholder="İşlemin Nedenini Açıklayın."
            />
          </Field>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAdjustmentOpen(false)}>Vazgeç</Button>
            <Button type="submit" disabled={saving}>{saving ? "Kaydediliyor..." : "Stok Düzeltmesini Kaydet"}</Button>
          </div>
        </form>
      </Modal>
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
