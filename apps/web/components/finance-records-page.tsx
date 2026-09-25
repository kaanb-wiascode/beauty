"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { FormActions, FormGrid, FormSection } from "@/components/form-system";
import { Modal } from "@/components/modal";
import { Alert, Button, EmptyState, Field, PageHeader, Select, Spinner, TextArea, TextInput } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";

type Mode = "expense" | "income";
type Category = { id:string; code:string; name:string; parentId:string|null; active:boolean };
type CostCenter = { id:string; code:string; name:string; active:boolean };
type Account = { id:string; code:string; name:string; type:string; active:boolean };
type FinanceRecord = {
  id:string; categoryId:string; costCenterId:string|null; counterpartyName:string|null;
  counterpartyTaxNumber:string|null; documentType:string|null; documentNumber:string|null;
  documentDate:string|null; transactionDate:string; dueDate:string|null; grossAmount:number;
  netAmount:number; taxAmount:number; withholdingAmount?:number; currency:string; exchangeRate:number;
  description:string|null; approvalStatus:string; paymentStatus?:string; collectionStatus?:string;
  reconciliationStatus:string; accountingStatus:string; version:number;
};
type RecordForm = {
  categoryId:string; costCenterId:string; counterpartyName:string; counterpartyTaxNumber:string;
  documentType:string; documentNumber:string; documentDate:string; transactionDate:string; dueDate:string;
  grossAmount:string; netAmount:string; taxAmount:string; withholdingAmount:string; currency:string;
  exchangeRate:string; description:string;
};

const today=()=>new Date().toISOString().slice(0,10);
const initialForm=():RecordForm=>({
  categoryId:"",costCenterId:"",counterpartyName:"",counterpartyTaxNumber:"",
  documentType:"",documentNumber:"",documentDate:"",transactionDate:today(),dueDate:"",
  grossAmount:"",netAmount:"",taxAmount:"0",withholdingAmount:"0",currency:"TRY",exchangeRate:"1",description:"",
});
const money=(value:number|string|null|undefined,currency="TRY")=>new Intl.NumberFormat("tr-TR",{style:"currency",currency,maximumFractionDigits:2}).format(Number(value??0));
const date=(value:string|null|undefined)=>value?new Date(value).toLocaleDateString("tr-TR"):"—";
const labels:Record<string,string>={
  DRAFT:"Taslak",SUBMITTED:"Onay Bekliyor",APPROVED:"Onaylandı",REJECTED:"Reddedildi",CANCELLED:"İptal Edildi",
  UNPAID:"Ödenmedi",PARTIALLY_PAID:"Kısmen Ödendi",PAID:"Ödendi",
  UNCOLLECTED:"Tahsil Edilmedi",PARTIALLY_COLLECTED:"Kısmen Tahsil Edildi",COLLECTED:"Tahsil Edildi",
  UNPOSTED:"Muhasebeleştirilmedi",READY_TO_POST:"Muhasebeleştirmeye Hazır",POSTED:"Muhasebeleştirildi",REVERSED:"Ters Kayıt",
};
const statusLabel=(value:string|undefined)=>value?(labels[value]??value):"—";
function pill(value:string|undefined){
  const positive=["APPROVED","PAID","COLLECTED","POSTED"].includes(value??"");
  const negative=["REJECTED","CANCELLED","REVERSED"].includes(value??"");
  return \`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold \${positive?"bg-[var(--secondary-soft)] text-[var(--secondary)]":negative?"bg-[var(--danger-soft)] text-[var(--danger)]":"bg-[var(--surface-2)] text-[var(--muted)]"}\`;
}

export function FinanceRecordsPage({mode}:{mode:Mode}){
  const expense=mode==="expense";
  const basePath=expense?"/finance/expenses":"/finance/income";
  const title=expense?"Gider Yönetimi":"Gelir Yönetimi";
  const canManage=hasPermission("finance","manage");

  const[records,setRecords]=useState<FinanceRecord[]>([]);
  const[categories,setCategories]=useState<Category[]>([]);
  const[costCenters,setCostCenters]=useState<CostCenter[]>([]);
  const[accounts,setAccounts]=useState<Account[]>([]);
  const[loading,setLoading]=useState(true),[working,setWorking]=useState(false);
  const[error,setError]=useState(""),[notice,setNotice]=useState("");
  const[search,setSearch]=useState(""),[approvalFilter,setApprovalFilter]=useState("");
  const[createOpen,setCreateOpen]=useState(false),[selected,setSelected]=useState<FinanceRecord|null>(null),[moneyOpen,setMoneyOpen]=useState(false);
  const[form,setForm]=useState<RecordForm>(initialForm);
  const[amount,setAmount]=useState(""),[accountId,setAccountId]=useState(""),[method,setMethod]=useState("TRANSFER"),[reference,setReference]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      let[nextRecords,nextCategories,nextCostCenters,nextAccounts]=await Promise.all([
        api<FinanceRecord[]>(expense?"/finance/expenses?limit=200":"/finance/income?limit=200"),
        api<Category[]>(\`/finance/setup/\${expense?"expense":"income"}-categories\`),
        api<CostCenter[]>("/finance/setup/cost-centers"),
        api<Account[]>("/accounting/accounts"),
      ]);
      if(!nextCategories.length&&canManage){
        await api("/finance/setup/bootstrap-default-taxonomy",{method:"POST"});
        nextCategories=await api<Category[]>(\`/finance/setup/\${expense?"expense":"income"}-categories\`);
      }
      setRecords(nextRecords);
      setCategories(nextCategories.filter(x=>x.active));
      setCostCenters(nextCostCenters.filter(x=>x.active));
      setAccounts(nextAccounts.filter(x=>x.active&&x.type==="ASSET"));
    }catch(e){setError(e instanceof ApiError?e.message:"Finans kayıtları yüklenemedi.");}
    finally{setLoading(false);}
  },[expense,canManage]);
  useEffect(()=>{void load();},[load]);

  const filtered=useMemo(()=>records.filter(record=>{
    if(approvalFilter&&record.approvalStatus!==approvalFilter)return false;
    if(!search.trim())return true;
    const category=categories.find(x=>x.id===record.categoryId)?.name??"";
    return [record.counterpartyName,record.documentNumber,record.description,category].join(" ").toLocaleLowerCase("tr-TR").includes(search.trim().toLocaleLowerCase("tr-TR"));
  }),[records,approvalFilter,search,categories]);

  const metrics=useMemo(()=>({
    total:records.reduce((sum,r)=>sum+Number(r.grossAmount||0),0),
    approved:records.filter(r=>r.approvalStatus==="APPROVED").length,
    pending:records.filter(r=>r.approvalStatus==="SUBMITTED").length,
    openMoney:records.filter(r=>expense?!["PAID","CANCELLED"].includes(r.paymentStatus??""):r.collectionStatus!=="COLLECTED").length,
  }),[records,expense]);

  async function createRecord(event:FormEvent){
    event.preventDefault();
    if(!form.categoryId||!form.transactionDate||!form.grossAmount||!form.netAmount){setError("Kategori, işlem tarihi, brüt tutar ve net tutar zorunludur.");return;}
    setWorking(true);setError("");
    try{
      await api(basePath,{method:"POST",body:{
        categoryId:form.categoryId,
        ...(form.costCenterId?{costCenterId:form.costCenterId}:{}),
        ...(form.counterpartyName?{counterpartyName:form.counterpartyName}:{}),
        ...(form.counterpartyTaxNumber?{counterpartyTaxNumber:form.counterpartyTaxNumber}:{}),
        ...(form.documentType?{documentType:form.documentType}:{}),
        ...(form.documentNumber?{documentNumber:form.documentNumber}:{}),
        ...(form.documentDate?{documentDate:form.documentDate}:{}),
        transactionDate:form.transactionDate,
        ...(form.dueDate?{dueDate:form.dueDate}:{}),
        grossAmount:Number(form.grossAmount),netAmount:Number(form.netAmount),taxAmount:Number(form.taxAmount||0),
        ...(expense?{withholdingAmount:Number(form.withholdingAmount||0)}:{}),
        currency:form.currency.toUpperCase(),exchangeRate:Number(form.exchangeRate||1),
        ...(form.description?{description:form.description}:{}),
      }});
      setCreateOpen(false);setForm(initialForm());setNotice(\`\${expense?"Gider":"Gelir"} kaydı oluşturuldu.\`);await load();
    }catch(e){setError(e instanceof ApiError?e.message:"Kayıt oluşturulamadı.");}
    finally{setWorking(false);}
  }

  async function transition(action:"submit"|"approve"){
    if(!selected)return;setWorking(true);setError("");
    try{
      await api(\`\${basePath}/\${selected.id}/\${action}\`,{method:"POST"});
      const next=await api<FinanceRecord>(\`\${basePath}/\${selected.id}\`);
      setSelected(next);setNotice(action==="submit"?"Kayıt onaya gönderildi.":"Kayıt onaylandı.");await load();
    }catch(e){setError(e instanceof ApiError?e.message:"İşlem tamamlanamadı.");}
    finally{setWorking(false);}
  }

  async function postAccounting(){
    if(!selected)return;setWorking(true);setError("");
    try{
      await api(\`\${basePath}/\${selected.id}/accounting/prepare\`,{method:"POST"});
      await api(\`\${basePath}/\${selected.id}/accounting/post\`,{method:"POST"});
      const next=await api<FinanceRecord>(\`\${basePath}/\${selected.id}\`);
      setSelected(next);setNotice("Kayıt muhasebeleştirildi.");await load();
    }catch(e){setError(e instanceof ApiError?e.message:"Muhasebeleştirme tamamlanamadı. Kategori muhasebe eşlemesini kontrol edin.");}
    finally{setWorking(false);}
  }

  function openMoney(record:FinanceRecord){
    setSelected(record);setAmount(String(record.grossAmount));setAccountId(accounts[0]?.id??"");setMethod("TRANSFER");setReference("");setMoneyOpen(true);
  }

  async function recordMoney(event:FormEvent){
    event.preventDefault();if(!selected||!accountId||!Number(amount))return;setWorking(true);setError("");
    try{
      const path=expense?\`\${basePath}/\${selected.id}/payments\`:\`\${basePath}/\${selected.id}/collections\`;
      const body=expense
        ?{amount:Number(amount),paymentAccountId:accountId,method,...(reference?{reference}:{})}
        :{amount:Number(amount),collectionAccountId:accountId,method,...(reference?{reference}:{})};
      await api(path,{method:"POST",body});
      setMoneyOpen(false);setSelected(null);setNotice(expense?"Ödeme kaydedildi.":"Tahsilat kaydedildi.");await load();
    }catch(e){setError(e instanceof ApiError?e.message:"Nakit hareketi kaydedilemedi.");}
    finally{setWorking(false);}
  }

  if(loading&&!records.length)return <Spinner label={\`\${title} hazırlanıyor...\`}/>;

  return <div className="mx-auto max-w-[1500px] space-y-6 pb-12">
    <PageHeader title={title} description={expense?"Gideri kaydetme, onay, muhasebe ve ödeme süreçlerini tek merkezden yönetin.":"Satış dışı ve operasyonel gelirlerin kayıt, onay, muhasebe ve tahsilat süreçlerini yönetin."} action={canManage?<Button onClick={()=>{setForm(initialForm());setCreateOpen(true);}}>+ Yeni {expense?"Gider":"Gelir"}</Button>:undefined}/>
    {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}
    {notice?<Alert tone="success" onClose={()=>setNotice("")}>{notice}</Alert>:null}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Kayıtlı Tutar" value={money(metrics.total)}/>
      <Metric label="Onaylanan Kayıt" value={metrics.approved}/>
      <Metric label="Onay Bekleyen" value={metrics.pending}/>
      <Metric label={expense?"Ödemesi Açık":"Tahsilatı Açık"} value={metrics.openMoney}/>
    </section>

    <section className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)]">
      <div className="grid gap-3 border-b border-[var(--line)] p-4 md:grid-cols-[1fr_220px_auto]">
        <TextInput value={search} onChange={e=>setSearch(e.target.value)} placeholder="Karşı taraf, belge no, kategori veya açıklama ara..."/>
        <Select value={approvalFilter} onChange={e=>setApprovalFilter(e.target.value)}>
          <option value="">Tüm onay durumları</option><option value="DRAFT">Taslak</option><option value="SUBMITTED">Onay bekliyor</option><option value="APPROVED">Onaylandı</option><option value="REJECTED">Reddedildi</option>
        </Select>
        <Button variant="secondary" onClick={()=>void load()} disabled={loading}>{loading?"Yükleniyor...":"Yenile"}</Button>
      </div>
      {filtered.length?<div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-xs">
        <thead><tr className="border-b border-[var(--line)] bg-[var(--surface-2)]/45 text-[10px] uppercase tracking-[.08em] text-[var(--muted-soft)]">
          <th className="px-4 py-3">Tarih</th><th className="px-4 py-3">Kategori</th><th className="px-4 py-3">Karşı Taraf</th><th className="px-4 py-3">Belge</th><th className="px-4 py-3">Tutar</th><th className="px-4 py-3">Onay</th><th className="px-4 py-3">{expense?"Ödeme":"Tahsilat"}</th><th className="px-4 py-3">Muhasebe</th><th className="px-4 py-3">İşlem</th>
        </tr></thead>
        <tbody>{filtered.map(record=><tr key={record.id} className="border-b border-[var(--line)] last:border-0">
          <td className="px-4 py-4 text-[var(--muted)]">{date(record.transactionDate)}</td>
          <td className="px-4 py-4 font-medium text-[var(--ink)]">{categories.find(x=>x.id===record.categoryId)?.name??"Kategori"}</td>
          <td className="px-4 py-4 text-[var(--muted)]">{record.counterpartyName||"—"}</td>
          <td className="px-4 py-4 text-[var(--muted)]">{record.documentNumber||"—"}</td>
          <td className="px-4 py-4 font-semibold text-[var(--ink)]">{money(record.grossAmount,record.currency)}</td>
          <td className="px-4 py-4"><span className={pill(record.approvalStatus)}>{statusLabel(record.approvalStatus)}</span></td>
          <td className="px-4 py-4"><span className={pill(expense?record.paymentStatus:record.collectionStatus)}>{statusLabel(expense?record.paymentStatus:record.collectionStatus)}</span></td>
          <td className="px-4 py-4"><span className={pill(record.accountingStatus)}>{statusLabel(record.accountingStatus)}</span></td>
          <td className="px-4 py-4"><Button size="sm" variant="secondary" onClick={()=>setSelected(record)}>Aç</Button></td>
        </tr>)}</tbody>
      </table></div>:<EmptyState title="Kayıt bulunamadı" description={expense?"Henüz gider kaydı yok veya filtrelere uyan kayıt bulunamadı.":"Henüz gelir kaydı yok veya filtrelere uyan kayıt bulunamadı."}/>}
    </section>

    <Modal open={createOpen} onClose={()=>setCreateOpen(false)} size="lg" title={\`Yeni \${expense?"Gider":"Gelir"}\`} description="Finansal olayı kaydedin. Ödeme veya tahsilat ayrı bir nakit hareketi olarak işlenir.">
      <form onSubmit={createRecord} className="space-y-5">
        <FormSection title="Kayıt Bilgileri"><FormGrid>
          <Field label="Kategori" required><Select value={form.categoryId} onChange={e=>setForm({...form,categoryId:e.target.value})} required><option value="">Kategori seçin</option>{categories.map(x=><option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}</Select></Field>
          <Field label="Masraf / Maliyet Merkezi"><Select value={form.costCenterId} onChange={e=>setForm({...form,costCenterId:e.target.value})}><option value="">Seçilmedi</option>{costCenters.map(x=><option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}</Select></Field>
          <Field label="Karşı Taraf"><TextInput value={form.counterpartyName} onChange={e=>setForm({...form,counterpartyName:e.target.value})} placeholder="Firma, kişi veya kurum"/></Field>
          <Field label="Vergi / Kimlik No"><TextInput value={form.counterpartyTaxNumber} onChange={e=>setForm({...form,counterpartyTaxNumber:e.target.value})}/></Field>
        </FormGrid></FormSection>
        <FormSection title="Belge ve Tarihler"><FormGrid columns={3}>
          <Field label="Belge Türü"><TextInput value={form.documentType} onChange={e=>setForm({...form,documentType:e.target.value})} placeholder="Fatura, makbuz, sözleşme..."/></Field>
          <Field label="Belge No"><TextInput value={form.documentNumber} onChange={e=>setForm({...form,documentNumber:e.target.value})}/></Field>
          <Field label="Belge Tarihi"><TextInput type="date" value={form.documentDate} onChange={e=>setForm({...form,documentDate:e.target.value})}/></Field>
          <Field label="İşlem Tarihi" required><TextInput type="date" value={form.transactionDate} onChange={e=>setForm({...form,transactionDate:e.target.value})} required/></Field>
          <Field label="Vade Tarihi"><TextInput type="date" value={form.dueDate} onChange={e=>setForm({...form,dueDate:e.target.value})}/></Field>
        </FormGrid></FormSection>
        <FormSection title="Tutarlar"><FormGrid columns={3}>
          <Field label="Brüt Tutar" required><TextInput type="number" min="0" step="0.01" value={form.grossAmount} onChange={e=>setForm({...form,grossAmount:e.target.value})} required/></Field>
          <Field label="Net Tutar" required><TextInput type="number" min="0" step="0.01" value={form.netAmount} onChange={e=>setForm({...form,netAmount:e.target.value})} required/></Field>
          <Field label="Vergi"><TextInput type="number" min="0" step="0.01" value={form.taxAmount} onChange={e=>setForm({...form,taxAmount:e.target.value})}/></Field>
          {expense?<Field label="Stopaj"><TextInput type="number" min="0" step="0.01" value={form.withholdingAmount} onChange={e=>setForm({...form,withholdingAmount:e.target.value})}/></Field>:null}
          <Field label="Para Birimi"><TextInput maxLength={3} value={form.currency} onChange={e=>setForm({...form,currency:e.target.value.toUpperCase()})}/></Field>
          <Field label="Kur"><TextInput type="number" min="0.000001" step="0.000001" value={form.exchangeRate} onChange={e=>setForm({...form,exchangeRate:e.target.value})}/></Field>
        </FormGrid><Field label="Açıklama"><TextArea rows={3} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Kaydın nedenini ve gerekli notları yazın."/></Field></FormSection>
        <FormActions sticky><Button variant="secondary" onClick={()=>setCreateOpen(false)} disabled={working}>Vazgeç</Button><Button type="submit" disabled={working}>{working?"Kaydediliyor...":"Taslak Olarak Kaydet"}</Button></FormActions>
      </form>
    </Modal>

    <Modal open={Boolean(selected)&&!moneyOpen} onClose={()=>setSelected(null)} size="lg" title={expense?"Gider Detayı":"Gelir Detayı"} description="Onay, muhasebe ve nakit hareketlerini yönetin.">
      {selected?<div className="space-y-5">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Detail label="Brüt Tutar" value={money(selected.grossAmount,selected.currency)}/><Detail label="Net Tutar" value={money(selected.netAmount,selected.currency)}/><Detail label="Vergi" value={money(selected.taxAmount,selected.currency)}/>{expense?<Detail label="Stopaj" value={money(selected.withholdingAmount,selected.currency)}/>:<Detail label="Vade" value={date(selected.dueDate)}/>}</section>
        <section className="grid gap-4 rounded-[18px] border border-[var(--line)] bg-[var(--surface-2)]/35 p-5 md:grid-cols-2">
          <Detail label="Kategori" value={categories.find(x=>x.id===selected.categoryId)?.name??"—"}/><Detail label="Karşı Taraf" value={selected.counterpartyName||"—"}/><Detail label="İşlem Tarihi" value={date(selected.transactionDate)}/><Detail label="Belge" value={[selected.documentType,selected.documentNumber].filter(Boolean).join(" · ")||"—"}/><Detail label="Onay Durumu" value={statusLabel(selected.approvalStatus)}/><Detail label={expense?"Ödeme Durumu":"Tahsilat Durumu"} value={statusLabel(expense?selected.paymentStatus:selected.collectionStatus)}/><Detail label="Muhasebe Durumu" value={statusLabel(selected.accountingStatus)}/><Detail label="Açıklama" value={selected.description||"—"}/>
        </section>
        {canManage?<div className="flex flex-wrap gap-2 border-t border-[var(--line)] pt-5">
          {["DRAFT","REJECTED"].includes(selected.approvalStatus)?<Button onClick={()=>void transition("submit")} disabled={working}>Onaya Gönder</Button>:null}
          {selected.approvalStatus==="SUBMITTED"?<Button variant="success" onClick={()=>void transition("approve")} disabled={working}>Onayla</Button>:null}
          {selected.approvalStatus==="APPROVED"&&selected.accountingStatus!=="POSTED"?<Button variant="secondary" onClick={()=>void postAccounting()} disabled={working}>Muhasebeleştir</Button>:null}
          {selected.approvalStatus==="APPROVED"&&selected.accountingStatus==="POSTED"?<Button variant="secondary" onClick={()=>openMoney(selected)} disabled={working||!accounts.length}>{expense?"Ödeme Kaydet":"Tahsilat Kaydet"}</Button>:null}
        </div>:null}
        {!accounts.length&&selected.accountingStatus==="POSTED"?<Alert>Ödeme veya tahsilat için aktif bir kasa/banka muhasebe hesabı bulunamadı.</Alert>:null}
      </div>:null}
    </Modal>

    <Modal open={moneyOpen} onClose={()=>setMoneyOpen(false)} title={expense?"Ödeme Kaydet":"Tahsilat Kaydet"} description={expense?"Onaylı giderin ödeme hareketini kaydedin.":"Onaylı gelirin tahsilat hareketini kaydedin."}>
      <form onSubmit={recordMoney} className="space-y-4">
        <Field label="Tutar" required><TextInput type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} required/></Field>
        <Field label={expense?"Ödeme Hesabı":"Tahsilat Hesabı"} required><Select value={accountId} onChange={e=>setAccountId(e.target.value)} required><option value="">Kasa / banka hesabı seçin</option>{accounts.map(x=><option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}</Select></Field>
        <Field label="Yöntem" required><Select value={method} onChange={e=>setMethod(e.target.value)}><option value="TRANSFER">Banka Havalesi / EFT</option><option value="CASH">Nakit</option><option value="CARD">Kart</option><option value="OTHER">Diğer</option></Select></Field>
        <Field label="Referans / Dekont No"><TextInput value={reference} onChange={e=>setReference(e.target.value)}/></Field>
        <FormActions><Button variant="secondary" onClick={()=>setMoneyOpen(false)} disabled={working}>Vazgeç</Button><Button type="submit" disabled={working||!accountId}>{working?"Kaydediliyor...":expense?"Ödemeyi Kaydet":"Tahsilatı Kaydet"}</Button></FormActions>
      </form>
    </Modal>
  </div>;
}

function Metric({label,value}:{label:string;value:string|number}){return <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4"><p className="text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--muted-soft)]">{label}</p><p className="mt-2 text-[22px] font-semibold tracking-[-.03em] text-[var(--ink)]">{value}</p></div>}
function Detail({label,value}:{label:string;value:string|number}){return <div><p className="text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--muted-soft)]">{label}</p><p className="mt-1 text-[13px] font-medium text-[var(--ink)]">{value}</p></div>}
