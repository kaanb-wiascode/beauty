"use client";

import { useEffect, useState } from "react";
import { Button, Field, Modal, TextInput } from "@/components/ui";
import { ConfirmDialog } from "@/components/modal";
import { ValooSelect } from "@/components/valoo-controls";

import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";
import { userDomainLabel, userLabel } from "@/lib/user-language";

type Workflow = {
  id: string;
  workflowKey: string;
  name: string;
  domain: string;
  description: string | null;
  version: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  conditions: Record<string, unknown>;
  steps: Array<Record<string, unknown>>;
  publishedAt: string | null;
  createdAt: string;
};

type RoleOption={id:string;name:string;slug:string};
type PermissionOption={id:string;resource:string;action:string};
type MembershipOption={id:string;status:string;user:{id:string;email:string;firstName:string;lastName:string};role:{id:string;name:string;slug:string}};
type ApproverType="DIRECT_MANAGER"|"BRANCH_MANAGER"|"REGIONAL_MANAGER"|"DEPARTMENT_MANAGER"|"ORGANIZATION_MANAGER"|"ROLE"|"PERMISSION"|"USER";
type TimeoutAction="ESCALATE"|"AUTO_APPROVE"|"AUTO_REJECT"|"NOTIFY";
type StepDraft={key:string;name:string;approverType:ApproverType;approverValue:string;slaMinutes:string;timeoutAction:TimeoutAction;escalationApproverType:ApproverType;escalationApproverValue:string};

const APPROVER_OPTIONS=[
  {value:"DIRECT_MANAGER",label:"Doğrudan Yönetici"},
  {value:"BRANCH_MANAGER",label:"Şube Müdürü"},
  {value:"REGIONAL_MANAGER",label:"Bölge Müdürü"},
  {value:"DEPARTMENT_MANAGER",label:"Departman Müdürü"},
  {value:"ORGANIZATION_MANAGER",label:"Organizasyon Yöneticisi Seviyesi"},
  {value:"ROLE",label:"Belirli Kullanıcı Tipi / Rol"},
  {value:"PERMISSION",label:"Belirli Yetkiye Sahip Kullanıcı"},
  {value:"USER",label:"Belirli Kullanıcı"},
] as const;
const TIMEOUT_OPTIONS=[
  {value:"ESCALATE",label:"Üst Onaylayana Aktar"},
  {value:"NOTIFY",label:"Gecikme Uyarısı Ver ve Bekle"},
  {value:"AUTO_APPROVE",label:"Otomatik Onayla"},
  {value:"AUTO_REJECT",label:"Otomatik Reddet"},
] as const;
const newStep=(index:number):StepDraft=>({key:"step-"+index,name:index===1?"Yönetici Onayı":"Onay Adımı "+index,approverType:"DIRECT_MANAGER",approverValue:"",slaMinutes:"",timeoutAction:"ESCALATE",escalationApproverType:"BRANCH_MANAGER",escalationApproverValue:""});
const needsValue=(type:ApproverType)=>["ROLE","PERMISSION","ORGANIZATION_MANAGER","USER"].includes(type);
const escalationIsValid=(step:StepDraft)=>step.timeoutAction!=="ESCALATE"||(!needsValue(step.escalationApproverType)||Boolean(step.escalationApproverValue.trim()));

export default function ApprovalWorkflowsPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [workflowKey, setWorkflowKey] = useState("");
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("finance");
  const [description, setDescription] = useState("");
  const [roles,setRoles]=useState<RoleOption[]>([]);
  const [permissions,setPermissions]=useState<PermissionOption[]>([]);
  const [memberships,setMemberships]=useState<MembershipOption[]>([]);
  const [steps,setSteps]=useState<StepDraft[]>([newStep(1)]);
  const [publishId,setPublishId]=useState<string|null>(null);

  async function load() {
    try {
      const [data,roleRows,permissionRows,membershipRows]=await Promise.all([
        api<Workflow[]>("/admin/approval-workflows"),
        api<RoleOption[]>("/roles"),
        api<PermissionOption[]>("/roles/permissions"),
        api<MembershipOption[]>("/memberships"),
      ]);
      setItems(data);
      setRoles(Array.isArray(roleRows)?roleRows:[]);
      setPermissions(Array.isArray(permissionRows)?permissionRows:[]);
      setMemberships(Array.isArray(membershipRows)?membershipRows.filter(item=>item.status==="ACTIVE"):[]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Onay akışları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function createWorkflow() {
    setSaving(true);
    setError("");
    try {
      await api("/admin/approval-workflows", {
        method: "POST",
        body: {
          workflowKey,
          name,
          domain,
          description: description.trim() || undefined,
          conditions: {},
          steps: steps.map((step,index)=>({
            key:step.key||"step-"+(index+1),
            name:step.name.trim()||"Onay Adımı "+(index+1),
            approverType:step.approverType,
            approverValue:needsValue(step.approverType)?step.approverValue.trim()||undefined:undefined,
            slaMinutes:step.slaMinutes.trim()?Number(step.slaMinutes):undefined,
            timeoutAction:step.timeoutAction,
            escalationApproverType:step.timeoutAction==="ESCALATE"?step.escalationApproverType:undefined,
            escalationApproverValue:step.timeoutAction==="ESCALATE"&&needsValue(step.escalationApproverType)?step.escalationApproverValue.trim()||undefined:undefined,
            mode:"SEQUENTIAL",
          })),
        },
      });
      setOpen(false);
      setWorkflowKey(""); setName(""); setDescription(""); setSteps([newStep(1)]);
      showToast("Onay akışı taslağı oluşturuldu.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Onay akışı oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  }

  async function publish(id:string){
    try{
      await api("/admin/approval-workflows/"+id+"/publish",{method:"POST"});
      setPublishId(null);
      showToast("Onay akışı yayınlandı.");
      await load();
    }catch(err){setError(err instanceof ApiError?err.message:"Onay akışı yayınlanamadı.")}
  }

  function updateStep(index:number,patch:Partial<StepDraft>){setSteps(current=>current.map((step,i)=>i===index?{...step,...patch}:step))}
  function addStep(){setSteps(current=>[...current,newStep(current.length+1)])}
  function removeStep(index:number){setSteps(current=>current.length<=1?current:current.filter((_,i)=>i!==index).map((step,i)=>({...step,key:"step-"+(i+1)})))}
  function moveStep(index:number,direction:-1|1){setSteps(current=>{const target=index+direction;if(target<0||target>=current.length)return current;const next=[...current];[next[index],next[target]]=[next[target],next[index]];return next.map((step,i)=>({...step,key:"step-"+(i+1)}))})}

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center text-sm text-[var(--muted)]">Yükleniyor…</div>;

  return <main className="mx-auto w-full max-w-[1240px] space-y-6 pb-10">
    <header className="flex flex-col gap-4 border-b border-[var(--line)] pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div><div className="mb-1 text-xs font-medium text-[var(--muted)]">Yönetim / Politikalar</div><h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[var(--ink)]">Onay Akışları</h1><p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">Finans, İnsan Kaynakları, Satın Alma ve diğer işlem alanları için sürümlenebilir merkezi onay akışları oluşturun.</p></div>
      <button type="button" onClick={() => setOpen(true)} className="rounded-xl bg-[var(--ink)] px-4 py-2.5 text-sm font-semibold text-white">+ Yeni Onay Akışı</button>
    </header>
    {error ? <div className="rounded-xl border border-[#f0d8d8] bg-[#fff8f8] px-4 py-3 text-sm text-[#9a4545]">{error}</div> : null}
    <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-[var(--line)] bg-[var(--surface-2)] text-xs text-[var(--muted)]"><tr><th className="px-4 py-3">Onay Akışı</th><th className="px-4 py-3">İşlem Alanı</th><th className="px-4 py-3">Sürüm</th><th className="px-4 py-3">Adımlar</th><th className="px-4 py-3">Durum</th><th className="px-4 py-3 text-right">İşlem</th></tr></thead><tbody>
        {items.map((item) => <tr key={item.id} className="border-b border-[var(--line)] last:border-0"><td className="px-4 py-4"><div className="font-semibold text-[var(--ink)]">{item.name}</div></td><td className="px-4 py-4">{userDomainLabel(item.domain)}</td><td className="px-4 py-4">Sürüm {item.version}</td><td className="px-4 py-4">{Array.isArray(item.steps) ? item.steps.length : 0}</td><td className="px-4 py-4"><span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--accent)]">{userLabel(item.status)}</span></td><td className="px-4 py-4 text-right">{item.status === "DRAFT" ? <button type="button" onClick={() => setPublishId(item.id)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold">Yayınla</button> : <span className="text-xs text-[var(--muted)]">Yayınlandıktan sonra değiştirilemez</span>}</td></tr>)}
        {!items.length ? <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-[var(--muted)]">Henüz merkezi onay akışı tanımlanmamış.</td></tr> : null}
      </tbody></table></div>
    </section>
    <Modal open={open} onClose={()=>{if(!saving)setOpen(false)}} title="Yeni Onay Akışı" description="İşletmenizin kendi hiyerarşisine göre bir veya birden fazla onay adımı oluşturun.">
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Akış Kodu" required><TextInput value={workflowKey} onChange={e=>setWorkflowKey(e.target.value)} placeholder="Örn. izin-onayi"/></Field>
          <Field label="Akış Adı" required><TextInput value={name} onChange={e=>setName(e.target.value)} placeholder="İzin Onay Akışı"/></Field>
          <Field label="İşlem Alanı"><ValooSelect value={domain} onChange={setDomain} searchable={false} options={[{value:"hr",label:"İnsan Kaynakları"},{value:"finance",label:"Finans"},{value:"procurement",label:"Satın Alma"},{value:"operations",label:"Operasyon"},{value:"inventory",label:"Envanter"}]}/></Field>
          <Field label="Açıklama"><TextInput value={description} onChange={e=>setDescription(e.target.value)} placeholder="Bu akışın hangi işlemlerde kullanılacağını açıklayın."/></Field>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-[var(--ink)]">Onay Adımları</h3><p className="mt-1 text-[11px] text-[var(--muted)]">Adımlar yukarıdan aşağıya sırayla çalışır.</p></div><Button variant="secondary" onClick={addStep}>+ Onay Adımı Ekle</Button></div>
          {steps.map((step,index)=><section key={step.key} className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)]/40 p-4">
            <div className="mb-4 flex items-center justify-between gap-2"><strong className="text-xs text-[var(--ink)]">{index+1}. Onay Adımı</strong><div className="flex gap-1"><Button size="sm" variant="ghost" disabled={index===0} onClick={()=>moveStep(index,-1)}>↑</Button><Button size="sm" variant="ghost" disabled={index===steps.length-1} onClick={()=>moveStep(index,1)}>↓</Button><Button size="sm" variant="danger" disabled={steps.length===1} onClick={()=>removeStep(index)}>Kaldır</Button></div></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Adım Adı" required><TextInput value={step.name} onChange={e=>updateStep(index,{name:e.target.value})}/></Field>
              <Field label="Onaylayan" required><ValooSelect value={step.approverType} onChange={value=>updateStep(index,{approverType:value as ApproverType,approverValue:""})} searchable={false} options={[...APPROVER_OPTIONS]}/></Field>
              {step.approverType==="ROLE"?<Field label="Kullanıcı Tipi / Rol" required><ValooSelect value={step.approverValue} onChange={approverValue=>updateStep(index,{approverValue})} searchPlaceholder="Rol ara…" options={roles.filter(r=>r.slug!=="owner").map(r=>({value:r.slug,label:r.name}))}/></Field>:null}
              {step.approverType==="PERMISSION"?<Field label="Gerekli Yetki" required><ValooSelect value={step.approverValue} onChange={approverValue=>updateStep(index,{approverValue})} searchPlaceholder="Yetki ara…" options={permissions.map(p=>({value:p.resource+"."+p.action,label:userDomainLabel(p.resource)+" · "+userLabel(p.action)}))}/></Field>:null}
              {step.approverType==="USER"?<Field label="Belirli Kullanıcı" required><ValooSelect value={step.approverValue} onChange={approverValue=>updateStep(index,{approverValue})} searchPlaceholder="Kullanıcı ara…" options={memberships.map(m=>({value:m.user.id,label:(m.user.firstName+" "+m.user.lastName).trim()+" · "+m.role.name+" · "+m.user.email}))}/></Field>:null}
              {step.approverType==="ORGANIZATION_MANAGER"?<Field label="Yönetici Seviyesi" required><ValooSelect value={step.approverValue||"1"} onChange={approverValue=>updateStep(index,{approverValue})} searchable={false} options={Array.from({length:5},(_,i)=>({value:String(i+1),label:(i+1)+". seviye yönetici"}))}/></Field>:null}
              <Field label="Karar Süresi (dakika)"><TextInput type="number" min={1} value={step.slaMinutes} onChange={e=>updateStep(index,{slaMinutes:e.target.value})} placeholder="Örn. 15"/></Field>
              <Field label="Süre Aşımı Davranışı"><ValooSelect value={step.timeoutAction} onChange={value=>updateStep(index,{timeoutAction:value as TimeoutAction})} searchable={false} options={[...TIMEOUT_OPTIONS]}/></Field>
              {step.timeoutAction==="ESCALATE"?<Field label="Süre Dolunca Aktarılacak Onaylayan"><ValooSelect value={step.escalationApproverType} onChange={value=>updateStep(index,{escalationApproverType:value as ApproverType,escalationApproverValue:""})} searchable={false} options={[...APPROVER_OPTIONS]}/></Field>:null}
              {step.timeoutAction==="ESCALATE"&&step.escalationApproverType==="ROLE"?<Field label="Escalation Rolü"><ValooSelect value={step.escalationApproverValue} onChange={escalationApproverValue=>updateStep(index,{escalationApproverValue})} options={roles.filter(r=>r.slug!=="owner").map(r=>({value:r.slug,label:r.name}))}/></Field>:null}
              {step.timeoutAction==="ESCALATE"&&step.escalationApproverType==="PERMISSION"?<Field label="Escalation Yetkisi"><ValooSelect value={step.escalationApproverValue} onChange={escalationApproverValue=>updateStep(index,{escalationApproverValue})} options={permissions.map(p=>({value:p.resource+"."+p.action,label:userDomainLabel(p.resource)+" · "+userLabel(p.action)}))}/></Field>:null}
              {step.timeoutAction==="ESCALATE"&&step.escalationApproverType==="USER"?<Field label="Süre Aşımında Belirli Kullanıcı" required><ValooSelect value={step.escalationApproverValue} onChange={escalationApproverValue=>updateStep(index,{escalationApproverValue})} searchPlaceholder="Kullanıcı ara…" options={memberships.map(m=>({value:m.user.id,label:(m.user.firstName+" "+m.user.lastName).trim()+" · "+m.role.name+" · "+m.user.email}))}/></Field>:null}
              {step.timeoutAction==="ESCALATE"&&step.escalationApproverType==="ORGANIZATION_MANAGER"?<Field label="Escalation Yönetici Seviyesi"><ValooSelect value={step.escalationApproverValue||"1"} onChange={escalationApproverValue=>updateStep(index,{escalationApproverValue})} searchable={false} options={Array.from({length:5},(_,i)=>({value:String(i+1),label:(i+1)+". seviye yönetici"}))}/></Field>:null}
            </div>
          </section>)}
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4"><Button variant="secondary" disabled={saving} onClick={()=>setOpen(false)}>Vazgeç</Button><Button disabled={saving||workflowKey.trim().length<2||name.trim().length<2||!steps.every(step=>step.name.trim()&&(!needsValue(step.approverType)||step.approverValue.trim())&&escalationIsValid(step))} onClick={()=>void createWorkflow()}>{saving?"Oluşturuluyor…":"Taslak Oluştur"}</Button></div>
      </div>
    </Modal>

    <ConfirmDialog open={Boolean(publishId)} title="Onay Akışını Yayınla" description="Bu sürüm yayınlandıktan sonra değiştirilemez. Sonraki değişiklikler yeni bir sürüm olarak hazırlanır." onClose={()=>setPublishId(null)} onConfirm={()=>{if(publishId)void publish(publishId)}}/>
  </main>;
}
