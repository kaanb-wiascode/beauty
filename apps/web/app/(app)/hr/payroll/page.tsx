"use client";

import PayrollDashboardPage from "../payroll-dashboard/page";
import { PayrollPolicyPanel } from "../payroll-dashboard/payroll-policy-panel";

export default function PayrollPage(){
  const now=new Date();
  return <div className="space-y-6">
    <PayrollDashboardPage/>
    <PayrollPolicyPanel year={now.getFullYear()} month={now.getMonth()+1}/>
  </div>;
}
