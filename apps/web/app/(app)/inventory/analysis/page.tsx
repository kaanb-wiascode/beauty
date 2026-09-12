"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  Button,
  Field,
  PageHeader,
  Panel,
  Select,
  Spinner,
  Td,
  TextInput,
  Th,
  TableWrap,
} from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { formatDate, formatPrice } from "@/lib/format";

type WarehouseValuation = {
  warehouseId: string;
  warehouseName: string;
  warehouseType: string;
  branchId: string | null;
  productCount: number | string;
  quantity: number | string;
  inventoryValue: number | string;
};

type Reconciliation = {
  subledgerValue: number | string;
  glBalance: number | string;
  variance: number | string;
  reconciled: boolean;
  scope: "BRANCH" | "COMPANY";
};

type ValuationDetail = {
  warehouseId: string;
  warehouseName: string;
  warehouseType: string;
  branchId: string | null;
  productId: string;
  productName: string;
  sku?: string | null;
  unit: string;
  quantity: number | string;
  unitCost: number | string;
  inventoryValue: number | string;
  minimumQuantity: number | string;
  targetQuantity: number | string;
  stockUpdatedAt: string;
};

type MovementSummary = {
  type: string;
  movementCount: number | string;
  quantity: number | string;
  movementValue: number | string;
};

type InTransitRow = {
  transferId: string;
  dispatchedAt?: string | null;
  totalValue: number | string;
  sourceWarehouseId: string;
  sourceWarehouseName: string;
  destinationWarehouseId: string;
  destinationWarehouseName: string;
  itemCount: number | string;
  unitsInTransit: number | string;
  valueInTransit: number | string;
};

type Filters = {
  warehouseId: string;
  from: string;
  to: string;
};

const MOVEMENT_LABELS: Record<string, string> = {
  PURCHASE: "Satın Alma Girişi",
  SERVICE_CONSUMPTION: "Hizmet Tüketimi",
  TRANSFER_IN: "Transfer Girişi",
  TRANSFER_OUT: "Transfer Çıkışı",
  ADJUSTMENT_IN: "Stok Düzeltme Girişi",
  ADJUSTMENT_OUT: "Stok Düzeltme Çıkışı",
  DAMAGE: "Hasarlı Ürün",
  EXPIRED: "Süresi Dolan Ürün",
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

function number(value: number | string | undefined | null) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatQuantity(value: number | string, unit?: string) {
  const formatted = new Intl.NumberFormat("tr-TR", {
    maximumFractionDigits: 3,
  }).format(number(value));
  return unit ? `${formatted} ${UNIT_LABELS[unit] ?? unit}` : formatted;
}

function isoStart(value: string) {
  if (!value) return "";
  return new Date(`${value}T00:00:00`).toISOString();
}

function isoEnd(value: string) {
  if (!value) return "";
  return new Date(`${value}T23:59:59.999`).toISOString();
}

function warehouseTypeLabel(value: string) {
  return value === "MAIN_DEPOT" ? "Ana Depo" : value === "BRANCH" ? "Şube Deposu" : value;
}

export default function InventoryAnalysisPage() {
  const [valuations, setValuations] = useState<WarehouseValuation[]>([]);
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(null);
  const [details, setDetails] = useState<ValuationDetail[]>([]);
  const [movementSummary, setMovementSummary] = useState<MovementSummary[]>([]);
  const [inTransit, setInTransit] = useState<InTransitRow[]>([]);
  const [filters, setFilters] = useState<Filters>({ warehouseId: "", from: "", to: "" });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  async function load(nextFilters: Filters, initial = false) {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError("");

    const detailParams = new URLSearchParams();
    const movementParams = new URLSearchParams();
    if (nextFilters.warehouseId) {
      detailParams.set("warehouseId", nextFilters.warehouseId);
      movementParams.set("warehouseId", nextFilters.warehouseId);
    }
    if (nextFilters.from) movementParams.set("from", isoStart(nextFilters.from));
    if (nextFilters.to) movementParams.set("to", isoEnd(nextFilters.to));

    try {
      const [valuationRows, reconciliationRow, detailRows, movementRows, transitRows] = await Promise.all([
        api<WarehouseValuation[]>("/inventory/accounting/valuation"),
        api<Reconciliation>("/inventory/accounting/reconciliation"),
        api<ValuationDetail[]>(`/inventory/accounting/valuation/detail${detailParams.size ? `?${detailParams}` : ""}`),
        api<MovementSummary[]>(`/inventory/accounting/movement-summary${movementParams.size ? `?${movementParams}` : ""}`),
        api<InTransitRow[]>("/inventory/accounting/in-transit"),
      ]);

      setValuations(valuationRows);
      setReconciliation(reconciliationRow);
      setDetails(detailRows);
      setMovementSummary(movementRows);
      setInTransit(transitRows);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Envanter Analizi Yüklenemedi.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load({ warehouseId: "", from: "", to: "" }, true);
  }, []);

  const totals = useMemo(() => {
    return valuations.reduce(
      (current, row) => ({
        value: current.value + number(row.inventoryValue),
        quantity: current.quantity + number(row.quantity),
        products: current.products + number(row.productCount),
      }),
      { value: 0, quantity: 0, products: 0 },
    );
  }, [valuations]);

  const movementTotals = useMemo(() => {
    return movementSummary.reduce(
      (current, row) => ({
        count: current.count + number(row.movementCount),
        value: current.value + number(row.movementValue),
      }),
      { count: 0, value: 0 },
    );
  }, [movementSummary]);

  const transitValue = useMemo(
    () => inTransit.reduce((sum, row) => sum + number(row.valueInTransit), 0),
    [inTransit],
  );

  if (loading) {
    return <Spinner label="Envanter Analizi Hazırlanıyor..." />;
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-10">
      <PageHeader
        title="Envanter Analizi"
        description="Stok Değerini, Muhasebe Mutabakatını, Hareket Yoğunluğunu Ve Transferdeki Stokları Aktif Şube Kapsamında İzleyin."
        action={
          <Button
            variant="secondary"
            disabled={refreshing}
            onClick={() => void load(filters)}
          >
            {refreshing ? "Yenileniyor..." : "Verileri Yenile"}
          </Button>
        }
      />

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Toplam Stok Değeri" value={formatPrice(totals.value)} description="Aktif Kapsamdaki Depolar" />
        <MetricCard label="Toplam Stok Miktarı" value={formatQuantity(totals.quantity)} description={`${valuations.length} Depo`} />
        <MetricCard label="Hareket Sayısı" value={formatQuantity(movementTotals.count)} description="Seçili Tarih Aralığı" />
        <MetricCard label="Transferdeki Stok" value={formatPrice(transitValue)} description={`${inTransit.length} Açık Transfer`} />
      </section>

      <Panel>
        <div className="grid gap-4 border-b border-[var(--line)] p-5 md:grid-cols-4 md:items-end">
          <Field label="Depo">
            <Select
              value={filters.warehouseId}
              onChange={(event) =>
                setFilters((current) => ({ ...current, warehouseId: event.target.value }))
              }
            >
              <option value="">Tüm Depolar</option>
              {valuations.map((warehouse) => (
                <option key={warehouse.warehouseId} value={warehouse.warehouseId}>
                  {warehouse.warehouseName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Başlangıç Tarihi">
            <TextInput
              type="date"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(event) =>
                setFilters((current) => ({ ...current, from: event.target.value }))
              }
            />
          </Field>
          <Field label="Bitiş Tarihi">
            <TextInput
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(event) =>
                setFilters((current) => ({ ...current, to: event.target.value }))
              }
            />
          </Field>
          <Button disabled={refreshing} onClick={() => void load(filters)}>
            Filtreleri Uygula
          </Button>
        </div>
      </Panel>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
        <Panel>
          <SectionHeading
            title="Depo Değerleri"
            description="Depo Bazında Ürün Adedi, Toplam Miktar Ve Stok Değeri."
          />
          <TableWrap>
            <thead>
              <tr>
                <Th>Depo</Th>
                <Th>Tür</Th>
                <Th>Ürün</Th>
                <Th>Miktar</Th>
                <Th>Stok Değeri</Th>
              </tr>
            </thead>
            <tbody>
              {valuations.map((row) => (
                <tr key={row.warehouseId}>
                  <Td>{row.warehouseName}</Td>
                  <Td>{warehouseTypeLabel(row.warehouseType)}</Td>
                  <Td>{formatQuantity(row.productCount)}</Td>
                  <Td>{formatQuantity(row.quantity)}</Td>
                  <Td className="font-semibold">{formatPrice(number(row.inventoryValue))}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          {!valuations.length ? <EmptyRow text="Aktif Kapsamda Depo Verisi Bulunamadı." /> : null}
        </Panel>

        <Panel>
          <SectionHeading
            title="Muhasebe Mutabakatı"
            description="Stok Alt Defteri İle 150 İlk Madde Ve Malzeme Hesabının Karşılaştırması."
          />
          <div className="space-y-4 p-5 pt-0">
            <KeyValue label="Stok Alt Defteri" value={formatPrice(number(reconciliation?.subledgerValue))} />
            <KeyValue label="Muhasebe Bakiyesi" value={formatPrice(number(reconciliation?.glBalance))} />
            <KeyValue label="Fark" value={formatPrice(number(reconciliation?.variance))} />
            <div className={`rounded-[18px] px-4 py-3 text-[13px] font-semibold ${reconciliation?.reconciled ? "bg-[rgba(47,122,86,0.10)] text-[#2d5c45]" : "bg-[rgba(177,111,38,0.10)] text-[#80571f]"}`}>
              {reconciliation?.reconciled ? "Mutabakat Tam" : "Mutabakat Farkı Bulunuyor"}
            </div>
            <p className="text-[11px] leading-5 text-[var(--muted)]">
              Kapsam: {reconciliation?.scope === "BRANCH" ? "Aktif Şube" : "Tüm Şubeler"}
            </p>
          </div>
        </Panel>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <Panel>
          <SectionHeading
            title="Stok Hareket Özeti"
            description="Seçili Tarih Ve Depo Filtresindeki Hareket Türlerinin Toplamı."
          />
          <div className="divide-y divide-[var(--line)]">
            {movementSummary.map((row) => (
              <div key={row.type} className="grid grid-cols-[1fr_auto] gap-4 px-5 py-4">
                <div>
                  <p className="text-[13px] font-semibold text-[var(--ink)]">{MOVEMENT_LABELS[row.type] ?? row.type}</p>
                  <p className="mt-1 text-[11px] text-[var(--muted)]">
                    {formatQuantity(row.movementCount)} Hareket · {formatQuantity(row.quantity)} Miktar
                  </p>
                </div>
                <p className="text-right text-[13px] font-semibold text-[var(--ink)]">
                  {formatPrice(number(row.movementValue))}
                </p>
              </div>
            ))}
          </div>
          {!movementSummary.length ? <EmptyRow text="Seçili Aralıkta Stok Hareketi Bulunamadı." /> : null}
        </Panel>

        <Panel>
          <SectionHeading
            title="Transferdeki Stoklar"
            description="Henüz Varış Deposunda Teslim Alınmamış Transferler."
          />
          <div className="divide-y divide-[var(--line)]">
            {inTransit.map((row) => (
              <div key={row.transferId} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-semibold text-[var(--ink)]">
                      {row.sourceWarehouseName} → {row.destinationWarehouseName}
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--muted)]">
                      {formatQuantity(row.itemCount)} Kalem · {formatQuantity(row.unitsInTransit)} Birim Yolda
                    </p>
                  </div>
                  <p className="text-[13px] font-semibold text-[var(--ink)]">
                    {formatPrice(number(row.valueInTransit))}
                  </p>
                </div>
                {row.dispatchedAt ? (
                  <p className="mt-2 text-[11px] text-[var(--muted-soft)]">
                    Sevk Tarihi: {formatDate(row.dispatchedAt)}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
          {!inTransit.length ? <EmptyRow text="Transferde Bekleyen Stok Bulunmuyor." /> : null}
        </Panel>
      </section>

      <Panel>
        <SectionHeading
          title="Ürün Bazlı Stok Değeri"
          description="Seçili Depo Kapsamındaki Ürünlerin Miktar, Birim Maliyet Ve Toplam Stok Değeri."
        />
        <TableWrap>
          <thead>
            <tr>
              <Th>Ürün</Th>
              <Th>Depo</Th>
              <Th>Miktar</Th>
              <Th>Birim Maliyet</Th>
              <Th>Toplam Değer</Th>
              <Th>Son Güncelleme</Th>
            </tr>
          </thead>
          <tbody>
            {details.map((row) => (
              <tr key={`${row.warehouseId}:${row.productId}`}>
                <Td>
                  <div>
                    <p className="font-medium">{row.productName}</p>
                    {row.sku ? <p className="mt-1 text-[11px] text-[var(--muted)]">{row.sku}</p> : null}
                  </div>
                </Td>
                <Td>{row.warehouseName}</Td>
                <Td>{formatQuantity(row.quantity, row.unit)}</Td>
                <Td>{formatPrice(number(row.unitCost))}</Td>
                <Td className="font-semibold">{formatPrice(number(row.inventoryValue))}</Td>
                <Td>{formatDate(row.stockUpdatedAt)}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        {!details.length ? <EmptyRow text="Seçili Kapsamda Stok Değeri Bulunamadı." /> : null}
      </Panel>
    </div>
  );
}

function MetricCard({ label, value, description }: { label: string; value: string; description: string }) {
  return (
    <article className="rounded-[24px] border border-white/80 bg-white/80 p-5 shadow-[0_12px_34px_rgba(17,70,104,0.06)] backdrop-blur-xl">
      <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--muted-soft)]">{label}</p>
      <p className="mt-3 text-[25px] font-semibold tracking-[-.035em] text-[var(--ink)]">{value}</p>
      <p className="mt-1 text-[11px] text-[var(--muted)]">{description}</p>
    </article>
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="px-5 pb-4 pt-5">
      <h2 className="text-[17px] font-semibold tracking-[-.02em] text-[var(--ink)]">{title}</h2>
      <p className="mt-1 text-[12px] leading-5 text-[var(--muted)]">{description}</p>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] pb-3 last:border-0 last:pb-0">
      <span className="text-[12px] text-[var(--muted)]">{label}</span>
      <strong className="text-[13px] font-semibold text-[var(--ink)]">{value}</strong>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="px-5 py-8 text-center text-[12px] text-[var(--muted)]">{text}</p>;
}
