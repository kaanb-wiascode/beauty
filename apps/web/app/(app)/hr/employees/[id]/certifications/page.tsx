"use client";

import Link from "next/link";
import { DatePicker } from "@/components/date-picker";
import { Alert, Button, EmptyState, Field, Modal, Spinner, TextArea, TextInput } from "@/components/ui";
import { ValooSelect } from "@/components/valoo-controls";
import { useParams } from "next/navigation";
import { useCallback,useEffect,useMemo,useState } from "react";
import { api,ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { userErrorMessage, userLabel } from "@/lib/user-language";

type Type={id:string;code:string;name:string;requiresExpiry:boolean;warningDays:number};
type Doc={id:string;title:string;fileName?:string|null;status:string};
type Row={id:string;certificationTypeId:string;code:string;name:string;category?:string|null;credentialNumber?:string|null;issuingOrganization?:string|null;qualification?:string|null;issuedAt?:string|null;expiresAt?:string|null;status:string;verificationNote?:string|null;warningDays:number;evidenceDocumentId?:string|null};
type Form={certificationTypeId:string;credentialNumber:string;issuingOrganization:string;qualification:string;issuedAt:string;expiresAt:string;evidenceDocumentId:string;notes:string};
type TypeForm={code:string;name:string;category:string;warningDays:string;requiresExpiry:boolean;serviceEligibilityRequired:boolean};
const EMPTY:Form={certificationTypeId:"",credentialNumber:"",issuingOrganization:"",qualification:"",issuedAt:"",expiresAt:"",evidenceDocumentId:"",notes:""};
const EMPTY_TYPE:TypeForm={code:"",name:"",category:"",warningDays:"30",requiresExpiry:true,serviceEligibilityRequired:false};
const statusLabel=(s:string)=>({PENDING:"Doğrulama bekliyor",VERIFIED:"Doğrulandı",REJECTED:"Reddedildi",EXPIRED:"Süresi doldu",REVOKED:"İptal edildi"}[s]??userLabel(s));
const date=(v?:string|null)=>v?new Date(`${v}T00:00:00`).toLocaleDateString("tr-TR"):"—";
const days=(v?:string|null)=>v?Math.ceil((new Date(`${v}T00:00:00`).getTime()-new Date().setHours(0,0,0,0))/86400000):null;

export default function EmployeeCertificationsPage(){
 const{id}=useParams<{id:string}>();
 const[allowed,setAllowed]=useState(false),[manage,setManage]=useState(false),[rows,setRows]=useState<Row[]>([]),[types,setTypes]=useState<Type[]>([]),[docs,setDocs]=useState<Doc[]>([]),[form,setForm]=useState<Form>(EMPTY),[typeForm,setTypeForm]=useState<TypeForm>(EMPTY_TYPE),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[createOpen,setCreateOpen]=useState(false),[typeOpen,setTypeOpen]=useState(false);

 useEffect(()=>{const sensitive=hasPermission("hr_sensitive","read");setAllowed(sensitive);setManage(sensitive&&hasPermission("hr","manage"))},[]);
 const load=useCallback(async()=>{if(!allowed)return;setLoading(true);setError("");try{const[data,typeData,docData]=await Promise.all([api<Row[]>(`/hr/employees/${id}/certifications`),api<Type[]>("/hr/certification-types"),api<Doc[]>(`/hr/employees/${id}/documents/sensitive`)]);setRows(data);setTypes(typeData);setDocs(docData)}catch(e){setError(e instanceof ApiError?userErrorMessage(e.message,"Sertifika kayıtları yüklenemedi."):"Sertifika kayıtları yüklenemedi.")}finally{setLoading(false)}},[allowed,id]);
 useEffect(()=>{if(allowed)void load();else setLoading(false)},[allowed,load]);

 async function create(){
  if(!manage||!form.certificationTypeId)return;
  setBusy(true);setError("");setNotice("");
  try{
   await api(`/hr/employees/${id}/certifications`,{method:"POST",body:form});
   setForm(EMPTY);setCreateOpen(false);setNotice("Sertifika kaydı oluşturuldu.");await load();
  }catch(e){setError(e instanceof ApiError?userErrorMessage(e.message,"Sertifika oluşturulamadı."):"Sertifika oluşturulamadı.")}
  finally{setBusy(false)}
 }

 async function createType(){
  const code=typeForm.code.trim(),name=typeForm.name.trim(),warningDays=Number(typeForm.warningDays);
  if(!code||!name){setError("Sertifika kodu ve adı zorunludur.");return}
  if(!Number.isFinite(warningDays)||warningDays<0){setError("Uyarı günü geçerli olmalıdır.");return}
  setBusy(true);setError("");setNotice("");
  try{
   const created=await api<Type>("/hr/certification-types",{method:"POST",body:{code,name,category:typeForm.category.trim()||undefined,warningDays,requiresExpiry:typeForm.requiresExpiry,serviceEligibilityRequired:typeForm.serviceEligibilityRequired}});
   await load();
   setForm(x=>({...x,certificationTypeId:created.id}));
   setTypeForm(EMPTY_TYPE);setTypeOpen(false);setCreateOpen(true);setNotice("Yeni sertifika türü oluşturuldu.");
  }catch(e){setError(e instanceof ApiError?userErrorMessage(e.message,"Sertifika türü oluşturulamadı."):"Sertifika türü oluşturulamadı.")}
  finally{setBusy(false)}
 }

 async function verify(row:Row,status:"VERIFIED"|"REJECTED"){const note=status==="REJECTED"?window.prompt("Reddetme gerekçesi:"):window.prompt("Doğrulama notu (opsiyonel):");if(status==="REJECTED"&&!note)return;setBusy(true);try{await api(`/hr/employees/${id}/certifications/${row.id}/verify`,{method:"PATCH",body:{status,note:note||undefined}});await load()}catch(e){setError(e instanceof ApiError?userErrorMessage(e.message,"Sertifika durumu güncellenemedi."):"Sertifika durumu güncellenemedi.")}finally{setBusy(false)}}
 async function revoke(row:Row){const note=window.prompt("Yetkinliğin geri alınma gerekçesi:");if(!note)return;setBusy(true);try{await api(`/hr/employees/${id}/certifications/${row.id}/revoke`,{method:"POST",body:{note}});await load()}catch(e){setError(e instanceof ApiError?userErrorMessage(e.message,"Sertifika iptal edilemedi."):"Sertifika iptal edilemedi.")}finally{setBusy(false)}}

 const verifiedDocs=useMemo(()=>docs.filter(d=>d.status!=="ARCHIVED"&&d.status!=="REJECTED"),[docs]);

 if(!allowed)return <main className="mx-auto max-w-[1280px] p-6"><Link href={`/hr/employees/${id}`} className="text-xs text-[var(--accent)]">← Personel 360°</Link><div className="mt-5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6"><h1 className="text-lg font-semibold">Sertifikalar ve Yetkinlikler</h1><p className="mt-2 text-sm text-[var(--muted)]">Bu alan hassas İK verisidir. Görüntülemek için gerekli yetkiniz bulunmuyor.</p></div></main>;

 return <main className="mx-auto max-w-[1280px] space-y-5 p-6">
  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
   <div><Link href={`/hr/employees/${id}`} className="text-xs text-[var(--accent)]">← Personel 360°</Link><h1 className="mt-3 text-xl font-semibold">Sertifikalar ve Yetkinlikler</h1><p className="mt-1 text-xs text-[var(--muted)]">Sertifika doğrulamasını, geçerlilik süresini ve hizmet yetkinliğini birlikte yönetin.</p></div>
   <div className="flex flex-wrap gap-2">{manage?<Button onClick={()=>setCreateOpen(true)}>+ Sertifika Ekle</Button>:null}<Link href={`/hr/employees/${id}/documents`} className="inline-flex h-10 items-center rounded-xl border border-[var(--line)] px-3 text-xs font-semibold text-[var(--accent)]">Personel Belgeleri</Link></div>
  </div>

  {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}
  {notice?<Alert tone="success" onClose={()=>setNotice("")}>{notice}</Alert>:null}

  <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
   <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Sertifika Kayıtları</h2><span className="text-xs text-[var(--muted)]">{rows.length} kayıt</span></div>
   {loading?<div className="flex h-40 items-center justify-center"><Spinner/></div>:!rows.length?<div className="py-8"><EmptyState title="Henüz sertifika kaydı yok" description="İlk sertifikayı ekleyerek çalışanın yetkinlik kaydını oluşturun."/>{manage?<div className="mt-4 flex justify-center"><Button onClick={()=>setCreateOpen(true)}>+ İlk Sertifikayı Ekle</Button></div>:null}</div>:<div className="mt-4 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="text-[10px] uppercase text-[var(--muted-soft)]"><tr><th className="pb-3">Sertifika</th><th className="pb-3">Belge numarası</th><th className="pb-3">Kurum / Yeterlilik</th><th className="pb-3">Geçerlilik</th><th className="pb-3">Durum</th><th className="pb-3 text-right">İşlem</th></tr></thead><tbody>{rows.map(r=>{const left=days(r.expiresAt),risk=r.status==="VERIFIED"&&left!==null&&left>=0&&left<=r.warningDays;return <tr key={r.id} className="border-t border-[var(--line)]"><td className="py-3"><p className="font-medium">{r.name}</p><p className="text-[10px] text-[var(--muted)]">{r.code}{r.category?` · ${userLabel(r.category)}`:""}</p></td><td className="py-3">{r.credentialNumber||"—"}</td><td className="py-3"><p>{r.issuingOrganization||"—"}</p><p className="text-[10px] text-[var(--muted)]">{r.qualification||""}</p></td><td className="py-3"><p>{date(r.issuedAt)} → {date(r.expiresAt)}</p>{left!==null?<p className={`text-[10px] ${left<0||risk?"text-[var(--danger)]":"text-[var(--muted)]"}`}>{left<0?`${Math.abs(left)} gün önce doldu`:`${left} gün kaldı`}</p>:null}</td><td className="py-3"><p>{statusLabel(r.status)}</p>{r.verificationNote?<p className="max-w-[220px] truncate text-[10px] text-[var(--muted)]">{r.verificationNote}</p>:null}</td><td className="py-3 text-right">{manage&&r.status==="PENDING"?<div className="flex justify-end gap-2"><button disabled={busy} onClick={()=>void verify(r,"VERIFIED")} className="text-[10px] font-semibold text-[var(--accent)]">Doğrula</button><button disabled={busy} onClick={()=>void verify(r,"REJECTED")} className="text-[10px] font-semibold text-[var(--danger)]">Reddet</button></div>:manage&&r.status==="VERIFIED"?<button disabled={busy} onClick={()=>void revoke(r)} className="text-[10px] font-semibold text-[var(--danger)]">Yetkiyi geri al</button>:<span className="text-[10px] text-[var(--muted)]">—</span>}</td></tr>})}</tbody></table></div>}
  </section>

  {!manage?<div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 text-xs text-[var(--muted)]">Kayıtları görüntüleyebilirsiniz; değişiklik yapmak için İK yönetim yetkisi gerekir.</div>:null}

  <Modal open={createOpen} onClose={()=>{if(!busy)setCreateOpen(false)}} title="Sertifika Ekle" description="Çalışanın sertifikasını mevcut kayıtlara bağlayın; sistemde tür yoksa aynı ekrandan oluşturun.">
   <div className="space-y-4">
    <Field label="Sertifika Türü" required>
     <ValooSelect value={form.certificationTypeId} onChange={certificationTypeId=>setForm(x=>({...x,certificationTypeId}))} options={types.map(t=>({value:t.id,label:`${t.name} · ${t.code}`}))} placeholder="Sertifika türü seçin" searchPlaceholder="Sertifika türü ara…" emptyLabel="Henüz sertifika türü yok." createAction={{label:"Yeni sertifika türü ekle",onClick:()=>{setCreateOpen(false);setTypeOpen(true)}}}/>
    </Field>
    <div className="grid gap-4 sm:grid-cols-2">
     <Field label="Sertifika / Belge Numarası"><TextInput value={form.credentialNumber} onChange={e=>setForm(x=>({...x,credentialNumber:e.target.value}))}/></Field>
     <Field label="Veren Kurum"><TextInput value={form.issuingOrganization} onChange={e=>setForm(x=>({...x,issuingOrganization:e.target.value}))}/></Field>
    </div>
    <Field label="Yeterlilik / Açıklama"><TextInput value={form.qualification} onChange={e=>setForm(x=>({...x,qualification:e.target.value}))}/></Field>
    <div className="grid gap-4 sm:grid-cols-2">
     <Field label="Düzenlenme Tarihi"><DatePicker value={form.issuedAt} onChange={issuedAt=>setForm(x=>({...x,issuedAt}))} ariaLabel="Düzenlenme tarihi"/></Field>
     <Field label="Son Geçerlilik"><DatePicker value={form.expiresAt} min={form.issuedAt||undefined} onChange={expiresAt=>setForm(x=>({...x,expiresAt}))} ariaLabel="Son geçerlilik tarihi"/></Field>
    </div>
    <Field label="Kanıt Belgesi">
     <ValooSelect value={form.evidenceDocumentId} onChange={evidenceDocumentId=>setForm(x=>({...x,evidenceDocumentId}))} options={verifiedDocs.map(d=>({value:d.id,label:`${d.title}${d.fileName?` · ${d.fileName}`:""}`}))} placeholder="İsteğe bağlı belge seçin" searchPlaceholder="Belge ara…" emptyLabel="Bu personel için uygun belge bulunmuyor."/>
    </Field>
    <Field label="Not"><TextArea rows={3} value={form.notes} onChange={e=>setForm(x=>({...x,notes:e.target.value}))}/></Field>
    <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4"><Button variant="secondary" onClick={()=>setCreateOpen(false)} disabled={busy}>Vazgeç</Button><Button onClick={()=>void create()} disabled={busy||!form.certificationTypeId}>{busy?"Kaydediliyor…":"Sertifikayı Kaydet"}</Button></div>
   </div>
  </Modal>

  <Modal open={typeOpen} onClose={()=>{if(!busy){setTypeOpen(false);setCreateOpen(true)}}} title="Yeni Sertifika Türü" description="Listede olmayan sertifika türünü burada oluşturun; oluşturulan kayıt otomatik seçilir.">
   <div className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Kısa Kod" required><TextInput value={typeForm.code} placeholder="Örn. UST-01" onChange={e=>setTypeForm(x=>({...x,code:e.target.value}))}/></Field><Field label="Sertifika Adı" required><TextInput value={typeForm.name} onChange={e=>setTypeForm(x=>({...x,name:e.target.value}))}/></Field></div>
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Kategori"><TextInput value={typeForm.category} onChange={e=>setTypeForm(x=>({...x,category:e.target.value}))}/></Field><Field label="Kaç Gün Önce Uyarı Verilsin?"><TextInput type="number" min={0} value={typeForm.warningDays} onChange={e=>setTypeForm(x=>({...x,warningDays:e.target.value}))}/></Field></div>
    <label className="flex items-center gap-3 rounded-xl border border-[var(--line)] p-3 text-xs"><input type="checkbox" checked={typeForm.requiresExpiry} onChange={e=>setTypeForm(x=>({...x,requiresExpiry:e.target.checked}))}/>Geçerlilik tarihi zorunlu olsun</label>
    <label className="flex items-center gap-3 rounded-xl border border-[var(--line)] p-3 text-xs"><input type="checkbox" checked={typeForm.serviceEligibilityRequired} onChange={e=>setTypeForm(x=>({...x,serviceEligibilityRequired:e.target.checked}))}/>Hizmet uygunluğu kontrolünde kullanılsın</label>
    <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4"><Button variant="secondary" onClick={()=>{setTypeOpen(false);setCreateOpen(true)}} disabled={busy}>Vazgeç</Button><Button onClick={()=>void createType()} disabled={busy}>{busy?"Kaydediliyor…":"Türü Oluştur"}</Button></div>
   </div>
  </Modal>
 </main>
}
