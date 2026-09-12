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

const RFQ_STATUS: Record<string, string> = {
  PUBLISHED: "Teklife açık",
  CLOSED: "Kapandı",
  AWARDED: "Sonuçlandı",
  CANCELLED: "İptal",
};

const QUOTE_STATUS: Record<string, string> = {
  DRAFT: "Taslak",
  SUBMITTED: "Gönderildi",
  WITHDRAWN: "Geri çekildi",
  ACCEPTED: "Kabul edildi",
  REJECTED: "Seçilmedi",
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
      setError(err instanceof ApiError ? err.message : "RFQ davetleri yüklenemedi.");
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
      setError(err instanceof ApiError ? err.message : "RFQ detayı yüklenemedi.");
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
      setError("Tüm RFQ satırları için geçerli bir birim fiyat girilmelidir.");
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
          expectedVersion: detail.quoteId ? detail.version ?? undefined : undefined,
          items,
        },
      });
      setDetail(data);
      await loadList();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Teklif taslağı kaydedilemedi.");
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
      setError(err instanceof ApiError ? err.message : "Teklif gönderilemedi.");
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
      setError(err instanceof ApiError ? err.message : "Teklif geri çekilemedi.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="py-20"><Spinner label="RFQ davetleri hazırlanıyor..." /></div>;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#1674bd]">RFQ VE TEKLİFLER</p>
        <h1 className="mt-2 text-[30px] font-semibold tracking-[-.035em]">Teklif Çalışma Alanı</h1>
        <p className="mt-1 text-[14px] text-[#667482]">Davetleri inceleyin, fiyat ve termin bilgilerini hazırlayın, teklifinizi kontrollü şekilde gönderin.</p>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      {!canManage ? <Alert tone="success">MEMBER rolü teklifleri görüntüleyebilir; taslak, gönderim ve geri çekme işlemleri OWNER veya ADMIN gerektirir.</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Teklife açık" value={metrics.open} />
        <Metric label="Taslak" value={metrics.draft} />
        <Metric label="Gönderildi" value={metrics.submitted} />
        <Metric label="Kabul edildi" value={metrics.accepted} />
      </section>

      <section className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-[20px] border border-[#dfe7ed] bg-white">
          <div className="border-b border-[#dfe7ed] px-4 py-3 text-[12px] font-semibold">RFQ davetleri · {rows.length}</div>
          <div className="max-h-[720px] divide-y divide-[#edf1f4] overflow-y-auto">
            {rows.map((row) => (
              <button key={row.id} type="button" onClick={() => setSelectedId(row.id)} className={`w-full px-4 py-4 text-left transition ${selectedId === row.id ? "bg-[#eef6fc]" : "hover:bg-[#f7fafc]"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-[13px] font-semibold">{row.title}</p><p className="mt-1 text-[11px] text-[#667482]">{row.warehouseName} · {row.itemCount} kalem</p></div>
                  <span className="rounded-full bg-[#f0f4f7] px-2 py-1 text-[9px] font-semibold text-[#52616d]">{QUOTE_STATUS[row.quoteStatus || ""] || "Teklif yok"}</span>
                </div>
                <p className="mt-3 text-[10px] text-[#7a8792]">Son yanıt: {formatDate(row.responseDeadline)}</p>
              </button>
            ))}
            {!rows.length ? <div className="px-5 py-12 text-center text-[12px] text-[#7a8792]">Henüz RFQ daveti yok.</div> : null}
          </div>
        </aside>

        <div className="min-w-0">
          {detailLoading ? <div className="rounded-[20px] border border-[#dfe7ed] bg-white py-20"><Spinner label="RFQ detayı yükleniyor..." /></div> : null}
          {!detailLoading && detail ? (
            <div className="space-y-5">
              <section className="rounded-[20px] border border-[#dfe7ed] bg-white p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#7a8792]">{RFQ_STATUS[detail.status] || detail.status}</p><h2 className="mt-1 text-[22px] font-semibold tracking-[-.03em]">{detail.title}</h2><p className="mt-2 text-[12px] text-[#667482]">{detail.warehouseName} · Son yanıt {formatDate(detail.responseDeadline)}</p></div>
                  <div className="rounded-[14px] bg-[#f6f8fb] px-4 py-3 text-right"><p className="text-[10px] text-[#7a8792]">Teklif durumu</p><p className="mt-1 text-[13px] font-semibold">{QUOTE_STATUS[detail.quoteStatus || ""] || "Henüz oluşturulmadı"}</p></div>
                </div>
                {detail.note ? <p className="mt-4 rounded-[14px] bg-[#f7fafc] px-4 py-3 text-[12px] leading-5 text-[#52616d]">{detail.note}</p> : null}
              </section>

              <section className="overflow-hidden rounded-[20px] border border-[#dfe7ed] bg-white">
                <div className="grid grid-cols-[minmax(220px,1.5fr)_90px_130px_130px_110px] gap-3 border-b border-[#dfe7ed] bg-[#f8fafc] px-4 py-3 text-[10px] font-semibold uppercase tracking-[.08em] text-[#7a8792]">
                  <span>Ürün</span><span>Miktar</span><span>Birim fiyat</span><span>Mevcut miktar</span><span>Termin</span>
                </div>
                <div className="divide-y divide-[#edf1f4]">
                  {detail.items.map((item, index) => {
                    const catalogDefault = catalogDefaultByItem.get(item.rfqItemId);
                    const seededFromCatalog = !detail.quoteId && catalogDefault?.hasActiveCatalogOffer;
                    return (
                      <div key={item.rfqItemId} className="grid grid-cols-[minmax(220px,1.5fr)_90px_130px_130px_110px] gap-3 px-4 py-4 text-[12px] items-center">
                        <div>
                          <p className="font-semibold">{item.catalogProductName} · {item.catalogVariantName}</p>
                          <p className="mt-1 text-[10px] text-[#7a8792]">{item.canonicalSku || "Canonical SKU yok"} · {item.unit}</p>
                          {seededFromCatalog ? <p className="mt-1 text-[9px] font-semibold text-[#1674bd]">Aktif katalog teklifinden ön dolduruldu</p> : null}
                        </div>
                        <span>{Number(item.quantity)} {item.unit}</span>
                        <TextInput disabled={!editable} inputMode="decimal" value={draftItems[index]?.unitPrice ?? ""} onChange={(event) => patchItem(index, { unitPrice: event.target.value })} placeholder="0,00" />
                        <TextInput disabled={!editable} inputMode="decimal" value={draftItems[index]?.availableQuantity ?? ""} onChange={(event) => patchItem(index, { availableQuantity: event.target.value })} placeholder="Opsiyonel" />
                        <div className="flex items-center gap-1"><TextInput disabled={!editable} inputMode="numeric" value={draftItems[index]?.leadTimeDays ?? "0"} onChange={(event) => patchItem(index, { leadTimeDays: event.target.value })} /><span className="text-[10px] text-[#7a8792]">gün</span></div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="grid gap-5 rounded-[20px] border border-[#dfe7ed] bg-white p-5 lg:grid-cols-[1fr_260px]">
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-[11px] font-semibold text-[#52616d]">Para birimi<TextInput disabled={!editable} value={currency} maxLength={3} onChange={(event) => setCurrency(event.target.value.toUpperCase())} className="mt-1" /></label>
                    <label className="text-[11px] font-semibold text-[#52616d]">Geçerlilik tarihi<input disabled={!editable} type="datetime-local" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} className="mt-1 h-10 w-full rounded-[10px] border border-[#dfe7ed] bg-white px-3 text-[12px] disabled:bg-[#f5f7f9]" /></label>
                  </div>
                  <label className="block text-[11px] font-semibold text-[#52616d]">Teklif notu<textarea disabled={!editable} value={quoteNote} onChange={(event) => setQuoteNote(event.target.value)} rows={4} className="mt-1 w-full resize-none rounded-[12px] border border-[#dfe7ed] bg-white px-3 py-2 text-[12px] outline-none focus:border-[#1674bd] disabled:bg-[#f5f7f9]" /></label>
                </div>
                <div className="rounded-[16px] bg-[#f7fafc] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#7a8792]">Teklif toplamı</p>
                  <p className="mt-2 text-[26px] font-semibold tracking-[-.04em]">{money(quoteTotal, currency || "TRY")}</p>
                  <p className="mt-2 text-[10px] leading-4 text-[#7a8792]">Toplam, RFQ miktarı × birim fiyat üzerinden bilgilendirme amacıyla hesaplanır.</p>
                  {editable ? <Button type="button" onClick={saveDraft} disabled={busy} className="mt-4 w-full">{busy ? "Kaydediliyor..." : "Taslağı kaydet"}</Button> : null}
                  {canManage && detail.quoteStatus === "DRAFT" ? <Button type="button" onClick={submitQuote} disabled={busy} className="mt-2 w-full">Teklifi gönder</Button> : null}
                  {canManage && detail.quoteStatus === "SUBMITTED" && detail.status === "PUBLISHED" ? <button type="button" onClick={withdrawQuote} disabled={busy} className="mt-2 w-full rounded-[12px] border border-[#dfe7ed] bg-white px-3 py-2.5 text-[12px] font-semibold text-[#9b4a3c] hover:bg-[#fff8f6] disabled:opacity-50">Teklifi geri çek</button> : null}
                  {detail.quoteStatus === "WITHDRAWN" ? <p className="mt-3 text-[10px] leading-4 text-[#9b4a3c]">Bu teklif geri çekildi ve artık buyer değerlendirmesinde aktif değildir.</p> : null}
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-[18px] border border-[#dfe7ed] bg-white p-4"><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#7a8792]">{label}</p><p className="mt-2 text-[26px] font-semibold tracking-[-.04em]">{value}</p></div>;
}
