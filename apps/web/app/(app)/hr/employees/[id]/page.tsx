"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { userLabel } from "@/lib/user-language";

type AnyRow=Record<string,any>;
type Employee360={employee:AnyRow;organization:{current:AnyRow|null;history:AnyRow[]};attendance:AnyRow;leave:AnyRow;payroll:{recentPeriods:AnyRow[];recentPayments:AnyRow[]};performance:{appointments:AnyRow;recentAppointments:AnyRow[]}};
const money=(v:any)=>new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY",maximumFractionDigits:2}).format(Number(v||0));
const date=(v:any)=>v?new Date(v).toLocaleDateString("tr-TR"):"—";
const value=(v:any)=>v===null||v===undefined||v===""?"—":typeof v==="string"?userLabel(v):String(v);

export default function Employee360Page(){
 const {id}=useParams<{id:string}>(); const [data,setData]=useState<Employee360|null>(null); const [error,setError]=useState("");
 useEffect(()=>{let active=true;api<Employee360>(`/hr/employees/${id}/360`).then(x=>active&&setData(x)).catch(e=>active&&setError(e instanceof ApiError?e.message:"Personel 360 verileri yüklenemedi."));return()=>{active=false}},[id]);
 if(error)return <div className="mx-auto max-w-[1280px] py-6"><Alert>{error}</Alert></div>;
 if(!data)return <div className="flex h-72 items-center justify-center"><Spinner/></div>;
 const e=data.employee,o=data.organization.current,a=data.attendance,l=data.leave,p=data.performance.appointments;
 return <div className="mx-auto max-w-[1280px] space-y-5 pb-12">
  <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
   <div><Link href="/hr/employees" className="text-xs font-medium text-[var(--accent)]">← Çalışanlar</Link><p className="mt-4 text-[11px] font-semibold uppercase tracking-[.15em] text-[var(--muted-soft)]">Personel 360°</p><h1 className="mt-1 text-[30px] font-semibold tracking-[-.035em] text-[var(--ink)]">{e.firstName} {e.lastName}</h1><p className="mt-1 text-xs text-[var(--muted)]">{value(o?.positionName)} · {value(o?.departmentName)} · {value(e.branch?.name)}</p></div>
   <div className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-xs font-semibold text-[var(--ink)]">{userLabel(e.status||"ACTIVE")}</div>
  </header>
  <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">{[["Sicil No",e.personnelNumber],["İşe Giriş",date(e.hireDate)],["Çalışılan Süre",`${Math.round(Number(a.workedMinutes||0)/60)} saat`],["Onaylı İzin",`${Number(l.approvedDays||0)} gün`],["Hizmet Geliri",money(p.collectedRevenue)]].map(([k,v])=><div key={k} className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5"><p className="text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--muted-soft)]">{k}</p><p className="mt-2 text-xl font-semibold text-[var(--ink)]">{v}</p></div>)}</section>
  <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
   <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5"><Title t="Özlük ve İletişim"/><div className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2"><Field k="T.C. Kimlik No" v={e.identityNumber}/><Field k="E-Posta" v={e.email}/><Field k="Kişisel E-Posta" v={e.personalEmail}/><Field k="Telefon" v={e.phone}/><Field k="Doğum Tarihi" v={date(e.dateOfBirth)}/><Field k="Çalışma Tipi" v={e.employmentType}/><Field k="IBAN" v={e.iban}/><Field k="Banka" v={e.bankName}/><Field k="Brüt Maaş" v={money(e.grossSalary)}/><Field k="Adres" v={e.address}/></div></section>
   <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5"><Title t="Organizasyon"/><div className="mt-4 space-y-4"><Field k="Departman" v={o?.departmentName}/><Field k="Takım" v={o?.teamName}/><Field k="Pozisyon" v={o?.positionName}/><Field k="Yönetici" v={o?.managerFirstName?`${o.managerFirstName} ${o.managerLastName||""}`:null}/><Field k="Atama Başlangıcı" v={date(o?.effectiveFrom)}/></div></section>
  </div>
  <section className="grid gap-5 lg:grid-cols-3"><Metric title="Puantaj" rows={[["Kayıt",a.recordCount],["Mevcut",a.presentCount],["Fazla Mesai",`${Math.round(Number(a.overtimeMinutes||0)/60)} saat`],["Son Çalışma",date(a.lastWorkDate)]]}/><Metric title="İzin" rows={[["Talep",l.requestCount],["Onaylı",`${l.approvedDays||0} gün`],["Bekleyen",`${l.pendingDays||0} gün`],["Son İzin Bitişi",date(l.lastApprovedLeaveEnd)]]}/><Metric title="Performans" rows={[["Toplam Randevu",p.totalAppointments],["Tamamlanan",p.completedAppointments],["İptal",p.cancelledAppointments],["Tahsilat",money(p.collectedRevenue)]]}/></section>
  <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5"><Title t="Son Bordro Dönemleri"/><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead><tr className="border-b border-[var(--line)] text-[10px] uppercase text-[var(--muted-soft)]"><th className="py-3">Dönem</th><th>Durum</th><th>Brüt</th><th>Net</th><th>İşveren Maliyeti</th></tr></thead><tbody>{data.payroll.recentPeriods.map((r,i)=><tr key={i} className="border-b border-[var(--line)] last:border-0"><td className="py-3">{r.year}/{String(r.month).padStart(2,"0")}</td><td>{value(r.periodStatus)}</td><td>{money(r.grossAmount)}</td><td>{money(r.netAmount)}</td><td>{money(r.employerCost)}</td></tr>)}</tbody></table>{!data.payroll.recentPeriods.length?<p className="py-8 text-center text-xs text-[var(--muted)]">Bordro kaydı bulunmuyor.</p>:null}</div></section>
 </div>
}
function Title({t}:{t:string}){return <h2 className="text-sm font-semibold text-[var(--ink)]">{t}</h2>}
function Field({k,v}:{k:string;v:any}){return <div><p className="text-[10px] uppercase tracking-[.07em] text-[var(--muted-soft)]">{k}</p><p className="mt-1 text-xs font-medium text-[var(--ink)]">{value(v)}</p></div>}
function Metric({title,rows}:{title:string;rows:any[][]}){return <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5"><Title t={title}/><div className="mt-4 divide-y divide-[var(--line)]">{rows.map(([k,v])=><div key={k} className="flex items-center justify-between py-3 text-xs"><span className="text-[var(--muted)]">{k}</span><strong className="font-semibold text-[var(--ink)]">{value(v)}</strong></div>)}</div></section>}
