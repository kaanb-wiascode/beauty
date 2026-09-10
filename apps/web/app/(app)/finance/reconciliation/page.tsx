"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";

type Settlement = {
  id:string; integrationId:string; providerSettlementId:string; grossAmount:number|string; feeAmount:number|string; netAmount:number|string;
  currency:string; settledAt:string; reconciliationStatus:string; matchedBankTransactionId?:string|null; reconciliationConfidence?:number|null;
};
type BankTransaction = {
  id:string; bankAccountId:string; bankName:string; bookedAt:string; amount:number|string; currency:string; description:string|null; counterpartyName:string|null; reconciliationStatus:string;
};
type Summary = { total:number; matched:number; unmatched:number; unmatchedAmount:number|string; unmatchedBankTransactions:number; ignoredBankTransactions:number };
type Suggestion = { id:string; bankAccountId:string; bookedAt:string; amount:number|string; currency:string; description?:string|null; confidence:number };

function money(value:number|string|null|undefined,currency="TRY"){return new Intl.NumberFormat("tr-TR",{style:"currency",currency,maximumFractionDigits:2}).format(Number(value??0))}
function dt(value:string){return new Intl.DateTimeFormat("tr-TR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value))}

export default function ReconciliationPage(){
  const [settlements,setSettlements]=useState<Settlement[]>([]);
  const [transactions,setTransactions]=useState<BankTransaction[]>([]);
  const [summary,setSummary]=useState<Summary|null>(null);
  const [selected,setSelected]=useState<Settlement|null>(null);
  const [suggestions,setSuggestions]=useState<Suggestion[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const [s,t,sum]=await Promise.all([
        api<Settlement[]>("/financial-integrations/pos/settlements"),
        api<BankTransaction[]>("/financial-integrations/bank-transactions?limit=300"),
        api<Summary>("/financial-integrations/pos/reconciliation/summary"),
      ]);
      setSettlements(s);setTransactions(t);setSummary(sum);
      if(selected){setSelected(s.find(x=>x.id===selected.id)??null)}
    }catch(e){setError(e instanceof ApiError?e.message:"Mutabakat verileri yüklenemedi.")}
    finally{setLoading(false)}
  },[selected]);

  useEffect(()=>{void load()},[load]);

  const unmatchedSettlements=useMemo(()=>settlements.filter(s=>s.reconciliationStatus==="UNMATCHED"),[settlements]);
  const unmatchedTransactions=useMemo(()=>transactions.filter(t=>t.reconciliationStatus==="UNMATCHED"),[transactions]);

  async function openSuggestions(settlement:Settlement){
    setSelected(settlement);setSuggestions([]);setError("");
    try{
      const result=await api<{suggestions:Suggestion[]}>(`/financial-integrations/pos/settlements/${settlement.id}/reconciliation-suggestions?days=7`);
      setSuggestions(result.suggestions);
    }catch(e){setError(e instanceof Error?e.message:"Öneriler alınamadı.")}
  }

  async function match(settlementId:string,bankTransactionId:string,confidence=100){
    setBusy(true);setError("");setNotice("");
    try{
      await api(`/financial-integrations/pos/settlements/${settlementId}/match-bank-transaction`,{method:"POST",body:{bankTransactionId,confidence,note:"MANUAL_UI_MATCH"}});
      setNotice("POS settlement banka hareketiyle eşleştirildi.");setSelected(null);setSuggestions([]);await load();
    }catch(e){setError(e instanceof Error?e.message:"Eşleştirme yapılamadı.")}
    finally{setBusy(false)}
  }

  async function ignore(bankTransactionId:string){
    setBusy(true);setError("");setNotice("");
    try{
      await api(`/financial-integrations/bank-transactions/${bankTransactionId}/ignore`,{method:"POST"});
      setNotice("Banka hareketi mutabakat dışında bırakıldı.");await load();
    }catch(e){setError(e instanceof Error?e.message:"Banka hareketi yok sayılamadı.")}
    finally{setBusy(false)}
  }

  async function autoMatch(){
    setBusy(true);setError("");setNotice("");
    try{
      const r=await api<{scanned:number;matched:number;skipped:number}>("/financial-integrations/pos/reconciliation/auto-match",{method:"POST",body:{limit:300}});
      setNotice(`${r.scanned} settlement tarandı, ${r.matched} otomatik eşleşti, ${r.skipped} manuel incelemeye kaldı.`);await load();
    }catch(e){setError(e instanceof Error?e.message:"Otomatik eşleştirme çalıştırılamadı.")}
    finally{setBusy(false)}
  }

  return <div className="mx-auto max-w-[1500px] space-y-6 px-4 py-5 sm:px-6 lg:px-8">
    <header className="flex flex-col gap-4 rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-[0_16px_50px_rgba(43,35,72,.07)] lg:flex-row lg:items-end lg:justify-between">
      <div><p className="text-[11px] font-semibold uppercase tracking-[.18em] text-[#8d76df]">Finans & CFO</p><h1 className="mt-1 text-2xl font-semibold tracking-[-.04em] text-[#242332]">Mutabakat Merkezi</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[#777586]">POS settlement kayıtlarını banka hareketleriyle eşleştirin. Yüksek güvenli adaylar otomatik, belirsiz kayıtlar manuel incelenir.</p></div>
      <div className="flex gap-2"><button onClick={()=>void load()} className="rounded-2xl border border-[#e8e4f4] bg-white px-4 py-2.5 text-sm font-medium text-[#6048bd]">Yenile</button><button disabled={busy} onClick={()=>void autoMatch()} className="rounded-2xl bg-[#7657e8] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Otomatik Eşleştir</button></div>
    </header>

    {error?<div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>:null}
    {notice?<div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-violet-700">{notice}</div>:null}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <Metric title="Settlement" value={String(summary?.total??0)} sub="Toplam kayıt"/>
      <Metric title="Eşleşen" value={String(summary?.matched??0)} sub="Mutabakat tamam"/>
      <Metric title="Bekleyen" value={String(summary?.unmatched??0)} sub={money(summary?.unmatchedAmount,"TRY")}/>
      <Metric title="Eşleşmemiş Banka" value={String(summary?.unmatchedBankTransactions??0)} sub="İnceleme bekliyor"/>
      <Metric title="Yok Sayılan" value={String(summary?.ignoredBankTransactions??0)} sub="Mutabakat dışı"/>
    </section>

    <section className="grid gap-6 xl:grid-cols-[1.05fr_.95fr]">
      <Panel title="Eşleşmemiş POS Settlement" subtitle={`${unmatchedSettlements.length} kayıt`}>
        <div className="space-y-2">{unmatchedSettlements.map(s=><button key={s.id} onClick={()=>void openSuggestions(s)} className={`w-full rounded-[18px] border p-4 text-left transition ${selected?.id===s.id?"border-[#9d84ef] bg-[#faf8ff]":"border-[#efecf4] bg-[#fcfbfe] hover:border-[#d9d2ed]"}`}><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-[#2d2b39]">{s.providerSettlementId}</p><p className="mt-1 text-xs text-[#8c8997]">{dt(s.settledAt)}</p></div><div className="text-right"><p className="text-sm font-semibold text-[#2d2b39]">{money(s.netAmount,s.currency)}</p><p className="mt-1 text-[11px] text-[#9995a3]">Brüt {money(s.grossAmount,s.currency)} · Komisyon {money(s.feeAmount,s.currency)}</p></div></div></button>)}{!unmatchedSettlements.length?<Empty text="Eşleşmemiş POS settlement bulunmuyor."/>:null}</div>
      </Panel>

      <Panel title="Eşleşme Önerileri" subtitle={selected?selected.providerSettlementId:"Settlement seçin"}>
        {selected?<div className="space-y-2">{suggestions.map(s=><div key={s.id} className="rounded-[18px] border border-[#efecf4] bg-[#fcfbfe] p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-[#2d2b39]">{money(s.amount,s.currency)}</p><p className="mt-1 text-xs text-[#888594]">{dt(s.bookedAt)}</p><p className="mt-1 text-[11px] text-[#9a97a4]">{s.description||"Açıklama yok"}</p></div><div className="text-right"><span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">%{s.confidence}</span><button disabled={busy} onClick={()=>void match(selected.id,s.id,s.confidence)} className="mt-3 block rounded-xl bg-[#7657e8] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Eşleştir</button></div></div></div>)}{!suggestions.length?<Empty text="Uygun otomatik öneri bulunamadı. Aşağıdaki banka hareketlerinden manuel seçim yapabilirsiniz."/>:null}</div>:<Empty text="Sol taraftan bir POS settlement seçin."/>}
      </Panel>
    </section>

    <Panel title="Eşleşmemiş Banka Hareketleri" subtitle={`${unmatchedTransactions.length} kayıt`}>
      <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left"><thead><tr className="border-b border-[#efedf3] text-[10px] uppercase tracking-[.12em] text-[#a09ca8]"><th className="px-3 py-3">Tarih</th><th className="px-3 py-3">Banka</th><th className="px-3 py-3">Açıklama</th><th className="px-3 py-3">Tutar</th><th className="px-3 py-3 text-right">İşlem</th></tr></thead><tbody>{unmatchedTransactions.map(t=><tr key={t.id} className="border-b border-[#f2f0f4] text-xs text-[#5d5968]"><td className="px-3 py-3">{dt(t.bookedAt)}</td><td className="px-3 py-3">{t.bankName}</td><td className="max-w-[360px] truncate px-3 py-3">{t.description||t.counterpartyName||"—"}</td><td className={`px-3 py-3 font-semibold ${Number(t.amount)>=0?"text-emerald-700":"text-rose-700"}`}>{money(t.amount,t.currency)}</td><td className="px-3 py-3 text-right"><button disabled={busy} onClick={()=>void ignore(t.id)} className="rounded-xl border border-[#e6e2ec] bg-white px-3 py-2 text-[11px] font-medium text-[#6f6a78] disabled:opacity-50">Mutabakat Dışı</button></td></tr>)}</tbody></table>{!unmatchedTransactions.length?<Empty text="Eşleşmemiş banka hareketi yok."/>:null}</div>
    </Panel>
  </div>
}

function Metric({title,value,sub}:{title:string;value:string;sub:string}){return <div className="rounded-[22px] border border-white/80 bg-white/90 p-5 shadow-[0_10px_34px_rgba(43,35,72,.05)]"><p className="text-[11px] font-medium text-[#8c8997]">{title}</p><p className="mt-2 text-2xl font-semibold tracking-[-.04em] text-[#282735]">{value}</p><p className="mt-1 text-[11px] text-[#a09ca8]">{sub}</p></div>}
function Panel({title,subtitle,children}:{title:string;subtitle:string;children:React.ReactNode}){return <section className="rounded-[26px] border border-white/80 bg-white/90 p-5 shadow-[0_12px_40px_rgba(43,35,72,.06)]"><div><h2 className="text-base font-semibold text-[#282736]">{title}</h2><p className="mt-1 text-xs text-[#8b8997]">{subtitle}</p></div><div className="mt-4">{children}</div></section>}
function Empty({text}:{text:string}){return <div className="rounded-[16px] border border-dashed border-[#ddd8e6] px-4 py-8 text-center text-xs text-[#9692a0]">{text}</div>}
