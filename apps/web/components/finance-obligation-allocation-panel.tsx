"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { FinanceEmpty, FinancePanel, FinanceStatus } from "@/components/finance-view";
import { Alert, Button, Field, Select, TextInput } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type Obligation={id:string;title:string;counterparty:string|null;amount:number|string;currency:string;dueDate:string;status:string};
type PaymentOption={id:string;amount:number|string;remaining:number|string;allocated:number|string;currency:string;paidAt:string;counterpartyName:string|null;documentNumber:string|null;description:string|null};
type Allocation={id:string;expensePaymentId:string;amount:number|string;allocatedAt:string;reversedAt:string|null;reversalReason:string|null};

export function FinanceObligationAllocationPanel(){
  const[obligations,setObligations]=useState<Obligation[]>([]);
  const[payments,setPayments]=useState<PaymentOption[]>([]);
  const[allocations,setAllocations]=useState<Allocation[]>([]);
  const[obligationId,setObligationId]=useState("");
  const[paymentId,setPaymentId]=useState("");
  const[amount,setAmount]=useState("");
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState("");
  const[notice,setNotice]=useState("");

  const load=useCallback(async()=>{
    setError("");
    try{
      const[o,p]=await Promise.all([
        api<Obligation[]>("/finance/obligations?limit=250"),
        api<PaymentOption[]>("/finance/obligations/payment-options?limit=250"),
      ]);
      setObligations(o);
      setPayments(p);
      setObligationId(current=>current||o.find(x=>["APPROVED","READY_FOR_PAYMENT","PARTIALLY_PAID","PAID"].includes(x.status))?.id||o[0]?.id||"");
    }catch(e){setError(e instanceof ApiError?e.message:"Ödeme tahsis verileri yüklenemedi.");}
  },[]);
  useEffect(()=>{void load();},[load]);

  useEffect(()=>{
    if(!obligationId){setAllocations([]);return;}
    void api<Allocation[]>(`/finance/obligations/${obligationId}/payment-allocations`)
      .then(setAllocations)
      .catch(()=>setAllocations([]));
  },[obligationId]);

  const selectedObligation=useMemo(()=>obligations.find(x=>x.id===obligationId)??null,[obligations,obligationId]);
  const compatiblePayments=useMemo(()=>payments.filter(x=>!selectedObligation||x.currency===selectedObligation.currency),[payments,selectedObligation]);

  async function allocate(event:FormEvent){
    event.preventDefault();
    if(!obligationId||!paymentId)return;
    setBusy(true);setError("");setNotice("");
    try{
      await api(`/finance/obligations/${obligationId}/payment-allocations`,{method:"POST",body:{expensePaymentId:paymentId,...(amount?{amount:Number(amount)}:{})}});
      setNotice("Ödeme yükümlülüğe tahsis edildi.");setPaymentId("");setAmount("");await load();
      setAllocations(await api<Allocation[]>(`/finance/obligations/${obligationId}/payment-allocations`));
    }catch(e){setError(e instanceof ApiError?e.message:"Ödeme tahsis edilemedi.");}
    finally{setBusy(false);}
  }

  async function reverse(allocation:Allocation){
    const reason=window.prompt("Ters kayıt nedeni");
    if(!reason?.trim())return;
    setBusy(true);setError("");setNotice("");
    try{
      await api(`/finance/obligations/${obligationId}/payment-allocations/${allocation.id}/reverse`,{method:"POST",body:{reason:reason.trim()}});
      setNotice("Ödeme tahsisi geri alındı.");
      setAllocations(await api<Allocation[]>(`/finance/obligations/${obligationId}/payment-allocations`));
      await load();
    }catch(e){setError(e instanceof ApiError?e.message:"Ters kayıt oluşturulamadı.");}
    finally{setBusy(false);}
  }

  return <FinancePanel title="Ödeme Tahsisi" description="Kimlik kodu girmeden yükümlülüğü ve uygun gider ödemesini seçerek eşleştirin.">
    {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}
    {notice?<Alert tone="success" onClose={()=>setNotice("")}>{notice}</Alert>:null}
    <form onSubmit={allocate} className="grid gap-4 lg:grid-cols-[1.1fr_1.4fr_.6fr_auto] lg:items-end">
      <Field label="Yükümlülük">
        <Select value={obligationId} onChange={e=>setObligationId(e.target.value)}>
          <option value="">Yükümlülük seçin</option>
          {obligations.map(o=><option key={o.id} value={o.id}>{o.title}{o.counterparty?` · ${o.counterparty}`:""} · {money(o.amount,o.currency)} · {date(o.dueDate)}</option>)}
        </Select>
      </Field>
      <Field label="Kullanılabilir Gider Ödemesi">
        <Select value={paymentId} onChange={e=>setPaymentId(e.target.value)}>
          <option value="">Ödeme seçin</option>
          {compatiblePayments.map(p=><option key={p.id} value={p.id}>{p.counterpartyName||"Gider Ödemesi"}{p.documentNumber?` · ${p.documentNumber}`:""} · Kalan {money(p.remaining,p.currency)} · {date(p.paidAt)}</option>)}
        </Select>
      </Field>
      <Field label="Tahsis Tutarı">
        <TextInput inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Tamamı"/>
      </Field>
      <Button type="submit" disabled={busy||!obligationId||!paymentId}>{busy?"İşleniyor...":"Tahsis Et"}</Button>
    </form>

    <div className="mt-5">
      <p className="mb-2 text-[11px] font-semibold text-[var(--ink)]">Seçili Yükümlülüğün Tahsis Geçmişi</p>
      <div className="space-y-2">
        {allocations.map(a=><div key={a.id} className="flex flex-col gap-3 rounded-[14px] border border-[var(--line)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-[12px] font-semibold text-[var(--ink)]">{money(a.amount,selectedObligation?.currency??"TRY")}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{date(a.allocatedAt)}</p></div>
          <div className="flex items-center gap-2"><FinanceStatus status={a.reversedAt?"REVERSED":"PROCESSED"} label={a.reversedAt?"Geri Alındı":"Aktif"}/>{!a.reversedAt?<Button variant="secondary" type="button" disabled={busy} onClick={()=>void reverse(a)}>Geri Al</Button>:null}</div>
        </div>)}
        {!allocations.length?<FinanceEmpty title="Bu yükümlülük için ödeme tahsisi bulunmuyor."/>:null}
      </div>
    </div>
  </FinancePanel>
}

function money(value:number|string,currency:string){return new Intl.NumberFormat("tr-TR",{style:"currency",currency,maximumFractionDigits:2}).format(Number(value??0))}
function date(value:string){return new Intl.DateTimeFormat("tr-TR",{dateStyle:"medium"}).format(new Date(value))}
