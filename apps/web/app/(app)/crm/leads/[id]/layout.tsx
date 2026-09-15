import type { ReactNode } from "react";
import { LeadDuplicateAlert } from "@/components/crm/lead-duplicate-alert";

export default async function CrmLeadLayout({children,params}:{children:ReactNode;params:Promise<{id:string}>}){
 const {id}=await params;
 return <div className="space-y-4"><LeadDuplicateAlert leadId={id}/>{children}</div>;
}
