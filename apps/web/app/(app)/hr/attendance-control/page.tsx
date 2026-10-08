"use client";

import { EnterpriseDataPage } from "@/components/enterprise-data-page";

function day(value: Date) {
  return value.toISOString().slice(0, 10);
}

export default function AttendanceControlPage() {
  const today = new Date();
  const fromDate = new Date(today);
  fromDate.setDate(fromDate.getDate() - 30);
  const from = day(fromDate);
  const to = day(today);

  return (
    <EnterpriseDataPage
      eyebrow="İnsan Kaynakları"
      title="Puantaj Kontrolü"
      description="Vardiya ile gerçekleşen çalışma kayıtlarını karşılaştırın; geç kalma, erken çıkış, eksik giriş-çıkış ve devamsızlık gibi durumları tek ekrandan inceleyin."
      sections={[
        {
          title: "Kontrol Gerektiren Kayıtlar",
          description: "Son 30 günde vardiya planıyla uyuşmayan çalışma kayıtlarını gösterir.",
          path: `/hr/attendance/exceptions?from=${from}&to=${to}`,
        },
      ]}
      forms={[
        {
          title: "Puantajı Vardiya Planıyla Karşılaştır",
          description: "Seçtiğiniz tarih aralığında vardiya planı ile giriş-çıkış kayıtlarını karşılaştırın ve kontrol gerektiren durumları belirleyin.",
          path: "/hr/attendance/reconcile",
          fields: [
            { name: "from", label: "Başlangıç Tarihi", type: "date", defaultValue: from, required: true },
            { name: "to", label: "Bitiş Tarihi", type: "date", defaultValue: to, required: true },
          ],
        },
        {
          title: "Puantaj Kaydını Düzelt",
          description: "Hatalı veya eksik bir giriş-çıkış kaydını gerekçesiyle birlikte düzeltin.",
          path: "/hr/attendance/{id}/corrections",
          fields: [
            {
              name: "id",
              label: "Kontrol Gerektiren Kayıt",
              type: "remote-select",
              optionsPath: `/hr/attendance/exceptions?from=${from}&to=${to}`,
              optionLabelKeys: ["firstName", "lastName", "date"],
              required: true,
            },
            { name: "checkIn", label: "Giriş Saati", type: "datetime-local" },
            { name: "checkOut", label: "Çıkış Saati", type: "datetime-local" },
            {
              name: "status",
              label: "Çalışma Durumu",
              type: "select",
              options: [
                { value: "PRESENT", label: "Çalıştı" },
                { value: "ABSENT", label: "Gelmedi" },
              ],
            },
            { name: "reason", label: "Düzeltme Nedeni", type: "textarea", required: true },
            { name: "note", label: "Açıklama", type: "textarea" },
          ],
        },
      ]}
    />
  );
}
