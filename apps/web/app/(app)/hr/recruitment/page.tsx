"use client";

import { EnterpriseDataPage } from "@/components/enterprise-data-page";
import { getActiveBranchId } from "@/lib/auth";

export default function RecruitmentPage() {
  const activeBranchId = getActiveBranchId() ?? "";
  return (
    <EnterpriseDataPage
      eyebrow="İnsan Kaynakları"
      title="İşe Alım Merkezi"
      description="Açık pozisyonları, adayları, başvuruları, görüşmeleri ve iş tekliflerini tek merkezden yönetin."
      sections={[
        { title: "Açık Pozisyonlar", description: "Yayınlanan veya hazırlanan iş ilanlarını görüntüleyin.", path: "/hr/recruitment/jobs" },
        { title: "Adaylar", description: "İşe alım sürecindeki aday kayıtlarını görüntüleyin.", path: "/hr/recruitment/candidates" },
        { title: "Başvurular", description: "Adayların hangi pozisyon için hangi aşamada olduğunu görüntüleyin.", path: "/hr/recruitment/applications" },
        { title: "Görüşmeler", description: "Planlanan ve tamamlanan görüşmeleri görüntüleyin.", path: "/hr/recruitment/interviews" },
        { title: "İş Teklifleri", description: "Adaylara hazırlanan ve gönderilen teklifleri görüntüleyin.", path: "/hr/recruitment/offers" },
      ]}
      forms={[
        {
          title: "Yeni Pozisyon Aç",
          description: "İşe alım yapılacak pozisyon için yeni ilan kaydı oluşturun.",
          path: "/hr/recruitment/jobs",
          fields: [
            { name: "title", label: "İlan Başlığı", placeholder: "Örn. Şube Müdürü", required: true },
            { name: "departmentName", label: "Departman" },
            { name: "positionName", label: "Pozisyon" },
            { name: "employmentType", label: "Çalışma Şekli", placeholder: "Örn. Tam zamanlı" },
            { name: "location", label: "Çalışma Yeri" },
            { name: "description", label: "Pozisyon Açıklaması", type: "textarea" },
            { name: "requirements", label: "Aranan Özellikler", type: "textarea" },
            {
              name: "status",
              label: "İlan Durumu",
              type: "select",
              defaultValue: "DRAFT",
              options: [
                { value: "DRAFT", label: "Hazırlanıyor" },
                { value: "OPEN", label: "Başvuruya Açık" },
                { value: "CLOSED", label: "Başvuruya Kapalı" },
              ],
            },
            { name: "closesAt", label: "Başvuru Bitişi", type: "datetime-local" },
          ],
        },
        {
          title: "Yeni Aday Ekle",
          description: "Başvuru yapacak veya değerlendirmeye alınacak adayın temel bilgilerini kaydedin.",
          path: "/hr/recruitment/candidates",
          fields: [
            { name: "firstName", label: "Ad", required: true },
            { name: "lastName", label: "Soyad", required: true },
            { name: "email", label: "E-posta" },
            { name: "phone", label: "Telefon" },
            { name: "city", label: "Şehir" },
            { name: "source", label: "Adayın Geldiği Kaynak", placeholder: "Örn. Kariyer sitesi, öneri, sosyal medya" },
            { name: "currentTitle", label: "Mevcut / Son Görev" },
            { name: "cvUrl", label: "Özgeçmiş Bağlantısı" },
            { name: "notes", label: "Notlar", type: "textarea" },
          ],
        },
        {
          title: "Adayı Pozisyona Başlat",
          description: "Bir adayı açık pozisyona bağlayarak işe alım sürecini başlatın.",
          path: "/hr/recruitment/applications",
          fields: [
            { name: "jobPostingId", label: "Pozisyon", type: "remote-select", optionsPath: "/hr/recruitment/jobs", optionLabelKeys: ["title"], required: true },
            { name: "candidateId", label: "Aday", type: "remote-select", optionsPath: "/hr/recruitment/candidates", optionLabelKeys: ["firstName", "lastName"], required: true },
            { name: "ownerStaffId", label: "Süreci Yürüten Çalışan", type: "remote-select", optionsPath: "/hr/employees", optionLabelKeys: ["firstName", "lastName"] },
          ],
        },
        {
          title: "Başvuru Aşamasını Güncelle",
          description: "Adayın işe alım sürecindeki mevcut aşamasını güncelleyin.",
          path: "/hr/recruitment/applications/{id}/stage",
          method: "PATCH",
          fields: [
            { name: "id", label: "Başvuru", type: "remote-select", optionsPath: "/hr/recruitment/applications", optionLabelKeys: ["firstName", "lastName", "jobTitle"], required: true },
            {
              name: "stage",
              label: "Yeni Aşama",
              type: "select",
              required: true,
              options: [
                { value: "APPLIED", label: "Başvurdu" },
                { value: "SCREENING", label: "Ön Değerlendirme" },
                { value: "INTERVIEW", label: "Görüşme" },
                { value: "OFFER", label: "Teklif" },
                { value: "HIRED", label: "İşe Alındı" },
                { value: "REJECTED", label: "Olumsuz Sonuçlandı" },
              ],
            },
            { name: "rating", label: "Değerlendirme Puanı", type: "number" },
            { name: "rejectionReason", label: "Olumsuz Sonuç Nedeni", type: "textarea" },
          ],
        },
        {
          title: "Görüşme Planla",
          description: "Adayla yapılacak görüşmenin tarihini, yerini ve görüşmeyi yapacak kişiyi belirleyin.",
          path: "/hr/recruitment/interviews",
          fields: [
            { name: "applicationId", label: "Başvuru", type: "remote-select", optionsPath: "/hr/recruitment/applications", optionLabelKeys: ["firstName", "lastName", "jobTitle"], required: true },
            {
              name: "interviewType",
              label: "Görüşme Türü",
              type: "select",
              defaultValue: "INTERVIEW",
              options: [
                { value: "PHONE", label: "Telefon Görüşmesi" },
                { value: "ONLINE", label: "Çevrim İçi Görüşme" },
                { value: "INTERVIEW", label: "Yüz Yüze Görüşme" },
                { value: "FINAL", label: "Son Görüşme" },
              ],
            },
            { name: "scheduledAt", label: "Görüşme Tarihi ve Saati", type: "datetime-local", required: true },
            { name: "interviewerStaffId", label: "Görüşmeyi Yapacak Çalışan", type: "remote-select", optionsPath: "/hr/employees", optionLabelKeys: ["firstName", "lastName"] },
            { name: "location", label: "Görüşme Yeri / Bağlantısı" },
            { name: "notes", label: "Görüşme Notu", type: "textarea" },
          ],
        },
        {
          title: "İş Teklifi Hazırla",
          description: "Son aşamaya gelen aday için ücret ve başlangıç tarihini içeren teklif oluşturun.",
          path: "/hr/recruitment/offers",
          fields: [
            { name: "applicationId", label: "Başvuru", type: "remote-select", optionsPath: "/hr/recruitment/applications", optionLabelKeys: ["firstName", "lastName", "jobTitle"], required: true },
            { name: "offeredTitle", label: "Teklif Edilen Pozisyon" },
            { name: "grossSalary", label: "Brüt Ücret", type: "number" },
            { name: "currency", label: "Para Birimi", defaultValue: "TRY" },
            { name: "startDate", label: "Planlanan İşe Başlangıç", type: "date" },
            { name: "expiresAt", label: "Teklif Geçerlilik Süresi", type: "datetime-local" },
            {
              name: "status",
              label: "Teklif Durumu",
              type: "select",
              defaultValue: "DRAFT",
              options: [
                { value: "DRAFT", label: "Hazırlanıyor" },
                { value: "SENT", label: "Adaya Gönderildi" },
              ],
            },
            { name: "notes", label: "Teklif Notu", type: "textarea" },
          ],
        },
        {
          title: "İş Teklifini Sonuçlandır",
          description: "Adayın iş teklifine verdiği kabul veya red yanıtını kaydedin.",
          path: "/hr/recruitment/offers/{id}/respond",
          method: "PATCH",
          fields: [
            { name: "id", label: "İş Teklifi", type: "remote-select", optionsPath: "/hr/recruitment/offers", optionLabelKeys: ["firstName", "lastName", "jobTitle"], required: true },
            {
              name: "status",
              label: "Adayın Yanıtı",
              type: "select",
              required: true,
              options: [
                { value: "ACCEPTED", label: "Teklifi Kabul Etti" },
                { value: "REJECTED", label: "Teklifi Reddetti" },
              ],
            },
            { name: "note", label: "Açıklama", type: "textarea" },
          ],
        },
        {
          title: "Adayı Çalışan Olarak Başlat",
          description: "İşe alımı tamamlanan adayı çalışan kaydına dönüştürün. Pozisyon ve teklif bilgileri mümkün olduğunda otomatik aktarılır ve işe başlangıç planı otomatik oluşturulur.",
          path: "/hr/recruitment/applications/{id}/hire",
          fields: [
            { name: "id", label: "İşe Alınacak Aday", type: "remote-select", optionsPath: "/hr/recruitment/applications", optionLabelKeys: ["firstName", "lastName", "jobTitle"], required: true },
            { name: "branchId", label: "Aktif Şube", type: "hidden", defaultValue: activeBranchId },
            { name: "hireDate", label: "İşe Başlangıç Tarihi", type: "date" },
            { name: "grossSalary", label: "Brüt Ücret", type: "number" },
            {
              name: "employmentType",
              label: "Çalışma Şekli",
              type: "select",
              options: [
                { value: "FULL_TIME", label: "Tam Zamanlı" },
                { value: "PART_TIME", label: "Yarı Zamanlı" },
                { value: "HOURLY", label: "Saatlik" },
                { value: "SEASONAL", label: "Dönemsel" },
                { value: "INTERN", label: "Stajyer" },
              ],
            },
          ],
        },
      ]}
    />
  );
}
