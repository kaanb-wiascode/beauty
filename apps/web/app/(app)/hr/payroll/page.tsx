"use client";

import PayrollDashboardPage from "../payroll-dashboard/page";
import { PayrollPolicyPanel } from "../payroll-dashboard/payroll-policy-panel";
import { EnterpriseDataPage } from "@/components/enterprise-data-page";

export default function PayrollPage(){
  const now=new Date();
  return <div className="space-y-6">
    <PayrollDashboardPage/>
    <PayrollPolicyPanel year={now.getFullYear()} month={now.getMonth()+1}/>
    <EnterpriseDataPage
      eyebrow="Muhasebe"
      title="Bordro Ödeme Kuyruğu"
      description="Muhasebeleştirilmiş bordrolardan doğan personel ödemelerini, kalan tutarları ve ödeme durumlarını izleyin."
      sections={[
        {
          title: "Bekleyen ve Tamamlanan Ödemeler",
          description: "Bordro kesinleştirildikten sonra personel bazında oluşan ödeme kuyruğunu gösterir.",
          path: "/hr/payroll/payment-queue",
        },
      ]}
      forms={[
        {
          title: "Maaş Ödemesi Yap",
          description: "Ödeme kuyruğundaki personeli seçin. Tutarı boş bırakırsanız kalan net maaşın tamamı ödenir.",
          path: "/hr/payroll/payment-queue/{queueId}/pay",
          success: "Maaş ödemesi kaydedildi.",
          fields: [
            {
              name: "queueId",
              label: "Ödeme Kaydı",
              type: "remote-select",
              optionsPath: "/hr/payroll/payment-queue",
              optionValueKey: "id",
              optionLabelKeys: ["firstName", "lastName", "branchName", "status"],
              required: true,
            },
            {
              name: "amount",
              label: "Ödenecek Tutar",
              type: "number",
              placeholder: "Boş bırakırsanız kalan tutarın tamamı",
            },
            {
              name: "method",
              label: "Ödeme Yöntemi",
              type: "select",
              required: true,
              defaultValue: "BANK",
              options: [
                { value: "BANK", label: "Banka" },
                { value: "CASH", label: "Kasa" },
              ],
            },
            {
              name: "note",
              label: "Açıklama",
              type: "textarea",
              placeholder: "İsteğe bağlı ödeme açıklaması",
            },
          ],
        },
      ]}
    />
  </div>;
}
