import { EnterpriseDataPage } from "@/components/enterprise-data-page";

export default function SalaryContractsPage() {
  return (
    <EnterpriseDataPage
      eyebrow="Bordro ve Ücret"
      title="NET Ücret Sözleşmeleri"
      description="Personelin bordro hesabında kullanılacak net ücret sözleşmelerini başlangıç ve bitiş tarihleriyle yönetin. Bordro brüt tutarı bu sözleşmeden değil, yayınlı yasal parametreler kullanılarak sistem tarafından hesaplanır."
      sections={[
        {
          title: "Ücret Sözleşmeleri",
          description: "Organizasyon kapsamınızdaki personelin tarihçeli net ücret sözleşmelerini gösterir.",
          path: "/hr/salary-contracts",
        },
      ]}
      forms={[
        {
          title: "NET Ücret Sözleşmesi Oluştur",
          description: "Personelin bordroda esas alınacak aylık net ücretini ve geçerlilik dönemini tanımlayın. Günlük ve saatlik ücret tipleri otomatik bordro motoruna dahil edilene kadar yeni sözleşmelerde kullanılamaz.",
          path: "/hr/employees/{staffId}/salary-contracts",
          success: "NET ücret sözleşmesi oluşturuldu.",
          fields: [
            {
              name: "staffId",
              label: "Personel",
              type: "remote-select",
              optionsPath: "/hr/employees",
              optionLabelKeys: ["firstName", "lastName"],
              required: true,
            },
            {
              name: "salaryBasis",
              label: "Ücret Türü",
              type: "select",
              required: true,
              defaultValue: "MONTHLY_NET",
              options: [
                { value: "MONTHLY_NET", label: "Aylık Net Ücret" },
              ],
            },
            {
              name: "netAmount",
              label: "Net Ücret",
              type: "number",
              required: true,
              placeholder: "0",
            },
            {
              name: "currency",
              label: "Para Birimi",
              type: "select",
              required: true,
              defaultValue: "TRY",
              options: [{ value: "TRY", label: "Türk Lirası (TRY)" }],
            },
            {
              name: "effectiveFrom",
              label: "Başlangıç Tarihi",
              type: "date",
              required: true,
            },
            {
              name: "effectiveTo",
              label: "Bitiş Tarihi",
              type: "date",
            },
            {
              name: "note",
              label: "Açıklama",
              type: "textarea",
              placeholder: "Sözleşmeyle ilgili gerekli açıklamayı yazın.",
            },
          ],
        },
      ]}
    />
  );
}
