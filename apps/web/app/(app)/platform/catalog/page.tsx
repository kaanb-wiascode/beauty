"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import { Alert, Button, Field, Select, Spinner, TextInput } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";

type Brand = { id: string; slug: string; name: string; status: string };
type Product = { id: string; brandId: string | null; brandName: string | null; slug: string; name: string; description: string | null; categoryCode: string | null; status: string; variantCount: number };
type Identifier = { id: string; identifierType: string; identifierValue: string };
type Variant = { id: string; catalogProductId: string; productName: string; canonicalSku: string | null; name: string; unit: string; attributes: Record<string, unknown>; status: string; identifiers: Identifier[] };

const unitLabels: Record<string, string> = {
  UNIT: "Adet",
  ML: "Mililitre",
  LITER: "Litre",
  GRAM: "Gram",
  KG: "Kilogram",
  METER: "Metre",
  PAIR: "Çift",
  BOX: "Kutu",
};

const identifierLabels: Record<string, string> = {
  EAN: "EAN Barkodu",
  GTIN: "GTIN Barkodu",
  UPC: "UPC Barkodu",
  MPN: "Üretici Parça Numarası",
  OTHER: "Diğer Tanımlayıcı",
};

export default function PlatformCatalogPage() {
  const { showToast } = useToast();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [brandName, setBrandName] = useState("");
  const [brandSlug, setBrandSlug] = useState("");
  const [productName, setProductName] = useState("");
  const [productSlug, setProductSlug] = useState("");
  const [productBrandId, setProductBrandId] = useState("");
  const [categoryCode, setCategoryCode] = useState("");
  const [variantProductId, setVariantProductId] = useState("");
  const [variantName, setVariantName] = useState("");
  const [canonicalSku, setCanonicalSku] = useState("");
  const [variantUnit, setVariantUnit] = useState("UNIT");
  const [identifierVariantId, setIdentifierVariantId] = useState("");
  const [identifierType, setIdentifierType] = useState("EAN");
  const [identifierValue, setIdentifierValue] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [brandRows, productRows, variantRows] = await Promise.all([
        api<Brand[]>("/platform/catalog/brands"),
        api<Product[]>("/platform/catalog/products"),
        api<Variant[]>("/platform/catalog/variants"),
      ]);
      setBrands(brandRows);
      setProducts(productRows);
      setVariants(variantRows);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Ürün Kataloğu Yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const identifierCount = useMemo(() => variants.reduce((sum, row) => sum + row.identifiers.length, 0), [variants]);

  async function run(action: () => Promise<unknown>, success: string) {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await action();
      showToast(success);
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Katalog İşlemi Tamamlanamadı.");
    } finally {
      setSaving(false);
    }
  }

  async function createBrand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(
      () => api("/platform/catalog/brands", { method: "POST", body: { name: brandName.trim(), slug: brandSlug.trim() || slugify(brandName) } }),
      "Marka Oluşturuldu.",
    );
    setBrandName(""); setBrandSlug("");
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(
      () => api("/platform/catalog/products", { method: "POST", body: { name: productName.trim(), slug: productSlug.trim() || slugify(productName), brandId: productBrandId || undefined, categoryCode: categoryCode.trim() || undefined } }),
      "Ürün Oluşturuldu.",
    );
    setProductName(""); setProductSlug(""); setProductBrandId(""); setCategoryCode("");
  }

  async function createVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!variantProductId) return;
    await run(
      () => api(`/platform/catalog/products/${variantProductId}/variants`, { method: "POST", body: { name: variantName.trim(), canonicalSku: canonicalSku.trim() || undefined, unit: variantUnit } }),
      "Ürün Seçeneği Oluşturuldu.",
    );
    setVariantName(""); setCanonicalSku("");
  }

  async function createIdentifier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!identifierVariantId) return;
    await run(
      () => api(`/platform/catalog/variants/${identifierVariantId}/identifiers`, { method: "POST", body: { type: identifierType, value: identifierValue.trim() } }),
      "Ürün Tanımlayıcısı Eklendi.",
    );
    setIdentifierValue("");
  }

  if (loading) return <div className="mx-auto max-w-[1480px] py-16"><Spinner label="Ürün Kataloğu Hazırlanıyor..." /></div>;

  return (
    <div className="mx-auto max-w-[1480px] space-y-6 pb-10">
      <header>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--muted-soft)]">Platform Kataloğu</p>
        <h1 className="text-[30px] font-semibold tracking-[-.035em] text-[var(--ink)]">Ürün Kataloğu</h1>
        <p className="mt-1 max-w-4xl text-[14px] text-[var(--muted)]">Markaları, Ürünleri, Ürün Seçeneklerini Ve Barkod Bilgilerini Tek Merkezden Yönetin.</p>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Marka" value={brands.length} />
        <Metric label="Ürün" value={products.length} />
        <Metric label="Ürün Seçeneği" value={variants.length} />
        <Metric label="Ürün Tanımlayıcısı" value={identifierCount} />
      </section>

      <section className="grid gap-5 xl:grid-cols-4">
        <FormCard title="Marka Oluştur" description="Yeni Marka Kaydı Oluşturun.">
          <form className="space-y-3" onSubmit={createBrand}>
            <Field label="Marka Adı" required><TextInput value={brandName} onChange={(e) => setBrandName(e.target.value)} required /></Field>
            <Field label="Yayın Adı"><TextInput value={brandSlug} onChange={(e) => setBrandSlug(e.target.value)} placeholder={slugify(brandName) || "marka-adi"} /></Field>
            <Button className="w-full" type="submit" disabled={saving || !brandName.trim()}>Kaydet</Button>
          </form>
        </FormCard>

        <FormCard title="Ürün Oluştur" description="Tedarikçilerden Bağımsız Ana Ürün Kaydı Oluşturun.">
          <form className="space-y-3" onSubmit={createProduct}>
            <Field label="Ürün Adı" required><TextInput value={productName} onChange={(e) => setProductName(e.target.value)} required /></Field>
            <Field label="Marka"><Select value={productBrandId} onChange={(e) => setProductBrandId(e.target.value)}><option value="">Markasız</option>{brands.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select></Field>
            <Field label="Kategori Kodu"><TextInput value={categoryCode} onChange={(e) => setCategoryCode(e.target.value)} /></Field>
            <Field label="Yayın Adı"><TextInput value={productSlug} onChange={(e) => setProductSlug(e.target.value)} placeholder={slugify(productName) || "urun-adi"} /></Field>
            <Button className="w-full" type="submit" disabled={saving || !productName.trim()}>Kaydet</Button>
          </form>
        </FormCard>

        <FormCard title="Ürün Seçeneği Oluştur" description="Ürünün Satılabilir Ölçü Veya Paket Seçeneğini Tanımlayın.">
          <form className="space-y-3" onSubmit={createVariant}>
            <Field label="Ürün" required><Select value={variantProductId} onChange={(e) => setVariantProductId(e.target.value)} required><option value="">Ürün Seçin</option>{products.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select></Field>
            <Field label="Seçenek Adı" required><TextInput value={variantName} onChange={(e) => setVariantName(e.target.value)} required /></Field>
            <Field label="Stok Kodu"><TextInput value={canonicalSku} onChange={(e) => setCanonicalSku(e.target.value)} /></Field>
            <Field label="Birim"><Select value={variantUnit} onChange={(e) => setVariantUnit(e.target.value)}>{Object.entries(unitLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
            <Button className="w-full" type="submit" disabled={saving || !variantProductId || !variantName.trim()}>Kaydet</Button>
          </form>
        </FormCard>

        <FormCard title="Ürün Tanımlayıcısı Ekle" description="Barkod Veya Üretici Numarası Ekleyin.">
          <form className="space-y-3" onSubmit={createIdentifier}>
            <Field label="Ürün Seçeneği" required><Select value={identifierVariantId} onChange={(e) => setIdentifierVariantId(e.target.value)} required><option value="">Ürün Seçeneği Seçin</option>{variants.map((row) => <option key={row.id} value={row.id}>{row.productName} · {row.name}</option>)}</Select></Field>
            <Field label="Tanımlayıcı Türü"><Select value={identifierType} onChange={(e) => setIdentifierType(e.target.value)}>{Object.entries(identifierLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
            <Field label="Değer" required><TextInput value={identifierValue} onChange={(e) => setIdentifierValue(e.target.value)} required /></Field>
            <Button className="w-full" type="submit" disabled={saving || !identifierVariantId || !identifierValue.trim()}>Ekle</Button>
          </form>
        </FormCard>
      </section>

      <section className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)]">
        <div className="border-b border-[var(--line)] px-5 py-4"><h2 className="text-[14px] font-semibold text-[var(--ink)]">Ürün Seçenekleri</h2><p className="mt-1 text-[11px] text-[var(--muted)]">Tedarikçi Teklifleri Bu Ürün Seçenekleriyle Eşleştirilir.</p></div>
        <div className="divide-y divide-[var(--line)]">
          {variants.map((row) => (
            <article key={row.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1.2fr_.8fr_.5fr_1fr] md:items-center">
              <div><p className="text-[12px] font-semibold text-[var(--ink)]">{row.productName} · {row.name}</p><p className="mt-1 text-[9px] text-[var(--muted-soft)]">{row.canonicalSku || "Stok Kodu Yok"}</p></div>
              <div className="text-[11px] text-[var(--muted)]">Birim: {unitLabels[row.unit] ?? row.unit}</div>
              <div className="text-[11px] text-[var(--muted)]">{row.identifiers.length} Tanımlayıcı</div>
              <div className="flex flex-wrap gap-1.5">{row.identifiers.map((identifier) => <span key={identifier.id} className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[9px] text-[var(--muted)]">{identifierLabels[identifier.identifierType] ?? "Tanımlayıcı"}: {identifier.identifierValue}</span>)}</div>
            </article>
          ))}
          {!variants.length ? <div className="px-5 py-12 text-center text-[11px] text-[var(--muted)]">Henüz Ürün Seçeneği Yok.</div> : null}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--muted-soft)]">{label}</p><p className="mt-3 text-[28px] font-semibold tracking-[-.04em] text-[var(--ink)]">{value}</p></div>;
}

function FormCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5"><h2 className="text-[13px] font-semibold text-[var(--ink)]">{title}</h2><p className="mb-4 mt-1 text-[10px] text-[var(--muted)]">{description}</p>{children}</div>;
}

function slugify(value: string) {
  return value.trim().toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
