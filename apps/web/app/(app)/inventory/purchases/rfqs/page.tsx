"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { Alert, Button, Field, Select, Spinner, StatusBadge, TextInput } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { userLabel } from "@/lib/user-language";

type Warehouse = { id: string; name: string; type: string; branchId: string | null };
type LinkedProduct = {
  inventoryProductId: string;
  inventoryProductName: string;
  sku: string | null;
  catalogVariantId: string;
  catalogProductName: string;
  catalogVariantName: string;
  canonicalSku: string | null;
  unit: string;
  brandName: string | null;
};
type SupplierOption = {
  supplierConnectionId: string;
  inventorySupplierId: string;
  supplierOrganizationId: string;
  supplierName: string;
  organizationType: string;
};
type RfqOptions = { warehouses: Warehouse[]; products: LinkedProduct[]; suppliers: SupplierOption[] };
type RfqListRow = {
  id: string;
  title: string;
  note: string | null;
  status: string;
  responseDeadline: string | null;
  publishedAt: string | null;
  closedAt: string | null;
  awardedQuoteId: string | null;
  convertedPurchaseOrderId: string | null;
  createdAt: string;
  updatedAt: string;
  warehouseId: string;
  warehouseName: string;
  branchId: string | null;
  itemCount: number;
  supplierCount: number;
  submittedQuoteCount: number;
};
type QuoteCommercialTerms = {
  quoteId: string;
  paymentTermsDays: number | null;
  warrantyMonths: number | null;
  installationIncluded: boolean;
  trainingIncluded: boolean;
  serviceSlaDays: number | null;
  financingAvailable: boolean;
};
type RfqQuote = QuoteCommercialTerms & {
  id: string;
  rfqSupplierId: string;
  supplierOrganizationId: string;
  supplierName: string;
  currency: string;
  status: string;
  note: string | null;
  validUntil: string | null;
  version: number;
  submittedAt: string | null;
  quotedTotal: number | string;
  maxLeadTimeDays: number | null;
};
type RfqDetail = RfqListRow & {
  items: Array<{
    id: string;
    inventoryProductId: string;
    inventoryProductName: string;
    sku: string | null;
    catalogVariantId: string;
    catalogProductName: string;
    catalogVariantName: string;
    canonicalSku: string | null;
    quantity: number | string;
    note: string | null;
  }>;
  suppliers: Array<{
    id: string;
    supplierConnectionId: string;
    supplierOrganizationId: string;
    supplierName: string;
    status: string;
    invitedAt: string;
    respondedAt: string | null;
  }>;
  quotes: RfqQuote[];
};
type DraftItem = { inventoryProductId: string; quantity: string };

const statusLabels: Record<string, string> = {
  DRAFT: "Taslak",
  PUBLISHED: "Yayında",
  CLOSED: "Kapandı",
  AWARDED: "Kazanan Seçildi",
  CANCELLED: "İptal Edildi",
  SUBMITTED: "Gönderildi",
  ACCEPTED: "Kabul Edildi",
  REJECTED: "Reddedildi",
  WITHDRAWN: "Geri Çekildi",
};

const EMPTY_TERMS: Omit<QuoteCommercialTerms, "quoteId"> = {
  paymentTermsDays: null,
  warrantyMonths: null,
  installationIncluded: false,
  trainingIncluded: false,
  serviceSlaDays: null,
  financingAvailable: false,
};

export default function RfqPage() {
  const { showToast } = useToast();
  const canWrite = hasPermission("inventory", "write");
  const [rfqs, setRfqs] = useState<RfqListRow[]>([]);
  const [options, setOptions] = useState<RfqOptions>({ warehouses: [], products: [], suppliers: [] });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RfqDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [deadline, setDeadline] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<DraftItem[]>([{ inventoryProductId: "", quantity: "1" }]);
  const [supplierIds, setSupplierIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    setError("");
    try {
      const [rfqRows, optionRows] = await Promise.all([
        api<RfqListRow[]>("/procurement/rfqs"),
        api<RfqOptions>("/procurement/rfqs/options"),
      ]);
      setRfqs(rfqRows);
      setOptions(optionRows);
      setWarehouseId((current) => current || optionRows.warehouses[0]?.id || "");
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Teklif Talebi Verileri Yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    setError("");
    try {
      const [rfq, terms] = await Promise.all([
        api<Omit<RfqDetail, "quotes"> & { quotes: Array<Omit<RfqQuote, keyof QuoteCommercialTerms>> }>(`/procurement/rfqs/${id}`),
        api<QuoteCommercialTerms[]>(`/procurement/rfqs/${id}/commercial-terms`),
      ]);
      const termsByQuote = new Map(terms.map((row) => [row.quoteId, row]));
      setDetail({
        ...rfq,
        quotes: rfq.quotes.map((quote) => ({
          ...EMPTY_TERMS,
          ...quote,
          ...(termsByQuote.get(quote.id) ?? {}),
          quoteId: quote.id,
        })),
      });
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Teklif Talebi Detayı Yüklenemedi.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!selectedId && rfqs[0]?.id) void loadDetail(rfqs[0].id);
  }, [loadDetail, rfqs, selectedId]);

  const submittedQuotes = useMemo(
    () => detail?.quotes.filter((quote) => quote.status === "SUBMITTED") ?? [],
    [detail],
  );

  function updateDraftItem(index: number, patch: Partial<DraftItem>) {
    setItems((current) => current.map((row, rowIndex) => rowIndex === index ? patch ? { ...row, ...patch } : row : row));
  }

  function toggleSupplier(id: string) {
    setSupplierIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  async function createRfq(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite || busy) return;
    const preparedItems = items
      .filter((item) => item.inventoryProductId)
      .map((item) => {
        const product = options.products.find((row) => row.inventoryProductId === item.inventoryProductId);
        return {
          inventoryProductId: item.inventoryProductId,
          catalogVariantId: product?.catalogVariantId ?? "",
          quantity: Number(item.quantity),
        };
      });
    if (!title.trim() || !warehouseId || !preparedItems.length || !supplierIds.length) {
      setError("Başlık, Depo, En Az Bir Ürün Ve En Az Bir Tedarikçi Seçilmelidir.");
      return;
    }
    if (preparedItems.some((item) => !item.catalogVariantId || !Number.isFinite(item.quantity) || item.quantity <= 0)) {
      setError("Her Ürün Katalogdaki Karşılığıyla Eşleştirilmeli Ve Geçerli Bir Miktar Girilmelidir.");
      return;
    }
    if (new Set(preparedItems.map((item) => item.inventoryProductId)).size !== preparedItems.length) {
      setError("Aynı Ürün Teklif Talebinde Yalnız Bir Kez Kullanılabilir.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const created = await api<RfqDetail>("/procurement/rfqs", {
        method: "POST",
        body: {
          warehouseId,
          title: title.trim(),
          note: note.trim() || undefined,
          responseDeadline: deadline ? new Date(deadline).toISOString() : undefined,
          items: preparedItems,
          supplierConnectionIds: supplierIds,
        },
      });
      showToast("Teklif Talebi Taslağı Oluşturuldu.");
      setTitle("");
      setDeadline("");
      setNote("");
      setItems([{ inventoryProductId: "", quantity: "1" }]);
      setSupplierIds([]);
      await load();
      await loadDetail(created.id);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Teklif Talebi Oluşturulamadı.");
    } finally {
      setBusy(false);
    }
  }

  async function transition(action: "publish" | "close" | "cancel") {
    if (!detail || !canWrite || busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`/procurement/rfqs/${detail.id}/${action}`, { method: "POST" });
      showToast(action === "publish" ? "Teklif Talebi Tedarikçilere Yayınlandı." : action === "close" ? "Teklif Talebi Teklif Alımına Kapatıldı." : "Teklif Talebi İptal Edildi.");
      await load();
      await loadDetail(detail.id);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Teklif Talebi Durumu Değiştirilemedi.");
    } finally {
      setBusy(false);
    }
  }

  async function award(quoteId: string) {
    if (!detail || !canWrite || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ purchaseOrderId: string; purchaseOrderStatus: string; total: number }>(
        `/procurement/rfqs/${detail.id}/quotes/${quoteId}/award`,
        { method: "POST" },
      );
      showToast(`Kazanan Teklif Seçildi. ${userLabel(result.purchaseOrderStatus)} Satın Alma Siparişi Oluşturuldu.`);
      await load();
      await loadDetail(detail.id);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Teklif Seçilemedi.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="py-16"><Spinner label="Teklif Talepleri Hazırlanıyor..." /></div>;

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--muted-soft)]">Satın Alma · Teklif Talebi</p>
          <h1 className="text-[30px] font-semibold tracking-[-.035em] text-[var(--ink)]">Teklif Toplama Ve Karşılaştırma</h1>
          <p className="mt-1 max-w-3xl text-[14px] text-[var(--muted)]">Fiyat, Ödeme Vadesi, Garanti, Kurulum, Eğitim, Hizmet Süresi Ve Finansman Koşullarını Karşılaştırın. Kazanan Teklif Önce Taslak Satın Alma Siparişine Dönüşür.</p>
        </div>
        <Link href="/inventory/supplier-network/catalog" className="inline-flex min-h-10 items-center justify-center rounded-[14px] bg-white/70 px-4 py-2.5 text-[13px] font-medium text-[var(--ink)] shadow-[inset_0_0_0_1px_var(--line)] transition-colors hover:bg-white">Ürünleri Katalogla Eşleştir</Link>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      {!canWrite ? <Alert tone="success">Bu Görünüm Salt Okunur. Bu İşlemi Yapma Yetkiniz Bulunmuyor.</Alert> : null}

      <section className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <form onSubmit={createRfq} className="space-y-4 rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5">
          <div><h2 className="text-[15px] font-semibold text-[var(--ink)]">Yeni Teklif Talebi</h2><p className="mt-1 text-[11px] text-[var(--muted)]">Taslak Oluşturun, Kontrol Ettikten Sonra Yayınlayın.</p></div>
          <Field label="Başlık" required><TextInput value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
          <Field label="Depo" required><Select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} required><option value="">Depo Seçin</option>{options.warehouses.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select></Field>
          <Field label="Teklif Son Zamanı"><TextInput type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></Field>
          <Field label="Not"><TextInput value={note} onChange={(event) => setNote(event.target.value)} /></Field>

          <div className="space-y-2">
            <div className="flex items-center justify-between"><span className="text-[11px] font-semibold text-[var(--ink)]">Kalemler</span><button type="button" className="text-[11px] font-semibold text-[var(--accent)]" onClick={() => setItems((current) => [...current, { inventoryProductId: "", quantity: "1" }])}>+ Kalem Ekle</button></div>
            {items.map((item, index) => (
              <div key={index} className="grid grid-cols-[minmax(0,1fr)_90px_auto] gap-2 rounded-[14px] bg-[var(--surface-2)] p-2.5">
                <Select value={item.inventoryProductId} onChange={(event) => updateDraftItem(index, { inventoryProductId: event.target.value })}><option value="">Ürün Seçin</option>{options.products.map((row) => <option key={row.inventoryProductId} value={row.inventoryProductId}>{row.inventoryProductName} · {row.catalogProductName}/{row.catalogVariantName}</option>)}</Select>
                <TextInput type="number" min="0.001" step="0.001" value={item.quantity} onChange={(event) => updateDraftItem(index, { quantity: event.target.value })} aria-label="Miktar" />
                <button type="button" className="px-2 text-[12px] text-[var(--muted)]" disabled={items.length === 1} onClick={() => setItems((current) => current.filter((_, rowIndex) => rowIndex !== index))}>Sil</button>
              </div>
            ))}
            {!options.products.length ? <p className="text-[10px] leading-4 text-[var(--warning)]">Teklif Talebi Oluşturmak İçin Önce Ürünleri Katalogla Eşleştirin.</p> : null}
          </div>

          <div className="space-y-2">
            <span className="text-[11px] font-semibold text-[var(--ink)]">Davet Edilecek Tedarikçiler</span>
            <div className="max-h-44 space-y-1 overflow-auto rounded-[14px] border border-[var(--line)] p-2">
              {options.suppliers.map((row) => (
                <label key={row.supplierConnectionId} className="flex cursor-pointer items-center gap-3 rounded-[10px] px-2.5 py-2 hover:bg-[var(--surface-2)]">
                  <input type="checkbox" checked={supplierIds.includes(row.supplierConnectionId)} onChange={() => toggleSupplier(row.supplierConnectionId)} />
                  <span className="text-[11px] font-medium text-[var(--ink)]">{row.supplierName}</span>
                </label>
              ))}
              {!options.suppliers.length ? <p className="px-2 py-4 text-[10px] text-[var(--warning)]">Aktif Ve Doğrulanmış Tedarikçi Bağlantısı Bulunamadı.</p> : null}
            </div>
          </div>
          {canWrite ? <Button type="submit" disabled={busy}>Teklif Talebi Taslağı Oluştur</Button> : null}
        </form>

        <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)]">
          <div className="border-b border-[var(--line)] px-5 py-4"><h2 className="text-[15px] font-semibold text-[var(--ink)]">Teklif Talebi Kayıtları</h2><p className="mt-1 text-[11px] text-[var(--muted)]">{rfqs.length} Kayıt</p></div>
          <div className="divide-y divide-[var(--line)]">
            {rfqs.map((row) => (
              <button key={row.id} type="button" onClick={() => void loadDetail(row.id)} className={`grid w-full gap-3 px-5 py-4 text-left transition hover:bg-[var(--surface-2)] md:grid-cols-[1fr_auto_auto] md:items-center ${selectedId === row.id ? "bg-[var(--accent-soft)]/40" : ""}`}>
                <div><div className="flex flex-wrap items-center gap-2"><span className="text-[13px] font-semibold text-[var(--ink)]">{row.title}</span><StatusBadge status={row.status} label={statusLabels[row.status] ?? userLabel(row.status)} /></div><p className="mt-1 text-[10px] text-[var(--muted)]">{row.warehouseName} · {row.itemCount} Kalem · {row.supplierCount} Tedarikçi</p></div>
                <span className="text-[10px] text-[var(--muted)]">{row.submittedQuoteCount} Teklif</span>
                <span className="text-[10px] text-[var(--muted-soft)]">{formatDate(row.createdAt)}</span>
              </button>
            ))}
            {!rfqs.length ? <div className="px-5 py-12 text-center text-[11px] text-[var(--muted)]">Henüz Teklif Talebi Oluşturulmadı.</div> : null}
          </div>
        </section>
      </section>

      {detailLoading ? <Spinner label="Teklif Talebi Detayı Yükleniyor..." /> : detail ? (
        <section className="space-y-5 rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-[18px] font-semibold text-[var(--ink)]">{detail.title}</h2><StatusBadge status={detail.status} label={statusLabels[detail.status] ?? userLabel(detail.status)} /></div><p className="mt-1 text-[11px] text-[var(--muted)]">{detail.warehouseName}{detail.responseDeadline ? ` · Son Teklif ${formatDate(detail.responseDeadline)}` : ""}</p></div>
            {canWrite ? <div className="flex flex-wrap gap-2">{detail.status === "DRAFT" ? <Button onClick={() => void transition("publish")} disabled={busy}>Yayınla</Button> : null}{detail.status === "PUBLISHED" ? <Button variant="secondary" onClick={() => void transition("close")} disabled={busy}>Teklif Alımını Kapat</Button> : null}{["DRAFT", "PUBLISHED", "CLOSED"].includes(detail.status) ? <Button variant="secondary" onClick={() => void transition("cancel")} disabled={busy}>İptal Et</Button> : null}</div> : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{detail.items.map((item) => <div key={item.id} className="rounded-[16px] bg-[var(--surface-2)] p-4"><p className="text-[12px] font-semibold text-[var(--ink)]">{item.inventoryProductName}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{item.catalogProductName} · {item.catalogVariantName}</p><p className="mt-2 text-[11px] text-[var(--ink)]">Talep: {Number(item.quantity).toLocaleString("tr-TR")}</p></div>)}</div>

          <div>
            <div className="mb-3 flex items-end justify-between"><div><h3 className="text-[14px] font-semibold text-[var(--ink)]">Tedarikçi Teklifleri</h3><p className="mt-1 text-[10px] text-[var(--muted)]">Fiyat Ve Ticari Koşullar Birlikte Gösterilir. Yalnız Gönderilmiş Teklifler Seçilebilir.</p></div><span className="text-[10px] text-[var(--muted)]">{submittedQuotes.length} Değerlendirilebilir Teklif</span></div>
            <div className="space-y-3">
              {detail.quotes.map((quote) => (
                <article key={quote.id} className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)] p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div><div className="flex flex-wrap items-center gap-2"><h4 className="text-[13px] font-semibold text-[var(--ink)]">{quote.supplierName}</h4><StatusBadge status={quote.status} label={statusLabels[quote.status] ?? userLabel(quote.status)} /></div><p className="mt-2 text-[18px] font-semibold text-[var(--ink)]">{formatMoney(Number(quote.quotedTotal), quote.currency)}</p><p className="mt-1 text-[10px] text-[var(--muted)]">Teslim Süresi: {quote.maxLeadTimeDays ?? 0} Gün · Geçerlilik: {quote.validUntil ? formatDate(quote.validUntil) : "Süresiz"}</p></div>
                    {canWrite && quote.status === "SUBMITTED" && ["PUBLISHED", "CLOSED"].includes(detail.status) ? <Button onClick={() => void award(quote.id)} disabled={busy}>Kazananı Seç</Button> : null}
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                    <Term label="Ödeme Vadesi" value={quote.paymentTermsDays == null ? "Belirtilmedi" : `${quote.paymentTermsDays} Gün`} />
                    <Term label="Garanti" value={quote.warrantyMonths == null ? "Belirtilmedi" : `${quote.warrantyMonths} Ay`} />
                    <Term label="Kurulum" value={quote.installationIncluded ? "Dahil" : "Dahil Değil"} />
                    <Term label="Eğitim" value={quote.trainingIncluded ? "Dahil" : "Dahil Değil"} />
                    <Term label="Hizmet Süresi" value={quote.serviceSlaDays == null ? "Belirtilmedi" : `${quote.serviceSlaDays} Gün`} />
                    <Term label="Finansman" value={quote.financingAvailable ? "Mevcut" : "Yok"} />
                  </div>
                </article>
              ))}
              {!detail.quotes.length ? <div className="rounded-[16px] border border-dashed border-[var(--line)] px-4 py-10 text-center text-[var(--muted)]">Henüz Tedarikçi Teklifi Yok.</div> : null}
            </div>
          </div>

          {detail.status === "AWARDED" && detail.convertedPurchaseOrderId ? <Alert tone="success">Kazanan Teklif Taslak Satın Alma Siparişine Dönüştürüldü. <Link className="font-semibold underline" href="/inventory/purchases">Siparişler Ekranından Onay Akışına Gönderin.</Link></Alert> : null}
        </section>
      ) : null}
    </div>
  );
}

function Term({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5"><p className="text-[9px] font-semibold uppercase tracking-[.08em] text-[var(--muted-soft)]">{label}</p><p className="mt-1 text-[11px] font-semibold text-[var(--ink)]">{value}</p></div>;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatMoney(value: number, currency: string) {
  try { return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(value); }
  catch { return `${value.toFixed(2)} ${currency}`; }
}
