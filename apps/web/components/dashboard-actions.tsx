"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Modal } from "@/components/modal";
import { Alert, Button, Field, Select, TextArea, TextInput } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import type { Appointment, Customer, Paginated, Service, Staff } from "@/lib/types";

export type DashboardAction = "appointment" | "customer" | "service" | "payment";

type Props = { action: DashboardAction | null; onClose: () => void; onSaved?: (message: string) => void };
const pad = (n: number) => String(n).padStart(2, "0");
function localDateTime(minutes = 30) { const d = new Date(Date.now() + minutes * 60000); d.setSeconds(0, 0); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function addMinutes(value: string, minutes: number) { const d = new Date(value); d.setMinutes(d.getMinutes() + minutes); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function labelName(first: string, last: string) { return `${first} ${last}`.trim(); }

export function DashboardActions({ action, onClose, onSaved }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [customer, setCustomer] = useState({ firstName: "", lastName: "", phone: "", email: "" });
  const [service, setService] = useState({ name: "", description: "", duration: "60", price: "" });
  const [appointment, setAppointment] = useState({ customerId: "", staffId: "", serviceId: "", startAt: localDateTime(), endAt: addMinutes(localDateTime(), 60), notes: "" });
  const [payment, setPayment] = useState({ appointmentId: "", amount: "", method: "CARD" as "CASH" | "CARD" | "TRANSFER" });

  useEffect(() => {
    if (!action) return;
    setError(""); setSaving(false);
    if (action === "customer") setCustomer({ firstName: "", lastName: "", phone: "", email: "" });
    if (action === "service") setService({ name: "", description: "", duration: "60", price: "" });
    if (action === "appointment") { const startAt = localDateTime(30); setAppointment({ customerId: "", staffId: "", serviceId: "", startAt, endAt: addMinutes(startAt, 60), notes: "" }); }
    if (action === "payment") setPayment({ appointmentId: "", amount: "", method: "CARD" });
  }, [action]);

  useEffect(() => {
    if (!action || action === "customer" || action === "service") return;
    let cancelled = false; setLoadingRefs(true);
    const from = new Date(); from.setHours(0,0,0,0);
    const to = new Date(); to.setDate(to.getDate()+14); to.setHours(23,59,59,999);
    void Promise.all([
      api<Paginated<Customer>>(withQuery("/customers", { page: 1, limit: 100 })),
      api<Paginated<Staff>>(withQuery("/staff", { page: 1, limit: 100 })),
      api<Paginated<Service>>(withQuery("/services", { page: 1, limit: 100 })),
      api<Paginated<Appointment>>(withQuery("/appointments", { page: 1, limit: 100, from: from.toISOString(), to: to.toISOString() })),
    ]).then(([c,s,sv,a]) => {
      if (cancelled) return;
      setCustomers(c.data); setStaff(s.data.filter((x)=>x.status === "ACTIVE")); setServices(sv.data.filter((x)=>x.status === "ACTIVE")); setAppointments(a.data.filter((x)=>x.status !== "CANCELLED" && x.status !== "NO_SHOW"));
    }).catch((err)=>{ if (!cancelled) setError(err instanceof ApiError ? err.message : "Form seçenekleri yüklenemedi."); }).finally(()=>{ if (!cancelled) setLoadingRefs(false); });
    return () => { cancelled = true; };
  }, [action]);

  const selectedService = useMemo(() => services.find((x)=>x.id === appointment.serviceId), [services, appointment.serviceId]);
  const selectedPaymentAppointment = useMemo(() => appointments.find((x)=>x.id === payment.appointmentId), [appointments, payment.appointmentId]);
  useEffect(() => { if (!selectedService || !appointment.startAt) return; setAppointment((current)=>({ ...current, endAt: addMinutes(current.startAt, selectedService.durationMinutes) })); }, [selectedService]);
  useEffect(() => { if (!selectedPaymentAppointment || payment.amount) return; const s = services.find((x)=>x.id === selectedPaymentAppointment.serviceId); if (s) setPayment((current)=>({ ...current, amount: String(s.price) })); }, [selectedPaymentAppointment, services, payment.amount]);

  const title = action === "appointment" ? "Yeni randevu" : action === "customer" ? "Yeni müşteri ekle" : action === "service" ? "Yeni hizmet ekle" : "Ödeme al";
  const description = action === "appointment" ? "Randevuyu dashboard'dan ayrılmadan oluştur." : action === "customer" ? "Müşteri kaydını hızlıca oluştur." : action === "service" ? "Hizmetini hızlıca tanımla." : "Yaklaşan bir randevu için tahsilat kaydı oluştur.";

  async function saveCustomer(e: FormEvent) { e.preventDefault(); if (!hasPermission("customers","create")) return setError("Bu işlem için yetkiniz yok."); if (!customer.firstName.trim() || !customer.lastName.trim()) return setError("Ad ve soyad gerekli."); setSaving(true); setError(""); try { await api("/customers", { method:"POST", body:{ firstName:customer.firstName.trim(), lastName:customer.lastName.trim(), ...(customer.phone.trim()?{phone:customer.phone.trim()}:{}), ...(customer.email.trim()?{email:customer.email.trim().toLowerCase()}:{}), consents:{kvkkAcknowledgement:true,membershipAgreement:true} } }); onSaved?.("Müşteri başarıyla eklendi."); onClose(); } catch(err) { setError(err instanceof ApiError ? err.message : "Müşteri eklenemedi."); } finally { setSaving(false); } }
  async function saveService(e: FormEvent) { e.preventDefault(); if (!hasPermission("services","create")) return setError("Bu işlem için yetkiniz yok."); const duration=Number(service.duration), price=Number(service.price); if(!service.name.trim()) return setError("Hizmet adı gerekli."); if(!Number.isInteger(duration)||duration<1) return setError("Geçerli bir süre girin."); if(!Number.isFinite(price)||price<0) return setError("Geçerli bir fiyat girin."); setSaving(true); setError(""); try { await api("/services",{method:"POST",body:{name:service.name.trim(),durationMinutes:duration,price,...(service.description.trim()?{description:service.description.trim()}: {})}}); onSaved?.("Hizmet başarıyla eklendi."); onClose(); } catch(err) { setError(err instanceof ApiError?err.message:"Hizmet eklenemedi."); } finally { setSaving(false); } }
  async function saveAppointment(e: FormEvent) { e.preventDefault(); if(!hasPermission("appointments","create")) return setError("Bu işlem için yetkiniz yok."); if(!appointment.customerId||!appointment.staffId||!appointment.serviceId) return setError("Müşteri, uzman ve hizmet seçin."); setSaving(true); setError(""); try { await api("/appointments",{method:"POST",body:{customerId:appointment.customerId,staffId:appointment.staffId,serviceId:appointment.serviceId,startAt:new Date(appointment.startAt).toISOString(),endAt:new Date(appointment.endAt).toISOString(),notes:appointment.notes.trim()}}); onSaved?.("Randevu başarıyla oluşturuldu."); onClose(); } catch(err) { setError(err instanceof ApiError?err.message:"Randevu oluşturulamadı."); } finally { setSaving(false); } }
  async function savePayment(e: FormEvent) { e.preventDefault(); if(!hasPermission("payments","create")) return setError("Bu işlem için yetkiniz yok."); const amount=Number(payment.amount); if(!payment.appointmentId||!Number.isFinite(amount)||amount<=0) return setError("Randevu ve geçerli tutar seçin."); setSaving(true); setError(""); try { await api("/payments",{method:"POST",body:{appointmentId:payment.appointmentId,amount,method:payment.method}}); onSaved?.("Ödeme başarıyla kaydedildi."); onClose(); } catch(err) { setError(err instanceof ApiError?err.message:"Ödeme kaydedilemedi."); } finally { setSaving(false); } }

  return <Modal open={Boolean(action)} onClose={onClose} title={title} description={description}>
    {action === "customer" ? <form onSubmit={saveCustomer} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="Ad"><TextInput required value={customer.firstName} onChange={(e)=>setCustomer({...customer,firstName:e.target.value})}/></Field><Field label="Soyad"><TextInput required value={customer.lastName} onChange={(e)=>setCustomer({...customer,lastName:e.target.value})}/></Field></div><Field label="Telefon"><TextInput value={customer.phone} onChange={(e)=>setCustomer({...customer,phone:e.target.value})}/></Field><Field label="E-posta"><TextInput type="email" value={customer.email} onChange={(e)=>setCustomer({...customer,email:e.target.value})}/></Field>{error&&<Alert>{error}</Alert>}<Actions saving={saving} onClose={onClose}/></form>:null}
    {action === "service" ? <form onSubmit={saveService} className="space-y-4"><Field label="Hizmet adı"><TextInput required value={service.name} onChange={(e)=>setService({...service,name:e.target.value})}/></Field><Field label="Açıklama"><TextArea rows={3} value={service.description} onChange={(e)=>setService({...service,description:e.target.value})}/></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Süre (dakika)"><TextInput type="number" min={1} value={service.duration} onChange={(e)=>setService({...service,duration:e.target.value})}/></Field><Field label="Fiyat"><TextInput type="number" min={0} step="0.01" value={service.price} onChange={(e)=>setService({...service,price:e.target.value})}/></Field></div>{error&&<Alert>{error}</Alert>}<Actions saving={saving} onClose={onClose}/></form>:null}
    {action === "appointment" ? <form onSubmit={saveAppointment} className="space-y-4">{loadingRefs&&<p className="text-xs text-[var(--muted)]">Seçenekler yükleniyor...</p>}<div className="grid gap-4 sm:grid-cols-2"><Field label="Müşteri"><Select required value={appointment.customerId} onChange={(e)=>setAppointment({...appointment,customerId:e.target.value})}><option value="">Seçin</option>{customers.map((x)=><option key={x.id} value={x.id}>{labelName(x.firstName,x.lastName)}</option>)}</Select></Field><Field label="Uzman"><Select required value={appointment.staffId} onChange={(e)=>setAppointment({...appointment,staffId:e.target.value})}><option value="">Seçin</option>{staff.map((x)=><option key={x.id} value={x.id}>{labelName(x.firstName,x.lastName)}</option>)}</Select></Field></div><Field label="Hizmet"><Select required value={appointment.serviceId} onChange={(e)=>setAppointment({...appointment,serviceId:e.target.value})}><option value="">Seçin</option>{services.map((x)=><option key={x.id} value={x.id}>{x.name} · {x.durationMinutes} dk · ₺{Number(x.price).toLocaleString("tr-TR")}</option>)}</Select></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Başlangıç"><TextInput type="datetime-local" required value={appointment.startAt} onChange={(e)=>setAppointment({...appointment,startAt:e.target.value,endAt:addMinutes(e.target.value,selectedService?.durationMinutes??60)})}/></Field><Field label="Bitiş"><TextInput type="datetime-local" required value={appointment.endAt} onChange={(e)=>setAppointment({...appointment,endAt:e.target.value})}/></Field></div><Field label="Not"><TextArea rows={2} value={appointment.notes} onChange={(e)=>setAppointment({...appointment,notes:e.target.value})}/></Field>{error&&<Alert>{error}</Alert>}<Actions saving={saving} onClose={onClose}/></form>:null}
    {action === "payment" ? <form onSubmit={savePayment} className="space-y-4">{loadingRefs&&<p className="text-xs text-[var(--muted)]">Randevular yükleniyor...</p>}<Field label="Randevu"><Select required value={payment.appointmentId} onChange={(e)=>setPayment({...payment,appointmentId:e.target.value})}><option value="">Seçin</option>{appointments.map((x)=>{const c=customers.find((customer)=>customer.id===x.customerId); const label=c?labelName(c.firstName,c.lastName):x.customerId.slice(0,8); return <option key={x.id} value={x.id}>{new Intl.DateTimeFormat("tr-TR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(x.startAt))} · {label}</option>})}</Select></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Tutar"><TextInput type="number" min={0.01} step="0.01" required value={payment.amount} onChange={(e)=>setPayment({...payment,amount:e.target.value})}/></Field><Field label="Yöntem"><Select value={payment.method} onChange={(e)=>setPayment({...payment,method:e.target.value as typeof payment.method})}><option value="CARD">Kart</option><option value="CASH">Nakit</option><option value="TRANSFER">Havale / EFT</option></Select></Field></div>{error&&<Alert>{error}</Alert>}<Actions saving={saving} onClose={onClose}/></form>:null}
  </Modal>;
}
function Actions({saving,onClose}:{saving:boolean;onClose:()=>void}) { return <div className="flex justify-end gap-3 pt-2"><Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Vazgeç</Button><Button type="submit" disabled={saving}>{saving?"Kaydediliyor...":"Kaydet"}</Button></div>; }
