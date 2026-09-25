import { EnterpriseDataPage } from "@/components/enterprise-data-page";

export default function ProcurementGovernancePage() {
  return (
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
            { name: "id", label: "Satın Alma Siparişi ID", required: true },
            { name: "level", label: "Onay Kademesi", type: "number", required: true },
          ],
        },
        {
          title: "Sipariş Onay Kademesini Reddet",
          path: "/procurement/purchase-orders/{id}/approvals/{level}/reject",
          fields: [
            { name: "id", label: "Satın Alma Siparişi ID", required: true },
            { name: "level", label: "Onay Kademesi", type: "number", required: true },
          ],
        },
        {
          title: "Satın Alma Siparişini Teslim Al",
          path: "/procurement/purchase-orders/{id}/receive",
          fields: [
            { name: "id", label: "Satın Alma Siparişi ID", required: true },
            {
              name: "items",
              label: "Teslim Alınan Kalemler",
              type: "json",
              required: true,
              placeholder: '[{"purchaseOrderItemId":"UUID","quantity":1}]',
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
            { name: "id", label: "Mal Kabul ID", required: true },
            { name: "reason", label: "Tersine Çevirme Nedeni", type: "textarea", required: true },
          ],
        },
        {
          title: "Kısmi İade Oluştur",
          path: "/procurement/goods-receipts/{id}/partial-return",
          fields: [
            { name: "id", label: "Mal Kabul ID", required: true },
            { name: "reason", label: "İade Nedeni", type: "textarea", required: true },
            {
              name: "items",
              label: "İade Kalemleri",
              type: "json",
              required: true,
              placeholder: '[{"goodsReceiptItemId":"UUID","quantity":1}]',
            },
          ],
        },
      ]}
    />
  );
}
