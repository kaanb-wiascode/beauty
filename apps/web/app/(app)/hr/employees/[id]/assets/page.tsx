
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, EmptyState, Field, Modal, PageHeader, Spinner, TextArea } from "@/components/ui";
import { ConfirmDialog } from "@/components/modal";
import { ValooSelect } from "@/components/valoo-controls";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { userErrorMessage } from "@/lib/user-language";

type Asset={id:string;assetCode:string;name:string;assetType?:string|null;brand?:string|null;model?:string|null;serialNumber?:string|null;condition?:string|null;branchName?:string|null;categoryName?:string|null;assignedAt?:string|null;note?:string|null};
type History=Asset&{assetId?:string;returnedAt?:string|null};
type Response={employee:{id:string;firstName:string;lastName:string;branchId:string};current:Asset[];history:History[]};

const date=(value?:string|null)=>value?new Date(value).toLocaleDateString("tr-TR"):"—";
const assetLabel=(asset:Asset)=>[asset.name,asset.assetCode?"#"+asset.assetCode:"",asset.serialNumber?"Seri "+asset.serialNumber:""].filter(Boolean).join(" · ");

export default function EmployeeAssetsPage(){
  const{id}=useParams<{id:string}>();
  const canManage=hasPermission("hr","manage");
  const[data,setData]=useState<Response|null>(null);
  const[available,setAvailable]=useState<Asset[]>([]);
  const[loading,setLoading]=useState(true);
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState("");
  const[notice,setNotice]=useState("");
  const[assignOpen,setAssignOpen]=useState(false);
  const[selectedAssetId,setSelectedAssetId]=useState("");
  const[note,setNote]=useState("");
  const[pendingReturn,setPendingReturn]=useState<Asset|null>(null);

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const [custody,choices]=await Promise.all([
        api<Response>("/hr/employees/"+id+"/assets"),
        api<Asset[]>("/hr/employees/"+id+"/assets/available"),
      ]);
      setData(custody);
      setAvailable(Array.isArray(choices)?choices:[]);
    }catch(e){
      setError(e instanceof ApiError?userErrorMessage(e.message,"Zimmet bilgileri yüklenemedi."):"Zimmet bilgileri yüklenemedi.");
    }finally{setLoading(false)}
  },[id]);

  useEffect(()=>{void load()},[load]);

  const selectedAsset=useMemo(()=>available.find(item=>item.id===selectedAssetId)??null,[available,selectedAssetId]);

  async function assign(){
    if(!selectedAssetId){setError("Zimmetlenecek varlığı seçin.");return}
    setBusy(true);setError("");setNotice("");
    try{
      await api("/hr/employees/"+id+"/assets/assign",{method:"POST",body:{assetId:selectedAssetId,note:note.trim()||undefined}});
      setAssignOpen(false);setSelectedAssetId("");setNote("");setNotice("Varlık çalışana zimmetlendi.");
      await load();
    }catch(e){
      setError(e instanceof ApiError?userErrorMessage(e.message,"Zimmet işlemi tamamlanamadı."):"Zimmet işlemi tamamlanamadı.");
    }finally{setBusy(false)}
  }

  async function returnAsset(){
    if(!pendingReturn)return;
    setBusy(true);setError("");setNotice("");
    try{
      await api("/hr/employees/"+id+"/assets/"+pendingReturn.id+"/return",{method:"POST",body:{}});
      setPendingReturn(null);setNotice("Varlık iade alındı ve yeniden zimmetlenebilir duruma getirildi.");
      await load();
    }catch(e){
      setError(e instanceof ApiError?userErrorMessage(e.message,"Zimmet iadesi tamamlanamadı."):"Zimmet iadesi tamamlanamadı.");
    }finally{setBusy(false)}
  }

  if(loading&&!data)return <div className="flex h-72 items-center justify-center"><Spinner label="Zimmetler hazırlanıyor…"/></div>;
  if(!data&&error)return <div className="mx-auto max-w-[1100px] py-8"><Alert>{error}</Alert></div>;

  const employee=data?.employee;
  const current=data?.current??[];
  const history=data?.history??[];

  return <div className="mx-auto max-w-[1200px] space-y-6 pb-12">
    <div>
      <Link href={"/hr/employees/"+id} className="text-xs font-medium text-[var(--accent)]">← Çalışan Genel Görünümü</Link>
      <div className="mt-4">
        <PageHeader
          title="Zimmet ve Ekipman"
          description={employee?employee.firstName+" "+employee.lastName+" için envanterden zimmetlenen varlıkları ve geçmişini yönetin.":"Çalışan zimmetlerini yönetin."}
          action={canManage?<Button onClick={()=>setAssignOpen(true)}>+ Zimmet Ekle</Button>:undefined}
        />
      </div>
    </div>

    {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}
    {notice?<Alert tone="success" onClose={()=>setNotice("")}>{notice}</Alert>:null}

    <section className="grid gap-3 sm:grid-cols-3">
      <Metric label="Aktif Zimmet" value={current.length}/>
      <Metric label="Zimmet Geçmişi" value={history.length}/>
      <Metric label="Zimmetlenebilir Varlık" value={available.length}/>
    </section>

    <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)]">
      <div className="border-b border-[var(--line)] px-5 py-4">
        <h2 className="text-sm font-semibold text-[var(--ink)]">Aktif Zimmetler</h2>
        <p className="mt-1 text-[11px] text-[var(--muted)]">Bilgiler doğrudan Envanter modülündeki varlık kayıtlarından gelir.</p>
      </div>
      {current.length?<div className="grid gap-3 p-4 md:grid-cols-2">
        {current.map(asset=><article key={asset.id} className="rounded-[18px] border border-[var(--line)] bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><h3 className="truncate text-sm font-semibold text-[var(--ink)]">{asset.name}</h3><p className="mt-1 text-[10px] text-[var(--muted)]">{asset.categoryName||"Envanter Varlığı"} · {asset.assetCode}</p></div>
            {canManage?<Button size="sm" variant="secondary" onClick={()=>setPendingReturn(asset)}>İade Al</Button>:null}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
            <Info label="Marka / Model" value={[asset.brand,asset.model].filter(Boolean).join(" · ")||"—"}/>
            <Info label="Seri No" value={asset.serialNumber||"—"}/>
            <Info label="Şube" value={asset.branchName||"—"}/>
            <Info label="Zimmet Tarihi" value={date(asset.assignedAt)}/>
            <Info label="Durum" value={asset.condition||"—"}/>
            <Info label="Not" value={asset.note||"—"}/>
          </dl>
        </article>)}
      </div>:<EmptyState title="Aktif zimmet yok" description="Bu çalışana henüz bir envanter varlığı zimmetlenmemiş." action={canManage?<Button onClick={()=>setAssignOpen(true)}>+ İlk Zimmeti Ekle</Button>:undefined}/>}
    </section>

    <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)]">
      <div className="border-b border-[var(--line)] px-5 py-4"><h2 className="text-sm font-semibold text-[var(--ink)]">Zimmet Geçmişi</h2><p className="mt-1 text-[11px] text-[var(--muted)]">Geçmiş zimmet ve iade hareketleri silinmeden korunur.</p></div>
      {history.length?<div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs">
        <thead><tr className="border-b border-[var(--line)] bg-[var(--surface-2)]/45 text-[10px] uppercase tracking-[.08em] text-[var(--muted-soft)]"><th className="p-4">Varlık</th><th className="p-4">Seri No</th><th className="p-4">Şube</th><th className="p-4">Zimmet</th><th className="p-4">İade</th></tr></thead>
        <tbody>{history.map((item,index)=><tr key={String(item.assetId??item.id??index)} className="border-b border-[var(--line)] last:border-0">
          <td className="p-4"><strong>{item.name}</strong><p className="mt-1 text-[10px] text-[var(--muted)]">{item.assetCode}</p></td>
          <td className="p-4 text-[var(--muted)]">{item.serialNumber||"—"}</td><td className="p-4 text-[var(--muted)]">{item.branchName||"—"}</td><td className="p-4 text-[var(--muted)]">{date(item.assignedAt)}</td><td className="p-4 text-[var(--muted)]">{item.returnedAt?date(item.returnedAt):"Aktif"}</td>
        </tr>)}</tbody>
      </table></div>:<div className="p-8"><EmptyState title="Geçmiş hareket yok" description="Zimmet hareketleri oluştukça burada görüntülenecek."/></div>}
    </section>

    <Modal open={assignOpen} onClose={()=>{if(!busy){setAssignOpen(false);setSelectedAssetId("");setNote("")}}} title="Çalışana Zimmet Ekle" description="Envanterde kayıtlı ve çalışanın şubesine uygun bir varlık seçin. Seri numarası, marka, model ve şube otomatik gelir.">
      <div className="space-y-5">
        <Field label="Envanter Varlığı" required>
          <ValooSelect value={selectedAssetId} onChange={setSelectedAssetId} options={available.map(asset=>({value:asset.id,label:assetLabel(asset)}))} placeholder="Zimmetlenecek varlığı seçin" searchPlaceholder="Varlık, kod veya seri no ara…" emptyLabel="Bu çalışan için zimmetlenebilir varlık bulunmuyor."/>
        </Field>
        {selectedAsset?<div className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)]/55 p-4"><div className="grid gap-3 sm:grid-cols-2">
          <Info label="Varlık" value={selectedAsset.name}/><Info label="Kod" value={selectedAsset.assetCode}/><Info label="Marka / Model" value={[selectedAsset.brand,selectedAsset.model].filter(Boolean).join(" · ")||"—"}/><Info label="Seri No" value={selectedAsset.serialNumber||"—"}/><Info label="Şube" value={selectedAsset.branchName||"Atamada çalışanın şubesi kullanılacak"}/><Info label="Durum" value={selectedAsset.condition||"—"}/>
        </div></div>:null}
        <Field label="Zimmet Notu"><TextArea rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="Örn. Laptop, adaptör ve çanta ile teslim edildi."/></Field>
        <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4"><Button variant="secondary" disabled={busy} onClick={()=>setAssignOpen(false)}>Vazgeç</Button><Button disabled={busy||!selectedAssetId} onClick={()=>void assign()}>{busy?"Zimmetleniyor…":"Zimmeti Kaydet"}</Button></div>
      </div>
    </Modal>

    <ConfirmDialog open={Boolean(pendingReturn)} title="Zimmeti İade Al" description={pendingReturn?pendingReturn.name+" çalışanın aktif zimmetinden çıkarılacak ve yeniden zimmetlenebilir hale gelecek.":""} loading={busy} onClose={()=>{if(!busy)setPendingReturn(null)}} onConfirm={()=>void returnAsset()}/>
  </div>;
}

function Metric({label,value}:{label:string;value:number}){return <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4"><p className="text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--muted-soft)]">{label}</p><p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{value}</p></div>}
function Info({label,value}:{label:string;value:string}){return <div><dt className="text-[10px] uppercase tracking-[.06em] text-[var(--muted-soft)]">{label}</dt><dd className="mt-1 text-xs font-medium text-[var(--ink)]">{value}</dd></div>}
