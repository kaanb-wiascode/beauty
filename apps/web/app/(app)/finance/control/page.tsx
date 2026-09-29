"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FinanceEmpty, FinanceMetric, FinancePanel, FinanceStatus } from "@/components/finance-view";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

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
type Period = { id:string; name:string; startsAt:string; endsAt:string; status:"OPEN"|"CLOSED"; closedAt?:string|null; closeReason?:string|null };

export default function FinanceControlPage(){
  const[projection,setProjection]=useState<Projection|null>(null);
  const[integrity,setIntegrity]=useState<Integrity|null>(null);
  const[validation,setValidation]=useState<Validation|null>(null);
  const[audit,setAudit]=useState<Audit[]>([]);
  const[periods,setPeriods]=useState<Period[]>([]);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const[p,i,v,a,fp]=await Promise.all([
        api<Projection>("/finance/control/projection"),
        api<Integrity>("/finance/control/integrity"),
        api<Validation>("/finance/control/kpi-validation"),
        api<Audit[]>("/finance/control/audit-trail?limit=100"),
        api<Period[]>("/finance/periods"),
      ]);
      setProjection(p);setIntegrity(i);setValidation(v);setAudit(a);setPeriods(fp);
    }catch(e){setError(e instanceof ApiError?e.message:"Finans kontrol verileri yüklenemedi.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);

  const currentPeriod=useMemo(()=>periods.find((period)=>{
    const now=Date.now();return new Date(period.startsAt).getTime()<=now&&new Date(period.endsAt).getTime()>=now;
  })??null,[periods]);

  if(loading&&!projection)return <div className="mx-auto max-w-[1500px] py-20"><Spinner label="Finans Kontrol Merkezi hazırlanıyor..."/></div>;

  return <div className="mx-auto max-w-[1500px] space-y-6 pb-12">
    <header className="flex flex-col gap-4 rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--accent)]">Finance 2.0</p>
        <h1 className="mt-2 text-[32px] font-semibold tracking-[-.045em] text-[var(--ink)]">Finans Kontrol Merkezi</h1>
        <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--muted)]">Gelir, gider, tahsilat, ödeme, muhasebe, banka ve POS kayıtlarının birbiriyle tutarlı çalışıp çalışmadığını tek merkezden izleyin.</p>
      </div>
      <Button onClick={()=>void load()} disabled={loading}>{loading?"Kontrol Ediliyor...":"Kontrolleri Yenile"}</Button>
    </header>
    {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <FinanceMetric label="Finansal Bütünlük" value={integrity?.healthy?"Sağlıklı":"Kontrol Gerekli"} detail={integrity?integrity.issueCount+" bulgu":"—"} tone={integrity?.healthy?"success":"danger"}/>
      <FinanceMetric label="Kasa" value={money(projection?.ledger.cash)} detail="Muhasebe bakiyesi"/>
      <FinanceMetric label="Banka" value={money(projection?.ledger.bank)} detail="Muhasebe bakiyesi"/>
      <FinanceMetric label="POS Alacakları" value={money(projection?.ledger.posReceivable)} detail="Hesaba geçmeyi bekleyen"/>
      <FinanceMetric label="Müşteri Alacakları" value={money(projection?.ledger.customerReceivable)} detail="Genel muhasebe"/>
      <FinanceMetric label="Tedarikçi Borçları" value={money(projection?.ledger.supplierPayable)} detail="Genel muhasebe"/>
    </section>

    <section className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
      <FinancePanel title="Kaynakların Birbiriyle Tutarlılığı" description="Alt defterler ile genel muhasebe arasındaki otomatik kontroller">
        <div className="space-y-2">
          {(validation?.checks??[]).map(check=><div key={check.code} className="flex flex-col gap-2 rounded-[14px] border border-[var(--line)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-[12px] font-semibold text-[var(--ink)]">{check.label}</p><p className="mt-1 text-[10px] text-[var(--muted)]">Alt defter {money(check.expected)} · Muhasebe {money(check.actual)}</p></div>
            <FinanceStatus status={check.ok?"PROCESSED":"FAILED"} label={check.ok?"Tutarlı":`Fark ${money(check.variance)}`}/>
          </div>)}
          {!validation?.checks?.length?<FinanceEmpty title="Kontrol sonucu bulunamadı."/>:null}
        </div>
      </FinancePanel>
      <FinancePanel title="Finansal Dönem" description="Kapalı dönemlere yeni veya değiştirilen finansal kayıt yazılamaz.">
        {currentPeriod?<div className="rounded-[14px] border border-[var(--line)] p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-[13px] font-semibold text-[var(--ink)]">{currentPeriod.name}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{date(currentPeriod.startsAt)} – {date(currentPeriod.endsAt)}</p></div><FinanceStatus status={currentPeriod.status==="OPEN"?"PROCESSED":"FAILED"} label={currentPeriod.status==="OPEN"?"Açık":"Kapalı"}/></div></div>:<FinanceEmpty title="Bugünü kapsayan finansal dönem tanımlı değil."/>}
        <p className="mt-3 text-[10px] leading-5 text-[var(--muted)]">Dönem oluşturma, kapatma ve yeniden açma işlemleri muhasebe yönetim yetkisiyle API üzerinden yönetilir; kullanıcı arayüzü dönem yönetimi sonraki genişletmede bu karta bağlanabilir.</p>
      </FinancePanel>
    </section>

    <FinancePanel title="Bütünlük Bulguları" description="Muhasebeleştirilmiş görünüp karşılığı bulunmayan veya zinciri kopmuş finansal kayıtlar">
      <div className="space-y-2">
        {(integrity?.issues??[]).map((issue,index)=><div key={issue.code+"-"+index} className="rounded-[14px] border border-[var(--line)] p-4">
          <div className="flex items-start justify-between gap-3"><div><p className="text-[12px] font-semibold text-[var(--ink)]">{issue.title}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{issue.domain} · {issue.detail}</p></div><FinanceStatus status={issue.severity==="CRITICAL"?"FAILED":"RETRY_PENDING"} label={issue.severity==="CRITICAL"?"Kritik":"Kontrol"}/></div>
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
      <FinancePanel title="Teknik ve Yönetim Ayarları" description="Günlük finans kullanıcılarından ayrıştırılmış yönetim araçları">
        <div className="grid gap-3 sm:grid-cols-2">
          <Quick href="/finance/configuration" title="Muhasebe Eşlemeleri" text="Gelir ve gider kategorilerinin hesap planı eşlemeleri"/>
          <Quick href="/finance/integrations" title="Banka ve POS Bağlantıları" text="Finansal veri sağlayıcıları ve bağlantı ayarları"/>
          <Quick href="/finance/integrations/operations" title="Bağlantı Sağlığı" text="Senkronizasyon, hata ve bağlantı geçmişi"/>
          <Quick href="/finance/integrations/transactions" title="POS İşlemleri" text="POS finans olayları, iade ve teknik işlem yönetimi"/>
        </div>
      </FinancePanel>
    </section>
  </div>
}

function Quick({href,title,text}:{href:string;title:string;text:string}){return <Link href={href} className="rounded-[14px] border border-[var(--line)] p-4 transition hover:bg-[var(--surface-2)]"><p className="text-[12px] font-semibold text-[var(--ink)]">{title}</p><p className="mt-1 text-[10px] leading-5 text-[var(--muted)]">{text}</p></Link>}
function money(value:unknown){const n=Number(value??0);return new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY",maximumFractionDigits:2}).format(Number.isFinite(n)?n:0)}
function date(value:string){return new Intl.DateTimeFormat("tr-TR",{dateStyle:"medium"}).format(new Date(value))}
function dateTime(value:string){return new Intl.DateTimeFormat("tr-TR",{dateStyle:"short",timeStyle:"short"}).format(new Date(value))}
function domainLabel(v:string){return v==="INCOME"?"Gelir":v==="EXPENSE"?"Gider":v==="CONFIGURATION"?"Finans Ayarı":v}
function eventLabel(v:string){return v.replaceAll("_"," ").toLocaleLowerCase("tr-TR").replace(/(^|\s)\S/g,(m)=>m.toLocaleUpperCase("tr-TR"))}
