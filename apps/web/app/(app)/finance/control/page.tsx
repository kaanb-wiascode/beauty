"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FinanceEmpty, FinanceMetric, FinancePanel, FinanceStatus } from "@/components/finance-view";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";

type Projection = {
  currencyBasis: string;
  ledger: { cash:number; bank:number; posReceivable:number; customerReceivable:number; supplierPayable:number; revenue:number };
  subledger: { recognizedIncome:number; recognizedExpense:number; collected:number; paid:number };
  provider: {
    bankBalances:Array<{currency:string;currentBalance:number;availableBalance:number;balanceAsOf:string|null}>;
    unsettledPos:Array<{currency:string;unsettledNet:number;transactionCount:number}>;
  };
};
type Integrity = { healthy:boolean; issueCount:number; criticalCount:number; checkedAt:string; issues:Array<{code:string;severity:string;domain:string;recordId:string|null;title:string;detail:string}> };
type Validation = { valid:boolean; tolerance:number; checks:Array<{code:string;label:string;expected:number;actual:number;variance:number;ok:boolean}> };
type Audit = { id:string; createdAt:string; domain:string; eventType:string; recordId:string|null; actorId:string|null; reason:string|null };
type FinanceSettings = { companyId:string; name?:string; baseCurrency:string };
type Period = { id:string; name:string; startsAt:string; endsAt:string; status:"OPEN"|"CLOSED"; closedAt?:string|null; closeReason?:string|null };
type PeriodCloseChecklist = {
  closable:boolean;
  blockingCount:number;
  checks:Array<{code:string;label:string;count:number;blocking:boolean}>;
};

export default function FinanceControlPage(){
  const[projection,setProjection]=useState<Projection|null>(null);
  const[settings,setSettings]=useState<FinanceSettings|null>(null);
  const[baseCurrencyInput,setBaseCurrencyInput]=useState("");
  const[integrity,setIntegrity]=useState<Integrity|null>(null);
  const[validation,setValidation]=useState<Validation|null>(null);
  const[audit,setAudit]=useState<Audit[]>([]);
  const[periods,setPeriods]=useState<Period[]>([]);
  const[periodName,setPeriodName]=useState("");
  const[periodFrom,setPeriodFrom]=useState("");
  const[periodTo,setPeriodTo]=useState("");
  const[periodBusy,setPeriodBusy]=useState(false);
  const canCreatePeriod=hasPermission("accounting","manage");
  const canClosePeriod=hasPermission("finance_period","close");
  const canReopenPeriod=hasPermission("finance_period","reopen");
  const canManageFinance=hasPermission("finance","manage");
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const[p,i,v,a,fp,s]=await Promise.all([
        api<Projection>("/finance/control/projection"),
        api<Integrity>("/finance/control/integrity"),
        api<Validation>("/finance/control/kpi-validation"),
        api<Audit[]>("/finance/control/audit-trail?limit=100"),
        api<Period[]>("/finance/periods"),
        api<FinanceSettings>("/finance/control/settings"),
      ]);
      setProjection(p);setIntegrity(i);setValidation(v);setAudit(a);setPeriods(fp);setSettings(s);setBaseCurrencyInput(s.baseCurrency||"TRY");
    }catch(e){setError(e instanceof ApiError?e.message:"Finans kontrol verileri yüklenemedi.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);

  async function saveBaseCurrency(){
    const value=baseCurrencyInput.trim().toUpperCase();
    if(!/^[A-Z]{3}$/.test(value))return;
    setPeriodBusy(true);setError("");
    try{
      const updated=await api<FinanceSettings>("/finance/control/settings",{method:"PUT",body:{baseCurrency:value}});
      setSettings(updated);setBaseCurrencyInput(updated.baseCurrency);
    }catch(e){setError(e instanceof ApiError?e.message:"Baz para birimi güncellenemedi.");}
    finally{setPeriodBusy(false);}
  }

  async function createPeriod(){
    if(!canCreatePeriod||!periodName.trim()||!periodFrom||!periodTo)return;
    setPeriodBusy(true);setError("");
    try{
      await api("/finance/periods",{method:"POST",body:{name:periodName.trim(),startsAt:periodFrom,endsAt:periodTo}});
      setPeriodName("");setPeriodFrom("");setPeriodTo("");await load();
    }catch(e){setError(e instanceof ApiError?e.message:"Finansal dönem oluşturulamadı.");}
    finally{setPeriodBusy(false);}
  }

  async function changePeriod(period:Period,action:"close"|"reopen"){
    if(action==="close"&&!canClosePeriod)return;
    if(action==="reopen"&&!canReopenPeriod)return;
    let body:Record<string,unknown>|undefined;
    if(action==="close"){
      try{
        const checklist=await api<PeriodCloseChecklist>(`/finance/periods/${period.id}/close-checklist`);
        if(!checklist.closable){
          const blockers=checklist.checks
            .filter(check=>check.blocking&&check.count!==0)
            .map(check=>`${check.label}: ${check.count}`)
            .join(" · ");
          setError(`Bu dönem henüz kapatılamaz. ${blockers}`);
          return;
        }
      }catch(e){
        setError(e instanceof ApiError?e.message:"Dönem kapanış kontrolleri tamamlanamadı.");
        return;
      }
      const reason=window.prompt("Dönem kapatma nedeni (isteğe bağlı)");
      if(reason===null)return;
      body=reason.trim()?{reason:reason.trim()}:undefined;
    }
    setPeriodBusy(true);setError("");
    try{
      await api(`/finance/periods/${period.id}/${action}`,{method:"POST",...(body?{body}:{})});
      await load();
    }catch(e){setError(e instanceof ApiError?e.message:"Finansal dönem güncellenemedi.");}
    finally{setPeriodBusy(false);}
  }

  const currentPeriod=useMemo(()=>periods.find((period)=>{
    const now=Date.now();return new Date(period.startsAt).getTime()<=now&&new Date(period.endsAt).getTime()>=now;
  })??null,[periods]);

  if(loading&&!projection)return <div className="mx-auto max-w-[1500px] py-20"><Spinner label="Finans Kontrol Merkezi hazırlanıyor..."/></div>;

  return <div className="mx-auto max-w-[1500px] space-y-6 pb-12">
    <header className="flex flex-col gap-4 rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--accent)]">Finans Yönetimi</p>
        <h1 className="mt-2 text-[32px] font-semibold tracking-[-.045em] text-[var(--ink)]">Finans Kontrol Merkezi</h1>
        <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--muted)]">Gelir, gider, tahsilat, ödeme, muhasebe, banka ve POS kayıtlarının birbiriyle tutarlı çalışıp çalışmadığını tek merkezden izleyin.</p>
      </div>
      <Button onClick={()=>void load()} disabled={loading}>{loading?"Kontrol Ediliyor...":"Kontrolleri Yenile"}</Button>
    </header>
    {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <FinanceMetric label="Finansal Bütünlük" value={integrity?.healthy?"Sağlıklı":"Kontrol Gerekli"} detail={integrity?integrity.issueCount+" bulgu":"—"} tone={integrity?.healthy?"success":"danger"}/>
      <FinanceMetric label="Kasa" value={money(projection?.ledger.cash,settings?.baseCurrency||"TRY")} detail="Muhasebe bakiyesi"/>
      <FinanceMetric label="Banka" value={money(projection?.ledger.bank,settings?.baseCurrency||"TRY")} detail="Muhasebe bakiyesi"/>
      <FinanceMetric label="POS Alacakları" value={money(projection?.ledger.posReceivable,settings?.baseCurrency||"TRY")} detail="Hesaba geçmeyi bekleyen"/>
      <FinanceMetric label="Müşteri Alacakları" value={money(projection?.ledger.customerReceivable,settings?.baseCurrency||"TRY")} detail="Genel muhasebe"/>
      <FinanceMetric label="Tedarikçi Borçları" value={money(projection?.ledger.supplierPayable,settings?.baseCurrency||"TRY")} detail="Genel muhasebe"/>
    </section>

    <section className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
      <FinancePanel title="Kaynakların Birbiriyle Tutarlılığı" description="Gelir, gider, tahsilat ve ödeme kayıtları ile muhasebe arasındaki otomatik kontroller">
        <div className="space-y-2">
          {(validation?.checks??[]).map(check=><div key={check.code} className="flex flex-col gap-2 rounded-[14px] border border-[var(--line)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-[12px] font-semibold text-[var(--ink)]">{check.label}</p><p className="mt-1 text-[10px] text-[var(--muted)]">Finans kayıtları {money(check.expected,settings?.baseCurrency||"TRY")} · Muhasebe {money(check.actual,settings?.baseCurrency||"TRY")}</p></div>
            <div className="flex items-center gap-2"><FinanceStatus status={check.ok?"PROCESSED":"FAILED"} label={check.ok?"Tutarlı":`Fark ${money(check.variance,settings?.baseCurrency||"TRY")}`}/>{!check.ok?<Link href={kpiHref(check.code)} className="rounded-[10px] border border-[var(--line)] px-3 py-2 text-[10px] font-semibold text-[var(--ink)] hover:bg-[var(--surface-2)]">İncele</Link>:null}</div>
          </div>)}
          {!validation?.checks?.length?<FinanceEmpty title="Kontrol sonucu bulunamadı."/>:null}
        </div>
      </FinancePanel>
      <FinancePanel title="Finansal Dönem" description="Kapalı dönemlere yeni veya değiştirilen finansal kayıt yazılamaz.">
        {currentPeriod?<div className="rounded-[14px] border border-[var(--line)] p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-[13px] font-semibold text-[var(--ink)]">{currentPeriod.name}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{date(currentPeriod.startsAt)} – {date(currentPeriod.endsAt)}</p></div><FinanceStatus status={currentPeriod.status==="OPEN"?"PROCESSED":"FAILED"} label={currentPeriod.status==="OPEN"?"Açık":"Kapalı"}/></div></div>:<FinanceEmpty title="Bugünü kapsayan finansal dönem tanımlı değil."/>}
        {(canCreatePeriod||canClosePeriod||canReopenPeriod)?<div className="mt-4 space-y-3">
          {canCreatePeriod?<><div className="grid gap-2 sm:grid-cols-3">
            <input value={periodName} onChange={e=>setPeriodName(e.target.value)} placeholder="Dönem adı" className="control h-10 rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[11px]"/>
            <input type="date" value={periodFrom} onChange={e=>setPeriodFrom(e.target.value)} className="control h-10 rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[11px]"/>
            <input type="date" value={periodTo} onChange={e=>setPeriodTo(e.target.value)} className="control h-10 rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[11px]"/>
          </div>
          <Button disabled={periodBusy||!periodName.trim()||!periodFrom||!periodTo} onClick={()=>void createPeriod()}>Yeni Dönem Oluştur</Button></>:null}
          <div className="max-h-[220px] space-y-2 overflow-auto">
            {periods.map(period=><div key={period.id} className="flex items-center justify-between gap-3 rounded-[12px] border border-[var(--line)] px-3 py-2">
              <div><p className="text-[11px] font-semibold text-[var(--ink)]">{period.name}</p><p className="text-[9px] text-[var(--muted)]">{date(period.startsAt)} – {date(period.endsAt)}</p></div>
              <div className="flex items-center gap-2"><FinanceStatus status={period.status==="OPEN"?"PROCESSED":"FAILED"} label={period.status==="OPEN"?"Açık":"Kapalı"}/>{period.status==="OPEN"&&canClosePeriod?<Button variant="secondary" disabled={periodBusy} onClick={()=>void changePeriod(period,"close")}>Kapat</Button>:null}{period.status==="CLOSED"&&canReopenPeriod?<Button variant="secondary" disabled={periodBusy} onClick={()=>void changePeriod(period,"reopen")}>Yeniden Aç</Button>:null}</div>
            </div>)}
          </div>
        </div>:<p className="mt-3 text-[10px] leading-5 text-[var(--muted)]">Finansal dönem işlemleri için ilgili oluşturma, kapatma veya yeniden açma yetkisi gerekir.</p>}
      </FinancePanel>
    </section>

    <FinancePanel title="Bütünlük Bulguları" description="Muhasebeleştirilmiş görünüp karşılığı bulunmayan veya zinciri kopmuş finansal kayıtlar">
      <div className="space-y-2">
        {(integrity?.issues??[]).map((issue,index)=><div key={issue.code+"-"+index} className="rounded-[14px] border border-[var(--line)] p-4">
          <div className="flex items-start justify-between gap-3"><div><p className="text-[12px] font-semibold text-[var(--ink)]">{issue.title}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{issue.domain} · {issue.detail}</p></div><div className="flex items-center gap-2"><FinanceStatus status={issue.severity==="CRITICAL"?"FAILED":"RETRY_PENDING"} label={issue.severity==="CRITICAL"?"Kritik":"Kontrol"}/><Link href={issueHref(issue.code)} className="rounded-[10px] border border-[var(--line)] px-3 py-2 text-[10px] font-semibold text-[var(--ink)] hover:bg-[var(--surface-2)]">Kaydı İncele</Link></div></div>
        </div>)}
        {integrity?.healthy?<FinanceEmpty title="Finansal kayıt zincirinde kritik tutarsızlık bulunmadı."/>:null}
      </div>
    </FinancePanel>

    <section className="grid gap-5 xl:grid-cols-2">
      <FinancePanel title="Merkezi Finans İşlem Geçmişi" description="Gelir, gider ve yapılandırma değişikliklerinin son 100 kaydı">
        <div className="max-h-[460px] space-y-2 overflow-auto">
          {audit.map(row=><div key={row.id} className="rounded-[12px] border border-[var(--line)] px-3 py-3"><div className="flex justify-between gap-3"><p className="text-[11px] font-semibold text-[var(--ink)]">{eventLabel(row.eventType)}</p><span className="text-[9px] text-[var(--muted-soft)]">{dateTime(row.createdAt)}</span></div><p className="mt-1 text-[10px] text-[var(--muted)]">{domainLabel(row.domain)}{row.reason?` · ${row.reason}`:""}</p></div>)}
          {!audit.length?<FinanceEmpty title="Finans işlem geçmişi bulunamadı."/>:null}
        </div>
      </FinancePanel>
      <FinancePanel title="Yönetim Ayarları" description="Muhasebe, banka bağlantıları ve şirket para birimiyle ilgili yönetici ayarları">
        <div className="mb-4 rounded-[14px] border border-[var(--line)] p-4">
          <p className="text-[11px] font-semibold text-[var(--ink)]">Şirket Baz Para Birimi</p>
          <p className="mt-1 text-[10px] leading-5 text-[var(--muted)]">Şirketin muhasebe kayıtlarının temel para birimidir. Finansal kayıt oluşturulduktan sonra değiştirilemez.</p>
          <div className="mt-3 flex gap-2">
            <input value={baseCurrencyInput} maxLength={3} onChange={e=>setBaseCurrencyInput(e.target.value.toUpperCase())} className="control h-10 w-28 rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[11px] uppercase" placeholder={settings?.baseCurrency||"TRY"}/>
            <Button disabled={periodBusy||!canManageFinance||!/^[A-Z]{3}$/.test(baseCurrencyInput)} onClick={()=>void saveBaseCurrency()}>Kaydet</Button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Quick href="/finance/configuration" title="Muhasebe Eşlemeleri" text="Gelir ve gider kategorilerinin hesap planı eşlemeleri"/>
          <Quick href="/finance/integrations" title="Banka ve POS Bağlantıları" text="Finansal veri sağlayıcıları ve bağlantı ayarları"/>
          <Quick href="/finance/integrations/operations" title="Bağlantı Durumu" text="Banka ve ödeme bağlantılarının çalışma durumu ile işlem geçmişi"/>
          <Quick href="/finance/integrations/transactions" title="POS İşlemleri" text="Kart tahsilatları, iadeler, banka geçişleri ve eşleştirme işlemleri"/>
        </div>
      </FinancePanel>
    </section>
  </div>
}

function Quick({href,title,text}:{href:string;title:string;text:string}){return <Link href={href} className="rounded-[14px] border border-[var(--line)] p-4 transition hover:bg-[var(--surface-2)]"><p className="text-[12px] font-semibold text-[var(--ink)]">{title}</p><p className="mt-1 text-[10px] leading-5 text-[var(--muted)]">{text}</p></Link>}
function money(value:unknown,currency="TRY"){const n=Number(value??0);return new Intl.NumberFormat("tr-TR",{style:"currency",currency,maximumFractionDigits:2}).format(Number.isFinite(n)?n:0)}
function date(value:string){return new Intl.DateTimeFormat("tr-TR",{dateStyle:"medium"}).format(new Date(value))}
function dateTime(value:string){return new Intl.DateTimeFormat("tr-TR",{dateStyle:"short",timeStyle:"short"}).format(new Date(value))}
function domainLabel(v:string){
  const labels:Record<string,string>={
    INCOME:"Gelir",
    EXPENSE:"Gider",
    CONFIGURATION:"Finans Ayarı",
    ACCOUNTING:"Muhasebe",
    PERIOD:"Finansal Dönem",
    RECONCILIATION:"Mutabakat",
    POS:"POS İşlemi",
  };
  return labels[v]??"Finans İşlemi";
}
function issueHref(code:string){if(code.startsWith("INCOME")||code.startsWith("COLLECTION"))return "/finance/income";if(code.startsWith("EXPENSE")||code.startsWith("PAYMENT"))return "/finance/expenses";return "/finance/accounting"}
function kpiHref(code:string){if(code.includes("BANK")||code.includes("POS"))return "/finance/reconciliation";if(code.includes("REVENUE"))return "/finance/accounting";return "/finance/control"}
function eventLabel(v:string){
  const labels:Record<string,string>={
    JOURNAL_CREATED:"Yevmiye kaydı oluşturuldu",
    JOURNAL_SUBMITTED:"Yevmiye kaydı onaya gönderildi",
    JOURNAL_APPROVED:"Yevmiye kaydı onaylandı",
    JOURNAL_POSTED:"Yevmiye kaydı muhasebeleştirildi",
    PERIOD_CLOSED:"Finansal dönem kapatıldı",
    PERIOD_REOPENED:"Finansal dönem yeniden açıldı",
    RECONCILIATION_MATCHED:"Banka hareketi eşleştirildi",
    RECONCILIATION_REVERSED:"Mutabakat geri alındı",
    POS_SETTLEMENT_BANK_MATCHED:"POS geçişi banka hareketiyle eşleştirildi",
    POS_REFUND:"POS iadesi işlendi",
    POS_CHARGEBACK:"Kart işlemi ters ibraz edildi",
  };
  return labels[v]??v.replaceAll("_"," ").toLocaleLowerCase("tr-TR").replace(/(^|\s)\S/g,(m)=>m.toLocaleUpperCase("tr-TR"));
}
