"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Alert, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

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

export default function SupplierOfferComparisonPage() {
  const [offers, setOffers] = useState<SupplierOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setOffers(await api<SupplierOffer[]>("/supplier-network/offers"));
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

  if (loading) return <div className="mx-auto max-w-[1480px] py-16"><Spinner label="Tedarikçi teklifleri hazırlanıyor..." /></div>;

  return (
    <div className="mx-auto max-w-[1480px] space-y-6 pb-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--muted-soft)]">TEDARİKÇİ AĞI</p>
          <h1 className="text-[30px] font-semibold tracking-[-.035em] text-[var(--ink)]">Teklif Karşılaştırma</h1>
          <p className="mt-1 max-w-3xl text-[14px] text-[var(--muted)]">Yalnız şirketinize bağlı, aktif ve doğrulanmış tedarikçi organizasyonlarının geçerli tekliflerini aynı canonical ürün varyantı altında karşılaştırın.</p>
        </div>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Ürün, varyant, marka veya tedarikçi ara..."
          className="min-h-10 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-4 text-[12px] text-[var(--ink)] outline-none transition focus:border-[var(--accent)] lg:max-w-[360px]"
        />
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

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

              <div className="hidden grid-cols-[1.3fr_.7fr_.7fr_.7fr_.7fr_.8fr] border-b border-[var(--line)] bg-[var(--surface-2)]/45 px-5 py-3 text-[9px] font-semibold uppercase tracking-[.08em] text-[var(--muted-soft)] md:grid">
                <span>Tedarikçi</span><span>Birim fiyat</span><span>MOQ</span><span>Stok</span><span>Teslim</span><span>Geçerlilik</span>
              </div>
              <div className="divide-y divide-[var(--line)]">
                {rows.map((offer, index) => (
                  <article key={offer.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1.3fr_.7fr_.7fr_.7fr_.7fr_.8fr] md:items-center">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-[12px] font-semibold text-[var(--ink)]">{offer.supplierName}</p>
                        {index === 0 ? <span className="rounded-full bg-[var(--success-soft)] px-2 py-0.5 text-[8px] font-semibold text-[var(--success)]">En uygun</span> : null}
                      </div>
                      <p className="mt-1 text-[9px] text-[var(--muted-soft)]">Tedarikçi SKU: {offer.supplierSku || "—"}</p>
                    </div>
                    <Value label="Birim fiyat" value={formatMoney(offer.unitPrice, offer.currency)} strong />
                    <Value label="MOQ" value={formatQuantity(offer.minimumOrderQuantity)} />
                    <Value label="Stok" value={offer.availableQuantity == null ? "Belirtilmedi" : formatQuantity(offer.availableQuantity)} />
                    <Value label="Teslim" value={`${offer.leadTimeDays + offer.preparationDays + offer.shippingDays} gün`} />
                    <Value label="Geçerlilik" value={offer.validTo ? formatDate(offer.validTo) : "Süresiz"} />
                  </article>
                ))}
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
