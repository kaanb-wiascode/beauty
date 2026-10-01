"use client";

import { CardInfo } from "@/components/card-info";
import { getCardHelp } from "@/lib/card-help";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Field, Modal, TextArea } from "@/components/ui";
import { ValooSelect } from "@/components/valoo-controls";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/toast";
import { userDomainLabel, userLabel, userPermissionKeyLabel } from "@/lib/user-language";

type Decision="APPROVE"|"REJECT"|"RETURN";
type ApprovalRequest={id:string;workflowKey:string;workflowVersion:number;domain:string;entityType:string;entityId:string;status:string;currentStepOrder:number;currentStepName:string|null;approverPermission:string|null;approverRoleSlug:string|null;approverType?:string|null;approverValue?:string|null;slaMinutes?:number|null;dueAt?:string|null;overdue?:boolean;reason:string|null;createdAt:string};

const APPROVER_LABELS:Record<string,string>={DIRECT_MANAGER:"Doğrudan Yönetici",MANAGER:"Doğrudan Yönetici",BRANCH_MANAGER:"Şube Müdürü",REGIONAL_MANAGER:"Bölge Müdürü",DEPARTMENT_MANAGER:"Departman Müdürü",ORGANIZATION_MANAGER:"Organizasyon Yöneticisi",ROLE:"Rol Bazlı Onay",PERMISSION:"Yetki Bazlı Onay",USER:"Belirli Kullanıcı"};

export default function ApprovalInboxPage(){
 const {showToast}=useToast();
 const [rows,setRows]=useState<ApprovalRequest[]>([]),[status,setStatus]=useState("PENDING"),[loading,setLoading]=useState(true),[busy,setBusy]=useState<string|null>(null),[error,setError]=useState("");
 const [actionRow,setActionRow]=useState<ApprovalRequest|null>(null),[decision,setDecision]=useState<Decision|null>(null),[comment,setComment]=useState("");
 const [now,setNow]=useState(0);
 const load=useCallback(async()=>{setLoading(true);setError("");try{const suffix=status?"?status="+encodeURIComponent(status):"";setRows(await api<ApprovalRequest[]>("/admin/approval-workflows/runtime/inbox"+suffix));}catch(e){setError(e instanceof ApiError?e.message:"Onay talepleri yüklenemedi.");}finally{setLoading(false)}},[status]);
 useEffect(()=>{void load()},[load]);
 useEffect(()=>{setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[]);
 const pending=useMemo(()=>rows.filter(x=>x.status==="PENDING").length,[rows]);
 const overdue=useMemo(()=>rows.filter(x=>x.status==="PENDING"&&x.overdue).length,[rows]);

 function openAction(row:ApprovalRequest,next:Decision){setActionRow(row);setDecision(next);setComment("")}
 async function submitAction(){if(!actionRow||!decision)return;if((decision==="REJECT"||decision==="RETURN")&&!comment.trim()){setError(decision==="REJECT"?"Ret nedeni zorunludur.":"Düzeltmeye gönderme nedeni zorunludur.");return}setBusy(actionRow.id);setError("");try{await api("/admin/approval-workflows/runtime/requests/"+actionRow.id+"/act",{method:"POST",body:{decision,comment:comment.trim()||undefined}});showToast(decision==="APPROVE"?"Talep onaylandı.":decision==="REJECT"?"Talep reddedildi.":"Talep düzeltmeye gönderildi.");setActionRow(null);setDecision(null);setComment("");await load();}catch(e){setError(e instanceof ApiError?e.message:"İşlem tamamlanamadı.");}finally{setBusy(null)}}

 return <main className="mx-auto w-full max-w-[1240px] space-y-6 pb-10">
  <header className="border-b border-[var(--line)] pb-5"><div className="mb-1 text-xs font-medium text-[var(--muted)]">Yönetim / Onaylar</div><h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[var(--ink)]">Onay Kutusu</h1><p className="mt-1 text-sm text-[var(--muted)]">Yalnız sizin karar verebileceğiniz talepleri, kalan karar süreleriyle birlikte görüntüleyin.</p></header>
  {error?<div className="rounded-xl border border-[#f0d8d8] bg-[#fff8f8] px-4 py-3 text-sm text-[#9a4545]">{error}</div>:null}
  <section className="grid gap-3 sm:grid-cols-3">
   <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"><div className="flex items-start justify-between gap-3"><div className="text-xs text-[var(--muted)]">Bekleyen</div><CardInfo help={getCardHelp("Bekleyen Onay","Sizin karar vermeniz gereken bekleyen onay talepleridir.")}/></div><div className="mt-1 text-2xl font-semibold">{pending}</div></div>
   <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"><div className="text-xs text-[var(--muted)]">Süresi Aşan</div><div className="mt-1 text-2xl font-semibold">{overdue}</div></div>
   <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"><Field label="Durum"><ValooSelect value={status} onChange={setStatus} searchable={false} options={[{value:"PENDING",label:"Bekleyen"},{value:"APPROVED",label:"Onaylanan"},{value:"REJECTED",label:"Reddedilen"},{value:"RETURNED",label:"Düzeltmeye Gönderilen"},{value:"",label:"Tümü"}]}/></Field></div>
  </section>
  <section className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
   {loading?<div className="p-8 text-sm text-[var(--muted)]">Yükleniyor…</div>:<table className="w-full min-w-[1080px] text-left text-sm">
    <thead className="border-b border-[var(--line)] bg-[var(--surface-2)] text-xs text-[var(--muted)]"><tr><th className="px-4 py-3">Onay Akışı</th><th className="px-4 py-3">Kayıt</th><th className="px-4 py-3">Onay Adımı</th><th className="px-4 py-3">Karar Süresi</th><th className="px-4 py-3">Durum</th><th className="px-4 py-3 text-right">İşlem</th></tr></thead>
    <tbody>{rows.map(row=><tr key={row.id} className="border-b border-[var(--line)] last:border-0">
     <td className="px-4 py-4"><div className="font-medium">{userDomainLabel(row.domain)} Onayı</div><div className="text-xs text-[var(--muted)]">Sürüm {row.workflowVersion}</div></td>
     <td className="px-4 py-4"><div>{userLabel(row.entityType)}</div><div className="mt-1 max-w-[180px] truncate text-xs text-[var(--muted)]">{row.entityId}</div></td>
     <td className="px-4 py-4"><div>{row.currentStepName??"Adım "+row.currentStepOrder}</div><div className="text-xs text-[var(--muted)]">{approverLabel(row)}</div></td>
     <td className="px-4 py-4">{row.status==="PENDING"?<SlaLabel dueAt={row.dueAt} overdue={row.overdue===true} now={now}/>:<span className="text-xs text-[var(--muted)]">—</span>}</td>
     <td className="px-4 py-4">{userLabel(row.status)}</td>
     <td className="px-4 py-4"><div className="flex justify-end gap-2">{row.status==="PENDING"?<><Button size="sm" disabled={busy===row.id} onClick={()=>openAction(row,"APPROVE")}>Onayla</Button><Button size="sm" variant="secondary" disabled={busy===row.id} onClick={()=>openAction(row,"RETURN")}>Düzeltmeye Gönder</Button><Button size="sm" variant="danger" disabled={busy===row.id} onClick={()=>openAction(row,"REJECT")}>Reddet</Button></>:null}</div></td>
    </tr>)}{!rows.length?<tr><td colSpan={6} className="px-4 py-10 text-center text-[var(--muted)]">Bu filtrede size atanmış onay talebi bulunmuyor.</td></tr>:null}</tbody>
   </table>}
  </section>
  <Modal open={Boolean(actionRow&&decision)} onClose={()=>{if(!busy){setActionRow(null);setDecision(null);setComment("")}}} title={decision==="APPROVE"?"Talebi Onayla":decision==="REJECT"?"Talebi Reddet":"Düzeltmeye Gönder"} description={actionRow?(actionRow.currentStepName??"Onay adımı")+" için kararınızı kaydedin.":undefined}>
   <div className="space-y-4"><Field label={decision==="APPROVE"?"Onay Notu":"Neden"} required={decision!=="APPROVE"}><TextArea rows={4} value={comment} onChange={e=>setComment(e.target.value)} placeholder={decision==="APPROVE"?"İsteğe bağlı not…":"Kararın nedenini yazın…"}/></Field><div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4"><Button variant="secondary" disabled={Boolean(busy)} onClick={()=>{setActionRow(null);setDecision(null);setComment("")}}>Vazgeç</Button><Button variant={decision==="REJECT"?"danger":"primary"} disabled={Boolean(busy)||(decision!=="APPROVE"&&!comment.trim())} onClick={()=>void submitAction()}>{busy?"İşleniyor…":decision==="APPROVE"?"Onayla":decision==="REJECT"?"Reddet":"Düzeltmeye Gönder"}</Button></div></div>
  </Modal>
 </main>
}

function approverLabel(row:ApprovalRequest){if(row.approverType&&APPROVER_LABELS[row.approverType])return APPROVER_LABELS[row.approverType];if(row.approverPermission)return userPermissionKeyLabel(row.approverPermission);if(row.approverRoleSlug)return "Rol bazlı onay";return "Yetkili onaylayan"}
function SlaLabel({dueAt,overdue,now}:{dueAt?:string|null;overdue:boolean;now:number}){if(!dueAt)return <span className="text-xs text-[var(--muted)]">Süre sınırı yok</span>;const diff=new Date(dueAt).getTime()-now;if(overdue||diff<=0)return <span className="text-xs font-semibold text-[var(--danger)]">Süre aşıldı</span>;const total=Math.floor(diff/1000),minutes=Math.floor(total/60),seconds=total%60;return <span className="text-xs font-semibold text-[var(--ink)]">{minutes}:{String(seconds).padStart(2,"0")} kaldı</span>}
