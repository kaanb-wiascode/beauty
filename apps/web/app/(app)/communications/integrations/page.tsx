"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";

type Connection = {
  id: string;
  provider: string;
  externalAccountId?: string | null;
  displayName: string;
  status: string;
  lastSyncAt?: string | null;
  lastError?: string | null;
};

const fieldClass = "mt-2 h-11 w-full rounded-[13px] border border-[var(--line)] bg-white px-3 text-[12px] text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";

export default function AdvertisingConnectionsPage() {
  const canManage = hasPermission("communications", "manage");
  const [rows, setRows] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [provider, setProvider] = useState("META");
  const [displayName, setDisplayName] = useState("");
  const [externalAccountId, setExternalAccountId] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setRows(await api<Connection[]>("/corporate-communications/provider-connections")); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Reklam hesapları yüklenemedi."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      await api("/corporate-communications/provider-connections", { method: "POST", body: { provider, displayName, externalAccountId: externalAccountId || undefined } });
      setDisplayName(""); setExternalAccountId(""); await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : "Bağlantı kaydı oluşturulamadı."); }
    finally { setSaving(false); }
  }

  if (loading && !rows.length) return <div className="py-20"><Spinner label="Reklam hesapları yükleniyor..." /></div>;

  return <div className="space-y-6 pb-12">
    <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--accent)]">Kurumsal İletişim</p><h1 className="text-[30px] font-semibold tracking-[-.04em] text-[var(--ink)]">Reklam Hesapları</h1><p className="mt-2 max-w-3xl text-[12px] leading-5 text-[var(--muted)]">Meta, Google Ads ve TikTok hesaplarının bağlantı kayıtlarını yönetin. Bu ekran credential toplamaz; OAuth/token vault bağlantısı provider fazında devreye alınacak.</p></header>
    {error ? <Alert>{error}</Alert> : null}
    <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
      {canManage ? <form onSubmit={(e) => void create(e)} className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5"><h2 className="text-[15px] font-semibold text-[var(--ink)]">Hesap Kaydı Ekle</h2><p className="mt-1 text-[10px] leading-5 text-[var(--muted)]">Şifre/API secret istemiyoruz. Bu kayıt OAuth bağlantısı için güvenli placeholder oluşturur.</p><label className="mt-5 block text-[11px] font-semibold text-[var(--muted)]">Provider<select className={fieldClass} value={provider} onChange={(e) => setProvider(e.target.value)}><option>META</option><option>GOOGLE_ADS</option><option>TIKTOK</option><option>OTHER</option></select></label><label className="mt-4 block text-[11px] font-semibold text-[var(--muted)]">Görünen Ad<input required className={fieldClass} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Örn. Merkez Meta Ads" /></label><label className="mt-4 block text-[11px] font-semibold text-[var(--muted)]">External Account ID<input className={fieldClass} value={externalAccountId} onChange={(e) => setExternalAccountId(e.target.value)} placeholder="OAuth sonrası da eşleştirilebilir" /></label><Button className="mt-5" disabled={saving} type="submit">{saving ? "Kaydediliyor..." : "Bağlantı Kaydı Oluştur"}</Button></form> : null}
      <section className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5"><h2 className="text-[15px] font-semibold text-[var(--ink)]">Bağlantılar</h2>{rows.length ? <div className="mt-4 space-y-3">{rows.map((row) => <div key={row.id} className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[13px] font-semibold text-[var(--ink)]">{row.displayName}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{row.provider} · {row.externalAccountId ?? "Hesap ID bekleniyor"}</p></div><span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[9px] font-semibold text-[var(--accent)]">{row.status}</span></div>{row.lastError ? <p className="mt-2 text-[10px] text-red-600">{row.lastError}</p> : null}</div>)}</div> : <p className="mt-6 text-[12px] text-[var(--muted)]">Henüz reklam hesabı kaydı yok.</p>}</section>
    </div>
  </div>;
}
