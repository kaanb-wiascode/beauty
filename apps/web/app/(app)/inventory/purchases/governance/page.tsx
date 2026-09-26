"use client";

import { useState } from "react";

import { EnterpriseDataPage } from "@/components/enterprise-data-page";
import { Alert, Button, Field, TextInput } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { userFieldLabel, userLabel } from "@/lib/user-language";

export default function ProcurementGovernancePage() {
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [detail, setDetail] = useState<unknown>(null);
  const [approval, setApproval] = useState<unknown>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState("");

  async function loadPurchaseOrder() {
    const id = purchaseOrderId.trim();
    if (!id) return;
    setLookupBusy(true);
    setLookupError("");
    try {
      const [nextDetail, nextApproval] = await Promise.all([
        api<unknown>(`/procurement/purchase-orders/${encodeURIComponent(id)}`),
        api<unknown>(`/procurement/purchase-orders/${encodeURIComponent(id)}/approvals`),
      ]);
      setDetail(nextDetail);
      setApproval(nextApproval);
    } catch (error) {
      setLookupError(error instanceof ApiError ? error.message : "Satın alma siparişi ayrıntıları yüklenemedi.");
    } finally {
      setLookupBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="mx-auto max-w-[1500px] rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5">
        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          <Field label="Satın Alma Siparişi Kodu">
            <TextInput value={purchaseOrderId} onChange={(event) => setPurchaseOrderId(event.target.value)} placeholder="Sipariş kimliğini girin" />
          </Field>
          <div className="flex items-end">
            <Button onClick={() => void loadPurchaseOrder()} disabled={lookupBusy || !purchaseOrderId.trim()}>
              {lookupBusy ? "Yükleniyor..." : "Sipariş ve Onay Durumunu Aç"}
            </Button>
          </div>
        </div>
        {lookupError ? <div className="mt-4"><Alert onClose={() => setLookupError("")}>{lookupError}</Alert></div> : null}
        {detail || approval ? (
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <LookupCard title="Sipariş Ayrıntısı" value={detail} />
            <LookupCard title="Onay Durumu" value={approval} />
          </div>
        ) : null}
      </section>

      <EnterpriseDataPage
        eyebrow="Envanter · Satın Alma Kontrolü"
        title="Satın Alma Kontrol Merkezi"
        description="Sipariş onay kademeleri, mal kabul düzeltmeleri, kısmi iadeler ve tedarikçi alacak notlarını tek kontrol yüzeyinden yönetin."
        sections={[
          { title: "Satın Alma Siparişleri", path: "/procurement/purchase-orders" },
          { title: "Mal Kabul Kayıtları", path: "/procurement/goods-receipts" },
          { title: "Satın Alma İadeleri", path: "/procurement/purchase-returns" },
          { title: "İade Talepleri", path: "/procurement/return-requests" },
          { title: "Değişim Talepleri", path: "/procurement/replacement-requests" },
          { title: "Tedarikçi Alacak Notları", path: "/procurement/supplier-credit-notes" },
        ]}
        forms={[
          {
            title: "Sipariş Onay Kademesini Onayla",
            path: "/procurement/purchase-orders/{id}/approvals/{level}/approve",
            fields: [
              { name: "id", label: "Satın Alma Siparişi Kodu", required: true },
              { name: "level", label: "Onay Kademesi", type: "number", required: true },
            ],
          },
          {
            title: "Sipariş Onay Kademesini Reddet",
            path: "/procurement/purchase-orders/{id}/approvals/{level}/reject",
            fields: [
              { name: "id", label: "Satın Alma Siparişi Kodu", required: true },
              { name: "level", label: "Onay Kademesi", type: "number", required: true },
            ],
          },
          {
            title: "Satın Alma Siparişini Teslim Al",
            path: "/procurement/purchase-orders/{id}/receive",
            fields: [
              { name: "id", label: "Satın Alma Siparişi Kodu", required: true },
              {
                name: "items",
                label: "Teslim Alınan Kalemler",
                type: "json",
                required: true,
                placeholder: '[{"purchaseOrderItemId":"SIPARIS_KALEMI_KODU","quantity":1}]',
              },
              { name: "invoiceNumber", label: "Fatura Numarası" },
              { name: "dueAt", label: "Vade Tarihi", type: "date" },
              { name: "note", label: "Not", type: "textarea" },
            ],
          },
          {
            title: "Mal Kabulü Tersine Çevir",
            path: "/procurement/goods-receipts/{id}/reverse",
            fields: [
              { name: "id", label: "Mal Kabul Kodu", required: true },
              { name: "reason", label: "Tersine Çevirme Nedeni", type: "textarea", required: true },
            ],
          },
          {
            title: "Kısmi İade Oluştur",
            path: "/procurement/goods-receipts/{id}/partial-return",
            fields: [
              { name: "id", label: "Mal Kabul Kodu", required: true },
              { name: "reason", label: "İade Nedeni", type: "textarea", required: true },
              {
                name: "items",
                label: "İade Kalemleri",
                type: "json",
                required: true,
                placeholder: '[{"goodsReceiptItemId":"MAL_KABUL_KALEMI_KODU","quantity":1}]',
              },
            ],
          },
        ]}
      />
    </div>
  );
}

function LookupCard({ title, value }: { title: string; value: unknown }) {
  const rows = value && typeof value === "object" && !Array.isArray(value)
    ? Object.entries(value as Record<string, unknown>).filter(([, item]) => item === null || item === undefined || typeof item !== "object")
    : [];

  return (
    <div className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)]/35 p-4">
      <h2 className="text-[13px] font-semibold text-[var(--ink)]">{title}</h2>
      {rows.length ? (
        <dl className="mt-3 divide-y divide-[var(--line)]">
          {rows.map(([key, item]) => (
            <div key={key} className="grid grid-cols-[minmax(140px,0.8fr)_1.2fr] gap-4 py-2.5 text-[11px]">
              <dt className="font-medium text-[var(--muted-soft)]">{userFieldLabel(key)}</dt>
              <dd className="break-words text-[var(--ink)]">
                {item === null || item === undefined || item === "" ? "—" : typeof item === "boolean" ? (item ? "Evet" : "Hayır") : typeof item === "string" ? userLabel(item) : String(item)}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 text-[11px] leading-5 text-[var(--muted)]">Bu kayıt için özet bilgi bulunmuyor.</p>
      )}
    </div>
  );
}
