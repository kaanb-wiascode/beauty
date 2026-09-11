"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import {
  DataView,
  DataViewMeta,
  DataViewToolbar,
  FilterChip,
  SearchField,
  ToolbarSelect,
} from "@/components/data-view";
import {
  FormActions,
  FormGrid,
  FormHint,
  FormSection,
  FormSubmitButton,
} from "@/components/form-system";
import { Alert, Button, Modal, Spinner, TextInput } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type Transfer = {
  id: string;
  sourceName: string;
  destinationName: string;
  status: string;
  itemCount: number;
  createdAt: string;
};

type Warehouse = { id: string; name: string; type: string };
type Product = { id: string; name: string; unit: string };
type InventoryOverview = { warehouses?: Warehouse[] };

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Onay bekliyor",
  APPROVED: "Onaylandı",
  IN_TRANSIT: "Yolda",
  RECEIVED: "Teslim alındı",
  CANCELLED: "İptal",
};

export default function TransfersPage() {
  const [rows, setRows] = useState<Transfer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [product, setProduct] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  async function load() {
    try {
      const [overview, productRows, transfers] = await Promise.all([
        api<InventoryOverview>("/inventory/overview"),
        api<Product[]>("/inventory/products"),
        api<Transfer[]>("/inventory/transfers"),
      ]);
      setWarehouses(overview.warehouses ?? []);
      setProducts(productRows);
      setRows(transfers);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Transferler yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
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
      return [row.sourceName, row.destinationName, STATUS_LABELS[row.status] ?? row.status].some(
        (value) => value.toLocaleLowerCase("tr-TR").includes(query),
      );
    });
  }, [rows, search, status]);

  const pendingCount = useMemo(
    () => rows.filter((row) => row.status === "PENDING").length,
    [rows],
  );
  const transitCount = useMemo(
    () => rows.filter((row) => row.status === "IN_TRANSIT").length,
    [rows],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!source || !destination || !product || Number(quantity) <= 0) {
      setError("Çıkış, varış, ürün ve pozitif miktar seçilmelidir.");
      return;
    }
    if (source === destination) {
      setError("Çıkış ve varış deposu aynı olamaz.");
      return;
    }

    setSaving(true);
    try {
      await api("/inventory/transfers", {
        method: "POST",
        body: {
          sourceWarehouseId: source,
          destinationWarehouseId: destination,
          items: [{ productId: product, quantity: Number(quantity) }],
        },
      });
      setOpen(false);
      resetForm();
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Transfer oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setSource("");
    setDestination("");
    setProduct("");
    setQuantity("1");
  }

  function closeModal() {
    if (saving) return;
    setOpen(false);
    resetForm();
  }

  if (loading) {
    return (
      <div className="py-16">
        <Spinner label="Transferler hazırlanıyor..." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--muted-soft)]">
            ENVANTER
          </p>
          <h1 className="text-[30px] font-semibold tracking-[-.035em] text-[var(--ink)]">
            Depo Transferleri
          </h1>
          <p className="mt-1 text-[14px] text-[var(--muted)]">
            Ana depo ve şubeler arasındaki stok transferlerini takip edin.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>+ Transfer oluştur</Button>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <DataView>
        <DataViewToolbar
          search={
            <SearchField
              value={search}
              placeholder="Çıkış veya varış lokasyonu ara..."
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setSearch("");
              }}
              aria-label="Transferlerde ara"
            />
          }
          actions={
            <ToolbarSelect
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label="Transfer durumu"
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
              <FilterChip active={status === "PENDING"} count={pendingCount} onClick={() => setStatus("PENDING")}>
                Onay bekleyen
              </FilterChip>
              <FilterChip active={status === "IN_TRANSIT"} count={transitCount} onClick={() => setStatus("IN_TRANSIT")}>
                Yolda
              </FilterChip>
            </>
          }
        />

        <div className="hidden md:block">
          <div className="grid grid-cols-[1fr_1fr_.7fr_.8fr_1fr] border-b border-[var(--line)] bg-[var(--surface-2)]/40 px-5 py-3 text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--muted-soft)]">
            <span>Çıkış</span>
            <span>Varış</span>
            <span>Ürün</span>
            <span>Durum</span>
            <span>Tarih</span>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {visibleRows.map((transfer) => (
              <div
                key={transfer.id}
                className="grid grid-cols-[1fr_1fr_.7fr_.8fr_1fr] items-center px-5 py-4"
              >
                <span className="text-[12px] font-semibold text-[var(--ink)]">{transfer.sourceName}</span>
                <span className="text-[12px] text-[var(--muted)]">→ {transfer.destinationName}</span>
                <span className="text-[12px] text-[var(--muted)]">{transfer.itemCount} ürün</span>
                <TransferStatus status={transfer.status} />
                <span className="text-[10px] text-[var(--muted-soft)]">{formatDateTime(transfer.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="divide-y divide-[var(--line)] md:hidden">
          {visibleRows.map((transfer) => (
            <article key={transfer.id} className="space-y-3 px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[12px] font-semibold text-[var(--ink)]">{transfer.sourceName}</p>
                  <p className="mt-1 text-[11px] text-[var(--muted)]">→ {transfer.destinationName}</p>
                </div>
                <TransferStatus status={transfer.status} />
              </div>
              <div className="flex items-center justify-between text-[10px] text-[var(--muted-soft)]">
                <span>{transfer.itemCount} ürün</span>
                <span>{formatDateTime(transfer.createdAt)}</span>
              </div>
            </article>
          ))}
        </div>

        {!visibleRows.length ? (
          <div className="px-5 py-14 text-center">
            <p className="text-[13px] font-medium text-[var(--ink)]">Eşleşen transfer yok.</p>
            <p className="mt-1 text-[11px] text-[var(--muted)]">Arama veya durum filtresini değiştirin.</p>
          </div>
        ) : null}

        <DataViewMeta>
          <span>{visibleRows.length} kayıt gösteriliyor</span>
          <span>Toplam {rows.length} transfer</span>
        </DataViewMeta>
      </DataView>

      <Modal open={open} onClose={closeModal} title="Yeni Transfer">
        <form onSubmit={submit}>
          <FormSection
            title="Transfer bilgileri"
            description="Transfer, onay bekleyen kayıt olarak oluşturulur; stok hareketi sonraki operasyon adımlarında gerçekleşir."
          >
            <FormGrid>
              <SelectField label="Çıkış deposu" value={source} onChange={setSource}>
                <option value="">Seçin</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </SelectField>
              <SelectField label="Varış deposu" value={destination} onChange={setDestination}>
                <option value="">Seçin</option>
                {warehouses
                  .filter((warehouse) => warehouse.id !== source)
                  .map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </option>
                  ))}
              </SelectField>
            </FormGrid>
            <FormGrid>
              <SelectField label="Ürün" value={product} onChange={setProduct}>
                <option value="">Seçin</option>
                {products.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </SelectField>
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-medium text-[var(--muted)]">Miktar</span>
                <TextInput
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                />
              </label>
            </FormGrid>
            <FormHint tone="info" title="Stok bütünlüğü">
              Kaynak ve hedef depo birbirinden farklı olmalıdır. Bu form yalnız transfer talebini oluşturur; onay, sevk ve teslim alma durumları backend governance akışı tarafından yönetilir.
            </FormHint>
          </FormSection>
          <FormActions>
            <Button type="button" variant="secondary" onClick={closeModal} disabled={saving}>
              Vazgeç
            </Button>
            <FormSubmitButton saving={saving} idleLabel="Transfer talebi oluştur" savingLabel="Oluşturuluyor..." />
          </FormActions>
        </form>
      </Modal>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium text-[var(--muted)]">{label}</span>
      <select className="control h-11 w-full" value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function TransferStatus({ status }: { status: string }) {
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
