"use client";

import { CardInfo } from "@/components/card-info";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, EmptyState, PageHeader, Select, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { getCardHelp } from "@/lib/card-help";
import { hasActiveBranch, hasPermission } from "@/lib/auth";
import type { Appointment, Paginated } from "@/lib/types";
import { useOperationRealtime } from "@/lib/use-operation-realtime";

type Session={id:string;status:"AVAILABLE"|"RESERVED"|"CONSUMED"|"CANCELLED";appointmentId:string|null;service:{id:string;name:string};customerPackage:{id:string;customer:{id:string;firstName:string;lastName:string};package:{id:string;name:string}};consumedAt?:string|null};
const labels:Record<string,string>={AVAILABLE:"Kullanılabilir",RESERVED:"Rezerve",CONSUMED:"Kullanıldı",CANCELLED:"İptal"};
export default function SessionsPage(){
 const canReserve=hasPermission("sessions","reserve");
 const canRelease=hasPermission("sessions","release");
 const canConsume=hasPermission("sessions","consume");
 const canCancel=hasPermission("sessions","cancel");
 const[rows,setRows]=useState<Session[]>([]),[appointments,setAppointments]=useState<Appointment[]>([]),[status,setStatus]=useState(""),[loading,setLoading]=useState(true),[working,setWorking]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[appointmentId,setAppointmentId]=useState<Record<string,string>>({});
 const load=useCallback(async()=>{
   if(!hasActiveBranch()){
     setRows([]);setAppointments([]);setLoading(false);setError("Seans yönetimi için önce aktif bir şube seçin.");return;
   }
   setLoading(true);setError("");
   const q=status?`?status=${status}`:"";
   const[r,a]=await Promise.allSettled([
     api<Session[]>(`/sessions${q}`),
     api<Paginated<Appointment>>("/appointments?page=1&limit=200"),
   ]);
   const errors:string[]=[];
   if(r.status==="fulfilled")setRows(Array.isArray(r.value)?r.value:[]);else{setRows([]);errors.push(r.reason instanceof ApiError?r.reason.message:"Seanslar yüklenemedi.");}
   if(a.status==="fulfilled")setAppointments(Array.isArray(a.value.data)?a.value.data:[]);else{setAppointments([]);errors.push(a.reason instanceof ApiError?a.reason.message:"Randevular yüklenemedi.");}
   if(errors.length)setError(Array.from(new Set(errors)).join(" "));
   setLoading(false);
 },[status]);
 useEffect(()=>{void load()},[load]);
 useOperationRealtime((event)=>{
   if(event.aggregateType==="session"||event.aggregateType==="appointment"||event.aggregateType==="service_execution") void load();
 });
 async function action(id:string,kind:"reserve"|"release"|"consume"|"cancel"){setWorking(true);setError("");try{await api(`/sessions/${id}/${kind}`,{method:"POST",body:kind==="reserve"?{appointmentId:appointmentId[id]}:undefined});setNotice(kind==="reserve"?"Seans randevuya rezerve edildi.":kind==="release"?"Seans rezervasyonu kaldırıldı.":kind==="consume"?"Seans kullanıldı olarak işlendi.":"Seans iptal edildi.");await load()}catch(e){setError(e instanceof ApiError?e.message:"Seans işlemi tamamlanamadı.")}finally{setWorking(false)}}
 const stats=useMemo(()=>({total:rows.length,available:rows.filter(x=>x.status==="AVAILABLE").length,reserved:rows.filter(x=>x.status==="RESERVED").length,consumed:rows.filter(x=>x.status==="CONSUMED").length}),[rows]);
 return <div className="mx-auto max-w-[1450px] space-y-6 pb-12"><PageHeader title="Seans Yönetimi" description="Satılmış paketlerdeki hizmet kullanım haklarını randevularla eşleştirin ve tüketim durumlarını yönetin."/>
 {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}{notice?<Alert tone="success" onClose={()=>setNotice("")}>{notice}</Alert>:null}
 <section className="grid gap-3 sm:grid-cols-4"><Metric label="Toplam" value={stats.total}/><Metric label="Kullanılabilir" value={stats.available}/><Metric label="Rezerve" value={stats.reserved}/><Metric label="Kullanılmış" value={stats.consumed}/></section>
 <div className="max-w-xs"><Select value={status} onChange={e=>setStatus(e.target.value)}><option value="">Tüm durumlar</option><option value="AVAILABLE">Kullanılabilir</option><option value="RESERVED">Rezerve</option><option value="CONSUMED">Kullanıldı</option><option value="CANCELLED">İptal</option></Select></div>
 {loading?<Spinner label="Seanslar yükleniyor..."/>:rows.length?<section className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)]"><div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-xs"><thead><tr className="border-b border-[var(--line)] bg-[var(--surface-2)]/40"><th className="px-4 py-3">Müşteri</th><th className="px-4 py-3">Paket</th><th className="px-4 py-3">Hizmet</th><th className="px-4 py-3">Durum</th><th className="px-4 py-3">Randevu</th><th className="px-4 py-3">İşlem</th></tr></thead><tbody>{rows.map(s=><tr key={s.id} className="border-b border-[var(--line)] last:border-0"><td className="px-4 py-4 font-medium">{s.customerPackage.customer.firstName} {s.customerPackage.customer.lastName}</td><td className="px-4 py-4">{s.customerPackage.package.name}</td><td className="px-4 py-4">{s.service.name}</td><td className="px-4 py-4">{labels[s.status]??s.status}</td><td className="px-4 py-4">{s.status==="AVAILABLE"?<Select value={appointmentId[s.id]??""} onChange={e=>setAppointmentId({...appointmentId,[s.id]:e.target.value})}><option value="">Uygun randevu seçin</option>{appointments.filter(a=>a.customerId===s.customerPackage.customer.id&&a.serviceId===s.service.id&&(a.status==="SCHEDULED"||a.status==="CONFIRMED")).map(a=><option key={a.id} value={a.id}>{new Date(a.startAt).toLocaleString("tr-TR")} · {a.status==="CONFIRMED"?"Onaylandı":"Planlandı"}</option>)}</Select>:s.appointmentId?"Randevuya bağlı":"—"}</td><td className="px-4 py-4"><div className="flex flex-wrap gap-2">{s.status==="AVAILABLE"?<>{canReserve?<Button size="sm" disabled={working||!appointmentId[s.id]} onClick={()=>void action(s.id,"reserve")}>Randevuya Ata</Button>:null}{canCancel?<Button size="sm" variant="danger" disabled={working} onClick={()=>void action(s.id,"cancel")}>İptal</Button>:null}</>:null}{s.status==="RESERVED"?<>{canRelease?<Button size="sm" variant="secondary" disabled={working} onClick={()=>void action(s.id,"release")}>Rezervasyonu Kaldır</Button>:null}{canConsume?<Button size="sm" disabled={working} onClick={()=>void action(s.id,"consume")}>Kullanıldı Olarak İşle</Button>:null}</>:null}</div></td></tr>)}</tbody></table></div></section>:<EmptyState title="Seans bulunamadı" description="Filtreye uyan paket seansı bulunmuyor."/>}
 </div>
}
function Metric({label,value}:{label:string;value:string|number}){return <div className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-4"><div className="flex items-start justify-between gap-3"><p className="text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--muted-soft)]">{label}</p><CardInfo help={getCardHelp(label)} /></div><p className="mt-2 text-xl font-semibold">{value}</p></div>}
