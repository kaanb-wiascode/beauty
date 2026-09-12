"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Alert, Button, Spinner, TextInput } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { supplierPortalApi } from "@/lib/supplier-portal-api";
import { getSupplierPortalSession } from "@/lib/supplier-portal-auth";

type RfqListRow = {
  id: string;
  title: string;
  note: string | null;
  status: string;
  responseDeadline: string | null;
  publishedAt: string | null;
  closedAt: string | null;
  warehouseName: string;
  rfqSupplierId: string;
  invitationStatus: string;
  quoteId: string | null;
  quoteStatus: string | null;
  currency: string | null;
  validUntil: string | null;
  version: number | null;
  submittedAt: string | null;
  itemCount: number;
};

type RfqItem = {
  rfqItemId: string;
  quantity: number | string;
  note: string | null;
  catalogProductName: string;
  catalogVariantName: string;
  canonicalSku: string | null;
  unit: string;
  unitPrice: number | string | null;
  availableQuantity: number | string | null;
  leadTimeDays: number | string | null;
  quoteItemNote: string | null;
};

type RfqDetail = {
  id: string;
  title: string;
  note: string | null;
  status: string;
  responseDeadline: string | null;
  publishedAt: string | null;
  closedAt: string | null;
  warehouseName: string;
  rfqSupplierId: string;
  invitationStatus: string;
  quoteId: string | null;
  quoteStatus: string | null;
  currency: string | null;
  quoteNote: string | null;
  validUntil: string | null;
  paymentTermsDays: number | null;
  warrantyMonths: number | null;
  installationIncluded: boolean | null;
  trainingIncluded: boolean | null;
  serviceSlaDays: number | null;
  financingAvailable: boolean | null;
  version: number | null;
  submittedAt: string | null;
  items: RfqItem[];
};

type CatalogDefault = {
  rfqItemId: string;
  catalogVariantId: string;
  supplierOfferId: string | null;
  currency: string | null;
  unitPrice: number | string | null;
  availableQuantity: number | string | null;
  leadTimeDays: number | string | null;
  minimumOrderQuantity: number | string | null;
  orderMultiple: number | string | null;
  validFrom: string | null;
  validTo: string | null;
  hasActiveCatalogOffer: boolean;
};

type DraftItem = {
  rfqItemId: string;
  unitPrice: string;
  availableQuantity: string;
  leadTimeDays: string;
  note: string;
};

const REQUEST_STATUS: Record<string, string> = {
  PUBLISHED: "Teklife Açık",
  CLOSED: "Kapandı",
  AWARDED: "Sonuçlandı",
  CANCELLED: "İptal Edildi",
};

const QUOTE_STATUS: Record<string, string> = {
  DRAFT: "Taslak",
  SUBMITTED: "Gönderildi",
  WITHDRAWN: "Geri Çekildi",
  ACCEPTED: "Kabul Edildi",
  REJECTED: "Seçilmedi",
};

const UNIT_LABELS: Record<string, string> = {
  UNIT: "Adet",
  ML: "Mililitre",
  LITER: "Litre",
  GRAM: "Gram",
  KG: "Kilogram",
  METER: "Metre",
  PAIR: "Çift",
  BOX: "Kutu",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export default function SupplierRfqPage() {
  const [rows, setRows] = useState<RfqListRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RfqDetail | null>(null);
  const [catalogDefaults, setCatalogDefaults] = useState<CatalogDefault[]>([]);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [currency, setCurrency] = useState("TRY");
  const [validUntil, setValidUntil] = useState("");
  const [quoteNote, setQuoteNote] = useState("");
  const [paymentTermsDays, setPaymentTermsDays] = useState("");
  const [warrantyMonths, setWarrantyMonths] = useState("");
  const [installationIncluded, setInstallationIncluded] = useState(false);
  const [trainingIncluded, setTrainingIncluded] = useState(false);
  const [serviceSlaDays, setServiceSlaDays] = useState("");
  const [financingAvailable, setFinancingAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const session = getSupplierPortalSession();
  const canManage = session?.membership.role === "OWNER" || session?.membership.role === "ADMIN";

  const loadList = useCallback(async () => {
    setError("");
    try {
      const data = await supplierPortalApi<RfqListRow[]>("/supplier-portal/rfqs");
      setRows(data);
      setSelectedId((current) => current ?? data[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Teklif Talepleri Yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setError("");
    try {
      const [data, defaults] = await Promise.all([
        supplierPortalApi<RfqDetail>(`/supplier-portal/rfqs/${id}`),
        supplierPortalApi<CatalogDefault[]>(`/supplier-portal/rfqs/${id}/catalog-defaults`),
      ]);
      const defaultsByItem = new Map(defaults.map((item) => [item.rfqItemId, item]));
      const firstCatalogCurrency = defaults.find((item) => item.hasActiveCatalogOffer && item.currency)?.currency;

      setDetail(data);
      setCatalogDefaults(defaults);
      setCurrency(data.currency || firstCatalogCurrency || "TRY");
      setQuoteNote(data.quoteNote || "");
      setValidUntil(data.validUntil ? new Date(data.validUntil).toISOString().slice(0, 16) : "");
      setPaymentTermsDays(data.paymentTermsDays == null ? "" : String(data.paymentTermsDays));
      setWarrantyMonths(data.warrantyMonths == null ? "" : String(data.warrantyMonths));
      setInstallationIncluded(Boolean(data.installationIncluded));
      setTrainingIncluded(Boolean(data.trainingIncluded));
      setServiceSlaDays(data.serviceSlaDays == null ? "" : String(data.serviceSlaDays));
      setFinancingAvailable(Boolean(data.financingAvailable));
      setDraftItems(data.items.map((item) => {
        const catalog = defaultsByItem.get(item.rfqItemId);
        return {
          rfqItemId: item.rfqItemId,
          unitPrice: item.unitPrice !== null && item.unitPrice !== undefined
            ? String(item.unitPrice)
            : catalog?.hasActiveCatalogOffer && catalog.unitPrice !== null && catalog.unitPrice !== undefined
              ? String(catalog.unitPrice)
              : "",
          availableQuantity: item.availableQuantity !== null && item.availableQuantity !== undefined
            ? String(item.availableQuantity)
            : catalog?.hasActiveCatalogOffer && catalog.availableQuantity !== null && catalog.availableQuantity !== undefined
              ? String(catalog.availableQuantity)
              : "",
          leadTimeDays: item.leadTimeDays !== null && item.leadTimeDays !== undefined
            ? String(item.leadTimeDays)
            : catalog?.hasActiveCatalogOffer && catalog.leadTimeDays !== null && catalog.leadTimeDays !== undefined
              ? String(catalog.leadTimeDays)
              : "0",
          note: item.quoteItemNote || "",
        };
      }));
    } catch (err) {
      setCatalogDefaults([]);
      setError(err instanceof ApiError ? err.message : "Teklif Talebi Detayı Yüklenemedi.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => { void loadList(); }, [loadList]);
  useEffect(() => { if (selectedId) void loadDetail(selectedId); }, [loadDetail, selectedId]);

  const metrics = useMemo(() => ({
    open: rows.filter((row) => row.status === "PUBLISHED").length,
    draft: rows.filter((row) => row.quoteStatus === "DRAFT").length,
    submitted: rows.filter((row) => row.quoteStatus === "SUBMITTED").length,
    accepted: rows.filter((row) => row.quoteStatus === "ACCEPTED").length,
  }), [rows]);

  const quoteTotal = useMemo(() => {
    if (!detail) return 0;
    return detail.items.reduce((sum, item, index) => {
      const unitPrice = Number(draftItems[index]?.unitPrice || 0);
      return sum + Number(item.quantity) * (Number.isFinite(unitPrice) ? unitPrice : 0);
    }, 0);
  }, [detail, draftItems]);

  const catalogDefaultByItem = useMemo(
    () => new Map(catalogDefaults.map((item) => [item.rfqItemId, item])),
    [catalogDefaults],
  );

  const editable = Boolean(canManage && detail?.status === "PUBLISHED" && (!detail.quoteStatus || detail.quoteStatus === "DRAFT"));

  function patchItem(index: number, patch: Partial<DraftItem>) {
    setDraftItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  function nullableNonNegativeInteger(value: string, label: string) {
    if (!value.trim()) return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${label} Negatif Olmayan Tam Sayı Olmalıdır.`);
    return parsed;
  }

  async function saveDraft() {
    if (!detail || !editable || busy) return;
    const items = draftItems.map((item) => ({
      rfqItemId: item.rfqItemId,
      unitPrice: Number(item.unitPrice),
      availableQuantity: item.availableQuantity === "" ? null : Number(item.availableQuantity),
      leadTimeDays: Number(item.leadTimeDays || 0),
      note: item.note.trim() || undefined,
    }));
    if (items.some((item) => !Number.isFinite(item.unitPrice) || item.unitPrice < 0)) {
      setError("Tüm Teklif Kalemleri İçin Geçerli Bir Birim Fiyat Girilmelidir.");
      return;
    }

    let terms: { paymentTermsDays: number | null; warrantyMonths: number | null; serviceSlaDays: number | null };
    try {
      terms = {
        paymentTermsDays: nullableNonNegativeInteger(paymentTermsDays, "Ödeme Vadesi"),
        warrantyMonths: nullableNonNegativeInteger(warrantyMonths, "Garanti Süresi"),
        serviceSlaDays: nullableNonNegativeInteger(serviceSlaDays, "Hizmet Süresi"),
      };
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : "Ticari Şartlar Geçersiz.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const data = await supplierPortalApi<RfqDetail>(`/supplier-portal/rfqs/${detail.id}/quote`, {
        method: "POST",
        body: {
          currency: currency.trim().toUpperCase(),
          note: quoteNote.trim() || undefined,
          validUntil: validUntil ? new Date(validUntil).toISOString() : null,
          ...terms,
          installationIncluded,
          trainingIncluded,
          financingAvailable,
          expectedVersion: detail.quoteId ? detail.version ?? undefined : undefined,
          items,
        },
      });
      setDetail(data);
      await loadList();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Teklif Taslağı Kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  }

  async function submitQuote() {
    if (!detail?.quoteId || detail.quoteStatus !== "DRAFT" || !detail.version || busy) return;
    setBusy(true);
    setError("");
    try {
      const data = await supplierPortalApi<RfqDetail>(`/supplier-portal/rfqs/${detail.id}/quote/submit`, {
        method: "POST",
        body: { expectedVersion: detail.version },
      });
      setDetail(data);
      await loadList();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Teklif Gönderilemedi.");
    } finally {
      setBusy(false);
    }
  }

  async function withdrawQuote() {
    if (!detail?.quoteId || detail.quoteStatus !== "SUBMITTED" || !detail.version || busy) return;
    setBusy(true);
    setError("");
    try {
      const data = await supplierPortalApi<RfqDetail>(`/supplier-portal/rfqs/${detail.id}/quote/withdraw`, {
        method: "POST",
        body: { expectedVersion: detail.version },
      });
      setDetail(data);
      await loadList();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Teklif Geri Çekilemedi.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="py-20"><Spinner label="Teklif Talepleri Hazırlanıyor..." /></div>;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#1674bd]">Teklif Talepleri Ve Teklifler</p>
        <h1 className="mt-2 text-[30px] font-semibold tracking-[-.035em]">Teklif Çalışma Alanı</h1>
        <p className="mt-1 text-[14px] text-[#667482]">Fiyat, Teslim Süresi Ve Ticari Şartları Birlikte Hazırlayın. Gönderilen Teklifler Değişiklik Geçmişi Korunarak Saklanır.</p>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      {!canManage ? <Alert tone="success">Görüntüleme Yetkisine Sahip Kullanıcılar Teklifleri İnceleyebilir. Teklif Oluşturma, Gönderme Ve Geri Çekme İşlemleri İçin Yönetim Yetkisi Gereklidir.</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Teklife Açık" value={metrics.open} />
        <Metric label="Taslak" value={metrics.draft} />
        <Metric label="Gönderildi" value={metrics.submitted} />
        <Metric label="Kabul Edildi" value={metrics.accepted} />
      </section>

      <section className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-[20px] border border-[#dfe7ed] bg-white">
          <div className="border-b border-[#dfe7ed] px-4 py-3 text-[12px] font-semibold">Teklif Talepleri · {rows.length}</div>
          <div className="max-h-[720px] divide-y divide-[#edf1f4] overflow-y-auto">
            {rows.map((row) => (
              <button key={row.id} type="button" onClick={() => setSelectedId(row.id)} className={`w-full px-4 py-4 text-left transition ${selectedId === row.id ? "bg-[#eef6fc]" : "hover:bg-[#f7fafc]"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-[13px] font-semibold">{row.title}</p><p className="mt-1 text-[11px] text-[#667482]">{row.warehouseName} · {row.itemCount} Kalem</p></div>
                  <span className="rounded-full bg-[#f0f4f7] px-2 py-1 text-[9px] font-semibold text-[#52616d]">{QUOTE_STATUS[row.quoteStatus || ""] || "Teklif Yok"}</span>
                </div>
                <p className="mt-3 text-[10px] text-[#7a8792]">Son Yanıt Tarihi: {formatDate(row.responseDeadline)}</p>
              </button>
            ))}
            {!rows.length ? <div className="px-5 py-12 text-center text-[12px] text-[#7a8792]">Henüz Teklif Talebi Yok.</div> : null}
          </div>
        </aside>

        <div className="min-w-0">
          {detailLoading ? <div className="rounded-[20px] border border-[#dfe7ed] bg-white py-20"><Spinner label="Teklif Talebi Detayı Yükleniyor..." /></div> : null}
          {!detailLoading && detail ? (
            <div className="space-y-5">
              <section className="rounded-[20px] border border-[#dfe7ed] bg-white p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#7a8792]">{REQUEST_STATUS[detail.status] || "Durum Bilinmiyor"}</p><h2 className="mt-1 text-[22px] font-semibold tracking-[-.03em]">{detail.title}</h2><p className="mt-2 text-[12px] text-[#667482]">{detail.warehouseName} · Son Yanıt {formatDate(detail.responseDeadline)}</p></div>
                  <div className="rounded-[14px] bg-[#f6f8fb] px-4 py-3 text-right"><p className="text-[10px] text-[#7a8792]">Teklif Durumu</p><p className="mt-1 text-[13px] font-semibold">{QUOTE_STATUS[detail.quoteStatus || ""] || "Henüz Oluşturulmadı"}</p></div>
                </div>
                {detail.note ? <p className="mt-4 rounded-[14px] bg-[#f7fafc] px-4 py-3 text-[12px] leading-5 text-[#52616d]">{detail.note}</p> : null}
              </section>

              <section className="overflow-hidden rounded-[20px] border border-[#dfe7ed] bg-white">
                <div className="grid grid-cols-[minmax(220px,1.5fr)_90px_130px_130px_110px] gap-3 border-b border-[#dfe7ed] bg-[#f8fafc] px-4 py-3 text-[10px] font-semibold uppercase tracking-[.08em] text-[#7a8792]">
                  <span>Ürün</span><span>Miktar</span><span>Birim Fiyat</span><span>Mevcut Miktar</span><span>Teslim Süresi</span>
                </div>
                <div className="divide-y divide-[#edf1f4]">
                  {detail.items.map((item, index) => {
                    const catalogDefault = catalogDefaultByItem.get(item.rfqItemId);
                    const seededFromCatalog = !detail.quoteId && catalogDefault?.hasActiveCatalogOffer;
                    const unitLabel = UNIT_LABELS[item.unit] ?? item.unit;
                    return (
                      <div key={item.rfqItemId} className="grid grid-cols-[minmax(220px,1.5fr)_90px_130px_130px_110px] items-center gap-3 px-4 py-4 text-[12px]">
                        <div>
                          <p className="font-semibold">{item.catalogProductName} · {item.catalogVariantName}</p>
                          <p className="mt-1 text-[10px] text-[#7a8792]">{item.canonicalSku || "Stok Kodu Yok"} · {unitLabel}</p>
                          {seededFromCatalog ? <p className="mt-1 text-[9px] font-semibold text-[#1674bd]">Aktif Katalog Teklifinden Otomatik Dolduruldu</p> : null}
                        </div>
                        <span>{Number(item.quantity)} {unitLabel}</span>
                        <TextInput disabled={!editable} inputMode="decimal" value={draftItems[index]?.unitPrice ?? ""} onChange={(event) => patchItem(index, { unitPrice: event.target.value })} placeholder="0,00" />
                        <TextInput disabled={!editable} inputMode="decimal" value={draftItems[index]?.availableQuantity ?? ""} onChange={(event) => patchItem(index, { availableQuantity: event.target.value })} placeholder="İsteğe Bağlı" />
                        <div className="flex items-center gap-1"><TextInput disabled={!editable} inputMode="numeric" value={draftItems[index]?.leadTimeDays ?? "0"} onChange={(event) => patchItem(index, { leadTimeDays: event.target.value })} /><span className="text-[10px] text-[#7a8792]">Gün</span></div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="grid gap-5 rounded-[20px] border border-[#dfe7ed] bg-white p-5 xl:grid-cols-[minmax(0,1fr)_300px]">
                <div className="space-y-5">
                  <div>
                    <h3 className="text-[14px] font-semibold">Ticari Şartlar</h3>
                    <p className="mt-1 text-[11px] text-[#7a8792]">Bu Koşullar Teklif Karşılaştırmasında Kullanılır Ve Kazanan Teklif Satın Alma Siparişine Aktarılır.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="text-[11px] font-semibold text-[#52616d]">Para Birimi<TextInput disabled={!editable} value={currency} maxLength={3} onChange={(event) => setCurrency(event.target.value.toUpperCase())} className="mt-1" /></label>
                    <label className="text-[11px] font-semibold text-[#52616d]">Geçerlilik Tarihi<input disabled={!editable} type="datetime-local" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} className="mt-1 h-10 w-full rounded-[10px] border border-[#dfe7ed] bg-white px-3 text-[12px] disabled:bg-[#f5f7f9]" /></label>
                    <label className="text-[11px] font-semibold text-[#52616d]">Ödeme Vadesi (Gün)<TextInput disabled={!editable} inputMode="numeric" value={paymentTermsDays} onChange={(event) => setPaymentTermsDays(event.target.value)} placeholder="İsteğe Bağlı" className="mt-1" /></label>
                    <label className="text-[11px] font-semibold text-[#52616d]">Garanti (Ay)<TextInput disabled={!editable} inputMode="numeric" value={warrantyMonths} onChange={(event) => setWarrantyMonths(event.target.value)} placeholder="İsteğe Bağlı" className="mt-1" /></label>
                    <label className="text-[11px] font-semibold text-[#52616d]">Hizmet Süresi (Gün)<TextInput disabled={!editable} inputMode="numeric" value={serviceSlaDays} onChange={(event) => setServiceSlaDays(event.target.value)} placeholder="İsteğe Bağlı" className="mt-1" /></label>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <CommercialToggle label="Kurulum Dahil" checked={installationIncluded} disabled={!editable} onChange={setInstallationIncluded} />
                    <CommercialToggle label="Eğitim Dahil" checked={trainingIncluded} disabled={!editable} onChange={setTrainingIncluded} />
                    <CommercialToggle label="Finansman Mevcut" checked={financingAvailable} disabled={!editable} onChange={setFinancingAvailable} />
                  </div>
                  <label className="block text-[11px] font-semibold text-[#52616d]">Teklif Notu<textarea disabled={!editable} value={quoteNote} onChange={(event) => setQuoteNote(event.target.value)} rows={4} className="mt-1 w-full resize-none rounded-[12px] border border-[#dfe7ed] bg-white px-3 py-2 text-[12px] outline-none focus:border-[#1674bd] disabled:bg-[#f5f7f9]" /></label>
                </div>
                <div className="rounded-[16px] bg-[#f7fafc] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#7a8792]">Teklif Toplamı</p>
                  <p className="mt-2 text-[26px] font-semibold tracking-[-.04em]">{money(quoteTotal, currency || "TRY")}</p>
                  <p className="mt-2 text-[10px] leading-4 text-[#7a8792]">Toplam, Talep Miktarı İle Birim Fiyatın Çarpılmasıyla Bilgilendirme Amacıyla Hesaplanır.</p>
                  {editable ? <Button type="button" onClick={saveDraft} disabled={busy} className="mt-4 w-full">{busy ? "Kaydediliyor..." : "Taslağı Kaydet"}</Button> : null}
                  {canManage && detail.quoteStatus === "DRAFT" ? <Button type="button" onClick={submitQuote} disabled={busy} className="mt-2 w-full">Teklifi Gönder</Button> : null}
                  {canManage && detail.quoteStatus === "SUBMITTED" && detail.status === "PUBLISHED" ? <button type="button" onClick={withdrawQuote} disabled={busy} className="mt-2 w-full rounded-[12px] border border-[#dfe7ed] bg-white px-3 py-2.5 text-[12px] font-semibold text-[#9b4a3c] hover:bg-[#fff8f6] disabled:opacity-50">Teklifi Geri Çek</button> : null}
                  {detail.quoteStatus === "WITHDRAWN" ? <p className="mt-3 text-[10px] leading-4 text-[#9b4a3c]">Bu Teklif Geri Çekildi Ve Değerlendirmede Aktif Değildir.</p> : null}
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function CommercialToggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 rounded-[12px] border border-[#dfe7ed] bg-[#fafcfd] px-3 py-3 text-[11px] font-semibold text-[#52616d]">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-[18px] border border-[#dfe7ed] bg-white p-4"><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#7a8792]">{label}</p><p className="mt-2 text-[26px] font-semibold tracking-[-.04em]">{value}</p></div>;
}
