"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  DataView,
  DataViewMeta,
  DataViewToolbar,
  FilterChip,
  SearchField,
} from "@/components/data-view";
import {
  Alert,
  Button,
  Field,
  Select,
  Spinner,
  TextArea,
  TextInput,
} from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type InventoryLot = {
  id: string;
  productId: string;
  productName: string;
  sku?: string | null;
  unit: string;
  warehouseId: string;
  warehouseName: string;
  branchId: string | null;
  lotNumber: string;
  manufacturedAt?: string | null;
  expiresAt?: string | null;
  quantity: number | string;
  unitCost: number | string;
  createdAt: string;
};

type Product = {
  id: string;
  name: string;
  sku?: string | null;
  unit: string;
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

type ExpiryFilter = "ALL" | "EXPIRING" | "EXPIRED";

type LotForm = {
  productId: string;
  warehouseId: string;
  lotNumber: string;
  manufacturedAt: string;
  expiresAt: string;
  quantity: string;
  unitCost: string;
  note: string;
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

const EMPTY_FORM: LotForm = {
  productId: "",
  warehouseId: "",
  lotNumber: "",
  manufacturedAt: "",
  expiresAt: "",
  quantity: "",
  unitCost: "",
  note: "",
};

export default function InventoryLotsPage() {
  const [lots, setLots] = useState<InventoryLot[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>("ALL");
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<LotForm>(EMPTY_FORM);
  const [currentTime, setCurrentTime] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [lotRows, productRows, overview] = await Promise.all([
        api<InventoryLot[]>("/inventory/lots"),
        api<Product[]>("/inventory/products"),
        api<InventoryOverview>("/inventory/overview"),
      ]);
      setLots(lotRows);
      setProducts(productRows);
      setWarehouses(overview.warehouses ?? []);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Lot Bilgileri Yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setCurrentTime(Date.now());
    void load();
  }, []);

  const visibleLots = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr-TR");
    const threshold =
      currentTime === null
        ? null
        : currentTime + 30 * 24 * 60 * 60 * 1000;

    return lots.filter((lot) => {
      const expiry = lot.expiresAt ? new Date(lot.expiresAt).getTime() : null;
      if (
        expiryFilter === "EXPIRED" &&
        currentTime !== null &&
        (expiry === null || expiry >= currentTime)
      ) {
        return false;
      }
      if (
        expiryFilter === "EXPIRING" &&
        currentTime !== null &&
        threshold !== null &&
        (expiry === null || expiry < currentTime || expiry > threshold)
      ) {
        return false;
      }
      if (!query) return true;

      return [lot.productName, lot.sku ?? "", lot.lotNumber, lot.warehouseName]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(query);
    });
  }, [currentTime, expiryFilter, lots, search]);

  const expiredCount = useMemo(() => {
    if (currentTime === null) return 0;
    return lots.filter(
      (lot) =>
        lot.expiresAt &&
        new Date(lot.expiresAt).getTime() < currentTime,
    ).length;
  }, [currentTime, lots]);

  const expiringCount = useMemo(() => {
    if (currentTime === null) return 0;
    const threshold = currentTime + 30 * 24 * 60 * 60 * 1000;
    return lots.filter((lot) => {
      if (!lot.expiresAt) return false;
      const expiry = new Date(lot.expiresAt).getTime();
      return expiry >= currentTime && expiry <= threshold;
    }).length;
  }, [currentTime, lots]);

  function openForm() {
    setForm({
      ...EMPTY_FORM,
      warehouseId: warehouses.length === 1 ? warehouses[0].id : "",
    });
    setError("");
    setNotice("");
    setFormOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api("/inventory/lots", {
        method: "POST",
        body: {
          productId: form.productId,
          warehouseId: form.warehouseId,
          lotNumber: form.lotNumber,
          manufacturedAt: form.manufacturedAt || null,
          expiresAt: form.expiresAt || null,
          quantity: Number(form.quantity),
          unitCost: form.unitCost ? Number(form.unitCost) : 0,
          note: form.note || null,
        },
      });
      setFormOpen(false);
      setForm(EMPTY_FORM);
      setNotice("Lot Girişi Başarıyla Kaydedildi.");
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Lot Girişi Kaydedilemedi.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="py-16">
        <Spinner label="Lot Ve Son Kullanma Bilgileri Hazırlanıyor..." />
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
            Lot Ve Son Kullanma
          </h1>
          <p className="mt-1 text-[14px] text-[var(--muted)]">
            Ürün Lotlarını, Son Kullanma Tarihlerini Ve Şube Bazlı Stok Girişlerini Yönetin.
          </p>
        </div>
        <Button onClick={openForm}>Yeni Lot Girişi</Button>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      {notice ? (
        <Alert tone="success" onClose={() => setNotice("")}>
          {notice}
        </Alert>
      ) : null}

      <DataView>
        <DataViewToolbar
          search={
            <SearchField
              value={search}
              placeholder="Ürün, Lot Numarası Veya Depo Ara..."
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setSearch("");
              }}
              aria-label="Lotlarda Ara"
            />
          }
          filters={
            <>
              <FilterChip
                active={expiryFilter === "ALL"}
                count={lots.length}
                onClick={() => setExpiryFilter("ALL")}
              >
                Tümü
              </FilterChip>
              <FilterChip
                active={expiryFilter === "EXPIRING"}
                count={expiringCount}
                onClick={() => setExpiryFilter("EXPIRING")}
              >
                30 Gün İçinde
              </FilterChip>
              <FilterChip
                active={expiryFilter === "EXPIRED"}
                count={expiredCount}
                onClick={() => setExpiryFilter("EXPIRED")}
              >
                Süresi Dolanlar
              </FilterChip>
            </>
          }
        />

        <div className="hidden md:block">
          <div className="grid grid-cols-[1.35fr_1fr_1fr_.75fr_1fr_.85fr] border-b border-[var(--line)] bg-[var(--surface-2)]/40 px-5 py-3 text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--muted-soft)]">
            <span>Ürün</span>
            <span>Lot Numarası</span>
            <span>Depo</span>
            <span>Miktar</span>
            <span>Son Kullanma</span>
            <span>Durum</span>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {visibleLots.map((lot) => (
              <LotRow key={lot.id} lot={lot} currentTime={currentTime} />
            ))}
          </div>
        </div>

        <div className="divide-y divide-[var(--line)] md:hidden">
          {visibleLots.map((lot) => (
            <LotCard key={lot.id} lot={lot} currentTime={currentTime} />
          ))}
        </div>

        {!visibleLots.length ? (
          <div className="px-5 py-14 text-center">
            <p className="text-[13px] font-medium text-[var(--ink)]">
              Eşleşen Lot Kaydı Yok.
            </p>
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              Arama Veya Filtreleri Değiştirin Ya Da Yeni Bir Lot Girişi Oluşturun.
            </p>
          </div>
        ) : null}

        <DataViewMeta>
          <span>{visibleLots.length} Kayıt Gösteriliyor</span>
          <span>Toplam {lots.length} Lot</span>
        </DataViewMeta>
      </DataView>

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-[680px] overflow-y-auto rounded-[28px] border border-white/80 bg-white p-6 shadow-[0_24px_80px_rgba(17,70,104,0.18)] sm:p-7">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[21px] font-semibold tracking-[-.025em] text-[var(--ink)]">
                  Yeni Lot Girişi
                </h2>
                <p className="mt-1 text-[12px] leading-5 text-[var(--muted)]">
                  Lot Miktarı Kaydedildiğinde İlgili Depo Stoku Da Aynı İşlemde Artırılır.
                </p>
              </div>
              <Button variant="ghost" onClick={() => setFormOpen(false)}>
                Kapat
              </Button>
            </div>

            <form className="space-y-5" onSubmit={submit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Ürün" required>
                  <Select
                    required
                    value={form.productId}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        productId: event.target.value,
                      }))
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

                <Field label="Depo" required>
                  <Select
                    required
                    value={form.warehouseId}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        warehouseId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Depo Seçin</option>
                    {warehouses.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Lot Numarası" required>
                  <TextInput
                    required
                    maxLength={120}
                    value={form.lotNumber}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        lotNumber: event.target.value,
                      }))
                    }
                    placeholder="Örn. LOT-2026-001"
                  />
                </Field>

                <Field label="Miktar" required>
                  <TextInput
                    required
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={form.quantity}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        quantity: event.target.value,
                      }))
                    }
                    placeholder="0"
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Üretim Tarihi">
                  <TextInput
                    type="date"
                    value={form.manufacturedAt}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        manufacturedAt: event.target.value,
                      }))
                    }
                  />
                </Field>

                <Field label="Son Kullanma Tarihi">
                  <TextInput
                    type="date"
                    min={form.manufacturedAt || undefined}
                    value={form.expiresAt}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        expiresAt: event.target.value,
                      }))
                    }
                  />
                </Field>
              </div>

              <Field label="Birim Maliyet">
                <TextInput
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.unitCost}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      unitCost: event.target.value,
                    }))
                  }
                  placeholder="0,00"
                />
              </Field>

              <Field label="Açıklama">
                <TextArea
                  rows={3}
                  maxLength={2000}
                  value={form.note}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      note: event.target.value,
                    }))
                  }
                  placeholder="Lot Girişiyle İlgili Not Ekleyin..."
                />
              </Field>

              <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
                <Button
                  variant="secondary"
                  disabled={saving}
                  onClick={() => setFormOpen(false)}
                >
                  Vazgeç
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Kaydediliyor..." : "Lot Girişi Kaydet"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LotRow({
  lot,
  currentTime,
}: {
  lot: InventoryLot;
  currentTime: number | null;
}) {
  return (
    <div className="grid grid-cols-[1.35fr_1fr_1fr_.75fr_1fr_.85fr] items-center px-5 py-4">
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold text-[var(--ink)]">
          {lot.productName}
        </div>
        <div className="mt-0.5 truncate text-[10px] text-[var(--muted-soft)]">
          {lot.sku || "Ürün Kodu Yok"}
        </div>
      </div>
      <span className="truncate text-[12px] font-medium text-[var(--ink)]">
        {lot.lotNumber}
      </span>
      <span className="truncate text-[12px] text-[var(--muted)]">
        {lot.warehouseName}
      </span>
      <span className="text-[12px] font-semibold text-[var(--ink)]">
        {formatQuantity(lot.quantity)} {UNIT_LABELS[lot.unit] ?? lot.unit}
      </span>
      <span className="text-[11px] text-[var(--muted)]">
        {lot.expiresAt ? formatDate(lot.expiresAt) : "Takip Edilmiyor"}
      </span>
      <ExpiryBadge expiresAt={lot.expiresAt} currentTime={currentTime} />
    </div>
  );
}

function LotCard({
  lot,
  currentTime,
}: {
  lot: InventoryLot;
  currentTime: number | null;
}) {
  return (
    <article className="space-y-3 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-[var(--ink)]">
            {lot.productName}
          </p>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            {lot.lotNumber} · {lot.warehouseName}
          </p>
        </div>
        <ExpiryBadge expiresAt={lot.expiresAt} currentTime={currentTime} />
      </div>
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <span className="font-semibold text-[var(--ink)]">
          {formatQuantity(lot.quantity)} {UNIT_LABELS[lot.unit] ?? lot.unit}
        </span>
        <span className="text-[var(--muted-soft)]">
          {lot.expiresAt ? formatDate(lot.expiresAt) : "Son Kullanma Takibi Yok"}
        </span>
      </div>
    </article>
  );
}

function ExpiryBadge({
  expiresAt,
  currentTime,
}: {
  expiresAt?: string | null;
  currentTime: number | null;
}) {
  if (!expiresAt) {
    return (
      <span className="w-fit rounded-full bg-black/[0.04] px-2.5 py-1 text-[9px] font-semibold text-[var(--muted)]">
        Tarih Yok
      </span>
    );
  }

  if (currentTime === null) {
    return (
      <span className="w-fit rounded-full bg-black/[0.04] px-2.5 py-1 text-[9px] font-semibold text-[var(--muted)]">
        Tarih Var
      </span>
    );
  }

  const remaining = new Date(expiresAt).getTime() - currentTime;
  if (remaining < 0) {
    return (
      <span className="w-fit rounded-full bg-[rgba(143,61,61,0.08)] px-2.5 py-1 text-[9px] font-semibold text-[#7a3333]">
        Süresi Doldu
      </span>
    );
  }
  if (remaining <= 30 * 24 * 60 * 60 * 1000) {
    return (
      <span className="w-fit rounded-full bg-[rgba(171,119,39,0.10)] px-2.5 py-1 text-[9px] font-semibold text-[#7a5a20]">
        Son Kullanma Yaklaşıyor
      </span>
    );
  }

  return (
    <span className="w-fit rounded-full bg-[rgba(47,122,86,0.10)] px-2.5 py-1 text-[9px] font-semibold text-[#2d5c45]">
      Uygun
    </span>
  );
}

function formatQuantity(value: number | string) {
  return Number(value || 0).toLocaleString("tr-TR", {
    maximumFractionDigits: 3,
  });
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
  }).format(new Date(value));
}
