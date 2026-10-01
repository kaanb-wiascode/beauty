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
    />
  </div>;
}
