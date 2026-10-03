"use client";

import { EnterpriseDataPage } from "@/components/enterprise-data-page";

export default function LeaveManagementPage() {
  return (
    <EnterpriseDataPage
      eyebrow="İnsan Kaynakları"
      title="İzin Yönetimi"
      description="İzin türlerini, hak kazanma kurallarını ve çalışan izin taleplerini tek merkezden yönetin."
      sections={[
        { title: "İzin Türleri", description: "Çalışanların kullanabileceği izin çeşitlerini görüntüleyin.", path: "/hr/leave-management/types", emptyActionFormTitle: "Yeni İzin Türü Ekle" },
        { title: "İzin Kuralları", description: "Yıllık hak, devreden gün ve kullanım kurallarını görüntüleyin.", path: "/hr/leave-management/policies" },
        { title: "İzin Talepleri", description: "Bekleyen, onaylanan ve sonuçlanan izin taleplerini görüntüleyin.", path: "/hr/leave-management/requests" },
      ]}
      forms={[
        {
          title: "Yeni İzin Türü Ekle",
          description: "Çalışanların kullanabileceği yeni izin türünü oluşturun.",
          path: "/hr/leave-management/types",
          fields: [
            { name: "name", label: "İzin Türü Adı", placeholder: "Örn. Evlilik İzni", required: true },
            { name: "code", label: "Kısa Kod", placeholder: "Örn. EVLILIK", required: true },
            { name: "paid", label: "Ücretli İzin", type: "boolean", defaultValue: "true" },
            { name: "requiresDocument", label: "Belge Zorunlu", type: "boolean", defaultValue: "false" },
          ],
        },
        {
          title: "Yeni İzin Kuralı Oluştur",
          description: "Bir izin türü için yıllık hak ve kullanım koşullarını belirleyin.",
          path: "/hr/leave-management/policies",
          fields: [
            { name: "leaveTypeId", label: "İzin Türü", type: "remote-select", optionsPath: "/hr/leave-management/types", optionLabelKeys: ["name"], createFormTitle: "Yeni İzin Türü Ekle", required: true },
            { name: "name", label: "Kural Adı", placeholder: "Örn. Tam zamanlı çalışan yıllık izin", required: true },
            { name: "annualEntitlement", label: "Yıllık İzin Hakkı (Gün)", type: "number", required: true },
            { name: "accrualMethod", label: "Hak Kazanma Şekli", type: "select", defaultValue: "ANNUAL", options: [
              { value: "ANNUAL", label: "Yıllık olarak tanımla" },
              { value: "MONTHLY", label: "Her ay hak kazandır" },
              { value: "NONE", label: "Otomatik hak kazandırma" },
            ]},
            { name: "accrualAmount", label: "Aylık Kazanılacak Gün", type: "number", defaultValue: "0" },
            { name: "carryOverLimit", label: "Sonraki Yıla Devredebilecek Gün", type: "number" },
            { name: "allowNegative", label: "Hak Yetmese de İzin Ver", type: "boolean", defaultValue: "false" },
            { name: "maxNegative", label: "En Fazla Eksi İzin (Gün)", type: "number", defaultValue: "0" },
            { name: "effectiveFrom", label: "Geçerlilik Başlangıcı", type: "date", required: true },
            { name: "effectiveTo", label: "Geçerlilik Bitişi", type: "date" },
          ],
        },
        {
          title: "Çalışan İçin İzin Talebi Oluştur",
          description: "Yetkili kullanıcı olarak bir çalışan adına izin talebi oluşturun.",
          path: "/hr/leave-management/employees/{staffId}/requests",
          fields: [
            { name: "staffId", label: "Çalışan", type: "remote-select", optionsPath: "/hr/employees", optionLabelKeys: ["firstName", "lastName"], required: true },
            { name: "leaveTypeId", label: "İzin Türü", type: "remote-select", optionsPath: "/hr/leave-management/types", optionLabelKeys: ["name"], createFormTitle: "Yeni İzin Türü Ekle", required: true },
            { name: "startDate", label: "Başlangıç Tarihi", type: "date", required: true },
            { name: "endDate", label: "Bitiş Tarihi", type: "date", required: true },
            { name: "days", label: "Kullanılacak Gün", type: "number", required: true },
            { name: "reason", label: "Açıklama", type: "textarea" },
          ],
        },
        {
          title: "İzin Talebini Sonuçlandır",
          description: "Bekleyen bir izin talebini onaylayın veya reddedin.",
          path: "/hr/leave-management/requests/{id}/review",
          fields: [
            { name: "id", label: "İzin Talebi", type: "remote-select", optionsPath: "/hr/leave-management/requests", optionLabelKeys: ["leaveType", "startDate", "endDate"], required: true },
            { name: "status", label: "Karar", type: "select", defaultValue: "APPROVED", options: [
              { value: "APPROVED", label: "Onayla" },
              { value: "REJECTED", label: "Reddet" },
            ], required: true },
            { name: "note", label: "Karar Notu", type: "textarea" },
          ],
        },
      ]}
    />
  );
}
