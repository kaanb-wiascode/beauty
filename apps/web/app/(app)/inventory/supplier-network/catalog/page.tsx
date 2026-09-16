"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { Alert, Button, Field, Select, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";

type InventoryProduct = {
  id: string;
  name: string;
  sku: string | null;
  brand: string | null;
  unit: string;
  status: string;
};
type CatalogVariant = {
  id: string;
  catalogProductId: string;
  canonicalSku: string | null;
  variantName: string;
  unit: string;
  productName: string;
  categoryCode: string | null;
  brandName: string | null;
  activeOfferCount: number;
};
type CatalogLink = {
  id: string;
  inventoryProductId: string;
  inventoryProductName: string;
  inventorySku: string | null;
  catalogVariantId: string;
  catalogProductName: string;
  catalogVariantName: string;
  canonicalSku: string | null;
  brandName: string | null;
  createdAt: string;
  updatedAt: string;
};

export default function SupplierCatalogMappingPage() {
  const { showToast } = useToast();
  const canWrite = hasPermission("inventory", "write");
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [variants, setVariants] = useState<CatalogVariant[]>([]);
  const [links, setLinks] = useState<CatalogLink[]>([]);
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [productRows, variantRows, linkRows] = await Promise.all([
        api<InventoryProduct[]>("/inventory/products"),
        api<CatalogVariant[]>("/supplier-network/catalog/variants"),
        api<CatalogLink[]>("/supplier-network/catalog/links"),
      ]);
      setProducts(productRows.filter((row) => row.status === "ACTIVE"));
      setVariants(variantRows);
      setLinks(linkRows);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Ürün Eşleştirmeleri Yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const linkedIds = useMemo(() => new Set(links.map((row) => row.inventoryProductId)), [links]);
  const selectedLink = useMemo(() => links.find((row) => row.inventoryProductId === productId), [links, productId]);

  useEffect(() => {
    if (selectedLink) setVariantId(selectedLink.catalogVariantId);
  }, [selectedLink]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite || saving || !productId || !variantId) return;
    setSaving(true);
    setError("");
    try {
      await api(`/supplier-network/catalog/products/${productId}/link`, {
        method: "POST",
        body: { catalogVariantId: variantId },
      });
      showToast(selectedLink ? "Ürün Eşleştirmesi Güncellendi." : "Ürün Eşleştirmesi Oluşturuldu.");
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Ürün Eşleştirmesi Kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="mx-auto max-w-[1440px] py-16"><Spinner label="Ürün Eşleştirmeleri Hazırlanıyor..." /></div>;

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--muted-soft)]">TEDARİKÇİ AĞI · KATALOG</p>
          <h1 className="text-[30px] font-semibold tracking-[-.035em] text-[var(--ink)]">Ürün Katalog Eşleştirmesi</h1>
          <p className="mt-1 max-w-3xl text-[14px] text-[var(--muted)]">Şirketinizdeki Stok Ürünlerini VALOO Kataloğundaki Karşılıklarıyla Eşleştirin. Teklif Talepleri Ve Tedarikçi Teklifleri Bu Eşleştirmeyi Kullanır.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/inventory/purchases/rfqs" className="inline-flex min-h-10 items-center justify-center rounded-[14px] bg-[var(--accent)] px-4 py-2.5 text-[13px] font-semibold text-white">Teklif Taleplerine Dön</Link>
          <Link href="/inventory/supplier-network" className="inline-flex min-h-10 items-center justify-center rounded-[14px] bg-white/70 px-4 py-2.5 text-[13px] font-medium text-[var(--ink)] shadow-[inset_0_0_0_1px_var(--line)]">Tedarikçi Ağı</Link>
        </div>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      {!canWrite ? <Alert tone="success">Bu Görünüm Salt Okunur. Ürün Eşleştirmelerini Değiştirmek İçin Envanter Yönetim Yetkisi Gereklidir.</Alert> : null}

      <section className="grid gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
        <form onSubmit={submit} className="space-y-4 rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5">
          <div><h2 className="text-[15px] font-semibold text-[var(--ink)]">Eşleme Kaydet</h2><p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">Bir Stok Ürünü Tek Bir Katalog Ürünüyle Eşleştirilir. Yeniden Kaydetmek Mevcut Eşleştirmeyi Günceller.</p></div>
          <Field label="Stok Ürünü" required>
            <Select value={productId} onChange={(event) => { setProductId(event.target.value); if (!links.some((row) => row.inventoryProductId === event.target.value)) setVariantId(""); }} required>
              <option value="">Ürün Seçin</option>
              {products.map((row) => <option key={row.id} value={row.id}>{row.name}{row.sku ? ` · ${row.sku}` : ""}{linkedIds.has(row.id) ? " · Eşleştirildi" : ""}</option>)}
            </Select>
          </Field>
          <Field label="Katalog Ürünü" required>
            <Select value={variantId} onChange={(event) => setVariantId(event.target.value)} required>
              <option value="">Katalog Ürünü Seçin</option>
              {variants.map((row) => <option key={row.id} value={row.id}>{row.brandName ? `${row.brandName} · ` : ""}{row.productName} · {row.variantName}{row.canonicalSku ? ` · ${row.canonicalSku}` : ""}</option>)}
            </Select>
          </Field>
          {variantId ? (() => {
            const variant = variants.find((row) => row.id === variantId);
            return variant ? <div className="rounded-[14px] bg-[var(--surface-2)] px-4 py-3 text-[10px] leading-5 text-[var(--muted)]">Birim: {variant.unit} · Aktif Teklif: {variant.activeOfferCount}</div> : null;
          })() : null}
          <Button type="submit" className="w-full" disabled={!canWrite || saving || !productId || !variantId}>{saving ? "Kaydediliyor..." : selectedLink ? "Eşlemeyi Güncelle" : "Eşleme Oluştur"}</Button>
        </form>

        <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4"><div><h2 className="text-[15px] font-semibold text-[var(--ink)]">Aktif Eşleştirmeler</h2><p className="mt-1 text-[11px] text-[var(--muted)]">Teklif Taleplerinde Kullanılabilir Ürün Bağlantıları</p></div><span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--accent)]">{links.length} Kayıt</span></div>
          <div className="divide-y divide-[var(--line)]">
            {links.map((row) => (
              <article key={row.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
                <div><p className="text-[12px] font-semibold text-[var(--ink)]">{row.inventoryProductName}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{row.inventorySku || "Stok Kodu Yok"}</p></div>
                <span className="text-[16px] text-[var(--muted-soft)]">→</span>
                <div><p className="text-[12px] font-semibold text-[var(--ink)]">{row.brandName ? `${row.brandName} · ` : ""}{row.catalogProductName} · {row.catalogVariantName}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{row.canonicalSku || "Katalog Stok Kodu Yok"}</p></div>
              </article>
            ))}
            {!links.length ? <div className="px-5 py-12 text-center text-[11px] text-[var(--muted)]">Henüz Ürün Eşleştirmesi Yok.</div> : null}
          </div>
        </section>
      </section>
    </div>
  );
}