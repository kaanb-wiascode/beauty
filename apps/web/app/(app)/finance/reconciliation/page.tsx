"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
type WebhookStatus = "RECEIVED"|"PROCESSING"|"PROCESSED"|"IGNORED"|"FAILED"|"RETRY_PENDING"|"ENRICHMENT_PENDING"|"DEAD_LETTER";
type WebhookEvent = {
  id:string; integrationId:string; provider:string; externalEventId:string|null; eventType:string|null; status:WebhookStatus;
  retryCount:number; nextRetryAt:string|null; lastAttemptAt:string|null; deadLetterAt:string|null; replayRequestedAt:string|null;
  posTransactionId:string|null; processingResult:unknown; errorMessage:string|null; createdAt:string; processedAt:string|null;
};
type TabKey = "reconciliation"|"webhooks";

const WEBHOOK_FILTERS:Array<{value:""|WebhookStatus;label:string}>=[
  {value:"",label:"Tümü"},{value:"FAILED",label:"Failed"},{value:"RETRY_PENDING",label:"Retry Pending"},{value:"ENRICHMENT_PENDING",label:"Enrichment"},{value:"DEAD_LETTER",label:"Dead Letter"},{value:"PROCESSING",label:"Processing"},{value:"PROCESSED",label:"Processed"},
];

function money(value:number|string|null|undefined,currency="TRY"){return new Intl.NumberFormat("tr-TR",{style:"currency",currency,maximumFractionDigits:2}).format(Number(value??0))}
function dt(value?:string|null){if(!value)return "—";return new Intl.DateTimeFormat("tr-TR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value))}
function statusClass(status:string){
  if(["MATCHED","PROCESSED"].includes(status))return "bg-emerald-50 text-emerald-700";
  if(["FAILED","DEAD_LETTER"].includes(status))return "bg-rose-50 text-rose-700";
  if(["RETRY_PENDING","ENRICHMENT_PENDING","PROCESSING"].includes(status))return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

export default function ReconciliationPage(){
  const [tab,setTab]=useState<TabKey>("reconciliation");
  const [settlements,setSettlements]=useState<Settlement[]>([]);
  const [transactions,setTransactions]=useState<BankTransaction[]>([]);
  const [summary,setSummary]=useState<Summary|null>(null);
  const [selected,setSelected]=useState<Settlement|null>(null);
  const [suggestions,setSuggestions]=useState<Suggestion[]>([]);
  const [webhooks,setWebhooks]=useState<WebhookEvent[]>([]);
  const [webhookFilter,setWebhookFilter]=useState<""|WebhookStatus>("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const webhookQuery=webhookFilter?`?status=${webhookFilter}&limit=200`:"?limit=200";
      const [s,t,sum,w]=await Promise.all([
        api<Settlement[]>("/financial-integrations/pos/settlements"),
        api<BankTransaction[]>("/financial-integrations/bank-transactions?limit=300"),
        api<Summary>("/financial-integrations/pos/reconciliation/summary"),
        api<WebhookEvent[]>(`/financial-integrations/pos/webhooks${webhookQuery}`),
      ]);
      setSettlements(s);setTransactions(t);setSummary(sum);setWebhooks(w);
      if(selected)setSelected(s.find(x=>x.id===selected.id)??null);
    }catch(e){setError(e instanceof ApiError?e.message:"Finansal exception verileri yüklenemedi.")}
    finally{setLoading(false)}
  },[selected,webhookFilter]);

  useEffect(()=>{void load()},[load]);

  const unmatchedSettlements=useMemo(()=>settlements.filter(s=>s.reconciliationStatus==="UNMATCHED"),[settlements]);
  const unmatchedTransactions=useMemo(()=>transactions.filter(t=>t.reconciliationStatus==="UNMATCHED"),[transactions]);
  const webhookExceptions=useMemo(()=>webhooks.filter(w=>["FAILED","RETRY_PENDING","ENRICHMENT_PENDING","DEAD_LETTER"].includes(w.status)),[webhooks]);
  const deadLetters=useMemo(()=>webhooks.filter(w=>w.status==="DEAD_LETTER").length,[webhooks]);

  async function openSuggestions(settlement:Settlement){
    setSelected(settlement);setSuggestions([]);setError("");
    try{
      const result=await api<{suggestions:Suggestion[]}>(`/financial-integrations/pos/settlements/${settlement.id}/reconciliation-suggestions?days=7`);
      setSuggestions(result.suggestions);
    }catch(e){setError(e instanceof Error?e.message:"Öneriler alınamadı.")}
  }

  async function match(settlementId:string,bankTransactionId:string,confidence=100,note="MANUAL_UI_MATCH"){
    setBusy(`match:${bankTransactionId}`);setError("");setNotice("");
    try{
      await api(`/financial-integrations/pos/settlements/${settlementId}/match-bank-transaction`,{method:"POST",body:{bankTransactionId,confidence,note}});
      setNotice("POS settlement banka hareketiyle eşleştirildi.");setSelected(null);setSuggestions([]);await load();
    }catch(e){setError(e instanceof Error?e.message:"Eşleştirme yapılamadı.")}
    finally{setBusy("")}
  }

  async function ignore(bankTransactionId:string){
    setBusy(`ignore:${bankTransactionId}`);setError("");setNotice("");
    try{
      await api(`/financial-integrations/bank-transactions/${bankTransactionId}/ignore`,{method:"POST"});
      setNotice("Banka hareketi mutabakat dışında bırakıldı.");await load();
    }catch(e){setError(e instanceof Error?e.message:"Banka hareketi mutabakat dışına alınamadı.")}
    finally{setBusy("")}
  }

  async function autoMatch(){
    setBusy("automatch");setError("");setNotice("");
    try{
      const r=await api<{scanned:number;matched:number;skipped:number}>("/financial-integrations/pos/reconciliation/auto-match",{method:"POST",body:{limit:300}});
      setNotice(`${r.scanned} settlement tarandı, ${r.matched} otomatik eşleşti, ${r.skipped} manuel incelemeye kaldı.`);await load();
    }catch(e){setError(e instanceof Error?e.message:"Otomatik eşleştirme çalıştırılamadı.")}
    finally{setBusy("")}
  }

  async function replayWebhook(eventId:string){
    setBusy(`replay:${eventId}`);setError("");setNotice("");
    try{
      await api(`/financial-integrations/pos/webhooks/${eventId}/replay`,{method:"POST"});
      setNotice("Webhook yeniden işleme kuyruğuna alındı.");await load();
    }catch(e){setError(e instanceof Error?e.message:"Webhook replay kuyruğa alınamadı.")}
    finally{setBusy("")}
  }

  return <div className="mx-auto max-w-[1500px] space-y-6 px-4 py-5 sm:px-6 lg:px-8">
    <header className="flex flex-col gap-4 rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-[0_16px_50px_rgba(43,35,72,.07)] lg:flex-row lg:items-end lg:justify-between">
      <div><p className="text-[11px] font-semibold uppercase tracking-[.18em] text-[#8d76df]">Finans & CFO</p><h1 className="mt-1 text-2xl font-semibold tracking-[-.04em] text-[#242332]">Exception & Mutabakat Merkezi</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[#777586]">POS settlement eşleştirmelerini, banka hareketi istisnalarını ve webhook retry/dead-letter kuyruğunu tek operasyon ekranından yönetin.</p></div>
      <div className="flex gap-2"><button onClick={()=>void load()} className="rounded-2xl border border-[#e8e4f4] bg-white px-4 py-2.5 text-sm font-medium text-[#6048bd]">Yenile</button>{tab==="reconciliation"?<button disabled={Boolean(busy)} onClick={()=>void autoMatch()} className="rounded-2xl bg-[#7657e8] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy==="automatch"?"Eşleştiriliyor…":"Otomatik Eşleştir"}</button>:null}</div>
    </header>

    {error?<div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>:null}
    {notice?<div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-violet-700">{notice}</div>:null}

    <div className="flex gap-1 rounded-[18px] border border-[#ece9f0] bg-white/80 p-1.5">
      <Tab active={tab==="reconciliation"} onClick={()=>setTab("reconciliation")}>Mutabakat</Tab>
      <Tab active={tab==="webhooks"} onClick={()=>setTab("webhooks")}>Webhook Audit <span className="ml-1 text-[10px] text-[#a29fac]">{webhookExceptions.length}</span></Tab>
    </div>

    {loading?<div className="rounded-[22px] border border-dashed border-[#e7e3ed] px-4 py-12 text-center text-sm text-[#9996a2]">Veriler yükleniyor…</div>:null}

    {!loading&&tab==="reconciliation"?<>
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
          {selected?<div className="space-y-2">{suggestions.map(s=><div key={s.id} className="rounded-[18px] border border-[#efecf4] bg-[#fcfbfe] p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-[#2d2b39]">{money(s.amount,s.currency)}</p><p className="mt-1 text-xs text-[#888594]">{dt(s.bookedAt)}</p><p className="mt-1 text-[11px] text-[#9a97a4]">{s.description||"Açıklama yok"}</p></div><div className="text-right"><span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">%{s.confidence}</span><button disabled={Boolean(busy)} onClick={()=>void match(selected.id,s.id,s.confidence,"SUGGESTION_UI_MATCH")} className="mt-3 block rounded-xl bg-[#7657e8] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Eşleştir</button></div></div></div>)}{!suggestions.length?<Empty text="Otomatik öneri bulunamadı. Aşağıdaki banka hareketlerinden manuel seçim yapabilirsiniz."/>:null}</div>:<Empty text="Sol taraftan bir POS settlement seçin."/>}
        </Panel>
      </section>

      <Panel title="Eşleşmemiş Banka Hareketleri" subtitle={selected?`${selected.providerSettlementId} için manuel eşleştirme yapılabilir`:`${unmatchedTransactions.length} kayıt`}>
        <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left"><thead><tr className="border-b border-[#efedf3] text-[10px] uppercase tracking-[.12em] text-[#a09ca8]"><th className="px-3 py-3">Tarih</th><th className="px-3 py-3">Banka</th><th className="px-3 py-3">Açıklama</th><th className="px-3 py-3">Tutar</th><th className="px-3 py-3 text-right">İşlem</th></tr></thead><tbody>{unmatchedTransactions.map(t=><tr key={t.id} className="border-b border-[#f2f0f4] text-xs text-[#5d5968]"><td className="px-3 py-3">{dt(t.bookedAt)}</td><td className="px-3 py-3">{t.bankName}</td><td className="max-w-[360px] truncate px-3 py-3">{t.description||t.counterpartyName||"—"}</td><td className={`px-3 py-3 font-semibold ${Number(t.amount)>=0?"text-emerald-700":"text-rose-700"}`}>{money(t.amount,t.currency)}</td><td className="px-3 py-3"><div className="flex justify-end gap-2">{selected?<button disabled={Boolean(busy)||t.currency!==selected.currency} onClick={()=>void match(selected.id,t.id,100,"MANUAL_EXCEPTION_CENTER_MATCH")} className="rounded-xl bg-[#7657e8] px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-40">{busy===`match:${t.id}`?"Eşleşiyor…":"Seçili Settlement ile Eşleştir"}</button>:null}<button disabled={Boolean(busy)} onClick={()=>void ignore(t.id)} className="rounded-xl border border-[#e6e2ec] bg-white px-3 py-2 text-[11px] font-medium text-[#6f6a78] disabled:opacity-50">{busy===`ignore:${t.id}`?"İşleniyor…":"Mutabakat Dışı"}</button></div></td></tr>)}</tbody></table>{!unmatchedTransactions.length?<Empty text="Eşleşmemiş banka hareketi yok."/>:null}</div>
      </Panel>
    </>:null}

    {!loading&&tab==="webhooks"?<>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="Webhook" value={String(webhooks.length)} sub="Filtredeki kayıt"/>
        <Metric title="Exception" value={String(webhookExceptions.length)} sub="Retry / failed / enrichment"/>
        <Metric title="Dead Letter" value={String(deadLetters)} sub="Manuel müdahale gerekli"/>
        <Metric title="Processing" value={String(webhooks.filter(w=>w.status==="PROCESSING").length)} sub="Şu an işleniyor"/>
      </section>

      <Panel title="Webhook Audit & Replay" subtitle="İmzalanmış provider event kuyruğu ve replay operasyonu">
        <div className="mb-4 flex flex-wrap gap-2">{WEBHOOK_FILTERS.map(f=><button key={f.value||"ALL"} onClick={()=>setWebhookFilter(f.value)} className={`rounded-xl px-3 py-2 text-[11px] font-semibold ${webhookFilter===f.value?"bg-[#7657e8] text-white":"border border-[#e8e4ee] bg-white text-[#6f6a78]"}`}>{f.label}</button>)}</div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1180px] text-left"><thead><tr className="border-b border-[#efedf3] text-[10px] uppercase tracking-[.12em] text-[#a09ca8]"><th className="px-3 py-3">Oluşma</th><th className="px-3 py-3">Provider</th><th className="px-3 py-3">Event</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Retry</th><th className="px-3 py-3">Son Deneme / Next</th><th className="px-3 py-3">Hata</th><th className="px-3 py-3 text-right">İşlem</th></tr></thead><tbody>{webhooks.map(w=><tr key={w.id} className="border-b border-[#f2f0f4] align-top text-xs text-[#5d5968]"><td className="whitespace-nowrap px-3 py-3">{dt(w.createdAt)}</td><td className="px-3 py-3 font-semibold text-[#454250]">{w.provider}</td><td className="px-3 py-3"><p className="font-medium text-[#454250]">{w.eventType||"—"}</p><p className="mt-1 max-w-[180px] truncate text-[10px] text-[#9a97a4]">{w.externalEventId||w.id}</p></td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${statusClass(w.status)}`}>{w.status}</span>{w.deadLetterAt?<p className="mt-1 text-[10px] text-rose-600">DLQ {dt(w.deadLetterAt)}</p>:null}</td><td className="px-3 py-3">{w.retryCount}</td><td className="px-3 py-3"><p>{dt(w.lastAttemptAt)}</p><p className="mt-1 text-[10px] text-[#9995a3]">Next: {dt(w.nextRetryAt)}</p></td><td className="max-w-[300px] px-3 py-3"><p className={`line-clamp-3 ${w.errorMessage?"text-rose-700":"text-[#9995a3]"}`}>{w.errorMessage||"—"}</p>{w.replayRequestedAt?<p className="mt-1 text-[10px] text-[#7657e8]">Replay requested: {dt(w.replayRequestedAt)}</p>:null}</td><td className="px-3 py-3 text-right">{w.status!=="PROCESSING"?<button disabled={Boolean(busy)} onClick={()=>void replayWebhook(w.id)} className="rounded-xl border border-[#dcd5ef] bg-white px-3 py-2 text-[11px] font-semibold text-[#6548c8] disabled:opacity-50">{busy===`replay:${w.id}`?"Kuyruğa alınıyor…":"Replay"}</button>:<span className="text-[10px] text-[#aaa6b2]">Processing</span>}</td></tr>)}</tbody></table>{!webhooks.length?<Empty text="Bu filtrede webhook event bulunmuyor."/>:null}</div>
      </Panel>
    </>:null}
  </div>
}

function Tab({active,onClick,children}:{active:boolean;onClick:()=>void;children:ReactNode}){return <button onClick={onClick} className={`rounded-[13px] px-4 py-2.5 text-[12px] font-semibold ${active?"bg-[#7657e8] text-white":"text-[#777382] hover:bg-[#f7f5fb]"}`}>{children}</button>}
function Metric({title,value,sub}:{title:string;value:string;sub:string}){return <div className="rounded-[22px] border border-white/80 bg-white/90 p-5 shadow-[0_10px_34px_rgba(43,35,72,.05)]"><p className="text-[11px] font-medium text-[#8c8997]">{title}</p><p className="mt-2 text-2xl font-semibold tracking-[-.04em] text-[#282735]">{value}</p><p className="mt-1 text-[11px] text-[#a09ca8]">{sub}</p></div>}
function Panel({title,subtitle,children}:{title:string;subtitle:string;children:ReactNode}){return <section className="rounded-[26px] border border-white/80 bg-white/90 p-5 shadow-[0_12px_40px_rgba(43,35,72,.06)]"><div><h2 className="text-base font-semibold text-[#282736]">{title}</h2><p className="mt-1 text-xs text-[#8b8997]">{subtitle}</p></div><div className="mt-4">{children}</div></section>}
function Empty({text}:{text:string}){return <div className="rounded-[16px] border border-dashed border-[#ddd8e6] px-4 py-8 text-center text-xs text-[#9692a0]">{text}</div>}
