"use client";

import { EnterpriseDataPage } from "@/components/enterprise-data-page";

export default function HROrganizationPage() {
  return (
    <EnterpriseDataPage
      eyebrow="İnsan Kaynakları"
      title="Organizasyon Yapısı"
      description="Departmanları, ekipleri ve pozisyonları düzenleyin; çalışanların şirket içindeki yerini daha anlaşılır ve güncel tutun."
      sections={[
        {
          title: "Departmanlar",
          description: "Şirket içindeki ana çalışma alanlarını görüntüleyin.",
          path: "/hr/organization",
          dataKey: "departments",
        },
        {
          title: "Ekipler",
          description: "Departmanlara bağlı çalışma ekiplerini görüntüleyin.",
          path: "/hr/organization",
          dataKey: "teams",
        },
        {
          title: "Pozisyonlar",
          description: "Görev ve sorumluluk yapılarını görüntüleyin.",
          path: "/hr/organization",
          dataKey: "positions",
        },
      ]}
      forms={[
        {
          title: "Yeni Departman Ekle",
          description: "Şirket içinde kullanılacak yeni bir departman oluşturun.",
          path: "/hr/organization/departments",
          fields: [
            { name: "code", label: "Kısa Kod", placeholder: "Örn. SAT", required: true },
            { name: "name", label: "Departman Adı", placeholder: "Örn. Satış", required: true },
            {
              name: "status",
              label: "Durum",
              type: "select",
              defaultValue: "ACTIVE",
              options: [
                { value: "ACTIVE", label: "Aktif" },
                { value: "INACTIVE", label: "Pasif" },
              ],
            },
          ],
        },
        {
          title: "Yeni Ekip Ekle",
          description: "Bir departmana bağlı yeni çalışma ekibi oluşturun.",
          path: "/hr/organization/teams",
          fields: [
            {
              name: "departmentId",
              label: "Departman",
              type: "remote-select",
              optionsPath: "/hr/organization",
              optionLabelKeys: ["name"],
              required: true,
            },
            { name: "code", label: "Kısa Kod", placeholder: "Örn. SAT-01", required: true },
            { name: "name", label: "Ekip Adı", placeholder: "Örn. Kurumsal Satış", required: true },
            {
              name: "status",
              label: "Durum",
              type: "select",
              defaultValue: "ACTIVE",
              options: [
                { value: "ACTIVE", label: "Aktif" },
                { value: "INACTIVE", label: "Pasif" },
              ],
            },
          ],
        },
        {
          title: "Yeni Pozisyon Ekle",
          description: "Çalışan atamalarında kullanılacak yeni bir pozisyon oluşturun.",
          path: "/hr/organization/positions",
          fields: [
            {
              name: "departmentId",
              label: "Departman",
              type: "remote-select",
              optionsPath: "/hr/organization",
              optionLabelKeys: ["name"],
            },
            { name: "code", label: "Kısa Kod", placeholder: "Örn. SAT-MDR", required: true },
            { name: "name", label: "Pozisyon Adı", placeholder: "Örn. Satış Müdürü", required: true },
            {
              name: "status",
              label: "Durum",
              type: "select",
              defaultValue: "ACTIVE",
              options: [
                { value: "ACTIVE", label: "Aktif" },
                { value: "INACTIVE", label: "Pasif" },
              ],
            },
          ],
        },
      ]}
    />
  );
}
