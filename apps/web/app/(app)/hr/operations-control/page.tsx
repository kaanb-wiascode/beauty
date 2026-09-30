import { EnterpriseDataPage } from "@/components/enterprise-data-page";

export default function HROperationsControlPage() {
  return (
    <EnterpriseDataPage
      eyebrow="İnsan Kaynakları · Operasyon"
      title="İK İşlem Takibi"
      description="Zimmetleri, çalışan politikalarını ve yapılması gereken insan kaynakları işlemlerini tek merkezden takip edin."
      sections={[
        {
          title: "Zimmet ve Varlıklar",
          description: "Çalışanlara atanmış veya kullanıma hazır zimmet kayıtlarını görüntüleyin.",
          path: "/hr/operations/assets",
        },
        {
          title: "Yapılacak İşler",
          description: "Takip edilmesi gereken insan kaynakları işlerini öncelik ve termin bilgileriyle görüntüleyin.",
          path: "/hr/operations/inbox",
        },
      ]}
      forms={[
        {
          title: "Zimmet Ata",
          description: "Envanterde kayıtlı ve kullanılabilir bir varlığı çalışana atayın. Şube, seri numarası ve varlık bilgileri envanter kaydından otomatik alınır.",
          path: "/hr/operations/assets/{assetId}/assign",
          fields: [
            {
              name: "assetId",
              label: "Envanter Varlığı",
              type: "remote-select",
              optionsPath: "/hr/operations/assignable-assets",
              optionLabelKeys: ["name", "brand", "model", "serialNumber", "branchName"],
              required: true,
            },
            {
              name: "staffId",
              label: "Çalışan",
              type: "remote-select",
              optionsPath: "/hr/employees",
              optionLabelKeys: ["firstName", "lastName"],
              required: true,
            },
            {
              name: "condition",
              label: "Teslim Durumu",
              type: "select",
              defaultValue: "GOOD",
              options: [
                { value: "NEW", label: "Yeni" },
                { value: "GOOD", label: "İyi" },
                { value: "USED", label: "Kullanılmış" },
                { value: "DAMAGED", label: "Hasarlı" },
              ],
            },
          ],
        },
        {
          title: "Zimmeti İade Al",
          description: "Çalışandaki aktif zimmeti iade alın. İade tamamlandığında varlık Envanter tarafında tekrar kullanılabilir hale gelir.",
          path: "/hr/operations/asset-assignments/{assignmentId}/return",
          fields: [
            {
              name: "assignmentId",
              label: "Aktif Zimmet",
              type: "remote-select",
              optionsPath: "/hr/operations/assets",
              optionValueKey: "assignmentId",
              optionLabelKeys: ["name", "firstName", "lastName", "serialNumber"],
              required: true,
            },
            {
              name: "condition",
              label: "İade Durumu",
              type: "select",
              defaultValue: "GOOD",
              options: [
                { value: "GOOD", label: "İyi" },
                { value: "USED", label: "Kullanılmış" },
                { value: "DAMAGED", label: "Hasarlı" },
                { value: "NEEDS_SERVICE", label: "Servis Gerekiyor" },
              ],
            },
          ],
        },
        {
          title: "Çalışan Politikası Yayınla",
          description: "Yeni çalışan politikasını yayınlayın. Sürüm numarası aynı başlıktaki önceki kayıtlara göre otomatik oluşturulur.",
          path: "/hr/operations/policies",
          fields: [
            { name: "title", label: "Politika Başlığı", required: true },
            {
              name: "category",
              label: "Kategori",
              type: "select",
              options: [
                { value: "WORKING_RULES", label: "Çalışma Kuralları" },
                { value: "LEAVE", label: "İzin ve Devam" },
                { value: "PRIVACY", label: "Gizlilik ve KVKK" },
                { value: "SECURITY", label: "Bilgi Güvenliği" },
                { value: "HEALTH_SAFETY", label: "İş Sağlığı ve Güvenliği" },
                { value: "COMPENSATION", label: "Ücret ve Yan Haklar" },
                { value: "OTHER", label: "Diğer" },
              ],
            },
            { name: "contentRef", label: "Belge Bağlantısı", placeholder: "Kurumsal belge bağlantısı" },
            { name: "mandatory", label: "Çalışan Onayı Zorunlu", type: "boolean", defaultValue: "true" },
          ],
        },
        {
          title: "Yapılacak İş Ekle",
          description: "İnsan kaynakları ekibinin takip edeceği işi kontrollü işlem türleriyle oluşturun.",
          path: "/hr/operations/inbox",
          fields: [
            {
              name: "itemType",
              label: "İşlem Türü",
              type: "select",
              required: true,
              options: [
                { value: "DOCUMENT", label: "Belge Tamamlama" },
                { value: "TRAINING", label: "Eğitim" },
                { value: "APPROVAL", label: "Onay" },
                { value: "ASSET", label: "Zimmet" },
                { value: "LEAVE", label: "İzin" },
                { value: "REVIEW", label: "Değerlendirme" },
                { value: "OTHER", label: "Diğer" },
              ],
            },
            {
              name: "entityType",
              label: "İlgili Kayıt Türü",
              type: "select",
              required: true,
              options: [
                { value: "STAFF", label: "Çalışan" },
                { value: "ASSET", label: "Zimmet" },
                { value: "POLICY", label: "Politika" },
                { value: "BRANCH", label: "Şube" },
                { value: "DEPARTMENT", label: "Departman" },
              ],
            },
            {
              name: "entityId",
              label: "İlgili Çalışan",
              type: "remote-select",
              optionsPath: "/hr/employees",
              optionLabelKeys: ["firstName", "lastName"],
              required: true,
            },
            { name: "title", label: "İş Başlığı", required: true },
            {
              name: "priority",
              label: "Öncelik",
              type: "select",
              defaultValue: "NORMAL",
              options: [
                { value: "LOW", label: "Düşük" },
                { value: "NORMAL", label: "Normal" },
                { value: "HIGH", label: "Yüksek" },
                { value: "CRITICAL", label: "Kritik" },
              ],
            },
            { name: "dueAt", label: "Termin", type: "datetime-local" },
          ],
        },
      ]}
    />
  );
}
