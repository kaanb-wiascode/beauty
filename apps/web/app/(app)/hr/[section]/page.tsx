"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError, withQuery } from "@/lib/api";
import { GlassCard, Button, Alert, Spinner, Field, TextInput, Select, TableWrap, Th, Td, StatusBadge } from "@/components/ui";

const cfg: any = {
  employees: { title: "Çalışanlar", get: "/hr/employees", post: "/staff", fields: ["firstName","lastName","phone","email","personnelNumber","position","department","employmentType","hireDate","salary","iban","bankName"] },
  "personnel-files": { title: "Özlük Dosyaları", get: "/hr/personnel-files", fields: ["firstName","lastName","identityNumber","department","position","hireDate","salary","iban","bankName"] },
  attendance: { title: "Puantaj", get: "/hr/attendance", post: "/hr/attendance", fields: ["staffId","workDate","checkIn","checkOut","breakMinutes","workedMinutes","overtimeMinutes","status","note"] },
  leaves: { title: "İzinler", get: "/hr/leaves", post: "/hr/leaves", fields: ["staffId","type","startDate","endDate","days","status","reason"] },
  payroll: { title: "Bordro", get: "/hr/payroll", post: "/hr/payroll/periods", fields: ["year","month"] },
  payments: { title: "Maaş Ödemeleri", get: "/hr/payments", post: "/hr/payments", fields: ["staffId","year","month","amount","method","status","paidAt","note"] },
  sgk: { title: "SGK İşlemleri", get: "/hr/sgk", post: "/hr/sgk", fields: ["staffId","year","month","status","documentNo","recordDate","note"] },
};
const labels: any = { firstName:"Ad",lastName:"Soyad",phone:"Telefon",email:"E-posta",personnelNumber:"Sicil No",identityNumber:"T.C. Kimlik No",position:"Pozisyon",department:"Departman",employmentType:"Çalışma Tipi",hireDate:"İşe Giriş",salary:"Brüt Maaş",iban:"IBAN",bankName:"Banka",staffId:"Personel",workDate:"Tarih",checkIn:"Giriş",checkOut:"Çıkış",breakMinutes:"Mola dk",workedMinutes:"Çalışma dk",overtimeMinutes:"Fazla Mesai dk",status:"Durum",note:"Not",type:"İzin Türü",startDate:"Başlangıç",endDate:"Bitiş",days:"Gün",reason:"Açıklama",year:"Yıl",month:"Ay",amount:"Tutar",method:"Yöntem",paidAt:"Ödeme Tarihi",documentNo:"Belge No",recordDate:"Kayıt Tarihi" };
const dateFields = new Set(["hireDate","workDate","startDate","endDate","paidAt","recordDate"]);
const numberFields = new Set(["salary","breakMinutes","workedMinutes","overtimeMinutes","days","year","month","amount"]);
const selectValues: any = { status: ["PENDING","APPROVED","PAID","PRESENT","ABSENT","DRAFT"], type:["ANNUAL","SICK","EXCUSE","UNPAID","OTHER"], method:["BANK","CASH"] };
function display(v:any){ if(v===null||v===undefined||v==="") return "—"; if(typeof v==="string" && v.includes("T")) return new Date(v).toLocaleString("tr-TR"); return String(v); }
function prettyStatus(v:any){ const map:any={PENDING:"Bekliyor",APPROVED:"Onaylandı",PAID:"Ödendi",PRESENT:"Mevcut",ABSENT:"Devamsız",DRAFT:"Taslak"}; return map[v]||display(v); }

export default function HRSection(){
  const { section } = useParams<{section:string}>();
  const c = cfg[section];
  const now = new Date();
  const [year,setYear]=useState(now.getFullYear());
  const [month,setMonth]=useState(now.getMonth()+1);
  const [rows,setRows]=useState<any[]>([]);
  const [staff,setStaff]=useState<any[]>([]);
  const [form,setForm]=useState<any>({year:now.getFullYear(),month:now.getMonth()+1});
  const [edit,setEdit]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");

  const load=async()=>{ if(!c)return; setLoading(true); setError(""); try{
    const needsPeriod=["attendance","payroll","payments","sgk"].includes(section);
    const r=await api<any>(needsPeriod?withQuery(c.get,{year,month}):c.get);
    setRows(Array.isArray(r)?r:r?.data??[]);
    if(section!=="employees"&&section!=="personnel-files"){
      const s=await api<any>("/hr/employees"); setStaff(Array.isArray(s)?s:s?.data??[]);
    } else setStaff(Array.isArray(r)?r:r?.data??[]);
  }catch(e){setError(e instanceof ApiError?e.message:"İK verileri yüklenemedi.");}finally{setLoading(false);} };
  useEffect(()=>{void load();},[section,year,month]);

  const normalize=(raw:any)=>{const b={...raw}; if(section==="employees"){
      const profile:any={}; for(const k of ["personnelNumber","identityNumber","position","department","employmentType","hireDate","salary","iban","bankName"]){if(b[k]!==undefined&&b[k]!=="")profile[k]=numberFields.has(k)?Number(b[k]):b[k];}
      return {firstName:b.firstName,lastName:b.lastName,phone:b.phone||undefined,email:b.email||undefined,profile};
    }
    for(const k of Object.keys(b)) if(numberFields.has(k)&&b[k]!=="") b[k]=Number(b[k]);
    return b;
  };
  const save=async()=>{if(!c.post)return; setSaving(true); setError(""); try{await api(edit&&section!=="attendance"?`${c.get}/${edit.id}`:c.post,{method:edit&&section!=="attendance"?"PATCH":"POST",body:normalize(form)});setForm({year,month});setEdit(null);await load();}catch(e){setError(e instanceof ApiError?e.message:"Kayıt kaydedilemedi.");}finally{setSaving(false);}};
  const startEdit=(r:any)=>{setEdit(r);setForm({...r,year:r.year??year,month:r.month??month});window.scrollTo({top:0,behavior:"smooth"});};
  const remove=async(id:string)=>{if(!id||!confirm("Bu kayıt silinsin/arşivlensin mi?"))return;try{await api(`${c.get}/${id}`,{method:"DELETE"});await load();}catch(e){setError(e instanceof ApiError?e.message:"Silme işlemi başarısız.");}};

  if(!c)return <GlassCard><p className="text-sm text-[var(--muted)]">İK sayfası bulunamadı.</p></GlassCard>;
  const editable=["employees","attendance","leaves"].includes(section);
  const period=["attendance","payroll","payments","sgk"].includes(section);
  return <div className="mx-auto max-w-[1320px] space-y-5 pb-10">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0"><p className="mb-2 text-[11px] font-semibold uppercase tracking-[.16em] text-[var(--accent)]">İnsan Kaynakları & Özlük</p><h1 className="text-[32px] font-semibold leading-tight tracking-[-.045em] text-[var(--ink)] sm:text-[38px]">{c.title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">Çalışan, özlük ve dönemsel İK kayıtlarını Beauty ERP tasarım sistemi üzerinden yönetin.</p></div>
      {period?<div className="glass flex items-center gap-2 rounded-[16px] p-2"><div className="w-[110px]"><Field label="Yıl"><TextInput type="number" value={year} onChange={e=>setYear(Number(e.target.value))}/></Field></div><div className="w-[125px]"><Field label="Dönem"><Select value={month} onChange={e=>setMonth(Number(e.target.value))}>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}. Ay</option>)}</Select></div></div>:null}
    </div>
    {error&&<Alert onClose={()=>setError("")}>{error}</Alert>}
    {c.post&&<GlassCard className="!p-5 sm:!p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--accent)]">Kayıt yönetimi</p><h2 className="mt-1 text-lg font-semibold tracking-[-.02em] text-[var(--ink)]">{edit?"Kaydı Güncelle":"Yeni Kayıt"}</h2><p className="mt-1 text-xs text-[var(--muted)]">Alanları doldurun ve güvenli biçimde kaydedin.</p></div>{edit&&<Button variant="ghost" onClick={()=>{setEdit(null);setForm({year,month});}}>Vazgeç</Button>}</div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{c.fields.map((f:string)=><Field key={f} label={labels[f]||f} required={f==="firstName"||f==="lastName"}>{f==="staffId"?<Select value={form[f]??""} onChange={e=>setForm({...form,[f]:e.target.value})}><option value="">Personel seçin</option>{staff.map(s=><option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}</Select>:selectValues[f]?<Select value={form[f]??""} onChange={e=>setForm({...form,[f]:e.target.value})}><option value="">Seçin</option>{selectValues[f].map((x:string)=><option key={x} value={x}>{prettyStatus(x)}</option>)}</Select>:<TextInput type={dateFields.has(f)?"date":numberFields.has(f)?"number":"text"} value={form[f]??""} onChange={e=>setForm({...form,[f]:e.target.value})}/>}</Field>)}</div>
      <div className="mt-5 flex flex-wrap gap-2"><Button onClick={save} disabled={saving}>{saving?"Kaydediliyor…":edit?"Güncelle":"Kaydet"}</Button>{edit&&<Button variant="secondary" onClick={()=>{setEdit(null);setForm({year,month});}}>İptal</Button>}</div>
    </GlassCard>}
    {loading?<GlassCard className="flex min-h-[280px] items-center justify-center !p-0"><Spinner label="İK kayıtları hazırlanıyor..."/></GlassCard>:<GlassCard className="!overflow-hidden !p-0">
      <div className="flex flex-col gap-2 border-b border-[var(--line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-semibold text-[var(--ink)]">Kayıtlar</h2><p className="mt-1 text-xs text-[var(--muted)]">{rows.length} kayıt listeleniyor</p></div><span className="soft-chip inline-flex w-fit">{period?`${month}. ay / ${year}`:"Güncel"}</span></div>
      <TableWrap><thead><tr>{c.fields.slice(0,8).map((f:string)=><Th key={f}>{labels[f]||f}</Th>)}<Th>İşlem</Th></tr></thead><tbody>{rows.map((r:any)=><tr key={r.id||JSON.stringify(r)}>{c.fields.slice(0,8).map((f:string)=><Td key={f} label={labels[f]||f}>{f==="staffId"?display(r.firstName?`${r.firstName} ${r.lastName}`:r[f]):f==="status"?<StatusBadge status={r[f]} label={prettyStatus(r[f])}/>:display(r[f])}</Td>)}<Td label="İşlem" actions><div className="flex justify-end gap-2">{editable&&r.id&&<Button variant="ghost" className="!min-h-8 !px-2.5 !py-1.5 !text-xs" onClick={()=>startEdit(r)}>Düzenle</Button>}{(section==="employees"||section==="leaves")&&r.id&&<Button variant="danger" className="!min-h-8 !px-2.5 !py-1.5 !text-xs" onClick={()=>remove(r.id)}>Sil</Button>}</div></Td></tr>)}</tbody></TableWrap>{rows.length===0&&<div className="border-t border-[var(--line)] px-6 py-14 text-center"><p className="text-sm font-medium text-[var(--ink)]">Bu dönem için kayıt bulunmuyor.</p><p className="mt-1 text-xs text-[var(--muted)]">Yeni kayıt ekleyerek başlayabilirsiniz.</p></div>}
    </GlassCard>}
  </div>;
}
