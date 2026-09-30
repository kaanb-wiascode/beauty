"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, EmptyState, Field, Modal, PageHeader, Spinner, TextArea } from "@/components/ui";
import { ValooSelect } from "@/components/valoo-controls";
import { api, ApiError } from "@/lib/api";
import { userDomainLabel, userErrorMessage, userLabel } from "@/lib/user-language";

type ApprovalItem={
  id:string;
  workflowKey:string;
  workflowVersion:number;
  domain:string;
  entityType:string;
  entityId:string;
  status:string;
  currentStepOrder:number;
  currentStepName?:string|null;
  reason?:string|null;
  amount?:string|null;
  createdAt:string;
  currentStepStartedAt?:string|null;
  dueAt?:string|null;
  overdue?:boolean;
  slaMinutes?:number|null;
  approverType?:string|null;
  timeoutAction?:string|null;
};
type MembershipOption={
  id:string;
  status:string;
  user:{id:string;email:string;firstName:string;lastName:string};
  role:{id:string;name:string;slug:string};
};
type CorrectionItem={
  id:string;
  workflowKey:string;
  workflowVersion:number;
  domain:string;
  entityType:string;
  entityId:string;
  status:string;
  currentStepOrder:number;
  currentStepName?:string|null;
  currentStepStatus?:string|null;
  reason?:string|null;
  correctionReason?:string|null;
  correctionRequestedAt?:string|null;
  createdAt:string;
  updatedAt:string;
};
type ActionKind="APPROVE"|"REJECT"|"RETURN"|"DELEGATE";

const ACTION_LABELS:Record<ActionKind,string>={
  APPROVE:"Onayla",
  REJECT:"Reddet",
  RETURN:"Düzeltmeye Gönder",
  DELEGATE:"Devret",
};

function remainingLabel(dueAt?:string|null,overdue?:boolean){
  if(!dueAt)return "Süre sınırı yok";
  const diff=new Date(dueAt).getTime()-Date.now();
  const abs=Math.abs(diff);
  const minutes=Math.floor(abs/60000);
  const seconds=Math.floor((abs%60000)/1000);
  if(overdue||diff<=0)return "Süre aşıldı · "+minutes+" dk "+seconds+" sn";
  if(minutes>=60){
    const hours=Math.floor(minutes/60);
    return hours+" sa "+(minutes%60)+" dk kaldı";
  }
  return String(minutes).padStart(2,"0")+":"+String(seconds).padStart(2,"0")+" kaldı";
}

export default function ApprovalQueuePage(){
  const[items,setItems]=useState<ApprovalItem[]>([]);
  const[memberships,setMemberships]=useState<MembershipOption[]>([]);
  const[corrections,setCorrections]=useState<CorrectionItem[]>([]);
  const[loading,setLoading]=useState(true);
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState("");
  const[notice,setNotice]=useState("");
  const[selected,setSelected]=useState<ApprovalItem|null>(null);
  const[actionKind,setActionKind]=useState<ActionKind|null>(null);
  const[comment,setComment]=useState("");
  const[delegateToUserId,setDelegateToUserId]=useState("");
  const[correctionItem,setCorrectionItem]=useState<CorrectionItem|null>(null);
  const[resubmitComment,setResubmitComment]=useState("");
  const[,setClock]=useState(0);

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const [inbox,correctionRows]=await Promise.all([
        api<ApprovalItem[]>("/admin/approval-workflows/runtime/inbox?status=PENDING"),
        api<CorrectionItem[]>("/admin/approval-workflows/runtime/my-requests?status=RETURNED"),
      ]);
      setItems(Array.isArray(inbox)?inbox:[]);
      setCorrections(Array.isArray(correctionRows)?correctionRows:[]);
      try{
        const memberRows=await api<MembershipOption[]>("/memberships");
        setMemberships(Array.isArray(memberRows)?memberRows.filter(row=>row.status==="ACTIVE"):[]);
      }catch{
        setMemberships([]);
      }
    }catch(e){
      setError(e instanceof ApiError?userErrorMessage(e.message,"Onay kuyruğu yüklenemedi."):"Onay kuyruğu yüklenemedi.");
    }finally{
      setLoading(false);
    }
  },[]);

  useEffect(()=>{void load()},[load]);
  useEffect(()=>{
    const timer=window.setInterval(()=>setClock(value=>value+1),1000);
    return()=>window.clearInterval(timer);
  },[]);

  const overdueCount=useMemo(()=>items.filter(item=>item.overdue||Boolean(item.dueAt&&new Date(item.dueAt).getTime()<=Date.now())).length,[items]);

  function openAction(item:ApprovalItem,kind:ActionKind){
    setSelected(item);
    setActionKind(kind);
    setComment("");
    setDelegateToUserId("");
    setError("");
  }

  function closeAction(){
    if(busy)return;
    setSelected(null);setActionKind(null);setComment("");setDelegateToUserId("");
  }

  function openResubmit(item:CorrectionItem){
    setCorrectionItem(item);
    setResubmitComment("");
    setError("");
  }

  function closeResubmit(){
    if(busy)return;
    setCorrectionItem(null);
    setResubmitComment("");
  }

  async function resubmitCorrection(){
    if(!correctionItem)return;
    if(!resubmitComment.trim()){
      setError("Yeniden gönderme açıklaması zorunludur.");
      return;
    }
    setBusy(true);setError("");setNotice("");
    try{
      await api("/admin/approval-workflows/runtime/requests/"+correctionItem.id+"/resubmit",{
        method:"POST",
        body:{comment:resubmitComment.trim()},
      });
      setNotice("Düzeltme tamamlandı ve talep yeniden onaya gönderildi.");
      closeResubmit();
      await load();
    }catch(e){
      setError(e instanceof ApiError?userErrorMessage(e.message,"Talep yeniden gönderilemedi."):"Talep yeniden gönderilemedi.");
    }finally{
      setBusy(false);
    }
  }

  async function submitAction(){
    if(!selected||!actionKind)return;
    if((actionKind==="REJECT"||actionKind==="RETURN")&&!comment.trim()){
      setError(actionKind==="REJECT"?"Ret nedeni zorunludur.":"Düzeltmeye gönderme nedeni zorunludur.");
      return;
    }
    if(actionKind==="DELEGATE"&&!delegateToUserId){
      setError("Onayın devredileceği kullanıcıyı seçin.");
      return;
    }
    setBusy(true);setError("");setNotice("");
    try{
      await api("/admin/approval-workflows/runtime/requests/"+selected.id+"/act",{
        method:"POST",
        body:{
          decision:actionKind,
          comment:comment.trim()||undefined,
          delegateToUserId:actionKind==="DELEGATE"?delegateToUserId:undefined,
        },
      });
      const message=actionKind==="APPROVE"
        ?"Onay adımı tamamlandı."
        :actionKind==="REJECT"
          ?"Talep reddedildi."
          :actionKind==="RETURN"
            ?"Talep düzeltme için sahibine gönderildi."
            :"Onay görevi seçilen kullanıcıya devredildi.";
      setNotice(message);
      closeAction();
      await load();
    }catch(e){
      setError(e instanceof ApiError?userErrorMessage(e.message,"Onay işlemi tamamlanamadı."):"Onay işlemi tamamlanamadı.");
    }finally{
      setBusy(false);
    }
  }

  if(loading&&!items.length)return <div className="flex min-h-[55vh] items-center justify-center"><Spinner label="Onay kuyruğu hazırlanıyor…"/></div>;

  return <main className="mx-auto w-full max-w-[1240px] space-y-6 pb-12">
    <PageHeader
      title="Onay Kuyruğu"
      description="Size atanan onay, düzeltme ve süreye bağlı karar görevlerini tek ekrandan yönetin."
    />

    {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}
    {notice?<Alert tone="success" onClose={()=>setNotice("")}>{notice}</Alert>:null}

    <section className="grid gap-3 sm:grid-cols-4">
      <Metric label="Bekleyen Onay" value={items.length}/>
      <Metric label="Süresi Aşan" value={overdueCount}/>
      <Metric label="Süre İçinde" value={Math.max(0,items.length-overdueCount)}/>
      <Metric label="Düzeltme Bekleyen" value={corrections.length}/>
    </section>

    {items.length?<section className="space-y-3">
      {items.map(item=>{
        const overdue=item.overdue||Boolean(item.dueAt&&new Date(item.dueAt).getTime()<=Date.now());
        return <article key={item.id} className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold text-[var(--ink)]">{item.currentStepName||"Onay Adımı"}</h2>
                  <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--accent)]">{userDomainLabel(item.domain)}</span>
                  {overdue?<span className="rounded-full bg-[var(--danger-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--danger)]">Süre Aşıldı</span>:null}
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">{userLabel(item.entityType)} · {item.entityId}</p>
              </div>
              {item.reason?<div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)]/55 px-3 py-2 text-xs text-[var(--muted)]"><strong className="text-[var(--ink)]">Talep nedeni:</strong> {item.reason}</div>:null}
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-[var(--muted)]">
                <span>Adım {item.currentStepOrder}</span>
                {item.amount?<span>Tutar: {Number(item.amount).toLocaleString("tr-TR")} ₺</span>:null}
                <span>Oluşturma: {new Date(item.createdAt).toLocaleString("tr-TR")}</span>
                <span className={overdue?"font-semibold text-[var(--danger)]":"font-semibold text-[var(--accent)]"}>{remainingLabel(item.dueAt,overdue)}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Button size="sm" onClick={()=>openAction(item,"APPROVE")}>Onayla</Button>
              <Button size="sm" variant="secondary" onClick={()=>openAction(item,"RETURN")}>Düzeltmeye Gönder</Button>
              <Button size="sm" variant="danger" onClick={()=>openAction(item,"REJECT")}>Reddet</Button>
              {memberships.length?<Button size="sm" variant="ghost" onClick={()=>openAction(item,"DELEGATE")}>Devret</Button>:null}
            </div>
          </div>
        </article>;
      })}
    </section>:<EmptyState title="Bekleyen onay yok" description="Şu anda size atanmış bir onay görevi bulunmuyor."/>}

    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-[var(--ink)]">Düzeltme Gereken Taleplerim</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">Onaylayan tarafından düzeltmeye gönderilen kendi taleplerinizi buradan yeniden onaya iletebilirsiniz.</p>
      </div>
      {corrections.length?corrections.map(item=><article key={item.id} className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-[var(--ink)]">{item.currentStepName||"Düzeltme Bekleyen Talep"}</h3>
                <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--accent)]">{userDomainLabel(item.domain)}</span>
                <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[10px] font-semibold text-[var(--muted)]">Düzeltme Bekliyor</span>
              </div>
              <p className="mt-1 text-xs text-[var(--muted)]">{userLabel(item.entityType)} · {item.entityId}</p>
            </div>
            {item.correctionReason?<div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)]/55 px-3 py-2 text-xs text-[var(--muted)]"><strong className="text-[var(--ink)]">Düzeltme nedeni:</strong> {item.correctionReason}</div>:null}
            {item.reason?<div className="text-[11px] text-[var(--muted)]"><strong className="text-[var(--ink)]">İlk talep nedeni:</strong> {item.reason}</div>:null}
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-[var(--muted)]">
              <span>Adım {item.currentStepOrder}</span>
              {item.correctionRequestedAt?<span>Düzeltme talebi: {new Date(item.correctionRequestedAt).toLocaleString("tr-TR")}</span>:null}
              <span>Son güncelleme: {new Date(item.updatedAt).toLocaleString("tr-TR")}</span>
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={()=>openResubmit(item)}>Düzelttim, Yeniden Gönder</Button>
          </div>
        </div>
      </article>):<EmptyState title="Düzeltme gereken talep yok" description="Şu anda size geri gönderilmiş bir talep bulunmuyor."/>}
    </section>

    <Modal
      open={Boolean(correctionItem)}
      onClose={closeResubmit}
      title="Düzeltmeyi Yeniden Gönder"
      description={correctionItem?((correctionItem.currentStepName||"Onay talebi")+" yeniden aynı onay adımına gönderilecek."):undefined}
    >
      <div className="space-y-4">
        {correctionItem?.correctionReason?<div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)]/55 px-3 py-2 text-xs text-[var(--muted)]"><strong className="text-[var(--ink)]">İstenen düzeltme:</strong> {correctionItem.correctionReason}</div>:null}
        <Field label="Yapılan Düzeltme Açıklaması" required>
          <TextArea
            rows={4}
            value={resubmitComment}
            onChange={event=>setResubmitComment(event.target.value)}
            placeholder="Hangi bilgiyi nasıl düzelttiğinizi açıklayın…"
          />
        </Field>
        <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4">
          <Button variant="secondary" disabled={busy} onClick={closeResubmit}>Vazgeç</Button>
          <Button disabled={busy||!resubmitComment.trim()} onClick={()=>void resubmitCorrection()}>
            {busy?"Gönderiliyor…":"Yeniden Onaya Gönder"}
          </Button>
        </div>
      </div>
    </Modal>

    <Modal
      open={Boolean(selected&&actionKind)}
      onClose={closeAction}
      title={actionKind?ACTION_LABELS[actionKind]:"Onay İşlemi"}
      description={selected?((selected.currentStepName||"Onay adımı")+" için kararınızı kaydedin."):undefined}
    >
      <div className="space-y-4">
        {actionKind==="DELEGATE"?<Field label="Devredilecek Kullanıcı" required>
          <ValooSelect
            value={delegateToUserId}
            onChange={setDelegateToUserId}
            searchPlaceholder="Kullanıcı ara…"
            placeholder="Kullanıcı seçin"
            options={memberships.map(row=>({
              value:row.user.id,
              label:(row.user.firstName+" "+row.user.lastName).trim()+" · "+row.role.name+" · "+row.user.email,
            }))}
          />
        </Field>:null}

        <Field
          label={actionKind==="REJECT"?"Ret Nedeni":actionKind==="RETURN"?"Düzeltme Nedeni":actionKind==="DELEGATE"?"Delegasyon Notu":"Onay Notu"}
          required={actionKind==="REJECT"||actionKind==="RETURN"}
        >
          <TextArea
            rows={4}
            value={comment}
            onChange={event=>setComment(event.target.value)}
            placeholder={actionKind==="REJECT"
              ?"Talebin neden reddedildiğini açıklayın…"
              :actionKind==="RETURN"
                ?"Hangi bilginin düzeltilmesi gerektiğini açıklayın…"
                :actionKind==="DELEGATE"
                  ?"İsteğe bağlı devir açıklaması…"
                  :"İsteğe bağlı onay notu…"}
          />
        </Field>

        <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4">
          <Button variant="secondary" disabled={busy} onClick={closeAction}>Vazgeç</Button>
          <Button
            variant={actionKind==="REJECT"?"danger":"primary"}
            disabled={
              busy||
              ((actionKind==="REJECT"||actionKind==="RETURN")&&!comment.trim())||
              (actionKind==="DELEGATE"&&!delegateToUserId)
            }
            onClick={()=>void submitAction()}
          >
            {busy?"İşleniyor…":actionKind?ACTION_LABELS[actionKind]:"Kaydet"}
          </Button>
        </div>
      </div>
    </Modal>
  </main>;
}

function Metric({label,value}:{label:string;value:number}){
  return <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4">
    <p className="text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--muted-soft)]">{label}</p>
    <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{value}</p>
  </div>;
}
