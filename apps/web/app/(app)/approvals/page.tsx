"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, EmptyState, Field, Modal, Spinner, TextArea } from "@/components/ui";
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
type QueueTab="approvals"|"corrections";
type SortMode="urgent"|"newest"|"oldest"|"amount";

const ACTION_LABELS:Record<ActionKind,string>={
  APPROVE:"Onayla",
  REJECT:"Reddet",
  RETURN:"Düzeltmeye Gönder",
  DELEGATE:"Devret",
};

function isOverdue(item:ApprovalItem,now:number){
  return Boolean(item.overdue||item.dueAt&&new Date(item.dueAt).getTime()<=now);
}

function remainingMs(item:ApprovalItem,now:number){
  if(!item.dueAt)return Number.POSITIVE_INFINITY;
  return new Date(item.dueAt).getTime()-now;
}

function isSoon(item:ApprovalItem,now:number){
  const diff=remainingMs(item,now);
  return diff>0&&diff<=60*60*1000;
}

function remainingLabel(dueAt:string|null|undefined,overdue:boolean|undefined,now:number){
  if(!dueAt)return "Süre sınırı yok";
  const diff=new Date(dueAt).getTime()-now;
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

function urgencyProgress(item:ApprovalItem,now:number){
  if(!item.dueAt||!item.currentStepStartedAt)return null;
  const start=new Date(item.currentStepStartedAt).getTime();
  const due=new Date(item.dueAt).getTime();
  if(!Number.isFinite(start)||!Number.isFinite(due)||due<=start)return null;
  const elapsed=Math.max(0,now-start);
  return Math.min(100,Math.round(elapsed/(due-start)*100));
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
  const[now,setNow]=useState(0);
  const[tab,setTab]=useState<QueueTab>("approvals");
  const[query,setQuery]=useState("");
  const[domainFilter,setDomainFilter]=useState("ALL");
  const[statusFilter,setStatusFilter]=useState<"ALL"|"OVERDUE"|"SOON">("ALL");
  const[sortMode,setSortMode]=useState<SortMode>("urgent");

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
      setError(e instanceof ApiError?userErrorMessage(e.message,"Onay merkezi yüklenemedi."):"Onay merkezi yüklenemedi.");
    }finally{
      setLoading(false);
    }
  },[]);

  useEffect(()=>{void load()},[load]);
  useEffect(()=>{
    setNow(Date.now());
    const timer=window.setInterval(()=>setNow(Date.now()),1000);
    return()=>window.clearInterval(timer);
  },[]);

  const overdueCount=useMemo(()=>items.filter(item=>isOverdue(item,now)).length,[items,now]);
  const soonCount=useMemo(()=>items.filter(item=>isSoon(item,now)).length,[items,now]);
  const domains=useMemo(()=>Array.from(new Set(items.map(item=>item.domain))).sort(),[items]);

  const filteredItems=useMemo(()=>{
    const normalized=query.trim().toLocaleLowerCase("tr-TR");
    const rows=items.filter(item=>{
      if(domainFilter!=="ALL"&&item.domain!==domainFilter)return false;
      if(statusFilter==="OVERDUE"&&!isOverdue(item,now))return false;
      if(statusFilter==="SOON"&&!isSoon(item,now))return false;
      if(!normalized)return true;
      const haystack=[
        item.currentStepName??"",
        item.reason??"",
        item.entityId,
        userDomainLabel(item.domain),
        userLabel(item.entityType),
        item.amount??"",
      ].join(" ").toLocaleLowerCase("tr-TR");
      return haystack.includes(normalized);
    });
    return [...rows].sort((a,b)=>{
      if(sortMode==="newest")return +new Date(b.createdAt)-+new Date(a.createdAt);
      if(sortMode==="oldest")return +new Date(a.createdAt)-+new Date(b.createdAt);
      if(sortMode==="amount")return Number(b.amount??0)-Number(a.amount??0);
      const aOver=isOverdue(a,now)?0:1;
      const bOver=isOverdue(b,now)?0:1;
      if(aOver!==bOver)return aOver-bOver;
      return remainingMs(a,now)-remainingMs(b,now);
    });
  },[items,query,domainFilter,statusFilter,sortMode,now]);

  const filteredCorrections=useMemo(()=>{
    const normalized=query.trim().toLocaleLowerCase("tr-TR");
    return corrections.filter(item=>{
      if(domainFilter!=="ALL"&&item.domain!==domainFilter)return false;
      if(!normalized)return true;
      const haystack=[
        item.currentStepName??"",
        item.reason??"",
        item.correctionReason??"",
        item.entityId,
        userDomainLabel(item.domain),
        userLabel(item.entityType),
      ].join(" ").toLocaleLowerCase("tr-TR");
      return haystack.includes(normalized);
    });
  },[corrections,query,domainFilter]);

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

  if(loading&&!items.length&&!corrections.length)return <div className="flex min-h-[55vh] items-center justify-center"><Spinner label="Onay merkezi hazırlanıyor…"/></div>;

  return <main className="mx-auto w-full max-w-[1380px] space-y-5 pb-12">
    <header className="flex flex-col gap-5 rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)] xl:flex-row xl:items-end xl:justify-between">
      <div>
        <p className="text-[12px] font-medium text-[var(--muted)]">Karar ve onay işlemleri</p>
        <h1 className="mt-1 text-[32px] font-semibold tracking-[-.045em] text-[var(--ink)]">Onay Merkezi</h1>
        <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--muted)]">Onayınızı bekleyen işlemleri öncelik, süre ve işlem alanına göre yönetin; düzeltmeye dönen talepleri aynı ekrandan yeniden gönderin.</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[var(--muted)]">Son güncelleme: şimdi</span>
        <Button variant="secondary" onClick={()=>void load()} disabled={loading}>{loading?"Güncelleniyor…":"Yenile"}</Button>
      </div>
    </header>

    {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}
    {notice?<Alert tone="success" onClose={()=>setNotice("")}>{notice}</Alert>:null}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard label="Karar Bekleyen" value={items.length} detail="Size atanmış açık onaylar" active={tab==="approvals"&&statusFilter==="ALL"} onClick={()=>{setTab("approvals");setStatusFilter("ALL")}}/>
      <SummaryCard label="Acil" value={overdueCount} detail="Süresi aşılmış işlemler" tone="danger" active={tab==="approvals"&&statusFilter==="OVERDUE"} onClick={()=>{setTab("approvals");setStatusFilter("OVERDUE")}}/>
      <SummaryCard label="Süresi Yaklaşan" value={soonCount} detail="60 dakika içinde sonuçlanmalı" tone="warning" active={tab==="approvals"&&statusFilter==="SOON"} onClick={()=>{setTab("approvals");setStatusFilter("SOON")}}/>
      <SummaryCard label="Düzeltmede" value={corrections.length} detail="Yeniden gönderilmeyi bekliyor" active={tab==="corrections"} onClick={()=>{setTab("corrections");setStatusFilter("ALL")}}/>
    </section>

    <section className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
      <div className="flex flex-col gap-4 border-b border-[var(--line)] p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex rounded-[12px] bg-[var(--surface-2)] p-1">
          <button type="button" onClick={()=>setTab("approvals")} className={`rounded-[9px] px-3 py-2 text-[11px] font-semibold transition ${tab==="approvals"?"bg-[var(--surface)] text-[var(--ink)] shadow-sm":"text-[var(--muted)]"}`}>Onay Bekleyenler <span className="ml-1 text-[9px]">{items.length}</span></button>
          <button type="button" onClick={()=>setTab("corrections")} className={`rounded-[9px] px-3 py-2 text-[11px] font-semibold transition ${tab==="corrections"?"bg-[var(--surface)] text-[var(--ink)] shadow-sm":"text-[var(--muted)]"}`}>Düzeltme Bekleyenler <span className="ml-1 text-[9px]">{corrections.length}</span></button>
        </div>

        <div className="flex flex-1 flex-col gap-2 sm:flex-row lg:max-w-[720px]">
          <input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Talep, işlem veya açıklama ara…" className="min-h-10 min-w-0 flex-1 rounded-[10px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[11px] text-[var(--ink)] outline-none placeholder:text-[var(--muted-soft)] focus:border-[var(--line-strong)]"/>
          <select value={sortMode} onChange={event=>setSortMode(event.target.value as SortMode)} className="min-h-10 rounded-[10px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[11px] text-[var(--ink)] outline-none">
            <option value="urgent">En acil</option>
            <option value="newest">En yeni</option>
            <option value="oldest">En eski</option>
            <option value="amount">En yüksek tutar</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-[var(--line)] px-4 py-3">
        <FilterChip label="Tümü" active={domainFilter==="ALL"} onClick={()=>setDomainFilter("ALL")}/>
        {domains.map(domain=><FilterChip key={domain} label={userDomainLabel(domain)} active={domainFilter===domain} onClick={()=>setDomainFilter(domain)}/>)}
      </div>

      <div className="p-4">
        {tab==="approvals" ? (
          filteredItems.length ? <div className="space-y-3">
            {filteredItems.map(item=><ApprovalCard key={item.id} item={item} now={now} memberships={memberships} onAction={openAction}/>)}
          </div> : <EmptyState title="Bu filtrede bekleyen onay yok" description="Filtreleri değiştirerek diğer onay görevlerini görüntüleyebilirsiniz."/>
        ) : (
          filteredCorrections.length ? <div className="space-y-3">
            {filteredCorrections.map(item=><CorrectionCard key={item.id} item={item} onResubmit={openResubmit}/>)}
          </div> : <EmptyState title="Düzeltme bekleyen talep yok" description="Şu anda bu filtreye uyan, size geri gönderilmiş bir talep bulunmuyor."/>
        )}
      </div>
    </section>

    <Modal
      open={Boolean(correctionItem)}
      onClose={closeResubmit}
      title="Düzeltmeyi Yeniden Gönder"
      description={correctionItem?((correctionItem.currentStepName||"Onay talebi")+" yeniden aynı onay adımına gönderilecek."):undefined}
    >
      <div className="space-y-4">
        {correctionItem?<DecisionContext domain={correctionItem.domain} entityType={correctionItem.entityType} reason={correctionItem.reason} amount={null}/>:null}
        {correctionItem?.correctionReason?<div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--muted)]"><strong className="text-[var(--ink)]">İstenen düzeltme:</strong> {correctionItem.correctionReason}</div>:null}
        <Field label="Yapılan Düzeltme Açıklaması" required>
          <TextArea rows={4} value={resubmitComment} onChange={event=>setResubmitComment(event.target.value)} placeholder="Hangi bilgiyi nasıl düzelttiğinizi açıklayın…"/>
        </Field>
        <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4">
          <Button variant="secondary" disabled={busy} onClick={closeResubmit}>Vazgeç</Button>
          <Button disabled={busy||!resubmitComment.trim()} onClick={()=>void resubmitCorrection()}>{busy?"Gönderiliyor…":"Yeniden Onaya Gönder"}</Button>
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
        {selected?<DecisionContext domain={selected.domain} entityType={selected.entityType} reason={selected.reason} amount={selected.amount}/>:null}

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
          label={actionKind==="REJECT"?"Ret Nedeni":actionKind==="RETURN"?"Düzeltme Nedeni":actionKind==="DELEGATE"?"Devir Notu":"Onay Notu"}
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
            disabled={busy||((actionKind==="REJECT"||actionKind==="RETURN")&&!comment.trim())||(actionKind==="DELEGATE"&&!delegateToUserId)}
            onClick={()=>void submitAction()}
          >
            {busy?"İşleniyor…":actionKind?ACTION_LABELS[actionKind]:"Kaydet"}
          </Button>
        </div>
      </div>
    </Modal>
  </main>;
}

function SummaryCard({label,value,detail,tone="neutral",active,onClick}:{label:string;value:number;detail:string;tone?:"neutral"|"warning"|"danger";active:boolean;onClick:()=>void}){
  return <button type="button" onClick={onClick} className={`rounded-[18px] border bg-[var(--surface)] p-4 text-left shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 ${active?"border-[var(--accent)] ring-2 ring-[var(--accent-soft)]":"border-[var(--line)] hover:border-[var(--line-strong)]"}`}>
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] font-medium text-[var(--muted)]">{label}</span>
      <span className={`h-2 w-2 rounded-full ${tone==="danger"?"bg-[var(--danger)]":tone==="warning"?"bg-[var(--warning)]":"bg-[var(--accent)]"}`}/>
    </div>
    <strong className="mt-3 block text-[24px] leading-none tracking-[-.04em] text-[var(--ink)]">{value}</strong>
    <span className="mt-2 block text-[9px] text-[var(--muted)]">{detail}</span>
  </button>;
}

function FilterChip({label,active,onClick}:{label:string;active:boolean;onClick:()=>void}){
  return <button type="button" onClick={onClick} className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold transition ${active?"border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]":"border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)]"}`}>{label}</button>;
}

function ApprovalCard({item,now,memberships,onAction}:{item:ApprovalItem;now:number;memberships:MembershipOption[];onAction:(item:ApprovalItem,kind:ActionKind)=>void}){
  const overdue=isOverdue(item,now);
  const soon=isSoon(item,now);
  const progress=urgencyProgress(item,now);
  const accent=overdue?"var(--danger)":soon?"var(--warning)":"var(--accent)";
  const amount=item.amount?Number(item.amount):null;
  return <article className="overflow-hidden rounded-[18px] border border-[var(--line)] bg-[var(--surface)]">
    <div className="grid grid-cols-[4px_minmax(0,1fr)]">
      <span style={{background:accent}}/>
      <div className="p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[14px] font-semibold text-[var(--ink)]">{item.currentStepName||"Onay Adımı"}</h2>
              <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[9px] font-semibold text-[var(--muted)]">{userDomainLabel(item.domain)}</span>
              {overdue?<span className="rounded-full bg-[var(--danger-soft)] px-2.5 py-1 text-[9px] font-semibold text-[var(--danger)]">Süre Aşıldı</span>:soon?<span className="rounded-full bg-[var(--warning-soft)] px-2.5 py-1 text-[9px] font-semibold text-[var(--warning)]">Süresi Yaklaşıyor</span>:null}
            </div>
            <p className="mt-1 text-[10px] text-[var(--muted)]">{userLabel(item.entityType)} · Adım {item.currentStepOrder}</p>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <MiniFact label="İşlem" value={userLabel(item.entityType)}/>
              <MiniFact label="Tutar" value={amount==null?"—":amount.toLocaleString("tr-TR")+" ₺"}/>
              <MiniFact label="Oluşturma" value={new Date(item.createdAt).toLocaleString("tr-TR",{dateStyle:"short",timeStyle:"short"})}/>
            </div>

            {item.reason?<div className="mt-3 rounded-[12px] bg-[var(--surface-2)] px-3 py-2.5 text-[10px] leading-5 text-[var(--muted)]"><strong className="text-[var(--ink)]">Talep nedeni:</strong> {item.reason}</div>:null}

            <div className="mt-3">
              <div className="flex items-center justify-between gap-3 text-[9px]">
                <span className="text-[var(--muted)]">Karar süresi</span>
                <strong style={{color:accent}}>{remainingLabel(item.dueAt,overdue,now)}</strong>
              </div>
              {progress!=null?<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]"><span className="block h-full rounded-full transition-[width]" style={{width:Math.max(2,progress)+"%",background:accent}}/></div>:null}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2 xl:max-w-[330px] xl:justify-end">
            <Button size="sm" onClick={()=>onAction(item,"APPROVE")}>Onayla</Button>
            <Button size="sm" variant="secondary" onClick={()=>onAction(item,"RETURN")}>Düzeltmeye Gönder</Button>
            <Button size="sm" variant="danger" onClick={()=>onAction(item,"REJECT")}>Reddet</Button>
            {memberships.length?<Button size="sm" variant="ghost" onClick={()=>onAction(item,"DELEGATE")}>Devret</Button>:null}
          </div>
        </div>
      </div>
    </div>
  </article>;
}

function CorrectionCard({item,onResubmit}:{item:CorrectionItem;onResubmit:(item:CorrectionItem)=>void}){
  return <article className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[14px] font-semibold text-[var(--ink)]">{item.currentStepName||"Düzeltme Bekleyen Talep"}</h3>
          <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[9px] font-semibold text-[var(--muted)]">{userDomainLabel(item.domain)}</span>
          <span className="rounded-full bg-[var(--warning-soft)] px-2.5 py-1 text-[9px] font-semibold text-[var(--warning)]">Düzeltme Bekliyor</span>
        </div>
        <p className="mt-1 text-[10px] text-[var(--muted)]">{userLabel(item.entityType)} · Adım {item.currentStepOrder}</p>
        {item.correctionReason?<div className="mt-3 rounded-[12px] bg-[var(--surface-2)] px-3 py-2.5 text-[10px] leading-5 text-[var(--muted)]"><strong className="text-[var(--ink)]">İstenen düzeltme:</strong> {item.correctionReason}</div>:null}
        {item.reason?<p className="mt-2 text-[10px] text-[var(--muted)]"><strong className="text-[var(--ink)]">İlk talep nedeni:</strong> {item.reason}</p>:null}
        <div className="mt-3 flex flex-wrap gap-4 text-[9px] text-[var(--muted)]">
          {item.correctionRequestedAt?<span>Düzeltme talebi: {new Date(item.correctionRequestedAt).toLocaleString("tr-TR")}</span>:null}
          <span>Son güncelleme: {new Date(item.updatedAt).toLocaleString("tr-TR")}</span>
        </div>
      </div>
      <Button size="sm" onClick={()=>onResubmit(item)}>Düzelttim, Yeniden Gönder</Button>
    </div>
  </article>;
}

function MiniFact({label,value}:{label:string;value:string}){
  return <div><span className="block text-[8px] font-medium text-[var(--muted-soft)]">{label}</span><strong className="mt-1 block truncate text-[10px] font-semibold text-[var(--ink)]">{value}</strong></div>;
}

function DecisionContext({domain,entityType,reason,amount}:{domain:string;entityType:string;reason?:string|null;amount?:string|null}){
  return <div className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] p-3">
    <div className="grid gap-3 sm:grid-cols-2">
      <MiniFact label="İşlem Alanı" value={userDomainLabel(domain)}/>
      <MiniFact label="İşlem Türü" value={userLabel(entityType)}/>
      {amount?<MiniFact label="Tutar" value={Number(amount).toLocaleString("tr-TR")+" ₺"}/>:null}
      {reason?<div className="sm:col-span-2"><span className="block text-[8px] font-medium text-[var(--muted-soft)]">Talep Nedeni</span><p className="mt-1 text-[10px] leading-5 text-[var(--ink)]">{reason}</p></div>:null}
    </div>
  </div>;
}
