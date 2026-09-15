import Link from "next/link";
import type { ReactNode } from "react";
import { LeadDuplicateAlert } from "@/components/crm/lead-duplicate-alert";

export default async function CrmLeadLayout({children,params}:{children:ReactNode;params:Promise<{id:string}>}){
 const {id}=await params;
 return <div className="space-y-4"><div className="flex flex-wrap justify-end gap-2"><Link href={`/crm/leads/${id}/context`} className="inline-flex min-h-9 items-center rounded-xl border border-[var(--line)] bg-white px-3 text-[10px] font-semibold text-[#1674BD]">İletişim / Edinim / Ticari Bağlam →</Link><Link href={`/crm/leads/${id}/duplicates`} className="inline-flex min-h-9 items-center rounded-xl border border-[var(--line)] bg-white px-3 text-[10px] font-semibold text-[#1674BD]">Mükerrer Kayıt İncelemesi →</Link></div><LeadDuplicateAlert leadId={id}/>{children}</div>;
}
