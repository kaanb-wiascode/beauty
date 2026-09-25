"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/toast";

type SodPolicy = { id:string; domain:string; requesterCannotApprove:boolean; requireDistinctApprovers:boolean; enabled:boolean };

function domainLabel(value:string){
  return ({finance:"Finans",hr:"İnsan Kaynakları",operations:"Operasyon",inventory:"Envanter",procurement:"Satın Alma"} as Record<string,string>)[value] ?? value;
}

export default function SodPoliciesPage(){
  const {showToast}=useToast();
  const [items,setItems]=useState<SodPolicy[]>([]); const [domain,setDomain]=useState("finance");
  const [requesterCannotApprove,setRequesterCannotApprove]=useState(true); const [requireDistinctApprovers,setRequireDistinctApprovers]=useState(false);
  const [enabled,setEnabled]=useState(true); const [error,setError]=useState(""); const [saving,setSaving]=useState(false);
  const load=()=>api<SodPolicy[]>("/admin/governance/sod").then(setItems).catch(e=>setError(e instanceof ApiError?e.message:"Görev ayrılığı kuralları yüklenemedi."));
  useEffect(()=>{void load();},[]);
  async function save(){setSaving(true);setError("");try{await api("/admin/governance/sod",{method:"PUT",body:{domain,requesterCannotApprove,requireDistinctApprovers,enabled}});await load();showToast("Görev ayrılığı kuralı kaydedildi.");}catch(e){setError(e instanceof ApiError?e.message:"Görev ayrılığı kuralı kaydedilemedi.");}finally{setSaving(false);}}
  return <main className="mx-auto w-full max-w-[1100px] space-y-6 pb-10"><header className="border-b border-[var(--line)] pb-5"><div className="text-xs text-[var(--muted)]">Yönetim / Güvenlik</div><h1 className="text-[28px] font-semibold tracking-[-.04em]">Görevlerin Ayrılığı</h1><p className="mt-1 text-sm text-[var(--muted)]">Kritik onaylarda aynı kişinin hem talep eden hem de onaylayan rolünde olmasını işlem alanına göre sınırlandırın.</p></header>{error?<div className="rounded-xl border border-[#f0d8d8] bg-[#fff8f8] p-3 text-sm text-[#9a4545]">{error}</div>:null}<section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5"><div className="grid gap-4 md:grid-cols-2"><label className="text-sm">İşlem Alanı<input value={domain} onChange={e=>setDomain(e.target.value)} className="mt-1 min-h-10 w-full rounded-xl border border-[var(--line)] px-3" /></label><div className="space-y-3 pt-1"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={requesterCannotApprove} onChange={e=>setRequesterCannotApprove(e.target.checked)}/> Talep sahibi kendi talebini onaylayamaz</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={requireDistinctApprovers} onChange={e=>setRequireDistinctApprovers(e.target.checked)}/> Çok adımlı akışta onaylayanlar farklı olmalı</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> Politika aktif</label></div></div><button disabled={saving} onClick={()=>void save()} className="mt-4 rounded-xl bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving?"Kaydediliyor…":"Politikayı Kaydet"}</button></section><section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]"><div className="border-b border-[var(--line)] px-4 py-3 text-sm font-semibold">Tanımlı Politikalar</div>{items.length?items.map(x=><div key={x.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3 last:border-0"><div><div className="font-medium">{domainLabel(x.domain)}</div><div className="text-xs text-[var(--muted)]">Talep sahibi kendi talebini onaylayamaz: {x.requesterCannotApprove?"Evet":"Hayır"} · Çok adımlı onaylarda farklı kişiler gerekir: {x.requireDistinctApprovers?"Evet":"Hayır"}</div></div><span className={`rounded-full px-2 py-1 text-xs ${x.enabled?"bg-[#eaf7ef] text-[#378a5e]":"bg-[var(--surface-2)] text-[var(--muted)]"}`}>{x.enabled?"Aktif":"Pasif"}</span></div>):<div className="p-5 text-sm text-[var(--muted)]">Henüz özel bir görev ayrılığı kuralı yok. Varsayılan güvenlik kuralı, talep sahibinin kendi talebini onaylamasını engeller.</div>}</section></main>;
}
