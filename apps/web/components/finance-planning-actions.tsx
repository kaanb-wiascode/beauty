"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Alert, Button, Field, Select, TextArea, TextInput } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { userErrorMessage } from "@/lib/user-language";

type OptionRow={id:string;name:string;code?:string};
type StaffRow={id:string;firstName:string;lastName:string};
type PlanningOptions={branches:OptionRow[];costCenters:OptionRow[];staff:StaffRow[]};
type UnallocatedExpense={journalEntryLineId:string;number:string;entryDate:string;description:string;accountName:string;amount:number|string};

const today=()=>new Date().toISOString().slice(0,10);
const yearStart=()=>`${new Date().getFullYear()}-01-01`;
const yearEnd=()=>`${new Date().getFullYear()}-12-31`;

export function FinancePlanningActions(){
  const canManage=hasPermission("finance","manage");
  const[options,setOptions]=useState<PlanningOptions>({branches:[],costCenters:[],staff:[]});
  const[unallocated,setUnallocated]=useState<UnallocatedExpense[]>([]);
  const[error,setError]=useState("");
  const[notice,setNotice]=useState("");
  const[busy,setBusy]=useState(false);

  const[targetType,setTargetType]=useState<"BRANCH"|"COST_CENTER">("BRANCH");
  const[targetId,setTargetId]=useState("");
  const[metricType,setMetricType]=useState<"REVENUE"|"EXPENSE">("REVENUE");
  const[periodStart,setPeriodStart]=useState(yearStart());
  const[periodEnd,setPeriodEnd]=useState(yearEnd());
  const[budgetAmount,setBudgetAmount]=useState("");
  const[budgetNote,setBudgetNote]=useState("");

  const[costCenterId,setCostCenterId]=useState("");
  const[allocations,setAllocations]=useState<Record<string,string>>({});
  const[expenseLineId,setExpenseLineId]=useState("");
  const[expenseCostCenterId,setExpenseCostCenterId]=useState("");
  const[staffId,setStaffId]=useState("");
  const[commissionRate,setCommissionRate]=useState("");

  const load=useCallback(async()=>{
    try{
      const[o,u]=await Promise.all([
        api<PlanningOptions>("/profitability/planning-options"),
        api<UnallocatedExpense[]>(`/profitability/cost-centers/unallocated-expenses?from=${yearStart()}&to=${yearEnd()}`),
      ]);
      setOptions(o);
      setUnallocated(u);
      setTargetId(current=>current||o.branches[0]?.id||"");
      setCostCenterId(current=>current||o.costCenters[0]?.id||"");
      setExpenseCostCenterId(current=>current||o.costCenters[0]?.id||"");
      setStaffId(current=>current||o.staff[0]?.id||"");
    }catch(e){
      setError(e instanceof ApiError?userErrorMessage(e.message,"Planlama seçenekleri yüklenemedi."):"Planlama seçenekleri yüklenemedi.");
    }
  },[]);
  useEffect(()=>{void load();},[load]);

  const targetOptions=targetType==="BRANCH"?options.branches:options.costCenters;
  useEffect(()=>{setTargetId(targetOptions[0]?.id||"");if(targetType==="COST_CENTER")setMetricType("EXPENSE");},[targetType,targetOptions]);

  const allocationTotal=useMemo(()=>Object.values(allocations).reduce((s,v)=>s+(Number(v)||0),0),[allocations]);

  async function saveBudget(){
    if(!targetId||!budgetAmount)return;
    setBusy(true);setError("");setNotice("");
    try{
      await api("/profitability/budgets",{method:"POST",body:{
        targetType,targetId,metricType,periodStart,periodEnd,amount:Number(budgetAmount),note:budgetNote.trim()||undefined,
      }});
      setNotice("Bütçe kaydedildi.");setBudgetAmount("");setBudgetNote("");
    }catch(e){setError(e instanceof ApiError?userErrorMessage(e.message,"Bütçe kaydedilemedi."):"Bütçe kaydedilemedi.");}
    finally{setBusy(false);}
  }

  async function saveAllocations(){
    const rows=Object.entries(allocations).filter(([,v])=>Number(v)>0).map(([branchId,percent])=>({branchId,percent:Number(percent)}));
    if(!costCenterId||!rows.length||Math.abs(allocationTotal-100)>0.001){setError("Şube dağılımlarının toplamı %100 olmalıdır.");return;}
    setBusy(true);setError("");setNotice("");
    try{
      await api(`/profitability/cost-centers/${costCenterId}/allocations`,{method:"POST",body:{allocations:rows}});
      setNotice("Maliyet merkezi şube dağılımı kaydedildi.");
    }catch(e){setError(e instanceof ApiError?userErrorMessage(e.message,"Şube dağılımı kaydedilemedi."):"Şube dağılımı kaydedilemedi.");}
    finally{setBusy(false);}
  }

  async function assignExpense(){
    if(!expenseLineId||!expenseCostCenterId)return;
    setBusy(true);setError("");setNotice("");
    try{
      await api(`/profitability/journal-lines/${expenseLineId}/cost-center`,{method:"POST",body:{costCenterId:expenseCostCenterId}});
      setNotice("Gider maliyet merkezine atandı.");setExpenseLineId("");await load();
    }catch(e){setError(e instanceof ApiError?userErrorMessage(e.message,"Gider maliyet merkezine atanamadı."):"Gider maliyet merkezine atanamadı.");}
    finally{setBusy(false);}
  }

  async function saveCommission(){
    if(!staffId||!commissionRate)return;
    setBusy(true);setError("");setNotice("");
    try{
      await api(`/profitability/staff/${staffId}/commission`,{method:"POST",body:{rate:Number(commissionRate)}});
      setNotice("Personel komisyon oranı güncellendi.");setCommissionRate("");
    }catch(e){setError(e instanceof ApiError?userErrorMessage(e.message,"Komisyon oranı güncellenemedi."):"Komisyon oranı güncellenemedi.");}
    finally{setBusy(false);}
  }

  if(!canManage)return null;

  return <section className="space-y-5 rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5">
    <div><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--accent)]">Planlama İşlemleri</p><h2 className="mt-1 text-[18px] font-semibold text-[var(--ink)]">Bütçe ve maliyet dağılımı yönetimi</h2><p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">Teknik kayıt kodu girmeden şube, maliyet merkezi ve personel seçerek planlama işlemlerini yönetin.</p></div>
    {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}
    {notice?<Alert tone="success" onClose={()=>setNotice("")}>{notice}</Alert>:null}

    <div className="grid gap-5 xl:grid-cols-2">
      <Card title="Bütçe Kaydet" description="Şube veya maliyet merkezi için dönemsel gelir/gider bütçesi oluşturun.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Bütçe Alanı"><Select value={targetType} onChange={e=>setTargetType(e.target.value as "BRANCH"|"COST_CENTER")}><option value="BRANCH">Şube</option><option value="COST_CENTER">Maliyet Merkezi</option></Select></Field>
          <Field label={targetType==="BRANCH"?"Şube":"Maliyet Merkezi"}><Select value={targetId} onChange={e=>setTargetId(e.target.value)}><option value="">Seçin</option>{targetOptions.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
          <Field label="Bütçe Türü"><Select value={metricType} onChange={e=>setMetricType(e.target.value as "REVENUE"|"EXPENSE")} disabled={targetType==="COST_CENTER"}><option value="REVENUE">Gelir</option><option value="EXPENSE">Gider</option></Select></Field>
          <Field label="Tutar"><TextInput type="number" min="0" step="0.01" value={budgetAmount} onChange={e=>setBudgetAmount(e.target.value)}/></Field>
          <Field label="Başlangıç"><TextInput type="date" value={periodStart} onChange={e=>setPeriodStart(e.target.value)}/></Field>
          <Field label="Bitiş"><TextInput type="date" value={periodEnd} onChange={e=>setPeriodEnd(e.target.value)}/></Field>
        </div>
        <Field label="Not"><TextArea rows={2} value={budgetNote} onChange={e=>setBudgetNote(e.target.value)} placeholder="İsteğe bağlı açıklama"/></Field>
        <Button disabled={busy||!targetId||!budgetAmount} onClick={()=>void saveBudget()}>Bütçeyi Kaydet</Button>
      </Card>

      <Card title="Maliyet Merkezi Şube Dağılımı" description="Bir maliyet merkezindeki giderlerin şubelere hangi oranla dağıtılacağını belirleyin.">
        <Field label="Maliyet Merkezi"><Select value={costCenterId} onChange={e=>setCostCenterId(e.target.value)}><option value="">Seçin</option>{options.costCenters.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
        <div className="space-y-2">{options.branches.map(branch=><div key={branch.id} className="grid grid-cols-[1fr_120px] items-center gap-3"><span className="text-[11px] text-[var(--ink)]">{branch.name}</span><TextInput type="number" min="0" max="100" step="0.01" value={allocations[branch.id]??""} onChange={e=>setAllocations(current=>({...current,[branch.id]:e.target.value}))} placeholder="%"/></div>)}</div>
        <div className="flex items-center justify-between text-[11px]"><span className="text-[var(--muted)]">Toplam dağılım</span><strong className={Math.abs(allocationTotal-100)<0.001?"text-[var(--success)]":"text-[var(--warning)]"}>%{allocationTotal.toLocaleString("tr-TR",{maximumFractionDigits:2})}</strong></div>
        <Button disabled={busy||!costCenterId||Math.abs(allocationTotal-100)>0.001} onClick={()=>void saveAllocations()}>Dağılımı Kaydet</Button>
      </Card>

      <Card title="Dağıtılmamış Gideri Maliyet Merkezine Ata" description="Şube belirtilmeden muhasebeleştirilmiş giderleri uygun maliyet merkezine bağlayın.">
        <Field label="Gider Kaydı"><Select value={expenseLineId} onChange={e=>setExpenseLineId(e.target.value)}><option value="">Gider seçin</option>{unallocated.map(x=><option key={x.journalEntryLineId} value={x.journalEntryLineId}>{x.number} · {x.accountName} · {Number(x.amount).toLocaleString("tr-TR",{maximumFractionDigits:2})}</option>)}</Select></Field>
        <Field label="Maliyet Merkezi"><Select value={expenseCostCenterId} onChange={e=>setExpenseCostCenterId(e.target.value)}><option value="">Seçin</option>{options.costCenters.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
        <Button disabled={busy||!expenseLineId||!expenseCostCenterId} onClick={()=>void assignExpense()}>Gideri Ata</Button>
      </Card>

      <Card title="Personel Komisyon Oranı" description={options.staff.length?"Aktif şubedeki personelin komisyon oranını güncelleyin.":"Personel komisyonu için önce aktif bir şube seçin."}>
        <Field label="Personel"><Select value={staffId} onChange={e=>setStaffId(e.target.value)} disabled={!options.staff.length}><option value="">Personel seçin</option>{options.staff.map(x=><option key={x.id} value={x.id}>{x.firstName} {x.lastName}</option>)}</Select></Field>
        <Field label="Komisyon Oranı (%)"><TextInput type="number" min="0" max="100" step="0.01" value={commissionRate} onChange={e=>setCommissionRate(e.target.value)}/></Field>
        <Button disabled={busy||!staffId||!commissionRate} onClick={()=>void saveCommission()}>Komisyon Oranını Kaydet</Button>
      </Card>
    </div>
  </section>;
}

function Card({title,description,children}:{title:string;description:string;children:React.ReactNode}){
  return <div className="space-y-4 rounded-[18px] border border-[var(--line)] bg-[var(--surface-2)]/30 p-4"><div><h3 className="text-[13px] font-semibold text-[var(--ink)]">{title}</h3><p className="mt-1 text-[10px] leading-5 text-[var(--muted)]">{description}</p></div>{children}</div>;
}
