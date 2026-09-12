"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";

import { FilterChip, SearchField } from "@/components/data-view";
import { InventoryFormShell, InventorySimpleFormShell } from "@/components/inventory-form-shell";
import { Alert, Button, Spinner, TextInput } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";
import { getActiveBranchId } from "@/lib/auth";
import {
  INVENTORY_UNITS,
  formatInventoryMoney,
  formatInventoryQuantity,
  inventoryAssetConditionLabel,
  inventoryAssetStatusLabel,
  inventoryAssetTypeLabel,
  inventoryUnitLabel,
  type AssetFormState,
  type InventoryAsset,
  type InventoryCategory,
  type InventoryOverview,
  type InventoryProduct,
  type InventorySupplier,
  type InventoryWarehouse,
  type ProductFormState,
} from "@/lib/inventory-types";

const productTabs = ["Genel", "Kategori", "Stok", "Tedarik", "Finans", "Parti Ve Son Kullanma", "Kullanım"] as const;
const assetTabs = ["Genel", "Satın Alma", "Konum Ve Zimmet", "Garanti Ve Bakım", "Belgeler", "Notlar"] as const;
type ProductTab = (typeof productTabs)[number];
type AssetTab = (typeof assetTabs)[number];
type InventoryTab = "Tümü" | "Ürünler" | "Varlıklar" | "Kritik Stok" | "Kategoriler" | "Tedarikçiler";
type IconName = "box" | "asset" | "alert" | "search" | "plus" | "warehouse" | "category" | "supplier" | "clock" | "truck" | "shield" | "calendar" | "spark";
type MetricTone = "orange" | "green" | "amber" | "blue";

const emptyProduct: ProductFormState = {
  name: "", sku: "", barcode: "", brand: "", manufacturer: "", model: "", description: "", categoryId: "", unit: "UNIT", packageQuantity: "", originCountry: "Türkiye", trackStock: true, trackExpiry: false, minimumQuantity: "", targetQuantity: "", initialQuantity: "", purchasePrice: "", salePrice: "", taxRate: "20", currency: "TRY", minimumOrderQuantity: "1", orderMultiple: "1", leadTimeDays: "0", preparationDays: "0", shippingDays: "0", returnable: true, supplierId: "", supplierProductCode: "", supplierUnitCost: "", supplierMinimumOrderQuantity: "1", supplierOrderMultiple: "1", supplierLeadTimeDays: "0", supplierPreparationDays: "0", supplierShippingDays: "0", lotNumber: "", manufacturedAt: "", expiresAt: "", serviceNotes: "",
};

const emptyAsset: AssetFormState = {
  name: "", assetCode: "", assetType: "EQUIPMENT", categoryId: "", brand: "", model: "", serialNumber: "", status: "ACTIVE", condition: "GOOD", branchId: "", warehouseId: "", purchaseDate: "", supplierId: "", invoiceNumber: "", purchasePrice: "", currency: "TRY", warrantyStart: "", warrantyEnd: "", maintenanceIntervalDays: "180", nextMaintenanceAt: "", notes: "",
};

function Icon({ name }: { name: IconName }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "box") return <svg {...common}><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/></svg>;
  if (name === "asset") return <svg {...common}><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 19v2M16 19v2M9 9h6M9 13h6"/></svg>;
  if (name === "alert") return <svg {...common}><path d="M12 4 3.5 19h17L12 4Z"/><path d="M12 9v5M12 17h.01"/></svg>;
  if (name === "search") return <svg {...common}><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg>;
  if (name === "plus") return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
  if (name === "warehouse") return <svg {...common}><path d="m3 10 9-6 9 6v9H3v-9Z"/><path d="M7 19v-6h10v6"/></svg>;
  if (name === "category") return <svg {...common}><path d="M4 5h6l2 2h8v12H4z"/><path d="M4 10h16"/></svg>;
  if (name === "supplier") return <svg {...common}><circle cx="8" cy="8" r="3"/><path d="M3 19a5 5 0 0 1 10 0M15 8h6M15 12h6M15 16h6"/></svg>;
  if (name === "clock") return <svg {...common}><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg>;
  if (name === "truck") return <svg {...common}><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7zM7 19h.01M18 19h.01"/></svg>;
  if (name === "shield") return <svg {...common}><path d="M12 3 19 6v6c0 4-2.5 7-7 9-4.5-2-7-5-7-9V6z"/><path d="m9 12 2 2 4-4"/></svg>;
  if (name === "calendar") return <svg {...common}><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>;
  return <svg {...common}><path d="m12 3 1.5 6 5.5 1.5-5.5 1.5L12 18l-1.5-6L5 10.5 10.5 9z"/></svg>;
}

export default function InventoryPage() {
  const { showToast } = useToast();
  const activeBranchId = getActiveBranchId();
  const [data, setData] = useState<InventoryOverview | null>(null);
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [assets, setAssets] = useState<InventoryAsset[]>([]);
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [suppliers, setSuppliers] = useState<InventorySupplier[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<InventoryTab>("Tümü");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [productOpen, setProductOpen] = useState(false);
  const [assetOpen, setAssetOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [productTab, setProductTab] = useState<ProductTab>("Genel");
  const [assetTab, setAssetTab] = useState<AssetTab>("Genel");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProductFormState>(emptyProduct);
  const [asset, setAsset] = useState<AssetFormState>(emptyAsset);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [overview, productRows, categoryRows, supplierRows, assetRows] = await Promise.all([
        api<InventoryOverview>("/inventory/overview"),
        api<InventoryProduct[]>(`/inventory/products${search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ""}`),
        api<InventoryCategory[]>("/inventory/categories"),
        api<InventorySupplier[]>("/inventory/suppliers"),
        api<InventoryAsset[]>("/inventory/assets"),
      ]);
      setData(overview);
      setProducts(productRows);
      setCategories(categoryRows);
      setSuppliers(supplierRows);
      setAssets(assetRows);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Envanter Yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 150);
    return () => window.clearTimeout(timer);
  }, [load]);

  const visible = useMemo(
    () => products.filter((product) => tab === "Kritik Stok" ? Number(product.minimumQuantity) > 0 && Number(product.quantity) <= Number(product.minimumQuantity) : true),
    [products, tab],
  );

  function updateProduct<K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateAsset<K extends keyof AssetFormState>(key: K, value: AssetFormState[K]) {
    setAsset((current) => ({ ...current, [key]: value }));
  }

  async function createProduct(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await api("/inventory/products", {
        method: "POST",
        body: {
          ...form,
          packageQuantity: Number(form.packageQuantity || 0) || null,
          minimumQuantity: Number(form.minimumQuantity || 0),
          targetQuantity: Number(form.targetQuantity || 0),
          initialQuantity: Number(form.initialQuantity || 0),
          purchasePrice: Number(form.purchasePrice || 0),
          salePrice: Number(form.salePrice || 0),
          taxRate: Number(form.taxRate || 20),
          minimumOrderQuantity: Number(form.minimumOrderQuantity || 1),
          orderMultiple: Number(form.orderMultiple || 1),
          leadTimeDays: Number(form.leadTimeDays || 0),
          preparationDays: Number(form.preparationDays || 0),
          shippingDays: Number(form.shippingDays || 0),
          supplierUnitCost: Number(form.supplierUnitCost || 0),
          supplierMinimumOrderQuantity: Number(form.supplierMinimumOrderQuantity || 1),
          supplierOrderMultiple: Number(form.supplierOrderMultiple || 1),
          supplierLeadTimeDays: Number(form.supplierLeadTimeDays || 0),
          supplierPreparationDays: Number(form.supplierPreparationDays || 0),
          supplierShippingDays: Number(form.supplierShippingDays || 0),
        },
      });
      showToast("Ürün Kartı Oluşturuldu.");
      setProductOpen(false);
      setForm(emptyProduct);
      setProductTab("Genel");
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Ürün Oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  }

  async function createAsset(event: FormEvent) {
    event.preventDefault();
    if (!asset.name.trim() || !asset.assetCode.trim()) return;
    setSaving(true);
    try {
      await api("/inventory/assets", {
        method: "POST",
        body: {
          ...asset,
          purchasePrice: Number(asset.purchasePrice || 0),
          maintenanceIntervalDays: Number(asset.maintenanceIntervalDays || 0) || null,
        },
      });
      showToast("Envanter Kaydı Oluşturuldu.");
      setAssetOpen(false);
      setAsset(emptyAsset);
      setAssetTab("Genel");
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Envanter Oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  }

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await api("/inventory/categories", {
        method: "POST",
        body: {
          name: String(formData.get("name")),
          code: String(formData.get("code") || ""),
          description: String(formData.get("description") || ""),
          defaultUnit: String(formData.get("defaultUnit") || "UNIT"),
        },
      });
      showToast("Kategori Oluşturuldu.");
      setCategoryOpen(false);
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Kategori Oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  }

  async function createSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await api("/inventory/suppliers", {
        method: "POST",
        body: {
          name: String(formData.get("name")),
          contactName: String(formData.get("contactName") || ""),
          phone: String(formData.get("phone") || ""),
          email: String(formData.get("email") || ""),
          taxNumber: String(formData.get("taxNumber") || ""),
          address: String(formData.get("address") || ""),
        },
      });
      showToast("Tedarikçi Oluşturuldu.");
      setSupplierOpen(false);
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Tedarikçi Oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data) return <div className="mx-auto max-w-[1480px] py-16"><Spinner label="Envanter Hazırlanıyor..."/></div>;

  return <div className="mx-auto max-w-[1480px] space-y-6 pb-10">
    <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[.15em] text-[var(--muted-soft)]">Envanter Yönetimi</p>
        <h1 className="text-[34px] font-semibold tracking-[-.04em] text-[var(--ink)]">Stok Ve Envanter</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-6 text-[var(--muted)]">Ürünleri, Sarf Malzemelerini, Şube Stoklarını Ve Şirket Varlıklarını Tek Ekrandan Yönetin.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => { setProductTab("Genel"); setProductOpen(true); }}><Icon name="box"/>Yeni Ürün</Button>
        <Button variant="secondary" onClick={() => { setAsset({ ...emptyAsset, branchId: activeBranchId ?? "" }); setAssetTab("Genel"); setAssetOpen(true); }}><Icon name="asset"/>Yeni Envanter</Button>
      </div>
    </header>

    {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <Metric icon="box" label="Toplam Ürün" value={data?.metrics.totalProducts ?? 0}/>
      <Metric icon="alert" label="Kritik Stok" value={data?.metrics.criticalProducts ?? 0} tone="orange"/>
      <Metric icon="asset" label="Varlık" value={data?.assetCount ?? assets.length} tone="green"/>
      <Metric icon="spark" label="Stok Değeri" value={formatInventoryMoney(data?.metrics.inventoryValue)} tone="blue"/>
      <Metric icon="calendar" label="Yaklaşan Son Kullanma" value={data?.expiringLots ?? 0} tone="amber"/>
      <Metric icon="clock" label="Satın Alma" value={data?.purchaseRequests?.filter((item) => ["PENDING", "APPROVED", "ORDERED"].includes(item.status)).length ?? 0} tone="blue"/>
    </div>

    <div className="flex flex-col gap-3 rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[0_8px_28px_rgba(17,70,104,.035)] lg:flex-row lg:items-center">
      <div className="flex gap-1 overflow-x-auto">
        {(["Tümü", "Ürünler", "Varlıklar", "Kritik Stok", "Kategoriler", "Tedarikçiler"] as InventoryTab[]).map((value) => (
          <FilterChip key={value} active={tab === value} onClick={() => setTab(value)}>{value}</FilterChip>
        ))}
      </div>
      <div className="min-w-0 flex-1 lg:ml-auto lg:max-w-[360px]">
        <SearchField value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ürün, Stok Kodu Veya Barkod Ara..." aria-label="Envanter Ara" onKeyDown={(event) => { if (event.key === "Escape" && search) setSearch(""); }}/>
      </div>
    </div>

    {tab === "Varlıklar" ? <AssetGrid assets={assets}/> : tab === "Kategoriler" ? <CategoryPanel categories={categories} onAdd={() => setCategoryOpen(true)}/> : tab === "Tedarikçiler" ? <SupplierPanel suppliers={suppliers} onAdd={() => setSupplierOpen(true)}/> : (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
            <div><h2 className="text-[15px] font-semibold text-[var(--ink)]">Ürün Kataloğu</h2><p className="mt-1 text-[11px] text-[var(--muted)]">Şube Ve Ana Depo Stoklarıyla Birlikte</p></div>
            <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--accent)]">{visible.length} Kayıt</span>
          </div>
          <div className="divide-y divide-[var(--line)]">{visible.map((product) => <ProductRow key={product.id} product={product}/>)}{!visible.length ? <div className="px-6 py-16 text-center text-[13px] text-[var(--muted)]">Ürün Bulunamadı.</div> : null}</div>
        </section>
        <aside className="space-y-5">
          <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)]">
            <div className="flex items-center justify-between border-b border-[var(--line)] p-5"><div><h2 className="text-[15px] font-semibold text-[var(--ink)]">Kritik Stok</h2><p className="mt-1 text-[11px] text-[var(--muted)]">Otomatik Satın Alma Önerisi</p></div><Icon name="alert"/></div>
            {(data?.critical ?? []).slice(0, 5).map((product) => <div key={product.id} className="border-b border-[var(--line)] px-5 py-4 last:border-0"><div className="flex justify-between gap-3"><span className="truncate text-[12px] font-medium text-[var(--ink)]">{product.name}</span><span className="text-[11px] font-semibold text-[var(--warning)]">{formatInventoryQuantity(product.quantity)} {inventoryUnitLabel(product.unit)}</span></div><div className="mt-2 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]"><div className="h-full rounded-full bg-[var(--warning)]" style={{ width: `${Math.min(100, (Number(product.quantity) / (Number(product.targetQuantity) || Number(product.minimumQuantity) || 1)) * 100)}%` }}/></div><span className="text-[9px] text-[var(--muted-soft)]">Minimum {formatInventoryQuantity(product.minimumQuantity)}</span></div></div>)}
            {!data?.critical?.length ? <div className="p-8 text-center text-[12px] text-[var(--muted)]">Kritik Stok Bulunmuyor.</div> : null}
          </section>
          <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)]">
            <div className="border-b border-[var(--line)] p-5"><h2 className="text-[15px] font-semibold text-[var(--ink)]">Depolar</h2><p className="mt-1 text-[11px] text-[var(--muted)]">Ana Depo Ve Şube Depoları</p></div>
            {(data?.warehouses ?? []).map((warehouse) => <div key={warehouse.id} className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-3.5 last:border-0"><span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--surface-2)] text-[var(--muted)]"><Icon name="warehouse"/></span><div className="min-w-0 flex-1"><div className="truncate text-[12px] font-medium text-[var(--ink)]">{warehouse.name}</div><div className="mt-0.5 text-[10px] text-[var(--muted-soft)]">{warehouse.type === "MAIN_DEPOT" ? "Ana Depo" : "Şube Deposu"}</div></div></div>)}
          </section>
        </aside>
      </div>
    )}

    <section className="grid gap-3 md:grid-cols-4">
      <QuickCard icon="category" title="Kategori Yönetimi" text={`${categories.length} Kategori Aktif`} onClick={() => setTab("Kategoriler")}/>
      <QuickCard icon="supplier" title="Tedarikçi Zinciri" text={`${suppliers.length} Tedarikçi Kayıtlı`} onClick={() => setTab("Tedarikçiler")}/>
      <QuickCard icon="truck" title="Satın Alma" text={`${data?.purchaseRequests?.length ?? 0} Satın Alma Önerisi`} href="/inventory/purchases"/>
      <QuickCard icon="shield" title="Varlık Yönetimi" text={`${assets.length} Taşınır / Ekipman`} onClick={() => setTab("Varlıklar")}/>
    </section>

    {productOpen ? <FormOverlay title="Yeni Ürün Ekle" description="Ürünü Kategori, Stok Politikası, Tedarik, Finans Ve Son Kullanma Bilgileriyle Eksiksiz Oluşturun." tabs={productTabs} activeTab={productTab} setActiveTab={setProductTab} onClose={() => setProductOpen(false)} onSubmit={createProduct} saving={saving} footer="Ürünü Kaydet"><ProductFormContent tab={productTab} form={form} update={updateProduct} categories={categories} suppliers={suppliers}/></FormOverlay> : null}
    {assetOpen ? <FormOverlay title="Yeni Envanter Ekle" description="Şirketin Taşınır Varlığını Satın Alma, Konum, Zimmet, Garanti Ve Bakım Bilgileriyle Kaydedin." tabs={assetTabs} activeTab={assetTab} setActiveTab={setAssetTab} onClose={() => setAssetOpen(false)} onSubmit={createAsset} saving={saving} footer="Envanteri Kaydet"><AssetFormContent tab={assetTab} form={asset} update={updateAsset} categories={categories} suppliers={suppliers} warehouses={data?.warehouses ?? []} activeBranchId={activeBranchId}/></FormOverlay> : null}
    {categoryOpen ? <SimpleOverlay title="Yeni Kategori" onClose={() => setCategoryOpen(false)} onSubmit={createCategory} footer="Kategori Oluştur" saving={saving}><div className="grid gap-4 sm:grid-cols-2"><Field label="Kategori Adı" required><TextInput name="name" required placeholder="Cilt Bakımı"/></Field><Field label="Kategori Kodu"><TextInput name="code" placeholder="Örn. CİLT-BAKIM"/></Field><Field label="Varsayılan Birim"><SelectNative name="defaultUnit">{INVENTORY_UNITS.map((unit) => <option key={unit} value={unit}>{inventoryUnitLabel(unit)}</option>)}</SelectNative></Field><Field label="Açıklama"><TextInput name="description" placeholder="Kategori Açıklaması"/></Field></div></SimpleOverlay> : null}
    {supplierOpen ? <SimpleOverlay title="Yeni Tedarikçi" onClose={() => setSupplierOpen(false)} onSubmit={createSupplier} footer="Tedarikçiyi Kaydet" saving={saving}><div className="grid gap-4 sm:grid-cols-2"><Field label="Firma Adı" required><TextInput name="name" required placeholder="ABC Kozmetik"/></Field><Field label="Yetkili"><TextInput name="contactName" placeholder="Ad Soyad"/></Field><Field label="Telefon"><TextInput name="phone" placeholder="+90"/></Field><Field label="E-Posta"><TextInput name="email" type="email" placeholder="Satın Alma E-Postası"/></Field><Field label="Vergi No"><TextInput name="taxNumber"/></Field><Field label="Adres"><TextInput name="address"/></Field></div></SimpleOverlay> : null}
  </div>;
}

function ProductFormContent({ tab, form, update, categories, suppliers }: { tab: ProductTab; form: ProductFormState; update: <K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) => void; categories: InventoryCategory[]; suppliers: InventorySupplier[] }) {
  if (tab === "Genel") return <div className="grid gap-5 md:grid-cols-2"><Field label="Ürün Adı" required><TextInput value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Cilt Yenileyici Serum" required/></Field><Field label="Stok Kodu"><TextInput value={form.sku} onChange={(event) => update("sku", event.target.value)} placeholder="SER-001"/></Field><Field label="Barkod"><TextInput value={form.barcode} onChange={(event) => update("barcode", event.target.value)} placeholder="8691234567890"/></Field><Field label="Marka"><TextInput value={form.brand} onChange={(event) => update("brand", event.target.value)} placeholder="Marka"/></Field><Field label="Üretici"><TextInput value={form.manufacturer} onChange={(event) => update("manufacturer", event.target.value)} placeholder="Üretici Firma"/></Field><Field label="Model / Seri"><TextInput value={form.model} onChange={(event) => update("model", event.target.value)} placeholder="Model"/></Field><Field label="Ürün Birimi"><SelectNative value={form.unit} onChange={(event) => update("unit", event.target.value)}>{INVENTORY_UNITS.map((unit) => <option key={unit} value={unit}>{inventoryUnitLabel(unit)}</option>)}</SelectNative></Field><Field label="Paket İçeriği"><TextInput type="number" value={form.packageQuantity} onChange={(event) => update("packageQuantity", event.target.value)} placeholder="30"/></Field><Field label="Menşei"><TextInput value={form.originCountry} onChange={(event) => update("originCountry", event.target.value)} placeholder="Türkiye"/></Field><Field label="Açıklama"><TextInput value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="Ürün Açıklaması"/></Field></div>;
  if (tab === "Kategori") return <div className="space-y-5"><div className="grid gap-4 md:grid-cols-2"><Field label="Kategori" required><SelectNative value={form.categoryId} onChange={(event) => update("categoryId", event.target.value)}><option value="">Kategori Seçin</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.code ? ` · ${category.code}` : ""}</option>)}</SelectNative></Field><Field label="Etiket / Alt Kategori"><TextInput placeholder="Serumlar"/></Field></div><Hint>Kategori Ağacı Ürünlerin Raporlama, Satın Alma Ve Stok Politikalarında Temel Alınır. Örnek: Cilt Bakımı → Serumlar.</Hint></div>;
  if (tab === "Stok") return <div className="grid gap-5 md:grid-cols-2"><Toggle label="Stok Takibi" value={form.trackStock} onChange={(value) => update("trackStock", value)}/><Toggle label="Parti Ve Son Kullanma Takibi" value={form.trackExpiry} onChange={(value) => update("trackExpiry", value)}/><Field label="Minimum Stok"><TextInput type="number" value={form.minimumQuantity} onChange={(event) => update("minimumQuantity", event.target.value)} placeholder="10"/></Field><Field label="İdeal Stok"><TextInput type="number" value={form.targetQuantity} onChange={(event) => update("targetQuantity", event.target.value)} placeholder="30"/></Field><Field label="Başlangıç Stoğu"><TextInput type="number" value={form.initialQuantity} onChange={(event) => update("initialQuantity", event.target.value)} placeholder="0"/></Field><Field label="İlk Maliyet"><TextInput type="number" value={form.purchasePrice} onChange={(event) => update("purchasePrice", event.target.value)} placeholder="420"/></Field></div>;
  if (tab === "Tedarik") return <div className="space-y-5"><div className="grid gap-4 md:grid-cols-2"><Field label="Ana Tedarikçi"><SelectNative value={form.supplierId} onChange={(event) => update("supplierId", event.target.value)}><option value="">Tedarikçi Seçin</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</SelectNative></Field><Field label="Tedarikçi Ürün Kodu"><TextInput value={form.supplierProductCode} onChange={(event) => update("supplierProductCode", event.target.value)} placeholder="ABC-93821"/></Field><Field label="Birim Alış Fiyatı"><TextInput type="number" value={form.supplierUnitCost} onChange={(event) => update("supplierUnitCost", event.target.value)} placeholder="420"/></Field><Field label="Minimum Sipariş"><TextInput type="number" value={form.supplierMinimumOrderQuantity} onChange={(event) => update("supplierMinimumOrderQuantity", event.target.value)} placeholder="10"/></Field><Field label="Sipariş Katı"><TextInput type="number" value={form.supplierOrderMultiple} onChange={(event) => update("supplierOrderMultiple", event.target.value)} placeholder="5"/></Field><Field label="Tedarik Süresi (Gün)"><TextInput type="number" value={form.supplierLeadTimeDays} onChange={(event) => update("supplierLeadTimeDays", event.target.value)} placeholder="7"/></Field><Field label="Hazırlık Süresi (Gün)"><TextInput type="number" value={form.supplierPreparationDays} onChange={(event) => update("supplierPreparationDays", event.target.value)} placeholder="2"/></Field><Field label="Kargo Süresi (Gün)"><TextInput type="number" value={form.supplierShippingDays} onChange={(event) => update("supplierShippingDays", event.target.value)} placeholder="3"/></Field></div><Hint>Toplam Teslim Süresi Tedarik, Hazırlık Ve Kargo Sürelerinin Toplamıdır. Sistem Tüketim Hızını Ve Güvenlik Stoğunu Kullanarak Sipariş Önerisi Oluşturabilir.</Hint></div>;
  if (tab === "Finans") return <div className="grid gap-5 md:grid-cols-2"><Field label="Alış Fiyatı"><TextInput type="number" value={form.purchasePrice} onChange={(event) => update("purchasePrice", event.target.value)} placeholder="420"/></Field><Field label="Satış Fiyatı"><TextInput type="number" value={form.salePrice} onChange={(event) => update("salePrice", event.target.value)} placeholder="750"/></Field><Field label="KDV"><TextInput type="number" value={form.taxRate} onChange={(event) => update("taxRate", event.target.value)} placeholder="20"/></Field><Field label="Para Birimi"><SelectNative value={form.currency} onChange={(event) => update("currency", event.target.value)}><option value="TRY">Türk Lirası</option><option value="EUR">Avro</option><option value="USD">Amerikan Doları</option></SelectNative></Field><div className="md:col-span-2"><Toggle label="İade Edilebilir" value={form.returnable} onChange={(value) => update("returnable", value)}/></div></div>;
  if (tab === "Parti Ve Son Kullanma") return <div className="grid gap-5 md:grid-cols-2"><Toggle label="Parti Ve Son Kullanma Takibi Aktif" value={form.trackExpiry} onChange={(value) => update("trackExpiry", value)}/><Field label="Parti Numarası"><TextInput value={form.lotNumber} onChange={(event) => update("lotNumber", event.target.value)} placeholder="PARTİ-2026-0831"/></Field><Field label="Üretim Tarihi"><TextInput type="date" value={form.manufacturedAt} onChange={(event) => update("manufacturedAt", event.target.value)}/></Field><Field label="Son Kullanma Tarihi"><TextInput type="date" value={form.expiresAt} onChange={(event) => update("expiresAt", event.target.value)}/></Field><div className="md:col-span-2"><Hint tone="warning">Son Kullanma Tarihi En Yakın Ürünün Önce Tüketilmesi Hedeflenir. Uyarılar Sistem Kurallarına Göre Oluşturulur.</Hint></div></div>;
  return <div className="space-y-5"><Hint>Bu Ürün Hizmet Tamamlandığında Stok Tüketimiyle İlişkilendirilebilir. Gerçek Tüketim Kayıtları Sistem Tarafından Ayrı Olarak İzlenir.</Hint><Field label="İç Kullanım Notu"><TextInput value={form.serviceNotes} onChange={(event) => update("serviceNotes", event.target.value)} placeholder="Örnek: Cilt Bakımında 5 Mililitre Kullanılır"/></Field></div>;
}

function AssetFormContent({ tab, form, update, categories, suppliers, warehouses, activeBranchId }: { tab: AssetTab; form: AssetFormState; update: <K extends keyof AssetFormState>(key: K, value: AssetFormState[K]) => void; categories: InventoryCategory[]; suppliers: InventorySupplier[]; warehouses: InventoryWarehouse[]; activeBranchId: string | null }) {
  const branchWarehouses = activeBranchId ? warehouses.filter((warehouse) => warehouse.branchId === activeBranchId) : warehouses.filter((warehouse) => warehouse.branchId);
  const locationWarehouses = activeBranchId ? branchWarehouses : warehouses;

  if (tab === "Genel") return <div className="grid gap-5 md:grid-cols-2"><Field label="Varlık Adı" required><TextInput value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Cilt Bakım Cihazı" required/></Field><Field label="Varlık Kodu" required><TextInput value={form.assetCode} onChange={(event) => update("assetCode", event.target.value)} placeholder="VAR-00124" required/></Field><Field label="Varlık Tipi"><SelectNative value={form.assetType} onChange={(event) => update("assetType", event.target.value)}>{["EQUIPMENT", "FURNITURE", "IT", "VEHICLE", "OTHER"].map((value) => <option key={value} value={value}>{inventoryAssetTypeLabel(value)}</option>)}</SelectNative></Field><Field label="Kategori"><SelectNative value={form.categoryId} onChange={(event) => update("categoryId", event.target.value)}><option value="">Kategori Seçin</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</SelectNative></Field><Field label="Marka"><TextInput value={form.brand} onChange={(event) => update("brand", event.target.value)} placeholder="Marka"/></Field><Field label="Model"><TextInput value={form.model} onChange={(event) => update("model", event.target.value)} placeholder="Model"/></Field><Field label="Seri Numarası"><TextInput value={form.serialNumber} onChange={(event) => update("serialNumber", event.target.value)} placeholder="SERİ-839292"/></Field><Field label="Durum"><SelectNative value={form.status} onChange={(event) => update("status", event.target.value)}>{["ACTIVE", "INACTIVE", "MAINTENANCE", "RETIRED"].map((value) => <option key={value} value={value}>{inventoryAssetStatusLabel(value)}</option>)}</SelectNative></Field><Field label="Fiziksel Durum"><SelectNative value={form.condition} onChange={(event) => update("condition", event.target.value)}>{["GOOD", "FAIR", "POOR", "BROKEN"].map((value) => <option key={value} value={value}>{inventoryAssetConditionLabel(value)}</option>)}</SelectNative></Field></div>;
  if (tab === "Satın Alma") return <div className="grid gap-5 md:grid-cols-2"><Field label="Satın Alma Tarihi"><TextInput type="date" value={form.purchaseDate} onChange={(event) => update("purchaseDate", event.target.value)}/></Field><Field label="Tedarikçi"><SelectNative value={form.supplierId} onChange={(event) => update("supplierId", event.target.value)}><option value="">Tedarikçi Seçin</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</SelectNative></Field><Field label="Fatura No"><TextInput value={form.invoiceNumber} onChange={(event) => update("invoiceNumber", event.target.value)} placeholder="FAT-83921"/></Field><Field label="Satın Alma Bedeli"><TextInput type="number" value={form.purchasePrice} onChange={(event) => update("purchasePrice", event.target.value)} placeholder="185000"/></Field><Field label="Para Birimi"><SelectNative value={form.currency} onChange={(event) => update("currency", event.target.value)}><option value="TRY">Türk Lirası</option><option value="EUR">Avro</option><option value="USD">Amerikan Doları</option></SelectNative></Field></div>;
  if (tab === "Konum Ve Zimmet") return <div className="grid gap-5 md:grid-cols-2"><Field label="Şube"><SelectNative value={activeBranchId ?? form.branchId} disabled={Boolean(activeBranchId)} onChange={(event) => update("branchId", event.target.value)}>{activeBranchId ? null : <option value="">Merkez / Ortak</option>}{branchWarehouses.map((warehouse) => <option key={warehouse.branchId ?? warehouse.id} value={warehouse.branchId ?? ""}>{warehouse.name.replace(" Stok", "")}</option>)}</SelectNative></Field><Field label="Depo / Konum"><SelectNative value={form.warehouseId} onChange={(event) => update("warehouseId", event.target.value)}><option value="">Seçin</option>{locationWarehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</SelectNative></Field><Field label="Zimmetli Personel"><TextInput placeholder="Personel Zimmet İşlemlerinden Yönetilir" disabled/></Field><Hint>{activeBranchId ? "Aktif Şube Seçiliyken Envanter Varlığı Yalnız Bu Şubeye Ve Şubenin Depolarına Kaydedilebilir." : "Şube Transferleri Ve Zimmet Geçmişi Varlık Kartında Ayrı Kayıtlarla İzlenir."}</Hint></div>;
  if (tab === "Garanti Ve Bakım") return <div className="grid gap-5 md:grid-cols-2"><Field label="Garanti Başlangıcı"><TextInput type="date" value={form.warrantyStart} onChange={(event) => update("warrantyStart", event.target.value)}/></Field><Field label="Garanti Bitişi"><TextInput type="date" value={form.warrantyEnd} onChange={(event) => update("warrantyEnd", event.target.value)}/></Field><Field label="Bakım Aralığı (Gün)"><TextInput type="number" value={form.maintenanceIntervalDays} onChange={(event) => update("maintenanceIntervalDays", event.target.value)} placeholder="180"/></Field><Field label="Sonraki Bakım"><TextInput type="date" value={form.nextMaintenanceAt} onChange={(event) => update("nextMaintenanceAt", event.target.value)}/></Field><div className="md:col-span-2"><Hint>Garanti Bitişi Ve Yaklaşan Bakım Tarihleri Sistem Kurallarına Göre İzlenir.</Hint></div></div>;
  if (tab === "Belgeler") return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><DocTile title="Fatura"/><DocTile title="Garanti Belgesi"/><DocTile title="Servis Sözleşmesi"/></div><p className="text-[11px] leading-5 text-[var(--muted)]">Belge Yükleme Özelliği Etkinleştirildiğinde Dosyalar Bu Alandan Yönetilebilir. Şu Anda Bu Kartlar Yalnız Bilgilendirme Amaçlıdır.</p></div>;
  return <Field label="Notlar"><TextInput value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Varlıkla İlgili Ek Bilgiler"/></Field>;
}

function FormOverlay<T extends string>({ title, description, tabs, activeTab, setActiveTab, onClose, onSubmit, saving, footer, children }: { title: string; description: string; tabs: readonly T[]; activeTab: T; setActiveTab: (value: T) => void; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; saving: boolean; footer: string; children: ReactNode }) {
  const steps = tabs.map((label) => ({ key: label, label }));
  const activeStep = Math.max(0, tabs.indexOf(activeTab));
  return <InventoryFormShell title={title} description={description} steps={steps} activeStep={activeStep} onStepChange={(index) => { const next = tabs[index]; if (next) setActiveTab(next); }} onClose={onClose} onSubmit={onSubmit} saving={saving} submitLabel={footer}>{children}</InventoryFormShell>;
}

function SimpleOverlay({ title, onClose, onSubmit, footer, children, saving }: { title: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; footer: string; children: ReactNode; saving: boolean }) {
  return <InventorySimpleFormShell title={title} onClose={onClose} onSubmit={onSubmit} saving={saving} submitLabel={footer}>{children}</InventorySimpleFormShell>;
}

function Field({ label, children, required }: { label: string; children: ReactNode; required?: boolean }) {
  return <label className="block"><span className="mb-1.5 block text-[11px] font-medium text-[var(--muted)]">{label}{required ? <span className="ml-1 text-[var(--accent)]">*</span> : null}</span>{children}</label>;
}

function SelectNative({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className="control h-11 w-full">{children}</select>;
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={value} onClick={() => onChange(!value)} className="flex items-center justify-between rounded-[14px] border border-[var(--line)] px-4 py-3 text-left"><span className="text-[12px] font-medium text-[var(--ink)]">{label}</span><span className={`h-5 w-9 rounded-full p-0.5 transition ${value ? "bg-[var(--accent)]" : "bg-[var(--line)]"}`}><span className={`block h-4 w-4 rounded-full bg-white transition ${value ? "translate-x-4" : "translate-x-0"}`}/></span></button>;
}

function Hint({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warning" }) {
  return <div className={`rounded-[14px] border p-4 text-[12px] leading-5 ${tone === "warning" ? "border-[rgba(190,116,37,.16)] bg-[rgba(190,116,37,.06)] text-[var(--muted)]" : "border-[var(--line)] bg-[var(--surface-2)]/55 text-[var(--muted)]"}`}>{children}</div>;
}

function ProductRow({ product }: { product: InventoryProduct }) {
  const critical = Number(product.minimumQuantity) > 0 && Number(product.quantity) <= Number(product.minimumQuantity);
  return <div className="flex items-center gap-4 px-5 py-4 transition hover:bg-[var(--surface-2)]/35"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[var(--surface-2)] text-[var(--muted)]"><Icon name="box"/></span><div className="min-w-0 flex-1"><div className="truncate text-[13px] font-semibold text-[var(--ink)]">{product.name}</div><div className="mt-1 truncate text-[10px] text-[var(--muted)]">{product.categoryName || "Kategorisiz"}{product.sku ? ` · Stok Kodu ${product.sku}` : ""}{product.barcode ? ` · ${product.barcode}` : ""}</div></div><div className="hidden min-w-[100px] text-right md:block"><div className="text-[12px] font-semibold text-[var(--ink)]">{formatInventoryQuantity(product.quantity)} {inventoryUnitLabel(product.unit)}</div><div className="mt-1 text-[10px] text-[var(--muted-soft)]">Minimum {formatInventoryQuantity(product.minimumQuantity)}</div></div><span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold ${critical ? "bg-[var(--warning-soft)] text-[var(--warning)]" : "bg-[var(--success-soft)] text-[var(--success)]"}`}>{critical ? "Kritik" : "Normal"}</span></div>;
}

function AssetGrid({ assets }: { assets: InventoryAsset[] }) {
  return <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{assets.map((item) => <article key={item.id} className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_8px_24px_rgba(17,70,104,.035)]"><div className="flex items-start justify-between gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[var(--success-soft)] text-[var(--success)]"><Icon name="asset"/></span><span className="rounded-full bg-[var(--success-soft)] px-2.5 py-1 text-[9px] font-semibold text-[var(--success)]">{inventoryAssetStatusLabel(item.status)}</span></div><h3 className="mt-4 text-[15px] font-semibold text-[var(--ink)]">{item.name}</h3><p className="mt-1 text-[10px] text-[var(--muted)]">{item.assetCode} · {item.categoryName || inventoryAssetTypeLabel(item.assetType)}</p><div className="mt-5 grid grid-cols-2 gap-3 text-[11px]"><Info label="Seri No" value={item.serialNumber || "—"}/><Info label="Konum" value={item.branchName || "Merkez"}/><Info label="Satın Alma" value={item.purchasePrice ? formatInventoryMoney(item.purchasePrice, item.currency) : "—"}/><Info label="Garanti" value={item.warrantyEnd ? dateLabel(item.warrantyEnd) : "—"}/></div><div className="mt-4 flex items-center gap-2 border-t border-[var(--line)] pt-4 text-[10px] text-[var(--muted)]"><Icon name="clock"/> Sonraki Bakım: {item.nextMaintenanceAt ? dateLabel(item.nextMaintenanceAt) : "Planlanmadı"}</div></article>)}{!assets.length ? <div className="col-span-full rounded-[22px] border border-dashed border-[var(--line)] p-12 text-center text-[12px] text-[var(--muted)]">Henüz Envanter Varlığı Yok. “Yeni Envanter” İle İlk Kaydı Oluşturun.</div> : null}</section>;
}

function CategoryPanel({ categories, onAdd }: { categories: InventoryCategory[]; onAdd: () => void }) {
  return <section className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5"><div className="flex items-center justify-between"><div><h2 className="text-[15px] font-semibold text-[var(--ink)]">Kategori Ağacı</h2><p className="mt-1 text-[11px] text-[var(--muted)]">Ürün Ve Varlıkları Standartlaştırın.</p></div><Button onClick={onAdd}><Icon name="plus"/>Yeni Kategori</Button></div><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{categories.map((category) => <div key={category.id} className="rounded-[16px] border border-[var(--line)] p-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent)]"><Icon name="category"/></span><div className="min-w-0"><p className="truncate text-[12px] font-semibold text-[var(--ink)]">{category.name}</p><p className="mt-0.5 text-[9px] text-[var(--muted-soft)]">{category.code || "Kodsuz"}</p></div></div>{category.description ? <p className="mt-3 text-[10px] leading-4 text-[var(--muted)]">{category.description}</p> : null}</div>)}</div></section>;
}

function SupplierPanel({ suppliers, onAdd }: { suppliers: InventorySupplier[]; onAdd: () => void }) {
  return <section className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5"><div className="flex items-center justify-between"><div><h2 className="text-[15px] font-semibold text-[var(--ink)]">Tedarikçiler</h2><p className="mt-1 text-[11px] text-[var(--muted)]">Fiyat, Süre Ve Satın Alma İlişkilerinin Temeli.</p></div><Button onClick={onAdd}><Icon name="plus"/>Yeni Tedarikçi</Button></div><div className="mt-5 divide-y divide-[var(--line)]">{suppliers.map((supplier) => <div key={supplier.id} className="flex items-center gap-4 py-4"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[11px] font-semibold text-[var(--accent)]">{supplier.name.slice(0, 2).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="text-[12px] font-semibold text-[var(--ink)]">{supplier.name}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{supplier.contactName || "Yetkili Belirtilmedi"}{supplier.phone ? ` · ${supplier.phone}` : ""}</p></div><span className="hidden text-[10px] text-[var(--muted)] sm:block">{supplier.email || "E-Posta Yok"}</span></div>)}</div></section>;
}

function QuickCard({ icon, title, text, onClick, href }: { icon: IconName; title: string; text: string; onClick?: () => void; href?: string }) {
  const content = <><span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[var(--accent-soft)] text-[var(--accent)]"><Icon name={icon}/></span><p className="mt-3 text-[12px] font-semibold text-[var(--ink)]">{title}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{text}</p></>;
  const className = "block rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(17,70,104,.06)]";
  return href ? <Link href={href} className={className}>{content}</Link> : <button type="button" onClick={onClick} className={className}>{content}</button>;
}

function Metric({ icon, label, value, tone }: { icon: IconName; label: string; value: ReactNode; tone?: MetricTone }) {
  const className = tone === "orange" ? "bg-[var(--warning-soft)] text-[var(--warning)]" : tone === "green" ? "bg-[var(--success-soft)] text-[var(--success)]" : tone === "blue" ? "bg-[var(--accent-soft)] text-[var(--accent)]" : tone === "amber" ? "bg-[var(--warning-soft)] text-[var(--warning)]" : "bg-[var(--surface-2)] text-[var(--muted)]";
  return <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-4"><div className={`mb-3 flex h-8 w-8 items-center justify-center rounded-[10px] ${className}`}><Icon name={icon}/></div><p className="text-[10px] text-[var(--muted)]">{label}</p><p className="mt-1 text-[20px] font-semibold tracking-[-.03em] text-[var(--ink)]">{value}</p></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[9px] uppercase tracking-[.08em] text-[var(--muted-soft)]">{label}</p><p className="mt-1 truncate text-[11px] font-medium text-[var(--muted)]">{value}</p></div>;
}

function DocTile({ title }: { title: string }) {
  return <div className="rounded-[16px] border border-dashed border-[var(--line)] p-4 text-center text-[10px] text-[var(--muted)]"><span className="mx-auto flex h-8 w-8 items-center justify-center rounded-[9px] bg-[var(--surface-2)] text-[var(--muted)]"><Icon name="box"/></span><p className="mt-2">{title}</p></div>;
}

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString("tr-TR");
}
