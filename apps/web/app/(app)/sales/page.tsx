"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Modal } from "@/components/modal";
import { Alert, Button, EmptyState, Field, PageHeader, Select, Spinner, TextArea, TextInput } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type Customer={id:string;firstName:string;lastName:string;phone?:string|null};
type Service={id:string;name:string;price:number|string;status?:string};
type Package={id:string;name:string;price:number|string;active:boolean};
type SaleItem={id:string;type:"SERVICE"|"PACKAGE";serviceId:string|null;packageId:string|null;description:string;quantity:number;unitPrice:number|string;lineTotal:number|string};
type SalePayment={id:string;amount:number|string;method:"CASH"|"CARD"|"TRANSFER";status:string;reference:string|null;note:string|null;paidAt:string;refundReason?:string|null};
type Installment={id:string;sequence:number;dueAt:string;amount:number|string;paidAmount:number|string;status:string};
type Sale={
 id:string;customerId:string;status:string;subtotal:number|string;discountTotal:number|string;total:number|string;createdAt:string;confirmedAt?:string|null;
 customer:Customer;items:SaleItem[];payments:SalePayment[];installmentPlan?:{id:string;installmentCount:number;installments:Installment[]}|null;
};
type PaymentSummary={saleId:string;saleStatus:string;total:number;paid:number;balance:number;paymentStatus:string};
type LineDraft={type:"SERVICE"|"PACKAGE";referenceId:string;quantity:string};

const money=(v:number|string|null|undefined)=>new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY",maximumFractionDigits:2}).format(Number(v??0));
const date=(v:string)=>new Date(v).toLocaleDateString("tr-TR");
const statusLabels:Record<string,string>={DRAFT:"Taslak",CONFIRMED:"Onaylandı",CANCELLED:"İptal",COMPLETED:"Tamamlandı",REFUNDED:"İade Edildi",UNPAID:"Ödenmedi",PARTIALLY_PAID:"Kısmen Ödendi",PAID:"Ödendi",PENDING:"Bekliyor"};

export default function SalesPage(){
 const[sales,setSales]=useState<Sale[]>([]),[customers,setCustomers]=useState<Customer[]>([]),[services,setServices]=useState<Service[]>([]),[packages,setPackages]=useState<Package[]>([]);
 const[loading,setLoading]=useState(true),[working,setWorking]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const[createOpen,setCreateOpen]=useState(false),[selectedId,setSelectedId]=useState(""),[selected,setSelected]=useState<Sale|null>(null),[summary,setSummary]=useState<PaymentSummary|null>(null);
 const[customerId,setCustomerId]=useState(""),[discount,setDiscount]=useState("0"),[lines,setLines]=useState<LineDraft[]>([{type:"SERVICE",referenceId:"",quantity:"1"}]);
 const[paymentAmount,setPaymentAmount]=useState(""),[paymentMethod,setPaymentMethod]=useState<"CASH"|"CARD"|"TRANSFER">("CARD"),[paymentReference,setPaymentReference]=useState(""),[paymentNote,setPaymentNote]=useState("");
 const[installmentCount,setInstallmentCount]=useState("2"),[firstDueAt,setFirstDueAt]=useState(new Date().toISOString().slice(0,10)),[intervalMonths,setIntervalMonths]=useState("1");

 const load=useCallback(async()=>{setLoading(true);setError("");try{
   const[s,c,sv,p]=await Promise.all([
    api<Sale[]>("/sales"),
    api<{data:Customer[]}>("/customers?limit=100"),
    api<Service[]>("/services?limit=200"),
    api<Package[]>("/packages"),
   ]);
   setSales(Array.isArray(s)?s:[]);setCustomers(Array.isArray(c.data)?c.data:[]);setServices(Array.isArray(sv)?sv:[]);setPackages(Array.isArray(p)?p:[]);
 }catch(e){setError(e instanceof ApiError?e.message:"Satış verileri yüklenemedi.")}finally{setLoading(false)}},[]);
 useEffect(()=>{void load()},[load]);

 const openDetail=useCallback(async(id:string)=>{setSelectedId(id);setWorking(true);setError("");try{
   const[detail,paymentSummary]=await Promise.all([api<Sale>(`/sales/${id}`),api<PaymentSummary>(`/sales/${id}/payment-summary`)]);
   setSelected(detail);setSummary(paymentSummary);setPaymentAmount(String(paymentSummary.balance||""));
 }catch(e){setError(e instanceof ApiError?e.message:"Satış detayı yüklenemedi.")}finally{setWorking(false)}},[]);

 async function createSale(event:FormEvent){event.preventDefault();if(!customerId||lines.some(l=>!l.referenceId||Number(l.quantity)<=0)){setError("Müşteri ve tüm satış kalemleri zorunludur.");return}setWorking(true);setError("");try{
   await api("/sales",{method:"POST",body:{customerId,discountTotal:Number(discount||0),items:lines.map(l=>({type:l.type,referenceId:l.referenceId,quantity:Number(l.quantity)}))}});
   setCreateOpen(false);setCustomerId("");setDiscount("0");setLines([{type:"SERVICE",referenceId:"",quantity:"1"}]);setNotice("Satış taslağı oluşturuldu.");await load();
 }catch(e){setError(e instanceof ApiError?e.message:"Satış oluşturulamadı.")}finally{setWorking(false)}}

 async function saleAction(action:"confirm"|"cancel"){if(!selected)return;setWorking(true);setError("");try{await api(`/sales/${selected.id}/${action}`,{method:"POST"});setNotice(action==="confirm"?"Satış onaylandı.":"Satış iptal edildi.");await load();await openDetail(selected.id)}catch(e){setError(e instanceof ApiError?e.message:"Satış işlemi tamamlanamadı.")}finally{setWorking(false)}}
 async function addPayment(event:FormEvent){event.preventDefault();if(!selected||Number(paymentAmount)<=0)return;setWorking(true);setError("");try{
   await api(`/sales/${selected.id}/payments`,{method:"POST",body:{amount:Number(paymentAmount),method:paymentMethod,...(paymentReference.trim()?{reference:paymentReference.trim()}:{}),...(paymentNote.trim()?{note:paymentNote.trim()}:{})}});
   setPaymentReference("");setPaymentNote("");setNotice("Satış ödemesi kaydedildi.");await load();await openDetail(selected.id);
 }catch(e){setError(e instanceof ApiError?e.message:"Ödeme kaydedilemedi.")}finally{setWorking(false)}}
 async function refund(payment:SalePayment){if(!selected)return;const reason=window.prompt("İade nedeni");if(!reason?.trim())return;setWorking(true);setError("");try{
   await api(`/sales/${selected.id}/payments/${payment.id}/refund`,{method:"POST",body:{reason:reason.trim()}});
   setNotice("Ödeme iadesi işlendi.");await load();await openDetail(selected.id);
 }catch(e){setError(e instanceof ApiError?e.message:"İade işlemi tamamlanamadı.")}finally{setWorking(false)}}
 async function createInstallment(event:FormEvent){event.preventDefault();if(!selected)return;setWorking(true);setError("");try{
   await api(`/sales/${selected.id}/installment-plan`,{method:"POST",body:{installmentCount:Number(installmentCount),firstDueAt,intervalMonths:Number(intervalMonths)}});
   setNotice("Taksit planı oluşturuldu.");await openDetail(selected.id);
 }catch(e){setError(e instanceof ApiError?e.message:"Taksit planı oluşturulamadı.")}finally{setWorking(false)}}

 const totals=useMemo(()=>({count:sales.length,total:sales.reduce((sum,s)=>sum+Number(s.total||0),0),confirmed:sales.filter(s=>s.status==="CONFIRMED").length}),[sales]);

 if(loading&&!sales.length)return <Spinner label="Satış merkezi hazırlanıyor..."/>;
 return <div className="mx-auto max-w-[1500px] space-y-6 pb-12">
  <PageHeader title="Satış Yönetimi" description="Hizmet ve paket satışlarını, tahsilatları, iadeleri ve taksit planlarını tek merkezden yönetin." action={<Button onClick={()=>setCreateOpen(true)}>+ Yeni Satış</Button>}/>
  {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}{notice?<Alert tone="success" onClose={()=>setNotice("")}>{notice}</Alert>:null}
  <section className="grid gap-3 sm:grid-cols-3"><Metric label="Satış Sayısı" value={totals.count}/><Metric label="Satış Toplamı" value={money(totals.total)}/><Metric label="Onaylı Satış" value={totals.confirmed}/></section>
  <section className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)]">
   {sales.length?<div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-xs"><thead><tr className="border-b border-[var(--line)] bg-[var(--surface-2)]/40"><th className="px-4 py-3">Tarih</th><th className="px-4 py-3">Müşteri</th><th className="px-4 py-3">Kalem</th><th className="px-4 py-3">İndirim</th><th className="px-4 py-3">Toplam</th><th className="px-4 py-3">Durum</th><th className="px-4 py-3"></th></tr></thead><tbody>
   {sales.map(s=><tr key={s.id} className="border-b border-[var(--line)] last:border-0"><td className="px-4 py-4 text-[var(--muted)]">{date(s.createdAt)}</td><td className="px-4 py-4 font-medium">{s.customer?.firstName} {s.customer?.lastName}</td><td className="px-4 py-4 text-[var(--muted)]">{s.items?.length??0}</td><td className="px-4 py-4">{money(s.discountTotal)}</td><td className="px-4 py-4 font-semibold">{money(s.total)}</td><td className="px-4 py-4">{statusLabels[s.status]??s.status}</td><td className="px-4 py-4"><Button size="sm" variant="secondary" onClick={()=>void openDetail(s.id)}>Aç</Button></td></tr>)}
   </tbody></table></div>:<EmptyState title="Satış bulunamadı" description="Henüz satış kaydı oluşturulmamış."/>}
  </section>

  <Modal open={createOpen} onClose={()=>setCreateOpen(false)} size="lg" title="Yeni Satış" description="Müşteriye bir veya daha fazla hizmet/paket ekleyin.">
   <form onSubmit={createSale} className="space-y-5">
    <Field label="Müşteri" required><Select value={customerId} onChange={e=>setCustomerId(e.target.value)} required><option value="">Müşteri seçin</option>{customers.map(c=><option key={c.id} value={c.id}>{c.firstName} {c.lastName}{c.phone?` · ${c.phone}`:""}</option>)}</Select></Field>
    <div className="space-y-3"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Satış Kalemleri</h3><Button type="button" size="sm" variant="secondary" onClick={()=>setLines([...lines,{type:"SERVICE",referenceId:"",quantity:"1"}])}>+ Kalem</Button></div>
    {lines.map((line,index)=><div key={index} className="grid gap-3 rounded-[16px] border border-[var(--line)] p-4 md:grid-cols-[160px_1fr_120px_auto]">
      <Select value={line.type} onChange={e=>setLines(lines.map((l,i)=>i===index?{...l,type:e.target.value as LineDraft["type"],referenceId:""}:l))}><option value="SERVICE">Hizmet</option><option value="PACKAGE">Paket</option></Select>
      <Select value={line.referenceId} onChange={e=>setLines(lines.map((l,i)=>i===index?{...l,referenceId:e.target.value}:l))}><option value="">Seçin</option>{(line.type==="SERVICE"?services:packages).map(item=><option key={item.id} value={item.id}>{item.name} · {money(item.price)}</option>)}</Select>
      <TextInput type="number" min="1" step="1" value={line.quantity} onChange={e=>setLines(lines.map((l,i)=>i===index?{...l,quantity:e.target.value}:l))}/>
      <Button type="button" variant="danger" size="sm" disabled={lines.length===1} onClick={()=>setLines(lines.filter((_,i)=>i!==index))}>Sil</Button>
    </div>)}</div>
    <Field label="Toplam İndirim"><TextInput type="number" min="0" step="0.01" value={discount} onChange={e=>setDiscount(e.target.value)}/></Field>
    <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={()=>setCreateOpen(false)}>Vazgeç</Button><Button type="submit" disabled={working}>{working?"Kaydediliyor...":"Satışı Oluştur"}</Button></div>
   </form>
  </Modal>

  <Modal open={Boolean(selectedId)} onClose={()=>{setSelectedId("");setSelected(null);setSummary(null)}} size="xl" title="Satış Detayı" description="Satış, tahsilat, iade ve taksit planını yönetin.">
   {working&&!selected?<Spinner label="Satış yükleniyor..."/>:selected?<div className="space-y-5">
    <section className="grid gap-3 sm:grid-cols-4"><Metric label="Toplam" value={money(selected.total)}/><Metric label="Ödenen" value={money(summary?.paid)}/><Metric label="Kalan" value={money(summary?.balance)}/><Metric label="Ödeme Durumu" value={statusLabels[summary?.paymentStatus??""]??summary?.paymentStatus??"—"}/></section>
    <section className="rounded-[16px] border border-[var(--line)]"><div className="border-b border-[var(--line)] px-4 py-3 text-sm font-semibold">Satış Kalemleri</div>{selected.items.map(item=><div key={item.id} className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-[var(--line)] px-4 py-3 last:border-0"><span>{item.description}</span><span className="text-[var(--muted)]">{item.quantity} adet</span><strong>{money(item.lineTotal)}</strong></div>)}</section>
    <div className="flex flex-wrap gap-2">{selected.status==="DRAFT"?<Button onClick={()=>void saleAction("confirm")} disabled={working}>Satışı Onayla</Button>:null}{selected.status==="DRAFT"?<Button variant="danger" onClick={()=>void saleAction("cancel")} disabled={working}>İptal Et</Button>:null}</div>

    {selected.status==="CONFIRMED"&&Number(summary?.balance??0)>0?<form onSubmit={addPayment} className="grid gap-3 rounded-[16px] border border-[var(--line)] p-4 md:grid-cols-4">
      <Field label="Ödeme Tutarı"><TextInput type="number" min="0.01" step="0.01" value={paymentAmount} onChange={e=>setPaymentAmount(e.target.value)}/></Field>
      <Field label="Yöntem"><Select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value as typeof paymentMethod)}><option value="CARD">Kart</option><option value="CASH">Nakit</option><option value="TRANSFER">Havale / EFT</option></Select></Field>
      <Field label="Referans"><TextInput value={paymentReference} onChange={e=>setPaymentReference(e.target.value)}/></Field>
      <div className="flex items-end"><Button className="w-full" type="submit" disabled={working}>Ödeme Kaydet</Button></div>
      <div className="md:col-span-4"><Field label="Not"><TextArea rows={2} value={paymentNote} onChange={e=>setPaymentNote(e.target.value)}/></Field></div>
    </form>:null}

    <section className="rounded-[16px] border border-[var(--line)]"><div className="border-b border-[var(--line)] px-4 py-3 text-sm font-semibold">Ödeme Geçmişi</div>{selected.payments?.length?selected.payments.map(p=><div key={p.id} className="grid gap-2 border-b border-[var(--line)] px-4 py-3 last:border-0 md:grid-cols-[1fr_1fr_1fr_auto]"><span>{money(p.amount)}</span><span className="text-[var(--muted)]">{p.method}</span><span className="text-[var(--muted)]">{p.reference??date(p.paidAt)}</span>{p.status==="COMPLETED"?<Button size="sm" variant="danger" onClick={()=>void refund(p)} disabled={working}>İade Et</Button>:<span>{statusLabels[p.status]??p.status}</span>}</div>):<div className="p-4 text-sm text-[var(--muted)]">Henüz ödeme yok.</div>}</section>

    {!selected.installmentPlan&&selected.status==="CONFIRMED"?<form onSubmit={createInstallment} className="grid gap-3 rounded-[16px] border border-[var(--line)] p-4 md:grid-cols-4"><Field label="Taksit Sayısı"><TextInput type="number" min="2" max="60" value={installmentCount} onChange={e=>setInstallmentCount(e.target.value)}/></Field><Field label="İlk Vade"><TextInput type="date" value={firstDueAt} onChange={e=>setFirstDueAt(e.target.value)}/></Field><Field label="Ay Aralığı"><TextInput type="number" min="1" max="24" value={intervalMonths} onChange={e=>setIntervalMonths(e.target.value)}/></Field><div className="flex items-end"><Button className="w-full" type="submit" disabled={working}>Taksit Planı Oluştur</Button></div></form>:null}
    {selected.installmentPlan?<section className="rounded-[16px] border border-[var(--line)]"><div className="border-b border-[var(--line)] px-4 py-3 text-sm font-semibold">Taksit Planı</div>{selected.installmentPlan.installments.map(i=><div key={i.id} className="grid grid-cols-4 gap-3 border-b border-[var(--line)] px-4 py-3 last:border-0"><span>{i.sequence}. Taksit</span><span>{date(i.dueAt)}</span><span>{money(i.amount)}</span><span>{statusLabels[i.status]??i.status}</span></div>)}</section>:null}
   </div>:null}
  </Modal>
 </div>
}
function Metric({label,value}:{label:string;value:string|number}){return <div className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-4"><p className="text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--muted-soft)]">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>}
