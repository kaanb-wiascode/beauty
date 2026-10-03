"use client";

import { useEffect, useState } from "react";
import { Select } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/toast";
import { userLabel } from "@/lib/user-language";

type PrivacyPolicy={id:string;dataCategory:string;retentionDays:number|null;legalBasisReference:string|null;notes:string|null;enabled:boolean};
type PrivacyRequest={id:string;requestType:string;subjectType:string;subjectId:string;status:string;reason:string|null;resolutionNote:string|null;createdAt:string};

const DATA_CATEGORIES = [
  ["customers", "Müşteri Verileri"],
  ["staff", "Personel Verileri"],
  ["appointments", "Randevu Verileri"],
  ["payments", "Ödeme Verileri"],
  ["finance", "Finans Verileri"],
  ["inventory", "Envanter Verileri"],
] as const;

const SUBJECT_TYPES = [
  ["customer", "Müşteri"],
  ["staff", "Personel"],
  ["user", "Kullanıcı"],
] as const;

function dataCategoryLabel(value:string){
  return DATA_CATEGORIES.find(([key])=>key===value)?.[1] ?? value;
}
function subjectTypeLabel(value:string){
  return SUBJECT_TYPES.find(([key])=>key===value)?.[1] ?? value;
}

export default function PrivacyPage(){
 const {showToast}=useToast(); const [policies,setPolicies]=useState<PrivacyPolicy[]>([]); const [requests,setRequests]=useState<PrivacyRequest[]>([]); const [error,setError]=useState("");
 const [category,setCategory]=useState("customers"); const [retentionDays,setRetentionDays]=useState(""); const [basis,setBasis]=useState(""); const [notes,setNotes]=useState("");
 const [requestType,setRequestType]=useState("EXPORT"); const [subjectType,setSubjectType]=useState("customer"); const [subjectId,setSubjectId]=useState(""); const [reason,setReason]=useState("");
 const load=()=>Promise.all([api<PrivacyPolicy[]>("/admin/governance/privacy/policies"),api<PrivacyRequest[]>("/admin/governance/privacy/requests")]).then(([p,r])=>{setPolicies(p);setRequests(r);}).catch(e=>setError(e instanceof ApiError?e.message:"Veri ve gizlilik alanı yüklenemedi."));
 useEffect(()=>{void load();},[]);
 async function savePolicy(){setError("");try{await api("/admin/governance/privacy/policies",{method:"PUT",body:{dataCategory:category,retentionDays:retentionDays?Number(retentionDays):null,legalBasisReference:basis||null,notes:notes||null,enabled:true}});await load();showToast("Gizlilik politikası kaydedildi.");}catch(e){setError(e instanceof ApiError?e.message:"Politika kaydedilemedi.");}}
 async function createRequest(){if(!subjectId.trim())return setError("Konu kaydı kimliği zorunludur.");setError("");try{await api("/admin/governance/privacy/requests",{method:"POST",body:{requestType,subjectType,subjectId,reason:reason||undefined}});setSubjectId("");setReason("");await load();showToast("Veri yönetişimi talebi oluşturuldu.");}catch(e){setError(e instanceof ApiError?e.message:"Talep oluşturulamadı.");}}
 async function review(id:string,status:string){const resolutionNote=window.prompt("Karar/açıklama notu (opsiyonel)")??"";try{await api(`/admin/governance/privacy/requests/${id}/review`,{method:"POST",body:{status,resolutionNote:resolutionNote||undefined}});await load();showToast("Talep durumu güncellendi.");}catch(e){setError(e instanceof ApiError?e.message:"Talep güncellenemedi.");}}
 return <main className="mx-auto w-full max-w-[1180px] space-y-6 pb-10"><header className="border-b border-[var(--line)] pb-5"><div className="text-xs text-[var(--muted)]">Yönetim / Veri</div><h1 className="text-[28px] font-semibold tracking-[-.04em]">Veri & Gizlilik</h1><p className="mt-1 text-sm text-[var(--muted)]">Veri saklama sürelerini ve kişisel veri taleplerini kayıt altına alınan bir süreçle yönetin. Bu ekran hukuki süre belirlemez ve verileri otomatik olarak silmez.</p></header>{error?<div className="rounded-xl border border-[#f0d8d8] bg-[#fff8f8] p-3 text-sm text-[#9a4545]">{error}</div>:null}<div className="grid gap-5 lg:grid-cols-2"><section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5"><h2 className="font-semibold">Veri Saklama Politikası</h2><div className="mt-4 space-y-3"><Select value={category} onChange={e=>setCategory(e.target.value)} className="min-h-10 w-full rounded-xl border border-[var(--line)] px-3 text-sm">{DATA_CATEGORIES.map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select><input value={retentionDays} onChange={e=>setRetentionDays(e.target.value)} type="number" min="1" placeholder="Saklama süresi, gün olarak (isteğe bağlı)" className="min-h-10 w-full rounded-xl border border-[var(--line)] px-3 text-sm"/><input value={basis} onChange={e=>setBasis(e.target.value)} placeholder="Hukuki/kurumsal dayanak referansı (opsiyonel)" className="min-h-10 w-full rounded-xl border border-[var(--line)] px-3 text-sm"/><textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Notlar" className="min-h-24 w-full rounded-xl border border-[var(--line)] p-3 text-sm"/><button onClick={()=>void savePolicy()} className="rounded-xl bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-white">Kaydet</button></div></section><section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5"><h2 className="font-semibold">Veri Talebi Oluştur</h2><div className="mt-4 space-y-3"><Select value={requestType} onChange={e=>setRequestType(e.target.value)} className="min-h-10 w-full rounded-xl border border-[var(--line)] px-3 text-sm"><option value="EXPORT">Veri Dışa Aktarım İncelemesi</option><option value="ANONYMIZATION">Anonimleştirme İncelemesi</option><option value="DELETION_REVIEW">Silme Uygunluk İncelemesi</option></Select><Select value={subjectType} onChange={e=>setSubjectType(e.target.value)} className="min-h-10 w-full rounded-xl border border-[var(--line)] px-3 text-sm">{SUBJECT_TYPES.map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select><input value={subjectId} onChange={e=>setSubjectId(e.target.value)} placeholder="İlgili kayıt numarası" className="min-h-10 w-full rounded-xl border border-[var(--line)] px-3 text-sm"/><textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="Talep gerekçesi" className="min-h-24 w-full rounded-xl border border-[var(--line)] p-3 text-sm"/><button onClick={()=>void createRequest()} className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white">Talep Oluştur</button></div></section></div><section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]"><div className="border-b border-[var(--line)] px-4 py-3 font-semibold">Politikalar</div>{policies.length?policies.map(p=><div key={p.id} className="border-b border-[var(--line)] px-4 py-3 text-sm last:border-0"><div className="font-medium">{dataCategoryLabel(p.dataCategory)}</div><div className="text-xs text-[var(--muted)]">Saklama süresi: {p.retentionDays ? `${p.retentionDays} gün` : "Tanımlı değil"} · Dayanak: {p.legalBasisReference??"—"}</div></div>):<div className="p-4 text-sm text-[var(--muted)]">Henüz politika yok.</div>}</section><section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]"><div className="border-b border-[var(--line)] px-4 py-3 font-semibold">Veri Talepleri</div>{requests.length?requests.map(r=><div key={r.id} className="flex flex-col gap-3 border-b border-[var(--line)] px-4 py-4 last:border-0 md:flex-row md:items-center md:justify-between"><div><div className="font-medium">{userLabel(r.requestType)} · {subjectTypeLabel(r.subjectType)} · Kayıt {r.subjectId}</div><div className="text-xs text-[var(--muted)]">{userLabel(r.status)} · {new Date(r.createdAt).toLocaleString("tr-TR")}</div></div>{!["COMPLETED","REJECTED","CANCELLED"].includes(r.status)?<div className="flex flex-wrap gap-2"><button onClick={()=>void review(r.id,"IN_REVIEW")} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs">İncelemede</button><button onClick={()=>void review(r.id,"APPROVED")} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs">Onayla</button><button onClick={()=>void review(r.id,"REJECTED")} className="rounded-lg border border-[#f0d8d8] px-3 py-2 text-xs text-[#9a4545]">Reddet</button><button onClick={()=>void review(r.id,"COMPLETED")} className="rounded-lg bg-[var(--ink)] px-3 py-2 text-xs text-white">Tamamlandı</button></div>:null}</div>):<div className="p-4 text-sm text-[var(--muted)]">Henüz veri talebi yok.</div>}</section></main>;
}
