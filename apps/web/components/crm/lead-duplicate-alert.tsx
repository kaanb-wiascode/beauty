"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { CrmLeadDuplicateCandidate } from "@/lib/crm-types";

export function LeadDuplicateAlert({leadId}:{leadId:string}){
 const [candidates,setCandidates]=useState<CrmLeadDuplicateCandidate[]>([]);
 useEffect(()=>{let active=true;void api<CrmLeadDuplicateCandidate[]>(`/crm/leads/${leadId}/duplicate-candidates`).then(rows=>{if(active)setCandidates(rows);}).catch(()=>{});return()=>{active=false;};},[leadId]);
 if(!candidates.length)return null;
 const strongest=Math.max(...candidates.map(row=>row.confidence));
 return <section className="rounded-[20px] border border-amber-200 bg-amber-50/70 p-4">
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
   <div><p className="text-[11px] font-semibold text-amber-900">Olası Mükerrer Kayıt Tespit Edildi</p><p className="mt-1 text-[10px] leading-5 text-amber-800">{candidates.length} aday bulundu. En güçlü eşleşme %{strongest}. Kayıtlar otomatik birleştirilmez; kullanıcı incelemesi gerekir.</p></div>
   <Link href={`/crm/leads/${leadId}/duplicates`} className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-xl border border-amber-300 bg-white px-3 text-[10px] font-semibold text-amber-900">Mükerrer Kayıtları İncele →</Link>
  </div>
 </section>;
}
