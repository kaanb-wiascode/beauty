"use client";

import { FormEvent, useEffect, useState } from "react";
import { Modal } from "@/components/modal";
import { Alert, Button, Field, Select, TextArea } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type LostReason = { id:string; code:string; label:string; description:string|null; isSystem:boolean; isActive:boolean; sortOrder:number };
type OpportunityLostDialogProps = { opportunityId:string; version:number; open:boolean; onClose:()=>void; onLost:()=>Promise<void>|void };

export function OpportunityLostDialog({opportunityId,version,open,onClose,onLost}:OpportunityLostDialogProps){
 const[reasons,setReasons]=useState<LostReason[]>([]),[reasonId,setReasonId]=useState(""),[note,setNote]=useState(""),[loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState("");
 useEffect(()=>{if(!open)return;let cancelled=false;setLoading(true);setError("");api<LostReason[]>("/crm/lost-reasons").then(rows=>{if(cancelled)return;const active=rows.filter(row=>row.isActive);setReasons(active);setReasonId(current=>current&&active.some(row=>row.id===current)?current:active[0]?.id??"");}).catch(requestError=>{if(!cancelled)setError(requestError instanceof ApiError?requestError.message:"Kayıp nedenleri yüklenemedi.");}).finally(()=>{if(!cancelled)setLoading(false);});return()=>{cancelled=true};},[open]);
 async function submit(event:FormEvent){event.preventDefault();if(!reasonId)return setError("Kayıp nedeni seçilmelidir.");setSaving(true);setError("");try{await api(`/crm/opportunities/${opportunityId}/lost`,{method:"POST",body:{version,lostReasonId:reasonId,...(note.trim()?{lostReasonNote:note.trim()}:{})}});}catch(requestError){setError(requestError instanceof ApiError?requestError.message:"Satış fırsatı kaybedildi olarak işaretlenemedi.");setSaving(false);return;}
  setNote("");onClose();setSaving(false);
  try{await onLost();}catch{/* Mutation succeeded. Parent refresh failure must not be reported as a failed LOST transition. */}
 }
 return <Modal open={open} onClose={saving?()=>undefined:onClose} title="Satış fırsatını kaybedildi olarak işaretle"><form className="space-y-4" onSubmit={submit}>{error?<Alert>{error}</Alert>:null}<Field label="Kayıp nedeni"><Select value={reasonId} onChange={event=>setReasonId(event.target.value)} disabled={loading||saving}><option value="">{loading?"Kayıp nedenleri yükleniyor...":"Kayıp nedeni seçin"}</option>{reasons.map(reason=><option key={reason.id} value={reason.id}>{reason.label}</option>)}</Select></Field><Field label="Açıklama" hint="İsteğe bağlı; görüşme veya karar bağlamını kaydedin."><TextArea value={note} onChange={event=>setNote(event.target.value)} rows={4} maxLength={2000} disabled={saving}/></Field><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Vazgeç</Button><Button type="submit" disabled={saving||loading||!reasonId}>{saving?"Kaydediliyor...":"Kaybedildi Olarak İşaretle"}</Button></div></form></Modal>;
}
