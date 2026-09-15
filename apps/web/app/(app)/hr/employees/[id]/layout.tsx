"use client";

import { useParams, usePathname } from "next/navigation";
import { EmployeeDocumentComplianceCard } from "@/components/hr/employee-document-compliance-card";

export default function EmployeeLayout({children}:{children:React.ReactNode}){
 const{id}=useParams<{id:string}>(),pathname=usePathname();
 const employee360=pathname===`/hr/employees/${id}`||pathname===`/hr/employees/${id}/`;
 return <>{children}{employee360?<div className="mx-auto max-w-[1280px] -mt-7 pb-12"><EmployeeDocumentComplianceCard employeeId={id}/></div>:null}</>;
}
