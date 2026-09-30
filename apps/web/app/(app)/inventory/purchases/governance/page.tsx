"use client";

import { EnterpriseDataPage } from "@/components/enterprise-data-page";
import { ProcurementGovernanceActions } from "@/components/procurement-governance-actions";

export default function ProcurementGovernancePage() {
  return (
    <div className="space-y-6">
      <ProcurementGovernanceActions />

      <EnterpriseDataPage
        eyebrow="Envanter · Satın Alma Kontrolü"
        title="Satın Alma Kontrol Merkezi"
        description="Siparişler, mal kabul kayıtları, iadeler, değişim talepleri ve tedarikçi alacak notlarını tek kontrol yüzeyinden izleyin."
        sections={[
          { title: "Satın Alma Siparişleri", path: "/procurement/purchase-orders" },
          { title: "Mal Kabul Kayıtları", path: "/procurement/goods-receipts" },
          { title: "Satın Alma İadeleri", path: "/procurement/purchase-returns" },
          { title: "İade Talepleri", path: "/procurement/return-requests" },
          { title: "Değişim Talepleri", path: "/procurement/replacement-requests" },
          { title: "Tedarikçi Alacak Notları", path: "/procurement/supplier-credit-notes" },
        ]}
      />
    </div>
  );
}
