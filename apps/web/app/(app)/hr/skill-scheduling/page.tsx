"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, EmptyState, Field, Modal, PageHeader, Spinner, TextInput } from "@/components/ui";
import { ValooSelect } from "@/components/valoo-controls";
import { api, ApiError } from "@/lib/api";
import { userErrorMessage, userLabel } from "@/lib/user-language";

type Service={id:string;name:string};
type ServiceResponse={data?:Service[]};
type Candidate={
  staffId:string;
  firstName:string;
  lastName:string;
  serviceName:string;
  eligible:boolean;
  status:string;
  reason:string;
  missingCompetencyCount:number;
  missingCertificationCount:number;
};

const today=()=>new Date().toISOString().slice(0,10);

export default function SkillSchedulingPage(){
  const[services,setServices]=useState<Service[]>([]);
  const[serviceId,setServiceId]=useState("");
  const[startAt,setStartAt]=useState(`${today()}T09:00`);
  const[endAt,setEndAt]=useState(`${today()}T18:00`);
  const[rows,setRows]=useState<Candidate[]>([]);
  const[loading,setLoading]=useState(false);
  const[loadingServices,setLoadingServices]=useState(true);
  const[error,setError]=useState("");
  const[createOpen,setCreateOpen]=useState(false);
  const[savingService,setSavingService]=useState(false);
  const[serviceForm,setServiceForm]=useState({name:"",category:"",durationMinutes:"60",price:"0"});

  const loadServices=useCallback(async()=>{
    setLoadingServices(true);
    setError("");
    try{
      const response=await api<ServiceResponse|Service[]>("/services?limit=100&status=ACTIVE");
      const list=Array.isArray(response)?response:(response.data??[]);
      setServices(list);
      setServiceId(current=>current||list[0]?.id||"");
    }catch(e){
      setError(e instanceof ApiError?userErrorMessage(e.message,"Hizmetler yüklenemedi."):"Hizmetler yüklenemedi.");
    }finally{
      setLoadingServices(false);
    }
  },[]);

  useEffect(()=>{void loadServices()},[loadServices]);

  async function search(){
    if(!serviceId)return;
    if(!startAt||!endAt||new Date(endAt)<=new Date(startAt)){
      setError("Bitiş zamanı başlangıç zamanından sonra olmalıdır.");
      return;
    }
    setLoading(true);
    setError("");
    try{
      const result=await api<Candidate[]>(`/hr/workforce/skill-scheduling/services/${serviceId}/candidates?startAt=${encodeURIComponent(new Date(startAt).toISOString())}&endAt=${encodeURIComponent(new Date(endAt).toISOString())}`);
      setRows(Array.isArray(result)?result:[]);
    }catch(e){
      setError(e instanceof ApiError?userErrorMessage(e.message,"Uygun personel adayları yüklenemedi."):"Uygun personel adayları yüklenemedi.");
    }finally{
      setLoading(false);
    }
  }

  async function createService(){
    const name=serviceForm.name.trim();
    const durationMinutes=Number(serviceForm.durationMinutes);
    const price=Number(serviceForm.price);
    if(!name)return setError("Hizmet adı zorunludur.");
    if(!Number.isFinite(durationMinutes)||durationMinutes<=0)return setError("Hizmet süresi sıfırdan büyük olmalıdır.");
    if(!Number.isFinite(price)||price<0)return setError("Hizmet fiyatı geçerli olmalıdır.");
    setSavingService(true);
    setError("");
    try{
      const created=await api<Service>("/services",{method:"POST",body:{
        name,
        category:serviceForm.category.trim()||undefined,
        durationMinutes,
        preparationMinutes:0,
        cleanupMinutes:0,
        price,
        taxRate:20,
        currency:"TRY",
        requiresConsultation:false,
      }});
      setCreateOpen(false);
      setServiceForm({name:"",category:"",durationMinutes:"60",price:"0"});
      await loadServices();
      setServiceId(created.id);
    }catch(e){
      setError(e instanceof ApiError?userErrorMessage(e.message,"Hizmet oluşturulamadı."):"Hizmet oluşturulamadı.");
    }finally{
      setSavingService(false);
    }
  }

  return <div className="mx-auto max-w-[1400px] space-y-6 pb-12">
    <PageHeader title="Yetkinliğe Göre Personel Planlama" description="Hizmet ve zaman aralığına göre uygun çalışanları; vardiya, izin, randevu, sertifika ve yetkinlik koşullarıyla birlikte değerlendirin."/>

    {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}

    <section className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_8px_30px_rgba(31,69,94,.035)]">
      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr_1fr_auto] lg:items-end">
        <Field label="Hizmet">
          <ValooSelect
            value={serviceId}
            onChange={setServiceId}
            options={services.map(item=>({value:item.id,label:item.name}))}
            loading={loadingServices}
            placeholder="Hizmet seçin"
            searchPlaceholder="Hizmet ara…"
            emptyLabel="Henüz hizmet bulunmuyor."
            createAction={{label:"Yeni hizmet ekle",onClick:()=>setCreateOpen(true)}}
          />
        </Field>
        <Field label="Başlangıç">
          <TextInput type="datetime-local" value={startAt} onChange={e=>setStartAt(e.target.value)}/>
        </Field>
        <Field label="Bitiş">
          <TextInput type="datetime-local" value={endAt} onChange={e=>setEndAt(e.target.value)}/>
        </Field>
        <Button className="min-w-[170px]" onClick={()=>void search()} disabled={loading||!serviceId}>
          {loading?"Kontrol Ediliyor…":"Uygun Personeli Bul"}
        </Button>
      </div>
    </section>

    {loading?<Spinner label="Uygunluk kontrol ediliyor…"/>:rows.length?
      <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)]">
        <div className="border-b border-[var(--line)] px-5 py-4">
          <h2 className="text-sm font-semibold">Personel Uygunluk Sonuçları</h2>
          <p className="mt-1 text-[11px] text-[var(--muted)]">{rows.length} çalışan değerlendirildi.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead><tr className="border-b border-[var(--line)] bg-[var(--surface-2)]/45 text-[10px] uppercase tracking-[.08em] text-[var(--muted-soft)]">
              <th className="px-4 py-3">Çalışan</th>
              <th className="px-4 py-3">Durum</th>
              <th className="px-4 py-3">Değerlendirme</th>
              <th className="px-4 py-3">Eksik Yetkinlik</th>
              <th className="px-4 py-3">Eksik Sertifika</th>
            </tr></thead>
            <tbody>{rows.map(row=><tr key={row.staffId} className="border-b border-[var(--line)] last:border-0">
              <td className="px-4 py-4 font-medium text-[var(--ink)]">{row.firstName} {row.lastName}</td>
              <td className="px-4 py-4"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${row.eligible?"border-[rgba(35,140,90,.18)] bg-[rgba(35,140,90,.07)] text-[var(--success)]":"border-[rgba(190,116,37,.18)] bg-[rgba(190,116,37,.07)] text-[var(--warning)]"}`}>{row.eligible?"Uygun":"Uygun Değil"}</span></td>
              <td className="max-w-[420px] px-4 py-4 text-[var(--muted)]">{row.reason}</td>
              <td className="px-4 py-4 text-[var(--muted)]">{row.missingCompetencyCount}</td>
              <td className="px-4 py-4 text-[var(--muted)]">{row.missingCertificationCount}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>:
      <section className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-6">
        <EmptyState
          title={services.length?"Henüz uygunluk kontrolü yapılmadı":"Henüz hizmet bulunmuyor"}
          description={services.length?"Bir hizmet ve zaman aralığı seçip uygun personeli kontrol edin.":"Planlama yapabilmek için önce bir hizmet oluşturun."}
        />
        {!services.length?<div className="mt-4 flex justify-center"><Button onClick={()=>setCreateOpen(true)}>+ Yeni Hizmet Ekle</Button></div>:null}
      </section>
    }

    <Modal open={createOpen} onClose={()=>{if(!savingService)setCreateOpen(false)}} title="Yeni Hizmet Ekle" description="Planlamada kullanılacak temel hizmet kaydını oluşturun.">
      <div className="space-y-4">
        <Field label="Hizmet Adı" required><TextInput value={serviceForm.name} onChange={e=>setServiceForm(x=>({...x,name:e.target.value}))}/></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kategori"><TextInput value={serviceForm.category} onChange={e=>setServiceForm(x=>({...x,category:e.target.value}))}/></Field>
          <Field label="Süre (Dakika)" required><TextInput type="number" min={1} value={serviceForm.durationMinutes} onChange={e=>setServiceForm(x=>({...x,durationMinutes:e.target.value}))}/></Field>
        </div>
        <Field label="Satış Fiyatı"><TextInput type="number" min={0} step="0.01" value={serviceForm.price} onChange={e=>setServiceForm(x=>({...x,price:e.target.value}))}/></Field>
        <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4">
          <Button variant="secondary" onClick={()=>setCreateOpen(false)} disabled={savingService}>Vazgeç</Button>
          <Button onClick={()=>void createService()} disabled={savingService}>{savingService?"Kaydediliyor…":"Hizmeti Oluştur"}</Button>
        </div>
      </div>
    </Modal>
  </div>
}
