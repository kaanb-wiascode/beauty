"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Modal } from "@/components/modal";
import { Alert, Button, Field, Spinner, TextInput } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";

type PurchaseReturn = {
  id: string;
  goodsReceiptId: string;
  supplierBillId: string;
  branchId: string | null;
  reason: string;
  totalAmount: number | string;
  createdAt: string;
  supplierCreditNoteId?: string | null;
  creditNoteAmount?: number | string | null;
  itemCount: number;
};

type ReturnItem = {
  id: string;
  productName: string;
  sku?: string | null;
  quantity: number | string;
  unitCost: number | string;
  replacementQuantity: number | string;
  remainingReplacementQuantity: number | string;
};

type ReturnDetail = {
  purchaseReturn: PurchaseReturn & {
    purchaseOrderId: string;
    warehouseName: string;
    supplierName: string | null;
  };
  items: ReturnItem[];
};

type ReplacementRequest = {
  id: string;
  purchaseReturnId: string;
  goodsReceiptId: string;
  supplierBillId: string;
  branchId: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "RECEIVED";
  reason: string;
  rejectionReason?: string | null;
  replacementReceiptId?: string | null;
  receivedAt?: string | null;
  createdAt: string;
  itemCount: number;
  totalAmount: number | string;
};

const STATUS_LABELS: Record<ReplacementRequest["status"], string> = {
  PENDING: "Onay bekliyor",
  APPROVED: "Onaylandı",
  REJECTED: "Reddedildi",
  RECEIVED: "Teslim alındı",
};

export default function PurchaseReplacementsPage() {
  const { showToast } = useToast();
  const canWrite = hasPermission("inventory", "write");
  const [returns, setReturns] = useState<PurchaseReturn[]>([]);
  const [requests, setRequests] = useState<ReplacementRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<ReturnDetail | null>(null);
  const [reason, setReason] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ReplacementRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [returnRows, requestRows] = await Promise.all([
        api<PurchaseReturn[]>("/procurement/purchase-returns"),
        api<ReplacementRequest[]>("/procurement/replacement-requests"),
      ]);
      setReturns(returnRows);
      setRequests(requestRows);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Değişim operasyonları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingCount = useMemo(() => requests.filter((row) => row.status === "PENDING").length, [requests]);
  const approvedCount = useMemo(() => requests.filter((row) => row.status === "APPROVED").length, [requests]);
  const receivedCount = useMemo(() => requests.filter((row) => row.status === "RECEIVED").length, [requests]);

  async function openReturn(row: PurchaseReturn) {
    setError("");
    setReason("");
    setQuantities({});
    try {
      const response = await api<ReturnDetail>(`/procurement/return-operations/purchase-returns/${row.id}`);
      setDetail(response);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "İade detayı yüklenemedi.");
    }
  }

  async function submitReplacement() {
    if (!detail || !canWrite || busyId) return;
    const items = detail.items
      .map((item) => ({ purchaseReturnItemId: item.id, quantity: Number(quantities[item.id] || 0) }))
      .filter((item) => Number.isFinite(item.quantity) && item.quantity > 0);

    if (!reason.trim()) {
      setError("Değişim nedeni zorunludur.");
      return;
    }
    if (!items.length) {
      setError("En az bir kalem için değişim miktarı girilmelidir.");
      return;
    }
    for (const requested of items) {
      const source = detail.items.find((item) => item.id === requested.purchaseReturnItemId);
      if (!source || requested.quantity > Number(source.remainingReplacementQuantity)) {
        setError("Değişim miktarı kalan değiştirilebilir miktarı aşamaz.");
        return;
      }
    }

    setBusyId(detail.purchaseReturn.id);
    setError("");
    try {
      await api(`/procurement/purchase-returns/${detail.purchaseReturn.id}/replacement-requests`, {
        method: "POST",
        body: { reason: reason.trim(), items },
      });
      showToast("Değişim talebi onaya gönderildi.");
      setDetail(null);
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Değişim talebi oluşturulamadı.");
    } finally {
      setBusyId(null);
    }
  }

  async function approve(id: string) {
    if (!canWrite || busyId) return;
    setBusyId(id);
    setError("");
    try {
      await api(`/procurement/replacement-requests/${id}/approve`, { method: "POST" });
      showToast("Değişim talebi onaylandı.");
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Değişim talebi onaylanamadı.");
    } finally {
      setBusyId(null);
    }
  }

  async function receive(id: string) {
    if (!canWrite || busyId) return;
    setBusyId(id);
    setError("");
    try {
      await api(`/procurement/replacement-requests/${id}/receive`, { method: "POST", body: {} });
      showToast("Değişim ürünleri teslim alındı ve stok/muhasebe kayıtlarına işlendi.");
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Değişim teslimatı işlenemedi.");
    } finally {
      setBusyId(null);
    }
  }

  async function reject() {
    if (!rejectTarget || !canWrite || busyId) return;
    if (!rejectReason.trim()) {
      setError("Ret nedeni zorunludur.");
      return;
    }
    setBusyId(rejectTarget.id);
    setError("");
    try {
      await api(`/procurement/replacement-requests/${rejectTarget.id}/reject`, {
        method: "POST",
        body: { reason: rejectReason.trim() },
      });
      showToast("Değişim talebi reddedildi.");
      setRejectTarget(null);
      setRejectReason("");
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Değişim talebi reddedilemedi.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <div className="py-16"><Spinner label="Değişim talepleri hazırlanıyor..." /></div>;

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
      <header>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--muted-soft)]">TEDARİKÇİ DEĞİŞİMİ</p>
        <h1 className="text-[30px] font-semibold tracking-[-.035em] text-[var(--ink)]">Değişim Talepleri</h1>
        <p className="mt-1 text-[14px] text-[var(--muted)]">İade edilen ürünleri tedarikçiden yeniden talep edin; onay ve teslim alma adımlarını audit edilebilir biçimde yönetin.</p>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      {!canWrite ? <Alert tone="success">Bu görünüm salt okunur. Değişim aksiyonları için inventory.write izni gerekir.</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="İade kaydı" value={String(returns.length)} />
        <Metric label="Onay bekleyen" value={String(pendingCount)} />
        <Metric label="Teslime hazır" value={String(approvedCount)} />
        <Metric label="Teslim alınan" value={String(receivedCount)} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_.95fr]">
        <div className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)]">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h2 className="text-[14px] font-semibold text-[var(--ink)]">Satın alma iadeleri</h2>
            <p className="mt-1 text-[11px] text-[var(--muted)]">Değişim talebi, yalnız gerçekleşmiş iade kalemlerinden açılır.</p>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {returns.map((row) => (
              <article key={row.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-mono text-[11px] font-semibold text-[var(--ink)]">{shortId(row.id)}</p>
                  <p className="mt-1 text-[11px] text-[var(--muted)]">{row.reason}</p>
                  <p className="mt-1 text-[10px] text-[var(--muted-soft)]">{formatDateTime(row.createdAt)} · {row.itemCount} kalem · {formatMoney(row.totalAmount)}</p>
                </div>
                <Button variant="secondary" className="min-h-8 px-3 py-1.5 text-[11px]" onClick={() => void openReturn(row)}>Detay / Değişim</Button>
              </article>
            ))}
            {!returns.length ? <Empty text="Henüz satın alma iadesi yok." /> : null}
          </div>
        </div>

        <div className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)]">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h2 className="text-[14px] font-semibold text-[var(--ink)]">Değişim kuyruğu</h2>
            <p className="mt-1 text-[11px] text-[var(--muted)]">Talep → yetkili onayı → tedarikçiden teslim alma.</p>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {requests.map((row) => (
              <article key={row.id} className="space-y-3 px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[11px] font-semibold text-[var(--ink)]">{shortId(row.id)}</p>
                    <p className="mt-1 text-[10px] text-[var(--muted-soft)]">{formatDateTime(row.createdAt)} · {row.itemCount} kalem · {formatMoney(row.totalAmount)}</p>
                  </div>
                  <StatusPill status={row.status} />
                </div>
                <p className="text-[11px] leading-5 text-[var(--muted)]">{row.reason}</p>
                {row.rejectionReason ? <p className="text-[10px] text-[var(--danger)]">Ret: {row.rejectionReason}</p> : null}
                {canWrite && row.status === "PENDING" ? (
                  <div className="flex flex-wrap gap-2">
                    <Button className="min-h-8 px-3 py-1.5 text-[11px]" disabled={Boolean(busyId)} onClick={() => void approve(row.id)}>{busyId === row.id ? "İşleniyor..." : "Onayla"}</Button>
                    <Button variant="secondary" className="min-h-8 px-3 py-1.5 text-[11px]" disabled={Boolean(busyId)} onClick={() => { setRejectTarget(row); setRejectReason(""); }}>Reddet</Button>
                  </div>
                ) : null}
                {canWrite && row.status === "APPROVED" ? (
                  <Button className="min-h-8 px-3 py-1.5 text-[11px]" disabled={Boolean(busyId)} onClick={() => void receive(row.id)}>{busyId === row.id ? "İşleniyor..." : "Teslim al"}</Button>
                ) : null}
              </article>
            ))}
            {!requests.length ? <Empty text="Değişim talebi bulunmuyor." /> : null}
          </div>
        </div>
      </section>

      <Modal open={Boolean(detail)} onClose={() => { if (!busyId) setDetail(null); }} title="İade kalemlerinden değişim oluştur" description={detail ? `${detail.purchaseReturn.supplierName || "Tedarikçi"} · ${detail.purchaseReturn.warehouseName}` : undefined}>
        {detail ? (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Info label="İade toplamı" value={formatMoney(detail.purchaseReturn.totalAmount)} />
              <Info label="İade nedeni" value={detail.purchaseReturn.reason} />
            </div>
            <div className="space-y-2">
              {detail.items.map((item) => (
                <div key={item.id} className="grid gap-3 rounded-[14px] bg-[var(--surface-2)] p-4 sm:grid-cols-[1fr_.5fr] sm:items-end">
                  <div>
                    <p className="text-[12px] font-semibold text-[var(--ink)]">{item.productName}</p>
                    <p className="mt-1 text-[10px] text-[var(--muted)]">İade {formatQuantity(item.quantity)} · Talep edilmiş {formatQuantity(item.replacementQuantity)} · Kalan {formatQuantity(item.remainingReplacementQuantity)}</p>
                  </div>
                  {canWrite ? (
                    <TextInput type="number" min="0" max={String(item.remainingReplacementQuantity)} step="0.001" inputMode="decimal" value={quantities[item.id] ?? ""} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Değişim miktarı" />
                  ) : null}
                </div>
              ))}
            </div>
            {canWrite ? (
              <>
                <Field label="Değişim nedeni" required>
                  <TextInput value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Hasarlı ürün yerine yenisi, yanlış ürün değişimi..." />
                </Field>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" disabled={Boolean(busyId)} onClick={() => setDetail(null)}>Vazgeç</Button>
                  <Button disabled={Boolean(busyId)} onClick={() => void submitReplacement()}>{busyId ? "Gönderiliyor..." : "Değişim talebi oluştur"}</Button>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal open={Boolean(rejectTarget)} onClose={() => { if (!busyId) setRejectTarget(null); }} title="Değişim talebini reddet" description="Ret gerekçesi audit kaydında tutulur.">
        <div className="space-y-4">
          <Field label="Ret nedeni" required>
            <TextInput value={rejectReason} maxLength={500} onChange={(event) => setRejectReason(event.target.value)} placeholder="Ret gerekçesi" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" disabled={Boolean(busyId)} onClick={() => setRejectTarget(null)}>Vazgeç</Button>
            <Button disabled={Boolean(busyId)} onClick={() => void reject()}>{busyId ? "İşleniyor..." : "Reddet"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--muted-soft)]">{label}</p><p className="mt-3 text-[28px] font-semibold tracking-[-.04em] text-[var(--ink)]">{value}</p></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[14px] bg-[var(--surface-2)] p-3"><p className="text-[9px] uppercase tracking-[.08em] text-[var(--muted-soft)]">{label}</p><p className="mt-1 text-[12px] font-semibold text-[var(--ink)]">{value}</p></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="px-5 py-10 text-center text-[11px] text-[var(--muted)]">{text}</div>;
}

function StatusPill({ status }: { status: ReplacementRequest["status"] }) {
  const className = status === "RECEIVED" ? "bg-[var(--success-soft)] text-[var(--success)]" : status === "REJECTED" ? "bg-[var(--danger-soft)] text-[var(--danger)]" : status === "PENDING" ? "bg-[var(--warning-soft)] text-[var(--warning)]" : "bg-[var(--surface-2)] text-[var(--muted)]";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[9px] font-semibold ${className}`}>{STATUS_LABELS[status]}</span>;
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
