"use client";

import { useEffect, useMemo, useState } from "react";
import { FinanceQuickCreate, type FinanceQuickCreateKind } from "@/components/finance-quick-create";
import { Alert, Button, Field, PageHeader, Select, Spinner } from "@/components/ui";
import { ValooSelect } from "@/components/valoo-controls";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";

type Category={id:string;code:string;name:string;active:boolean};
type Account={id:string;code:string;name:string;type:"ASSET"|"LIABILITY"|"EQUITY"|"REVENUE"|"EXPENSE";active:boolean};
type ExpenseMapping={id:string;categoryId:string;categoryCode:string;categoryName:string;expenseAccountId:string;expenseAccountCode:string;expenseAccountName:string;taxAccountId:string|null;taxAccountCode:string|null;taxAccountName:string|null;payableAccountId:string|null;payableAccountCode:string|null;payableAccountName:string|null;withholdingAccountId:string|null;withholdingAccountCode:string|null;withholdingAccountName:string|null};
type IncomeMapping={id:string;categoryId:string;categoryCode:string;categoryName:string;revenueAccountId:string;revenueAccountCode:string;revenueAccountName:string;taxAccountId:string|null;taxAccountCode:string|null;taxAccountName:string|null;receivableAccountId:string;receivableAccountCode:string;receivableAccountName:string};

export function FinanceAccountingMappings(){
 const[expenseCategories,setExpenseCategories]=useState<Category[]>([]),[incomeCategories,setIncomeCategories]=useState<Category[]>([]),[accounts,setAccounts]=useState<Account[]>([]);
 const[expenseMappings,setExpenseMappings]=useState<ExpenseMapping[]>([]),[incomeMappings,setIncomeMappings]=useState<IncomeMapping[]>([]);
 const[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const[expenseForm,setExpenseForm]=useState({categoryId:"",expenseAccountId:"",taxAccountId:"",payableAccountId:"",withholdingAccountId:""});
 const[incomeForm,setIncomeForm]=useState({categoryId:"",revenueAccountId:"",taxAccountId:"",receivableAccountId:""});
 const[quickCreate,setQuickCreate]=useState<{kind:FinanceQuickCreateKind;name:string}|null>(null);
 const canManage=hasPermission("finance","manage");
 async function load(){setLoading(true);setError("");try{const[initialExpenseCategories,initialIncomeCategories,a,em,im]=await Promise.all([
 api<Category[]>("/finance/setup/expense-categories"),api<Category[]>("/finance/setup/income-categories"),api<Account[]>("/accounting/accounts"),
 api<ExpenseMapping[]>("/finance/setup/expense-accounting-mappings"),api<IncomeMapping[]>("/finance/setup/income-accounting-mappings")
 ]);let ec=initialExpenseCategories,ic=initialIncomeCategories;if(!ec.length||!ic.length){await api("/finance/setup/bootstrap-default-taxonomy",{method:"POST"});[ec,ic]=await Promise.all([api<Category[]>("/finance/setup/expense-categories"),api<Category[]>("/finance/setup/income-categories")])}
 setExpenseCategories(ec.filter(x=>x.active));setIncomeCategories(ic.filter(x=>x.active));setAccounts(a.filter(x=>x.active));setExpenseMappings(em);setIncomeMappings(im)}catch(e){setError(e instanceof ApiError?e.message:"Finans yapılandırması yüklenemedi.")}finally{setLoading(false)}}
 useEffect(()=>{void load()},[]);
 const expenseAccounts=useMemo(()=>accounts.filter(x=>x.type==="EXPENSE"),[accounts]),revenueAccounts=useMemo(()=>accounts.filter(x=>x.type==="REVENUE"),[accounts]),assetAccounts=useMemo(()=>accounts.filter(x=>x.type==="ASSET"),[accounts]),liabilityAccounts=useMemo(()=>accounts.filter(x=>x.type==="LIABILITY"),[accounts]);
 async function saveExpense(){if(!expenseForm.categoryId||!expenseForm.expenseAccountId||!expenseForm.payableAccountId)return;setSaving(true);setError("");try{await api("/finance/setup/expense-accounting-mappings",{method:"PUT",body:{categoryId:expenseForm.categoryId,expenseAccountId:expenseForm.expenseAccountId,payableAccountId:expenseForm.payableAccountId,...(expenseForm.taxAccountId?{taxAccountId:expenseForm.taxAccountId}:{}),...(expenseForm.withholdingAccountId?{withholdingAccountId:expenseForm.withholdingAccountId}:{})}});setNotice("Gider muhasebe eşlemesi kaydedildi.");await load()}catch(e){setError(e instanceof ApiError?e.message:"Eşleme kaydedilemedi.")}finally{setSaving(false)}}
 async function saveIncome(){if(!incomeForm.categoryId||!incomeForm.revenueAccountId||!incomeForm.receivableAccountId)return;setSaving(true);setError("");try{await api("/finance/setup/income-accounting-mappings",{method:"PUT",body:{categoryId:incomeForm.categoryId,revenueAccountId:incomeForm.revenueAccountId,receivableAccountId:incomeForm.receivableAccountId,...(incomeForm.taxAccountId?{taxAccountId:incomeForm.taxAccountId}:{})}});setNotice("Gelir muhasebe eşlemesi kaydedildi.");await load()}catch(e){setError(e instanceof ApiError?e.message:"Eşleme kaydedilemedi.")}finally{setSaving(false)}}
 if(loading)return <Spinner label="Finans yapılandırması hazırlanıyor..."/>;
 return <div className="mx-auto max-w-[1500px] space-y-6 pb-12"><PageHeader title="Finans Yapılandırması" description="Gelir ve gider kategorilerini muhasebe hesaplarıyla eşleyin. Bu eşlemeler otomatik muhasebeleştirme ve ödeme/tahsilat için kullanılır."/>
 {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}{notice?<Alert tone="success" onClose={()=>setNotice("")}>{notice}</Alert>:null}
 <section className="grid gap-5 xl:grid-cols-2">
  <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5"><h2 className="text-[15px] font-semibold">Gider Muhasebe Eşlemesi</h2><p className="mt-1 text-[11px] text-[var(--muted)]">Gider kategorisini gider, vergi, borç ve stopaj hesaplarına bağlayın.</p><div className="mt-5 grid gap-4">
   <Field label="Gider Kategorisi"><ValooSelect value={expenseForm.categoryId} onChange={(categoryId)=>setExpenseForm({...expenseForm,categoryId})} placeholder="Gider kategorisi seçin" searchPlaceholder="Kategori ara…" emptyLabel="Gider kategorisi bulunamadı." options={expenseCategories.map(x=>({value:x.id,label:`${x.code} · ${x.name}`}))} createAction={canManage?{label:"Yeni gider kategorisi oluştur",onClick:(query)=>setQuickCreate({kind:"expense-category",name:query})}:undefined}/></Field>
   <Field label="Gider Hesabı"><Select value={expenseForm.expenseAccountId} onChange={e=>setExpenseForm({...expenseForm,expenseAccountId:e.target.value})}><option value="">Seçin</option>{expenseAccounts.map(x=><option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}</Select></Field>
   <Field label="Borç / Satıcı Hesabı"><Select value={expenseForm.payableAccountId} onChange={e=>setExpenseForm({...expenseForm,payableAccountId:e.target.value})}><option value="">Seçin</option>{liabilityAccounts.map(x=><option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}</Select></Field>
   <Field label="Vergi Hesabı"><Select value={expenseForm.taxAccountId} onChange={e=>setExpenseForm({...expenseForm,taxAccountId:e.target.value})}><option value="">Yok</option>{[...assetAccounts,...liabilityAccounts].map(x=><option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}</Select></Field>
   <Field label="Stopaj Hesabı"><Select value={expenseForm.withholdingAccountId} onChange={e=>setExpenseForm({...expenseForm,withholdingAccountId:e.target.value})}><option value="">Yok</option>{liabilityAccounts.map(x=><option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}</Select></Field>
   <Button onClick={()=>void saveExpense()} disabled={saving||!expenseForm.categoryId||!expenseForm.expenseAccountId||!expenseForm.payableAccountId}>{saving?"Kaydediliyor...":"Gider Eşlemesini Kaydet"}</Button>
  </div></div>
  <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5"><h2 className="text-[15px] font-semibold">Gelir Muhasebe Eşlemesi</h2><p className="mt-1 text-[11px] text-[var(--muted)]">Gelir kategorisini gelir, vergi ve alacak hesaplarına bağlayın.</p><div className="mt-5 grid gap-4">
   <Field label="Gelir Kategorisi"><ValooSelect value={incomeForm.categoryId} onChange={(categoryId)=>setIncomeForm({...incomeForm,categoryId})} placeholder="Gelir kategorisi seçin" searchPlaceholder="Kategori ara…" emptyLabel="Gelir kategorisi bulunamadı." options={incomeCategories.map(x=>({value:x.id,label:`${x.code} · ${x.name}`}))} createAction={canManage?{label:"Yeni gelir kategorisi oluştur",onClick:(query)=>setQuickCreate({kind:"income-category",name:query})}:undefined}/></Field>
   <Field label="Gelir Hesabı"><Select value={incomeForm.revenueAccountId} onChange={e=>setIncomeForm({...incomeForm,revenueAccountId:e.target.value})}><option value="">Seçin</option>{revenueAccounts.map(x=><option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}</Select></Field>
   <Field label="Alacak Hesabı"><Select value={incomeForm.receivableAccountId} onChange={e=>setIncomeForm({...incomeForm,receivableAccountId:e.target.value})}><option value="">Seçin</option>{assetAccounts.map(x=><option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}</Select></Field>
   <Field label="Vergi Hesabı"><Select value={incomeForm.taxAccountId} onChange={e=>setIncomeForm({...incomeForm,taxAccountId:e.target.value})}><option value="">Yok</option>{liabilityAccounts.map(x=><option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}</Select></Field>
   <Button onClick={()=>void saveIncome()} disabled={saving||!incomeForm.categoryId||!incomeForm.revenueAccountId||!incomeForm.receivableAccountId}>{saving?"Kaydediliyor...":"Gelir Eşlemesini Kaydet"}</Button>
  </div></div>
 </section>
 {quickCreate?<FinanceQuickCreate
   open
   kind={quickCreate.kind}
   initialName={quickCreate.name}
   onClose={()=>setQuickCreate(null)}
   onCreated={(entity)=>{
     const created:Category={id:entity.id,code:entity.code,name:entity.name,active:entity.active};
     if(quickCreate.kind==="expense-category"){
       setExpenseCategories(current=>[...current.filter(item=>item.id!==created.id),created].sort((a,b)=>a.name.localeCompare(b.name,"tr")));
       setExpenseForm(current=>({...current,categoryId:created.id}));
     }else if(quickCreate.kind==="income-category"){
       setIncomeCategories(current=>[...current.filter(item=>item.id!==created.id),created].sort((a,b)=>a.name.localeCompare(b.name,"tr")));
       setIncomeForm(current=>({...current,categoryId:created.id}));
     }
     setQuickCreate(null);
   }}
 />:null}
 <section className="grid gap-5 xl:grid-cols-2"><MappingTable title="Mevcut Gider Eşlemeleri" rows={expenseMappings.map(x=>({category:x.categoryName,primary:`${x.expenseAccountCode} · ${x.expenseAccountName}`,secondary:`${x.payableAccountCode??"—"} · ${x.payableAccountName??"—"}`}))}/><MappingTable title="Mevcut Gelir Eşlemeleri" rows={incomeMappings.map(x=>({category:x.categoryName,primary:`${x.revenueAccountCode} · ${x.revenueAccountName}`,secondary:`${x.receivableAccountCode} · ${x.receivableAccountName}`}))}/></section>
 </div>
}
function MappingTable({title,rows}:{title:string;rows:Array<{category:string;primary:string;secondary:string}>}){return <section className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)]"><div className="border-b border-[var(--line)] px-5 py-4"><h2 className="text-[14px] font-semibold">{title}</h2></div><div className="divide-y divide-[var(--line)]">{rows.map((r,i)=><div key={`${r.category}-${i}`} className="grid gap-2 px-5 py-4 md:grid-cols-3"><strong className="text-[12px]">{r.category}</strong><span className="text-[11px] text-[var(--muted)]">{r.primary}</span><span className="text-[11px] text-[var(--muted)]">{r.secondary}</span></div>)}{!rows.length?<div className="px-5 py-10 text-center text-[11px] text-[var(--muted)]">Henüz eşleme yok.</div>:null}</div></section>}
