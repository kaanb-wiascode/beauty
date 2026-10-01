import { EnterpriseDataPage } from "@/components/enterprise-data-page";
import { AttendanceActionsPanel } from "./attendance-actions-panel";
import { EmployeeNotificationsPanel } from "./employee-notifications-panel";

export default function HRSelfServicePage() {
  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-12">
      <AttendanceActionsPanel />
      <EmployeeNotificationsPanel />
      <EnterpriseDataPage
      eyebrow="Çalışan Deneyimi"
      title="Çalışan İşlemleri"
      description="Çalışanların kendi izinlerini, yaklaşan vardiyalarını ve temel insan kaynakları bilgilerini tek merkezden takip etmesini sağlar."
      sections={[
        {
          title: "Benim Bilgilerim",
          description: "Çalışan kaydınızla eşleşen temel bilgileri gösterir.",
          path: "/hr/self-service/me",
          dataKey: "employee",
        },
        {
          title: "İzin Bakiyelerim",
          description: "Kullanabileceğiniz, kullandığınız ve bekleyen izin günlerini izin türüne göre gösterir.",
          path: "/hr/self-service/me",
          dataKey: "leaveBalances",
        },
        {
          title: "İzin Taleplerim",
          description: "Daha önce oluşturduğunuz izin taleplerini ve sonuçlarını gösterir.",
          path: "/hr/self-service/me",
          dataKey: "leaveRequests",
        },
        {
          title: "Yaklaşan Vardiyalarım",
          description: "Size atanmış yaklaşan çalışma vardiyalarını gösterir.",
          path: "/hr/self-service/me",
          dataKey: "upcomingShifts",
        },
        {
          title: "Bugünkü Puantaj Hareketlerim",
          description: "Gün içindeki çalışma ve mola hareketlerinizin onay durumunu, yönetici adımını ve karar süresini gösterir.",
          path: "/hr/self-service/me",
          dataKey: "attendanceToday",
        },
        {
          title: "Bordro ve Ödeme Durumum",
          description: "Son bordro dönemlerinizdeki net ücret, ödenen tutar, kalan tutar ve ödeme durumunu gösterir.",
          path: "/hr/self-service/me/payroll-status",
        },
        {
          title: "Ekibim",
          description: "Yöneticiyseniz sorumlu olduğunuz çalışanları gösterir.",
          path: "/hr/self-service/manager",
          dataKey: "team",
        },
        {
          title: "Ekibimin Bekleyen İzinleri",
          description: "Yöneticiyseniz ekibinizde sonuçlandırılmayı bekleyen izin taleplerini gösterir.",
          path: "/hr/self-service/manager",
          dataKey: "pendingLeaves",
        },
      ]}
      forms={[
        {
          title: "İzin Talebi Oluştur",
          description: "İzin türünü ve tarih aralığını seçerek izin talebinizi oluşturun.",
          path: "/hr/self-service/me/leave-requests",
          fields: [
            { name: "leaveTypeId", label: "İzin Türü", type: "remote-select", optionsPath: "/hr/leave-management/types", optionLabelKeys: ["name"], required: true },
            { name: "startDate", label: "Başlangıç Tarihi", type: "date", required: true },
            { name: "endDate", label: "Bitiş Tarihi", type: "date", required: true },
            { name: "days", label: "İzin Günü", type: "number", required: true },
            { name: "reason", label: "Açıklama", type: "textarea" },
          ],
        },
        {
          title: "Çalışan Hesabını Eşleştir",
          description: "Yetkili kullanıcı olarak çalışanın sistem hesabını kendi çalışan kaydıyla eşleştirin.",
          path: "/hr/self-service/employees/{staffId}/link-user",
          fields: [
            { name: "staffId", label: "Çalışan", type: "remote-select", optionsPath: "/hr/employees", optionLabelKeys: ["firstName", "lastName"], required: true },
            { name: "userId", label: "Kullanıcı Hesabı", required: true, placeholder: "Bağlanacak kullanıcı hesabını seçin veya girin" },
          ],
        },
      ]}
      />
    </div>
  );
}
