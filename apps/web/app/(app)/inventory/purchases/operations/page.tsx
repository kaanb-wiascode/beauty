"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Modal } from "@/components/modal";
import { Alert, Button, Field, Spinner, TextInput } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";

type GoodsReceipt = {
  id: string;
  purchaseOrderId: string;
  supplierBillId: string | null;
  branchId: string | null;
  receivedAt: string;
  reversedAt: string | null;
  reversalReason: string | null;
  note: string | null;
  total: number | string;
  itemCount: number;
};

type ReceiptItem = {
  id: string;
  productName: string;
  sku?: string | null;
  quantity: number | string;
  unitCost: number | string;
  returnedQuantity: number | string;
  returnableQuantity: number | string;
  lineTotal: number | string;
};

type ReceiptDetail = {
  receipt: GoodsReceipt & {
    supplierName: string | null;
    warehouseName: string;
    invoiceNumber: string | null;
    supplierBillAmount: number | string | null;
    supplierBillStatus: string | null;
    paidAmount: number | string;
  };
  items: ReceiptItem[];
};

type ReturnRequest = {
  id: string;
  goodsReceiptId: string;
  reason: string;
  items: Array<{ goodsReceiptItemId: string; quantity: number }>;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXECUTED";
  rejectionReason?: string | null;
  executedPurchaseReturnId?: string | null;
  createdAt: string;
};

const RETURN_STATUS_LABELS: Record<ReturnRequest["status"], string> = {
  PENDING: "Onay bekliyor",
  APPROVED: "Onaylandı",
  REJECTED: "Reddedildi",
  EXECUTED: "İade işlendi",
};

export default function PurchaseOperationsPage() {
  const { showToast } = useToast();
  const canWrite = hasPermission("inventory", "write");
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);
  const [requests, setRequests] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<ReceiptDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ReturnRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [receiptRows, requestRows] = await Promise.all([
        api<GoodsReceipt[]>("/procurement/goods-receipts"),
        api<ReturnRequest[]>("/procurement/return-requests"),
      ]);
      setReceipts(receiptRows);
      setRequests(requestRows);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Mal kabul operasyonları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingCount = useMemo(() => requests.filter((row) => row.status === "PENDING").length, [requests]);
  const approvedCount = useMemo(() => requests.filter((row) => row.status === "APPROVED").length, [requests]);
  const receiptValue = useMemo(() => receipts.reduce((sum, row) => sum + Number(row.total || 0), 0), [receipts]);

  async function openReceipt(receipt: GoodsReceipt) {
    setDetailLoading(true);
    setError("");
    setReturnReason("");
    setQuantities({});
    try {
      const response = await api<ReceiptDetail>(`/procurement/receipt-operations/goods-receipts/${receipt.id}`);
      setDetail(response);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Mal kabul detayı yüklenemedi.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function submitReturnRequest() {
    if (!detail || !canWrite || busyId) return;
    const items = detail.items
      .map((item) => ({ goodsReceiptItemId: item.id, quantity: Number(quantities[item.id] || 0) }))
      .filter((item) => Number.isFinite(item.quantity) && item.quantity > 0);

    if (!returnReason.trim()) {
      setError("İade nedeni zorunludur.");
      return;
    }
    if (!items.length) {
      setError("En az bir kalem için iade miktarı girilmelidir.");
      return;
    }
    for (const requested of items) {
      const source = detail.items.find((item) => item.id === requested.goodsReceiptItemId);
      if (!source || requested.quantity > Number(source.returnableQuantity)) {
        setError("İade miktarı iade edilebilir miktarı aşamaz.");
        return;
      }
    }

    setBusyId(detail.receipt.id);
    setError("");
    try {
      await api(`/procurement/goods-receipts/${detail.receipt.id}/return-requests`, {
        method: "POST",
        body: { reason: returnReason.trim(), items },
      });
      showToast("İade talebi onaya gönderildi.");
      setDetail(null);
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "İade talebi oluşturulamadı.");
    } finally {
      setBusyId(null);
    }
  }

  async function approveRequest(id: string) {
    if (!canWrite || busyId) return;
    setBusyId(id);
    setError("");
    try {
      await api(`/procurement/return-requests/${id}/approve`, { method: "POST" });
      showToast("İade talebi onaylandı.");
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "İade talebi onaylanamadı.");
    } finally {
      setBusyId(null);
    }
  }

  async function executeRequest(id: string) {
    if (!canWrite || busyId) return;
    setBusyId(id);
    setError("");
    try {
      await api(`/procurement/return-requests/${id}/execute`, { method: "POST" });
      showToast("İade stok ve muhasebe kayıtlarına işlendi.");
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "İade işlemi tamamlanamadı.");
    } finally {
      setBusyId(null);
    }
  }

  async function rejectRequest() {
    if (!rejectTarget || !canWrite || busyId) return;
    if (!rejectReason.trim()) {
      setError("Ret nedeni zorunludur.");
      return;
    }
    setBusyId(rejectTarget.id);
    setError("");
    try {
      await api(`/procurement/return-requests/${rejectTarget.id}/reject`, {
        method: "POST",
        body: { reason: rejectReason.trim() },
      });
      showToast("İade talebi reddedildi.");
      setRejectTarget(null);
      setRejectReason("");
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "İade talebi reddedilemedi.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <div className="py-16"><Spinner label="Mal kabul operasyonları hazırlanıyor..." /></div>;
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
      <header>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--muted-soft)]">SATIN ALMA OPERASYONU</p>
        <h1 className="text-[30px] font-semibold tracking-[-.035em] text-[var(--ink)]">Mal Kabul ve İadeler</h1>
        <p className="mt-1 text-[14px] text-[var(--muted)]">Teslim alınan ürünleri, iade taleplerini ve onay sonrası muhasebe etkisini aynı akışta yönetin.</p>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      {!canWrite ? <Alert tone="success">Bu görünüm salt okunur. Operasyon aksiyonları için inventory.write izni gerekir.</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Mal kabul" value={String(receipts.length)} />
        <Metric label="Mal kabul değeri" value={formatMoney(receiptValue)} compact />
        <Metric label="Onay bekleyen iade" value={String(pendingCount)} />
        <Metric label="İşleme hazır iade" value={String(approvedCount)} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
        <div className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)]">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h2 className="text-[14px] font-semibold text-[var(--ink)]">Mal kabul geçmişi</h2>
            <p className="mt-1 text-[11px] text-[var(--muted)]">Kısmi veya tam teslim kayıtları; aktif şube kapsamıyla sınırlıdır.</p>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {receipts.map((receipt) => (
              <article key={receipt.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] font-semibold text-[var(--ink)]">{shortId(receipt.id)}</span>
                    <StatusPill label={receipt.reversedAt ? "Ters kayıt" : "Aktif"} tone={receipt.reversedAt ? "danger" : "success"} />
                  </div>
                  <p className="mt-2 text-[11px] text-[var(--muted)]">{formatDateTime(receipt.receivedAt)} · {receipt.itemCount} kalem · {formatMoney(receipt.total)}</p>
                  <p className="mt-1 font-mono text-[9px] text-[var(--muted-soft)]">PO {shortId(receipt.purchaseOrderId)}</p>
                </div>
                <Button variant="secondary" className="min-h-8 px-3 py-1.5 text-[11px]" onClick={() => void openReceipt(receipt)} disabled={detailLoading}>
                  Detay / İade
                </Button>
              </article>
            ))}
            {!receipts.length ? <Empty text="Henüz mal kabul kaydı yok." /> : null}
          </div>
        </div>

        <div className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)]">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h2 className="text-[14px] font-semibold text-[var(--ink)]">İade onay kuyruğu</h2>
            <p className="mt-1 text-[11px] text-[var(--muted)]">Talep → yönetici onayı → muhasebeli stok iadesi.</p>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {requests.map((request) => (
              <article key={request.id} className="space-y-3 px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[11px] font-semibold text-[var(--ink)]">{shortId(request.id)}</p>
                    <p className="mt-1 text-[10px] text-[var(--muted-soft)]">{formatDateTime(request.createdAt)}</p>
                  </div>
                  <StatusPill label={RETURN_STATUS_LABELS[request.status]} tone={request.status === "REJECTED" ? "danger" : request.status === "EXECUTED" ? "success" : request.status === "PENDING" ? "warning" : "neutral"} />
                </div>
                <p className="text-[11px] leading-5 text-[var(--muted)]">{request.reason}</p>
                <p className="text-[10px] text-[var(--muted-soft)]">{request.items.length} kalem · Mal kabul {shortId(request.goodsReceiptId)}</p>
                {request.rejectionReason ? <p className="text-[10px] text-[var(--danger)]">Ret: {request.rejectionReason}</p> : null}
                {canWrite && request.status === "PENDING" ? (
                  <div className="flex flex-wrap gap-2">
                    <Button className="min-h-8 px-3 py-1.5 text-[11px]" disabled={Boolean(busyId)} onClick={() => void approveRequest(request.id)}>{busyId === request.id ? "İşleniyor..." : "Onayla"}</Button>
                    <Button variant="secondary" className="min-h-8 px-3 py-1.5 text-[11px]" disabled={Boolean(busyId)} onClick={() => { setRejectTarget(request); setRejectReason(""); }}>Reddet</Button>
                  </div>
                ) : null}
                {canWrite && request.status === "APPROVED" ? (
                  <Button className="min-h-8 px-3 py-1.5 text-[11px]" disabled={Boolean(busyId)} onClick={() => void executeRequest(request.id)}>{busyId === request.id ? "İşleniyor..." : "İadeyi işle"}</Button>
                ) : null}
              </article>
            ))}
            {!requests.length ? <Empty text="İade talebi bulunmuyor." /> : null}
          </div>
        </div>
      </section>

      <Modal
        open={Boolean(detail)}
        onClose={() => { if (!busyId) setDetail(null); }}
        title="Mal kabul detayı"
        description={detail ? `${detail.receipt.supplierName || "Tedarikçi"} · ${detail.receipt.warehouseName}` : undefined}
      >
        {detail ? (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <Info label="Toplam" value={formatMoney(detail.items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0))} />
              <Info label="Fatura" value={detail.receipt.invoiceNumber || "—"} />
              <Info label="Ödenen" value={formatMoney(detail.receipt.paidAmount || 0)} />
            </div>

            {detail.receipt.reversedAt ? <Alert>Bu mal kabul ters kayda alınmış; yeni iade talebi oluşturulamaz.</Alert> : null}
            {Number(detail.receipt.paidAmount || 0) > 0 ? <Alert>Bu mal kabule bağlı tedarikçi faturasında ödeme var. Backend, ödeme terslenmeden kısmi iadeyi reddeder.</Alert> : null}

            <div className="space-y-2">
              {detail.items.map((item) => (
                <div key={item.id} className="grid gap-3 rounded-[14px] bg-[var(--surface-2)] p-4 sm:grid-cols-[1fr_.5fr_.5fr] sm:items-end">
                  <div>
                    <p className="text-[12px] font-semibold text-[var(--ink)]">{item.productName}</p>
                    <p className="mt-1 text-[10px] text-[var(--muted)]">Alınan {formatQuantity(item.quantity)} · İade edilen {formatQuantity(item.returnedQuantity)} · İade edilebilir {formatQuantity(item.returnableQuantity)}</p>
                  </div>
                  <div className="text-[11px] text-[var(--muted)]">{formatMoney(item.unitCost)} / birim</div>
                  {canWrite && !detail.receipt.reversedAt ? (
                    <TextInput
                      type="number"
                      min="0"
                      max={String(item.returnableQuantity)}
                      step="0.001"
                      inputMode="decimal"
                      value={quantities[item.id] ?? ""}
                      onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: event.target.value }))}
                      placeholder="İade miktarı"
                    />
                  ) : null}
                </div>
              ))}
            </div>

            {canWrite && !detail.receipt.reversedAt ? (
              <>
                <Field label="İade nedeni" required>
                  <TextInput value={returnReason} maxLength={500} onChange={(event) => setReturnReason(event.target.value)} placeholder="Hasar, yanlış ürün, kalite problemi..." />
                </Field>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setDetail(null)} disabled={Boolean(busyId)}>Vazgeç</Button>
                  <Button onClick={() => void submitReturnRequest()} disabled={Boolean(busyId)}>{busyId ? "Gönderiliyor..." : "İade talebi oluştur"}</Button>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal open={Boolean(rejectTarget)} onClose={() => { if (!busyId) setRejectTarget(null); }} title="İade talebini reddet" description="Ret nedeni audit kaydında saklanır.">
        <div className="space-y-4">
          <Field label="Ret nedeni" required>
            <TextInput value={rejectReason} maxLength={500} onChange={(event) => setRejectReason(event.target.value)} placeholder="Ret gerekçesi" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" disabled={Boolean(busyId)} onClick={() => setRejectTarget(null)}>Vazgeç</Button>
            <Button disabled={Boolean(busyId)} onClick={() => void rejectRequest()}>{busyId ? "İşleniyor..." : "Reddet"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Metric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--muted-soft)]">{label}</p>
      <p className={`mt-3 font-semibold tracking-[-.04em] text-[var(--ink)] ${compact ? "text-[17px]" : "text-[28px]"}`}>{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[14px] bg-[var(--surface-2)] p-3"><p className="text-[9px] uppercase tracking-[.08em] text-[var(--muted-soft)]">{label}</p><p className="mt-1 text-[12px] font-semibold text-[var(--ink)]">{value}</p></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="px-5 py-10 text-center text-[11px] text-[var(--muted)]">{text}</div>;
}

function StatusPill({ label, tone }: { label: string; tone: "success" | "danger" | "warning" | "neutral" }) {
  const className = tone === "success" ? "bg-[var(--success-soft)] text-[var(--success)]" : tone === "danger" ? "bg-[var(--danger-soft)] text-[var(--danger)]" : tone === "warning" ? "bg-[var(--warning-soft)] text-[var(--warning)]" : "bg-[var(--surface-2)] text-[var(--muted)]";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[9px] font-semibold ${className}`}>{label}</span>;
}

function formatMoney(value: number | string) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(Number(value || 0));
}

function formatQuantity(value: number | string) {
  return Number(value || 0).toLocaleString("tr-TR", { maximumFractionDigits: 3 });
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function shortId(value: string) {
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}
