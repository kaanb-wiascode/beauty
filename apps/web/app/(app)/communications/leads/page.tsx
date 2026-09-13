"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";

type Lead = {
  id: string;
  provider: string;
  campaignName?: string | null;
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
  status: string;
  serviceInterest?: string | null;
  assignedUserId?: string | null;
  branchId?: string | null;
  appointmentId?: string | null;
  saleId?: string | null;
  revenueAmount: string | number;
  receivedAt: string;
};

type Campaign = { id: string; name: string };

const fieldClass = "mt-2 h-11 w-full rounded-[13px] border border-[var(--line)] bg-white px-3 text-[12px] text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";

export default function MarketingLeadsPage() {
  const canManage = hasPermission("communications", "manage");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [provider, setProvider] = useState("MANUAL");
  const [campaignId, setCampaignId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [serviceInterest, setServiceInterest] = useState("");
  const [externalLeadId, setExternalLeadId] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [leadRows, campaignRows] = await Promise.all([
        api<Lead[]>("/corporate-communications/leads?limit=200"),
        api<Campaign[]>("/corporate-communications/campaigns?limit=200"),
      ]);
      setLeads(leadRows); setCampaigns(campaignRows);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Marketing lead verileri yüklenemedi.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createLead(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      await api("/corporate-communications/leads", {
        method: "POST",
        body: {
          provider,
          campaignId: campaignId || undefined,
          externalLeadId: externalLeadId || undefined,
          firstName,
          lastName,
          phone: phone || undefined,
          email: email || undefined,
          serviceInterest: serviceInterest || undefined,
        },
      });
      setFirstName(""); setLastName(""); setPhone(""); setEmail(""); setServiceInterest(""); setExternalLeadId(""); setShowForm(false);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Lead kaydedilemedi.");
    } finally { setSaving(false); }
  }

  if (loading && !leads.length) return <div className="py-20"><Spinner label="Lead inbox yükleniyor..." /></div>;

  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-col gap-4 rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 md:flex-row md:items-end md:justify-between">
        <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--accent)]">Kurumsal İletişim</p><h1 className="text-[30px] font-semibold tracking-[-.04em] text-[var(--ink)]">Lead & Dönüşüm Inbox</h1><p className="mt-2 max-w-3xl text-[12px] leading-5 text-[var(--muted)]">Meta, Google Ads, TikTok, web sitesi ve manuel kaynaklardan gelen talepler için merkezi pazarlama inbox'ı.</p></div>
        {canManage ? <Button onClick={() => setShowForm((v) => !v)}>{showForm ? "Formu Kapat" : "Lead Ekle"}</Button> : null}
      </header>
      {error ? <Alert>{error}</Alert> : null}

      {showForm && canManage ? (
        <form onSubmit={(e) => void createLead(e)} className="grid gap-4 rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-[11px] font-semibold text-[var(--muted)]">Kaynak<select className={fieldClass} value={provider} onChange={(e) => setProvider(e.target.value)}><option>MANUAL</option><option>META</option><option>GOOGLE_ADS</option><option>TIKTOK</option><option>WEBSITE</option><option>WHATSAPP</option><option>OTHER</option></select></label>
          <label className="text-[11px] font-semibold text-[var(--muted)]">Kampanya<select className={fieldClass} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}><option value="">Kampanyasız</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label>
          <label className="text-[11px] font-semibold text-[var(--muted)]">Provider Lead ID<input className={fieldClass} value={externalLeadId} onChange={(e) => setExternalLeadId(e.target.value)} placeholder="Opsiyonel" /></label>
          <label className="text-[11px] font-semibold text-[var(--muted)]">Ad<input required className={fieldClass} value={firstName} onChange={(e) => setFirstName(e.target.value)} /></label>
          <label className="text-[11px] font-semibold text-[var(--muted)]">Soyad<input required className={fieldClass} value={lastName} onChange={(e) => setLastName(e.target.value)} /></label>
          <label className="text-[11px] font-semibold text-[var(--muted)]">Telefon<input className={fieldClass} value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
          <label className="text-[11px] font-semibold text-[var(--muted)]">E-posta<input type="email" className={fieldClass} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="text-[11px] font-semibold text-[var(--muted)] md:col-span-2">Hizmet İlgisi<input className={fieldClass} value={serviceInterest} onChange={(e) => setServiceInterest(e.target.value)} placeholder="Örn. Lazer epilasyon" /></label>
          <div className="md:col-span-2 xl:col-span-3"><Button disabled={saving} type="submit">{saving ? "Kaydediliyor..." : "Lead'i Kaydet"}</Button></div>
        </form>
      ) : null}

      <section className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5">
        {leads.length ? <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left"><thead><tr className="border-b border-[var(--line)] text-[10px] uppercase tracking-[.1em] text-[var(--muted-soft)]"><th className="px-3 py-3">Lead</th><th className="px-3 py-3">Kaynak</th><th className="px-3 py-3">Kampanya</th><th className="px-3 py-3">İlgi</th><th className="px-3 py-3">Durum</th><th className="px-3 py-3">Dönüşüm</th><th className="px-3 py-3">Geliş</th></tr></thead><tbody>{leads.map((lead) => <tr key={lead.id} className="border-b border-[var(--line)] last:border-0"><td className="px-3 py-4"><p className="text-[13px] font-semibold text-[var(--ink)]">{lead.firstName} {lead.lastName}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{lead.phone || lead.email || "—"}</p></td><td className="px-3 py-4 text-[11px] text-[var(--muted)]">{lead.provider}</td><td className="px-3 py-4 text-[11px] text-[var(--muted)]">{lead.campaignName ?? "—"}</td><td className="px-3 py-4 text-[11px] text-[var(--muted)]">{lead.serviceInterest ?? "—"}</td><td className="px-3 py-4"><span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[9px] font-semibold text-[var(--accent)]">{lead.status}</span></td><td className="px-3 py-4 text-[10px] text-[var(--muted)]">{lead.saleId ? "Satış" : lead.appointmentId ? "Randevu" : "Henüz yok"}</td><td className="px-3 py-4 text-[10px] text-[var(--muted)]">{new Date(lead.receivedAt).toLocaleString("tr-TR")}</td></tr>)}</tbody></table></div> : <div className="py-14 text-center text-[12px] text-[var(--muted)]">Henüz lead yok.</div>}
      </section>
    </div>
  );
}
