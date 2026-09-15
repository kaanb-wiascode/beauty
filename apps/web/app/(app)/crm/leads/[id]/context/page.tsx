"use client";

import Link from "next/link";
import { FormEvent, use, useEffect, useState } from "react";
import { LeadContextFields,contextPayload,emptyLeadContext,type CommercialOptions,type LeadContextForm } from "@/components/crm/lead-context-fields";
import { Alert,Button,PageHeader,Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api,ApiError } from "@/lib/api";
import { hasActiveBranch,hasPermission } from "@/lib/auth";
import type { CrmLeadDetail } from "@/lib/crm-types";

function fromLead(lead:CrmLeadDetail):LeadContextForm{return {...emptyLeadContext,alternativePhone:lead.alternativePhone??"",preferredContactChannel:lead.preferredContactChannel??"",language:lead.language??"tr",timezone:lead.timezone??"Europe/Istanbul",sourceDetail:lead.sourceDetail??"",campaignId:lead.campaignId??"",campaignName:lead.campaignName??"",adSetId:lead.adSetId??"",adSetName:lead.adSetName??"",adId:lead.adId??"",adName:lead.adName??"",landingPage:lead.landingPage??"",referrer:lead.referrer??"",utmSource:lead.utmSource??"",utmMedium:lead.utmMedium??"",utmCampaign:lead.utmCampaign??"",utmContent:lead.utmContent??"",utmTerm:lead.utmTerm??"",interestedServiceIds:lead.interestedServiceIds??[],interestedPackageIds:lead.interestedPackageIds??[],preferredBranchId:lead.preferredBranchId??"",estimatedBudget:lead.estimatedBudget==null?"":String(lead.estimatedBudget),budgetCurrency:lead.budgetCurrency??"TRY",purchaseUrgency:lead.purchaseUrgency??"UNKNOWN",consultationNeed:lead.consultationNeed??"UNKNOWN",customerIntent:lead.customerIntent??"",team:lead.team??"",leadScore:String(lead.leadScore??0),leadTemperature:lead.leadTemperature??"COLD"};}

export default function LeadContextPage({params}:{params:Promise<{id:string}>}){
 const {id}=use(params),canManage=hasPermission("crm","manage"),{showToast}=useToast();
 const [lead,setLead]=useState<CrmLeadDetail|null>(null),[options,setOptions]=useState<CommercialOptions>(),[form,setForm]=useState<LeadContextForm>(emptyLeadContext),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState("");
 useEffect(()=>{void Promise.all([api<CrmLeadDetail>(`/crm/leads/${id}`),api<CommercialOptions>("/crm/commercial-options")]).then(([row,catalog])=>{setLead(row);setForm(fromLead(row));setOptions(catalog);}).catch(e=>setError(e instanceof ApiError?e.message:"Lead bağlamı yüklenemedi.")).finally(()=>setLoading(false));},[id]);
 async function submit(event:FormEvent){event.preventDefault();if(!lead||!canManage)return;if(!hasActiveBranch()){showToast("Lead bağlamını güncellemek için aktif şube seçin.","error");return;}setSaving(true);setError("");try{const updated=await api<CrmLeadDetail>(`/crm/leads/${id}`,{method:"PATCH",body:{version:lead.version,...contextPayload(form)}});setLead({...lead,...updated});showToast("Lead iletişim, edinim, ticari niyet ve satış bağlamı güncellendi.","success");}catch(e){setError(e instanceof ApiError?e.message:"Lead bağlamı güncellenemedi.");}finally{setSaving(false);}}
 if(loading)return <Spinner label="Lead bağlamı hazırlanıyor..."/>;
 if(!lead)return <div className="space-y-4"><Alert>{error||"Potansiyel müşteri bulunamadı."}</Alert><Link href={`/crm/leads/${id}`} className="text-[11px] font-semibold text-[#1674BD]">← Detaya dön</Link></div>;
 return <div className="space-y-6"><Link href={`/crm/leads/${id}`} className="inline-flex text-[11px] font-semibold text-[#1674BD]">← Potansiyel Müşteri Detayına Dön</Link><PageHeader title="Lead Bağlamı" description={`${lead.firstName} ${lead.lastName} için iletişim tercihleri, edinim attribution verileri, hizmet/paket ilgisi ve satış sınıflandırması.`}/>{error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}<form onSubmit={submit} className="space-y-5 rounded-[22px] border border-[var(--line)] bg-white p-5 shadow-[var(--shadow-soft)]"><LeadContextFields value={form} onChange={setForm} commercialOptions={options}/>{canManage?<div className="flex justify-end"><Button type="submit" disabled={saving}>{saving?"Kaydediliyor...":"Bağlamı Kaydet"}</Button></div>:null}</form></div>;
}
