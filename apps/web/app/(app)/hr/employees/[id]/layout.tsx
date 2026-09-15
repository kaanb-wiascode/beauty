"use client";

import { useParams, usePathname } from "next/navigation";
import { EmployeeDocumentComplianceCard } from "@/components/hr/employee-document-compliance-card";
import { EmployeeCertificationCard } from "@/components/hr/employee-certification-card";

export default function EmployeeLayout({children}:{children:React.ReactNode}){
 const{id}=useParams<{id:string}>(),pathname=usePathname();
 const employee360=pathname===`/hr/employees/${id}`||pathname===`/hr/employees/${id}/`;
 return <>{children}{employee360?<div className="mx-auto grid max-w-[1280px] -mt-7 gap-4 pb-12 xl:grid-cols-2"><EmployeeDocumentComplianceCard employeeId={id}/><EmployeeCertificationCard employeeId={id}/></div>:null}</>;
}
