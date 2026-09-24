"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Spinner, Select } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";

type ContentItem = {
  id: string;
  title: string;
  platform: string;
  format: string;
  status: string;
  caption?: string | null;
  cta?: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  pendingApprovalId?: string | null;
  updatedAt: string;
};

type Campaign = { id: string; name: string };

const fieldClass = "mt-2 h-11 w-full rounded-[13px] border border-[var(--line)] bg-white px-3 text-[12px] text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";
const areaClass = "mt-2 min-h-24 w-full rounded-[13px] border border-[var(--line)] bg-white px-3 py-3 text-[12px] text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";
const columns = ["IDEA", "BRIEF", "PRODUCTION", "REVIEW", "APPROVED", "SCHEDULED", "PUBLISHED"];

const statusLabel: Record<string, string> = {
  IDEA: "Fikir",
  BRIEF: "Brief",
  PRODUCTION: "Üretim",
  REVIEW: "İnceleme",
  APPROVED: "Onaylandı",
  SCHEDULED: "Planlandı",
  PUBLISHED: "Yayınlandı",
  ARCHIVED: "Arşiv",
};

export default function ContentOperationsPage() {
  const canManage = hasPermission("communications", "manage");
  const [items, setItems] = useState<ContentItem[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState("");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState("INSTAGRAM");
  const [format, setFormat] = useState("POST");
  const [campaignId, setCampaignId] = useState("");
  const [caption, setCaption] = useState("");
  const [cta, setCta] = useState("");
  const [scheduleId, setScheduleId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [contentRows, campaignRows] = await Promise.all([
        api<ContentItem[]>("/corporate-communications/content?limit=200"),
        api<Campaign[]>("/corporate-communications/campaigns?limit=200"),
      ]);
      setItems(contentRows);
      setCampaigns(campaignRows);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "İçerik operasyonu yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const grouped = useMemo(() => Object.fromEntries(columns.map((status) => [status, items.filter((item) => item.status === status)])), [items]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api("/corporate-communications/content", {
        method: "POST",
        body: {
          title,
          platform,
          format,
          campaignId: campaignId || undefined,
          caption: caption || undefined,
          cta: cta || undefined,
        },
      });
      setTitle("");
      setCaption("");
      setCta("");
      setCampaignId("");
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "İçerik kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  async function submitReview(id: string) {
    setActingId(id);
    setError("");
    try {
      await api(`/corporate-communications/content/${id}/submit-review`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "İçerik incelemeye gönderilemedi.");
    } finally { setActingId(""); }
  }

  async function publish(id: string) {
    setActingId(id);
    setError("");
    try {
      await api(`/corporate-communications/content/${id}/publish`, { method: "POST", body: {} });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "İçerik yayınlandı olarak işaretlenemedi.");
    } finally { setActingId(""); }
  }

  async function schedule(event: FormEvent) {
    event.preventDefault();
    if (!scheduleId) return;
    setActingId(scheduleId);
    setError("");
    try {
      await api(`/corporate-communications/content/${scheduleId}/schedule`, {
        method: "POST",
        body: { scheduledAt: new Date(scheduledAt).toISOString() },
      });
      setScheduleId("");
      setScheduledAt("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "İçerik planlanamadı.");
    } finally { setActingId(""); }
  }

  if (loading && !items.length) return <div className="py-20"><Spinner label="İçerik operasyonu yükleniyor..." /></div>;

  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-col gap-4 rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--accent)]">Kurumsal İletişim</p>
          <h1 className="text-[30px] font-semibold tracking-[-.04em] text-[var(--ink)]">İçerik Operasyonu</h1>
          <p className="mt-2 max-w-3xl text-[12px] leading-5 text-[var(--muted)]">Fikirden yayına kadar sosyal medya ve dijital içerik lifecycle&apos;ını kampanya bağlantısı ve zorunlu onay kapısıyla yönetin.</p>
        </div>
        {canManage ? <Button onClick={() => setShowForm((value) => !value)}>{showForm ? "Formu Kapat" : "Yeni İçerik"}</Button> : null}
      </header>

      {error ? <Alert>{error}</Alert> : null}

      {showForm && canManage ? (
        <form onSubmit={(e) => void create(e)} className="grid gap-4 rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-[11px] font-semibold text-[var(--muted)] md:col-span-2">Başlık<input required className={fieldClass} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label className="text-[11px] font-semibold text-[var(--muted)]">Platform<Select className={fieldClass} value={platform} onChange={(e) => setPlatform(e.target.value)}><option>INSTAGRAM</option><option>FACEBOOK</option><option>TIKTOK</option><option>YOUTUBE</option><option>LINKEDIN</option><option>WEBSITE</option><option>EMAIL</option><option>SMS</option><option>WHATSAPP</option><option>OTHER</option></Select></label>
          <label className="text-[11px] font-semibold text-[var(--muted)]">Format<Select className={fieldClass} value={format} onChange={(e) => setFormat(e.target.value)}><option>POST</option><option>REEL</option><option>STORY</option><option>VIDEO</option><option>ARTICLE</option><option>EMAIL</option><option>SMS</option><option>BANNER</option><option>OTHER</option></Select></label>
          <label className="text-[11px] font-semibold text-[var(--muted)] md:col-span-2">Kampanya<Select className={fieldClass} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}><option value="">Kampanyasız</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</Select></label>
          <label className="text-[11px] font-semibold text-[var(--muted)] md:col-span-2">CTA<input className={fieldClass} value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Randevu al, Teklif iste..." /></label>
          <label className="text-[11px] font-semibold text-[var(--muted)] md:col-span-2 xl:col-span-4">Caption / İçerik Metni<textarea className={areaClass} value={caption} onChange={(e) => setCaption(e.target.value)} /></label>
          <div className="md:col-span-2 xl:col-span-4"><Button disabled={saving} type="submit">{saving ? "Kaydediliyor..." : "İçeriği Oluştur"}</Button></div>
        </form>
      ) : null}

      {scheduleId ? (
        <form onSubmit={(e) => void schedule(e)} className="flex flex-col gap-3 rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5 md:flex-row md:items-end">
          <label className="flex-1 text-[11px] font-semibold text-[var(--muted)]">Yayın Zamanı<input required type="datetime-local" className={fieldClass} value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></label>
          <Button disabled={actingId === scheduleId} type="submit">Planla</Button>
          <Button type="button" onClick={() => setScheduleId("")}>Vazgeç</Button>
        </form>
      ) : null}

      <section className="overflow-x-auto pb-2">
        <div className="grid min-w-[1700px] grid-cols-7 gap-4">
          {columns.map((status) => (
            <div key={status} className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-3">
              <div className="mb-3 flex items-center justify-between"><h2 className="text-[12px] font-semibold text-[var(--ink)]">{statusLabel[status]}</h2><span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] text-[var(--muted)]">{grouped[status]?.length ?? 0}</span></div>
              <div className="space-y-3">
                {(grouped[status] ?? []).map((item) => (
                  <article key={item.id} className="rounded-[15px] border border-[var(--line)] bg-white p-3">
                    <p className="text-[12px] font-semibold text-[var(--ink)]">{item.title}</p>
                    <p className="mt-1 text-[9px] uppercase tracking-[.08em] text-[var(--muted)]">{item.platform} · {item.format}</p>
                    {item.campaignName ? <p className="mt-2 text-[10px] text-[var(--muted)]">{item.campaignName}</p> : null}
                    {item.scheduledAt ? <p className="mt-2 text-[10px] text-[var(--muted)]">{new Date(item.scheduledAt).toLocaleString("tr-TR")}</p> : null}
                    {canManage && ["IDEA", "BRIEF", "PRODUCTION"].includes(item.status) ? <Button className="mt-3 w-full" disabled={actingId === item.id} onClick={() => void submitReview(item.id)}>İncelemeye Gönder</Button> : null}
                    {canManage && item.status === "APPROVED" ? <div className="mt-3 flex gap-2"><Button onClick={() => setScheduleId(item.id)}>Planla</Button><Button disabled={actingId === item.id} onClick={() => void publish(item.id)}>Yayınla</Button></div> : null}
                    {canManage && item.status === "SCHEDULED" ? <Button className="mt-3 w-full" disabled={actingId === item.id} onClick={() => void publish(item.id)}>Yayınlandı İşaretle</Button> : null}
                  </article>
                ))}
                {!grouped[status]?.length ? <p className="py-5 text-center text-[10px] text-[var(--muted-soft)]">Kayıt yok</p> : null}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
