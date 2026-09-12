"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";

import { Modal } from "@/components/modal";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";

type SupplierOffer = {
  id: string;
  catalogVariantId: string;
  supplierSku: string | null;
  currency: string;
  unitPrice: number | string;
  minimumOrderQuantity: number | string;
  orderMultiple: number | string;
  availableQuantity: number | string | null;
  leadTimeDays: number;
  preparationDays: number;
  shippingDays: number;
  validFrom: string | null;
  validTo: string | null;
  version: number;
  inventorySupplierId: string;
  supplierOrganizationId: string;
  supplierName: string;
  catalogProductId: string;
  productName: string;
  variantName: string;
  canonicalSku: string | null;
  brandName: string | null;
  unit: string;
  attributes: Record<string, unknown>;
};

type ProcurementOptions = {
  warehouses: Array<{ id: string; name: string; type: string; branchId: string | null }>;
  products: Array<{
    inventoryProductId: string;
    inventoryProductName: string;
    sku: string | null;
    catalogVariantId: string;
    catalogProductName: string;
    catalogVariantName: string;
    canonicalSku: string | null;
    unit: string;
    brandName: string | null;
  }>;
};

type DraftOrderResult = {
  purchaseOrderId: string;
  purchaseOrderStatus: string;
  total: number;
  idempotent: boolean;
};

export default function SupplierOfferComparisonPage() {
  const [offers, setOffers] = useState<SupplierOffer[]>([]);
  const [options, setOptions] = useState<ProcurementOptions>({ warehouses: [], products: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [orderTarget, setOrderTarget] = useState<SupplierOffer | null>(null);
  const [warehouseId, setWarehouseId] = useState("");
  const [inventoryProductId, setInventoryProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [busy, setBusy] = useState(false);
  const idempotencySeed = useId();
  const orderSequence = useRef(0);
  const canWrite = hasPermission("inventory", "write");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [offerRows, procurementOptions] = await Promise.all([
        api<SupplierOffer[]>("/supplier-network/offers"),
        api<ProcurementOptions>("/procurement/rfqs/options"),
      ]);
      setOffers(offerRows);
      setOptions(procurementOptions);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Tedarikçi teklifleri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr-TR");
    if (!query) return offers;
    return offers.filter((offer) => [
      offer.supplierName,
      offer.productName,
      offer.variantName,
      offer.brandName ?? "",
      offer.canonicalSku ?? "",
      offer.supplierSku ?? "",
    ].some((value) => value.toLocaleLowerCase("tr-TR").includes(query)));
  }, [offers, search]);

  const productGroups = useMemo(() => {
    const groups = new Map<string, SupplierOffer[]>();
    for (const offer of visible) {
      const rows = groups.get(offer.catalogVariantId) ?? [];
      rows.push(offer);
      groups.set(offer.catalogVariantId, rows);
    }
    return Array.from(groups.values()).map((rows) => rows.sort((a, b) => Number(a.unitPrice) - Number(b.unitPrice)));
  }, [visible]);

  const supplierCount = useMemo(() => new Set(offers.map((offer) => offer.supplierOrganizationId)).size, [offers]);
  const variantCount = useMemo(() => new Set(offers.map((offer) => offer.catalogVariantId)).size, [offers]);
  const mappedProducts = useMemo(
    () => orderTarget ? options.products.filter((product) => product.catalogVariantId === orderTarget.catalogVariantId) : [],
    [options.products, orderTarget],
  );

  function openOrder(offer: SupplierOffer) {
    const products = options.products.filter((product) => product.catalogVariantId === offer.catalogVariantId);
    const minimum = Number(offer.minimumOrderQuantity || 1);
    const multiple = Number(offer.orderMultiple || 1);
    const defaultQuantity = Math.ceil((minimum - 1e-9) / multiple) * multiple;
    orderSequence.current += 1;
    setOrderTarget(offer);
    setWarehouseId(options.warehouses[0]?.id ?? "");
    setInventoryProductId(products[0]?.inventoryProductId ?? "");
    setQuantity(String(Number(defaultQuantity.toFixed(3))));
    setIdempotencyKey(`${idempotencySeed}-${orderSequence.current}-${offer.id}`);
    setError("");
    setSuccess("");
  }

  function closeOrder() {
    if (busy) return;
    setOrderTarget(null);
    setWarehouseId("");
    setInventoryProductId("");
    setQuantity("");
    setIdempotencyKey("");
  }

  async function createDraftOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!orderTarget || !canWrite || busy) return;
    const numericQuantity = Number(quantity);
    if (!warehouseId || !inventoryProductId || !Number.isFinite(numericQuantity) || numericQuantity <= 0) {
      setError("Depo, eşlenmiş yerel ürün ve geçerli bir miktar seçilmelidir.");
      return;
    }

    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await api<DraftOrderResult>(`/procurement/supplier-offers/${orderTarget.id}/purchase-order`, {
        method: "POST",
        body: {
          warehouseId,
          inventoryProductId,
          quantity: numericQuantity,
          expectedOfferVersion: orderTarget.version,
          idempotencyKey,
        },
      });
      setSuccess(`DRAFT satın alma siparişi oluşturuldu: ${result.purchaseOrderId}. Onay akışına satın alma ekranından gönderebilirsiniz.`);
      setOrderTarget(null);
      setWarehouseId("");
      setInventoryProductId("");
      setQuantity("");
      setIdempotencyKey("");
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Satın alma siparişi taslağı oluşturulamadı.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="mx-auto max-w-[1480px] py-16"><Spinner label="Tedarikçi teklifleri hazırlanıyor..." /></div>;

  return (
    <div className="mx-auto max-w-[1480px] space-y-6 pb-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--muted-soft)]">TEDARİKÇİ AĞI</p>
          <h1 className="text-[30px] font-semibold tracking-[-.035em] text-[var(--ink)]">Teklif Karşılaştırma</h1>
          <p className="mt-1 max-w-3xl text-[14px] text-[var(--muted)]">Yalnız şirketinize bağlı, aktif ve doğrulanmış tedarikçi organizasyonlarının geçerli tekliflerini aynı canonical ürün varyantı altında karşılaştırın. Sipariş seçimi otomatik onay vermez; yalnız DRAFT satın alma siparişi oluşturur.</p>
        </div>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Ürün, varyant, marka veya tedarikçi ara..."
          className="min-h-10 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-4 text-[12px] text-[var(--ink)] outline-none transition focus:border-[var(--accent)] lg:max-w-[360px]"
        />
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      {success ? <Alert tone="success" onClose={() => setSuccess("")}>{success} <Link href="/inventory/purchases" className="font-semibold underline">Satın almaya git</Link></Alert> : null}
      {!canWrite ? <Alert tone="success">Bu görünüm salt okunur. Sipariş taslağı oluşturmak için inventory.write izni gerekir.</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-3">
        <Metric label="Aktif teklif" value={String(offers.length)} />
        <Metric label="Karşılaştırılan varyant" value={String(variantCount)} />
        <Metric label="Teklif veren tedarikçi" value={String(supplierCount)} />
      </section>

      <div className="space-y-5">
        {productGroups.map((rows) => {
          const first = rows[0];
          const best = rows[0];
          return (
            <section key={first.catalogVariantId} className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)]">
              <div className="flex flex-col gap-3 border-b border-[var(--line)] px-5 py-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[14px] font-semibold text-[var(--ink)]">{first.productName} · {first.variantName}</h2>
                    {first.brandName ? <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[9px] font-semibold text-[var(--muted)]">{first.brandName}</span> : null}
                  </div>
                  <p className="mt-1 text-[10px] text-[var(--muted-soft)]">Canonical SKU: {first.canonicalSku || "—"} · Birim: {first.unit}</p>
                </div>
                <div className="rounded-[14px] bg-[var(--success-soft)] px-3 py-2 text-right">
                  <p className="text-[9px] font-semibold uppercase tracking-[.08em] text-[var(--success)]">En düşük teklif</p>
                  <p className="mt-1 text-[14px] font-semibold text-[var(--success)]">{formatMoney(best.unitPrice, best.currency)}</p>
                </div>
              </div>

              <div className="hidden grid-cols-[1.25fr_.65fr_.55fr_.55fr_.55fr_.7fr_.75fr] border-b border-[var(--line)] bg-[var(--surface-2)]/45 px-5 py-3 text-[9px] font-semibold uppercase tracking-[.08em] text-[var(--muted-soft)] md:grid">
                <span>Tedarikçi</span><span>Birim fiyat</span><span>MOQ</span><span>Stok</span><span>Teslim</span><span>Geçerlilik</span><span>Aksiyon</span>
              </div>
              <div className="divide-y divide-[var(--line)]">
                {rows.map((offer, index) => {
                  const hasMappedProduct = options.products.some((product) => product.catalogVariantId === offer.catalogVariantId);
                  return (
                    <article key={offer.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1.25fr_.65fr_.55fr_.55fr_.55fr_.7fr_.75fr] md:items-center">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-[12px] font-semibold text-[var(--ink)]">{offer.supplierName}</p>
                          {index === 0 ? <span className="rounded-full bg-[var(--success-soft)] px-2 py-0.5 text-[8px] font-semibold text-[var(--success)]">En uygun</span> : null}
                        </div>
                        <p className="mt-1 text-[9px] text-[var(--muted-soft)]">Tedarikçi SKU: {offer.supplierSku || "—"} · v{offer.version}</p>
                      </div>
                      <Value label="Birim fiyat" value={formatMoney(offer.unitPrice, offer.currency)} strong />
                      <Value label="MOQ" value={formatQuantity(offer.minimumOrderQuantity)} />
                      <Value label="Stok" value={offer.availableQuantity == null ? "Belirtilmedi" : formatQuantity(offer.availableQuantity)} />
                      <Value label="Teslim" value={`${offer.leadTimeDays + offer.preparationDays + offer.shippingDays} gün`} />
                      <Value label="Geçerlilik" value={offer.validTo ? formatDate(offer.validTo) : "Süresiz"} />
                      <div>
                        <p className="text-[8px] font-semibold uppercase tracking-[.08em] text-[var(--muted-soft)] md:hidden">Aksiyon</p>
                        {canWrite && hasMappedProduct && options.warehouses.length ? (
                          <button type="button" onClick={() => openOrder(offer)} className="mt-1 rounded-[10px] bg-[var(--accent-soft)] px-3 py-2 text-[10px] font-semibold text-[var(--accent)] transition hover:opacity-80 md:mt-0">Sipariş taslağı</button>
                        ) : (
                          <span className="text-[9px] text-[var(--muted-soft)]">{!hasMappedProduct ? "Ürün eşlemesi gerekli" : !options.warehouses.length ? "Aktif depo yok" : "Salt okunur"}</span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}

        {!productGroups.length ? (
          <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] px-6 py-14 text-center">
            <p className="text-[13px] font-semibold text-[var(--ink)]">Karşılaştırılabilir aktif teklif yok.</p>
            <p className="mt-1 text-[11px] text-[var(--muted)]">Bağlı ve doğrulanmış tedarikçiler ACTIVE teklif yayınladığında burada görünecek.</p>
          </div>
        ) : null}
      </div>

      <Modal
        open={Boolean(orderTarget)}
        onClose={closeOrder}
        title="Satın alma siparişi taslağı"
        description="Bu işlem tedarikçinin güncel ticari teklifini snapshot olarak kaydeder ve yalnız DRAFT PO üretir. Sipariş mevcut onay akışından geçmeden ORDERED olamaz."
      >
        {orderTarget ? (
          <form onSubmit={createDraftOrder} className="space-y-4">
            <div className="rounded-[14px] bg-[var(--surface-2)] p-4">
              <p className="text-[12px] font-semibold text-[var(--ink)]">{orderTarget.supplierName}</p>
              <p className="mt-1 text-[11px] text-[var(--muted)]">{orderTarget.productName} · {orderTarget.variantName}</p>
              <p className="mt-2 text-[11px] text-[var(--muted)]">{formatMoney(orderTarget.unitPrice, orderTarget.currency)} · MOQ {formatQuantity(orderTarget.minimumOrderQuantity)} · Sipariş katı {formatQuantity(orderTarget.orderMultiple)}</p>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold text-[var(--muted)]">Depo</span>
              <select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} className="h-11 w-full rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[12px] text-[var(--ink)]">
                <option value="">Depo seçin</option>
                {options.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold text-[var(--muted)]">Yerel envanter ürünü</span>
              <select value={inventoryProductId} onChange={(event) => setInventoryProductId(event.target.value)} className="h-11 w-full rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[12px] text-[var(--ink)]">
                <option value="">Ürün seçin</option>
                {mappedProducts.map((product) => <option key={product.inventoryProductId} value={product.inventoryProductId}>{product.inventoryProductName}{product.sku ? ` · ${product.sku}` : ""}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold text-[var(--muted)]">Miktar</span>
              <input type="number" min="0.001" step="0.001" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="h-11 w-full rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[12px] text-[var(--ink)]" />
              <span className="mt-1 block text-[9px] text-[var(--muted-soft)]">Backend MOQ, sipariş katı ve varsa tedarikçi stok limitini yeniden doğrular.</span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={closeOrder} disabled={busy}>Vazgeç</Button>
              <Button type="submit" disabled={busy || !warehouseId || !inventoryProductId || !quantity}>{busy ? "Oluşturuluyor..." : "DRAFT PO oluştur"}</Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--muted-soft)]">{label}</p><p className="mt-3 text-[28px] font-semibold tracking-[-.04em] text-[var(--ink)]">{value}</p></div>;
}

function Value({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div><p className="text-[8px] font-semibold uppercase tracking-[.08em] text-[var(--muted-soft)] md:hidden">{label}</p><p className={`mt-0.5 text-[11px] ${strong ? "font-semibold text-[var(--ink)]" : "text-[var(--muted)]"}`}>{value}</p></div>;
}

function formatMoney(value: number | string, currency: string) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 4 }).format(Number(value || 0));
}

function formatQuantity(value: number | string) {
  return Number(value || 0).toLocaleString("tr-TR", { maximumFractionDigits: 3 });
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("tr-TR", { dateStyle: "short" }).format(date);
}
