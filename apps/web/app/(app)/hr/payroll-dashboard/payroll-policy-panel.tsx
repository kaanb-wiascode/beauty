"use client";

import { useEffect, useState } from "react";

import { FinanceEmpty, FinancePanel, FinanceStatus } from "@/components/finance-view";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";

type Policy = {
  enabled:boolean;
  applyOvertime:boolean;
  applyUnpaidLeaveDeduction:boolean;
  standardMonthlyMinutes:number|null;
  overtimeMultiplier:number|null;
  monthlyDayDivisor:number|null;
  updatedAt:string|null;
};

type Preview = {
  year:number;
  month:number;
  settings:Policy;
  staff:Array<{
    staffId:string;
    firstName:string;
    lastName:string;
    overtimeMinutes:number|string;
    unpaidLeaveDays:number|string;
    baseGross:number;
    overtimeAddition:number;
    unpaidLeaveDeduction:number;
    proposedGross:number;
    delta:number;
    policyApplied:boolean;
  }>;
};

const EMPTY:Policy={enabled:false,applyOvertime:false,applyUnpaidLeaveDeduction:false,standardMonthlyMinutes:null,overtimeMultiplier:null,monthlyDayDivisor:null,updatedAt:null};

export function PayrollPolicyPanel({year,month}:{year:number;month:number}){
  const [policy,setPolicy]=useState<Policy>(EMPTY);
  const [preview,setPreview]=useState<Preview|null>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");

  async function load(){
    setLoading(true);setError("");
    try{
      const [settings,result]=await Promise.all([
        api<Policy>("/hr/payroll/policy"),
        api<Preview>(withQuery("/hr/payroll/policy/preview",{year,month})),
      ]);
      setPolicy(settings);setPreview(result);
    }catch(requestError){setError(requestError instanceof ApiError?requestError.message:"Bordro politikası yüklenemedi.");}
    finally{setLoading(false);}
  }

  useEffect(()=>{void load();},[year,month]);

  async function save(){
    setSaving(true);setError("");setSuccess("");
    try{
      const updated=await api<Policy>("/hr/payroll/policy",{method:"PUT",body:{
        enabled:policy.enabled,
        applyOvertime:policy.applyOvertime,
        applyUnpaidLeaveDeduction:policy.applyUnpaidLeaveDeduction,
        standardMonthlyMinutes:policy.standardMonthlyMinutes,
        overtimeMultiplier:policy.overtimeMultiplier,
        monthlyDayDivisor:policy.monthlyDayDivisor,
      }});
      setPolicy(updated);setSuccess("Bordro politikası kaydedildi.");
      setPreview(await api<Preview>(withQuery("/hr/payroll/policy/preview",{year,month})));
    }catch(requestError){setError(requestError instanceof ApiError?requestError.message:"Bordro politikası kaydedilemedi.");}
    finally{setSaving(false);}
  }

  if(loading)return <FinancePanel title="Bordro Politikası" description="Fazla mesai ve ücretsiz izin kurallarını şirket bazında yönetin."><div className="flex h-36 items-center justify-center"><Spinner label="Politika hazırlanıyor..."/></div></FinancePanel>;

  const affected=(preview?.staff??[]).filter(row=>Math.abs(Number(row.delta??0))>=0.01);
  return <div className="space-y-4">
    {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}
    {success?<Alert onClose={()=>setSuccess("")}>{success}</Alert>:null}
    <div className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
      <FinancePanel title="Bordro Politikası" description="Bu ayarlar şirket seviyesindedir. Kapalı policy finansal tutar üretmez.">
        <div className="space-y-4">
          <Toggle label="Policy engine" detail="Attendance ve izin girdilerinden önerilen brüt ücret üretir." checked={policy.enabled} onChange={enabled=>setPolicy(current=>({...current,enabled}))}/>
          <Toggle label="Fazla mesai etkisi" detail="Tanımlı aylık dakika ve multiplier üzerinden ek kazanç hesaplar." checked={policy.applyOvertime} onChange={applyOvertime=>setPolicy(current=>({...current,applyOvertime}))}/>
          {policy.applyOvertime?<div className="grid gap-3 sm:grid-cols-2"><NumberField label="Standart aylık dakika" value={policy.standardMonthlyMinutes} min={1} onChange={standardMonthlyMinutes=>setPolicy(current=>({...current,standardMonthlyMinutes}))}/><NumberField label="Fazla mesai çarpanı" value={policy.overtimeMultiplier} min={0} step="0.01" onChange={overtimeMultiplier=>setPolicy(current=>({...current,overtimeMultiplier}))}/></div>:null}
          <Toggle label="Ücretsiz izin kesintisi" detail="Yalnız onaylanmış UNPAID izin kayıtlarını dikkate alır." checked={policy.applyUnpaidLeaveDeduction} onChange={applyUnpaidLeaveDeduction=>setPolicy(current=>({...current,applyUnpaidLeaveDeduction}))}/>
          {policy.applyUnpaidLeaveDeduction?<NumberField label="Aylık gün böleni" value={policy.monthlyDayDivisor} min={1} step="0.01" onChange={monthlyDayDivisor=>setPolicy(current=>({...current,monthlyDayDivisor}))}/>:null}
          <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] pt-4"><div><FinanceStatus status={policy.enabled?"ACTIVE":"INACTIVE"}>{policy.enabled?"Aktif":"Pasif"}</FinanceStatus><p className="mt-2 text-[10px] text-[var(--muted)]">Son güncelleme: {policy.updatedAt?new Date(policy.updatedAt).toLocaleString("tr-TR"):"Henüz kaydedilmedi"}</p></div><Button onClick={()=>void save()} disabled={saving}>{saving?"Kaydediliyor...":"Politikayı Kaydet"}</Button></div>
        </div>
      </FinancePanel>

      <FinancePanel title={`${year}/${String(month).padStart(2,"0")} Policy Preview`} description="Mevcut personel ücretini otomatik değiştirmez; önerilen brüt ve farkı karar desteği olarak gösterir.">
        {!preview?.staff.length?<FinanceEmpty title="Preview verisi yok" description="Bu dönem için aktif çalışan bulunamadı."/>:<div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-[11px]"><thead><tr className="border-b border-[var(--line)] text-[10px] uppercase tracking-[.07em] text-[var(--muted-soft)]"><th className="pb-3">Çalışan</th><th className="pb-3 text-right">Fazla Mesai</th><th className="pb-3 text-right">Ücretsiz İzin</th><th className="pb-3 text-right">Baz Brüt</th><th className="pb-3 text-right">Önerilen</th><th className="pb-3 text-right">Fark</th></tr></thead><tbody>{preview.staff.slice(0,12).map(row=><tr key={row.staffId} className="border-b border-[var(--line)] last:border-0"><td className="py-3 font-medium text-[var(--ink)]">{row.firstName} {row.lastName}</td><td className="py-3 text-right text-[var(--muted)]">{Number(row.overtimeMinutes||0)} dk</td><td className="py-3 text-right text-[var(--muted)]">{Number(row.unpaidLeaveDays||0)} gün</td><td className="py-3 text-right">{money(row.baseGross)}</td><td className="py-3 text-right font-medium">{money(row.proposedGross)}</td><td className={`py-3 text-right font-medium ${Number(row.delta)>0?"text-emerald-600":Number(row.delta)<0?"text-amber-600":"text-[var(--muted)]"}`}>{signedMoney(row.delta)}</td></tr>)}</tbody></table><div className="mt-3 flex justify-between text-[10px] text-[var(--muted)]"><span>{preview.staff.length} çalışan değerlendirildi</span><span>{affected.length} çalışan için finansal fark var</span></div></div>}
      </FinancePanel>
    </div>
  </div>;
}

function Toggle({label,detail,checked,onChange}:{label:string;detail:string;checked:boolean;onChange:(value:boolean)=>void}){return <label className="flex cursor-pointer items-start justify-between gap-4 rounded-[14px] border border-[var(--line)] p-3.5"><span><span className="block text-[12px] font-semibold text-[var(--ink)]">{label}</span><span className="mt-1 block text-[10px] leading-5 text-[var(--muted)]">{detail}</span></span><input className="mt-1 h-4 w-4" type="checkbox" checked={checked} onChange={event=>onChange(event.target.checked)}/></label>}
function NumberField({label,value,onChange,min,step="1"}:{label:string;value:number|null;onChange:(value:number|null)=>void;min:number;step?:string}){return <label className="block"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[.06em] text-[var(--muted-soft)]">{label}</span><input className="control h-10 w-full" type="number" min={min} step={step} value={value??""} onChange={event=>onChange(event.target.value===""?null:Number(event.target.value))}/></label>}
function money(value:number){return new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY",maximumFractionDigits:2}).format(Number(value??0));}
function signedMoney(value:number){const amount=Number(value??0);return `${amount>0?"+":""}${money(amount)}`;}
