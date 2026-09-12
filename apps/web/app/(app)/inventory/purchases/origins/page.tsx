"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type PurchaseOrder = {
  id: string;
  status: string;
  totalAmount: number | string;
  orderedAt: string | null;
  receivedAt: string | null;
  supplierName: string | null;
  warehouseName: string;
  branchId: string | null;
  itemCount: number;
  originType: "SUPPLIER_OFFER" | "SUPPLIER_QUOTE" | null;
  originVersion: number | null;
  supplierOrganizationId: string | null;
  supplierOrganizationName: string | null;
};

type PurchaseOrderOriginResponse = {
  purchaseOrderId: string;
  purchaseOrderStatus: string;
  purchaseOrderTotal: number | string;
  warehouseName: string;
  origin: null | {
    id: string;
    sourceType: "SUPPLIER_OFFER" | "SUPPLIER_QUOTE";
    supplierOrganizationId: string;
    supplierOrganizationName: string | null;
    supplierConnectionId: string;
    supplierOfferId: string | null;
    supplierQuoteId: string | null;
    sourceVersion: number;
    currency: string;
    idempotencyKey: string;
    commercialSnapshot: Record<string, unknown>;
    createdByUserId: string | null;
    createdAt: string;
  };
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Taslak",
  PENDING: "Onay bekliyor",
  APPROVED: "Onaylandı",
  ORDERED: "Sipariş verildi",
  RECEIVED: "Teslim alındı",
  CANCELLED: "İptal",
};

const ORIGIN_LABELS: Record<string, string> = {
  SUPPLIER_OFFER: "SupplierOffer",
  SUPPLIER_QUOTE: "RFQ / SupplierQuote",
};

export default function PurchaseOrderOriginsPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PurchaseOrderOriginResponse | null>(null);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await api<PurchaseOrder[]>("/procurement/purchase-orders");
      setOrders(rows);
      setSelectedId((current) => current ?? rows[0]?.id ?? null);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Satın alma kaynak izleri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setError("");
    try {
      const response = await api<PurchaseOrderOriginResponse>(`/procurement/purchase-orders/${id}/origin`);
      setDetail(response);
    } catch (requestError) {
      setDetail(null);
      setError(requestError instanceof ApiError ? requestError.message : "Sipariş kaynak detayı yüklenemedi.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (selectedId) void loadDetail(selectedId); else setDetail(null); }, [loadDetail, selectedId]);

  const visibleOrders = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr-TR");
    return orders.filter((order) => {
      const source = order.originType ?? "LEGACY";
      if (sourceFilter && source !== sourceFilter) return false;
      if (!query) return true;
      return [
        order.supplierName ?? "",
        order.supplierOrganizationName ?? "",
        order.warehouseName,
        order.id,
        STATUS_LABELS[order.status] ?? order.status,
        order.originType ? ORIGIN_LABELS[order.originType] ?? order.originType : "Manuel / legacy",
      ].some((value) => value.toLocaleLowerCase("tr-TR").includes(query));
    });
  }, [orders, search, sourceFilter]);

  const sourcedCount = orders.filter((order) => order.originType).length;
  const offerCount = orders.filter((order) => order.originType === "SUPPLIER_OFFER").length;
  const quoteCount = orders.filter((order) => order.originType === "SUPPLIER_QUOTE").length;

  if (loading) return <div className="mx-auto max-w-[1440px] py-16"><Spinner label="Ticari kaynak izleri hazırlanıyor..." /></div>;

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--muted-soft)]">SATIN ALMA DENETİM İZİ</p>
        <h1 className="mt-2 text-[30px] font-semibold tracking-[-.035em] text-[var(--ink)]">Ticari Kaynak İzleri</h1>
        <p className="mt-1 max-w-3xl text-[14px] text-[var(--muted)]">SupplierOffer ve RFQ kazanan tekliflerinden oluşan satın alma siparişlerinin kaynak sürümünü, platform tedarikçisini ve immutable ticari snapshot&apos;ını inceleyin.</p>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Toplam PO" value={String(orders.length)} />
        <Metric label="Kaynak izli PO" value={String(sourcedCount)} />
        <Metric label="SupplierOffer" value={String(offerCount)} />
        <Metric label="RFQ / Quote" value={String(quoteCount)} />
      </section>

      <div className="flex flex-col gap-3 rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-3 sm:flex-row">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="PO, tedarikçi, depo veya kaynak ara..." className="min-h-10 flex-1 rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[12px] text-[var(--ink)] outline-none focus:border-[var(--accent)]" />
        <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} className="min-h-10 rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[12px] text-[var(--ink)]">
          <option value="">Tüm kaynaklar</option>
          <option value="SUPPLIER_OFFER">SupplierOffer</option>
          <option value="SUPPLIER_QUOTE">RFQ / SupplierQuote</option>
          <option value="LEGACY">Manuel / legacy</option>
        </select>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_520px]">
        <section className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)]">
          <div className="hidden grid-cols-[1.2fr_1fr_.8fr_.8fr_.8fr] border-b border-[var(--line)] bg-[var(--surface-2)]/40 px-5 py-3 text-[9px] font-semibold uppercase tracking-[.08em] text-[var(--muted-soft)] md:grid">
            <span>Tedarikçi</span><span>Depo</span><span>Kaynak</span><span>Tutar</span><span>Durum</span>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {visibleOrders.map((order) => (
              <button key={order.id} type="button" onClick={() => setSelectedId(order.id)} className={`grid w-full gap-3 px-5 py-4 text-left transition md:grid-cols-[1.2fr_1fr_.8fr_.8fr_.8fr] md:items-center ${selectedId === order.id ? "bg-[var(--accent-soft)]/45" : "hover:bg-[var(--surface-2)]/45"}`}>
                <div className="min-w-0"><p className="truncate text-[12px] font-semibold text-[var(--ink)]">{order.supplierOrganizationName || order.supplierName || "Tedarikçi belirtilmedi"}</p><p className="mt-1 font-mono text-[9px] text-[var(--muted-soft)]">{shortId(order.id)}</p></div>
                <span className="text-[11px] text-[var(--muted)]">{order.warehouseName}</span>
                <SourceBadge source={order.originType} version={order.originVersion} />
                <span className="text-[11px] font-semibold text-[var(--ink)]">{formatMoney(order.totalAmount)}</span>
                <span className="text-[10px] text-[var(--muted)]">{STATUS_LABELS[order.status] ?? order.status}</span>
              </button>
            ))}
            {!visibleOrders.length ? <div className="px-6 py-14 text-center text-[12px] text-[var(--muted)]">Filtreye uyan satın alma siparişi bulunamadı.</div> : null}
          </div>
        </section>

        <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--muted-soft)]">SEÇİLİ PO</p><h2 className="mt-2 font-mono text-[13px] font-semibold text-[var(--ink)]">{detail ? detail.purchaseOrderId : "—"}</h2></div>
            {detail ? <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[9px] font-semibold text-[var(--muted)]">{STATUS_LABELS[detail.purchaseOrderStatus] ?? detail.purchaseOrderStatus}</span> : null}
          </div>

          {detailLoading ? <div className="py-12"><Spinner label="Kaynak detayı yükleniyor..." /></div> : detail ? (
            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 rounded-[14px] bg-[var(--surface-2)]/50 p-4">
                <Info label="Depo" value={detail.warehouseName} />
                <Info label="PO tutarı" value={formatMoney(detail.purchaseOrderTotal)} />
              </div>

              {detail.origin ? (
                <>
                  <div className="rounded-[14px] border border-[var(--line)] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2"><SourceBadge source={detail.origin.sourceType} version={detail.origin.sourceVersion} /><span className="text-[9px] text-[var(--muted-soft)]">{formatDate(detail.origin.createdAt)}</span></div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <Info label="Platform tedarikçisi" value={detail.origin.supplierOrganizationName || detail.origin.supplierOrganizationId} />
                      <Info label="Para birimi" value={detail.origin.currency} />
                      <Info label="SupplierOffer" value={detail.origin.supplierOfferId ? shortId(detail.origin.supplierOfferId) : "—"} mono />
                      <Info label="SupplierQuote" value={detail.origin.supplierQuoteId ? shortId(detail.origin.supplierQuoteId) : "—"} mono />
                      <Info label="Connection" value={shortId(detail.origin.supplierConnectionId)} mono />
                      <Info label="Idempotency" value={detail.origin.idempotencyKey} mono />
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--muted-soft)]">IMMUTABLE COMMERCIAL SNAPSHOT</p>
                    <pre className="max-h-[420px] overflow-auto rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)]/55 p-4 text-[10px] leading-5 text-[var(--ink)]">{JSON.stringify(detail.origin.commercialSnapshot, null, 2)}</pre>
                  </div>
                </>
              ) : (
                <Alert tone="success">Bu PO, origin snapshot altyapısından önce oluşturulmuş veya manuel satın alma akışından gelmiş legacy kayıttır.</Alert>
              )}
            </div>
          ) : <p className="py-12 text-center text-[12px] text-[var(--muted)]">Detay görmek için bir satın alma siparişi seçin.</p>}
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5"><p className="text-[9px] font-semibold uppercase tracking-[.1em] text-[var(--muted-soft)]">{label}</p><p className="mt-2 text-[25px] font-semibold tracking-[-.04em] text-[var(--ink)]">{value}</p></div>;
}

function SourceBadge({ source, version }: { source: string | null; version: number | null }) {
  const label = source ? ORIGIN_LABELS[source] ?? source : "Manuel / legacy";
  return <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-[9px] font-semibold ${source ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[var(--surface-2)] text-[var(--muted)]"}`}>{label}{version ? ` · v${version}` : ""}</span>;
}

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><p className="text-[8px] font-semibold uppercase tracking-[.08em] text-[var(--muted-soft)]">{label}</p><p className={`mt-1 break-all text-[10px] text-[var(--ink)] ${mono ? "font-mono" : ""}`}>{value}</p></div>;
}

function formatMoney(value: number | string) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(Number(value || 0));
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function shortId(value: string) {
  return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-5)}` : value;
}
