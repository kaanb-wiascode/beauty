"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Alert, Button, Spinner, Select } from "@/components/ui";
import { CardInfo } from "@/components/card-info";
import { getCardHelp } from "@/lib/card-help";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { userErrorMessage, userLabel } from "@/lib/user-language";

type Connection = {
  id: string;
  provider: string;
  externalAccountId?: string | null;
  displayName: string;
  status: string;
  lastSyncAt?: string | null;
  lastError?: string | null;
};

type MetaPageResult = {
  connectionId: string;
  pages: Array<{
    id: string;
    name: string;
    subscribed: boolean;
  }>;
};

type WebhookSetup = {
  connectionId: string;
  webhookUrl: string;
  webhookSecret: string;
  secretVisibleOnce: boolean;
};

type DiscoveredAccounts = {
  connectionId: string;
  provider: string;
  selectedAccountId?: string | null;
  accounts: Array<{
    id: string;
    name: string;
    status?: string | null;
    currency?: string | null;
    timezone?: string | null;
  }>;
};

type ConnectionHealth = {
  total: number;
  connected: number;
  attention: number;
  authorizationRequired: number;
  verificationRequired: number;
  disconnected: number;
  lastSyncAt?: string | null;
  connections: Array<{
    id: string;
    provider: string;
    status: string;
    credentialsConfigured: boolean;
    health: "HEALTHY" | "ATTENTION" | "VERIFY_REQUIRED" | "AUTH_REQUIRED" | "DISCONNECTED";
    lastSyncAt?: string | null;
    lastError?: string | null;
  }>;
};

const healthLabel: Record<string, string> = {
  HEALTHY: "Bağlı ve Çalışıyor",
  ATTENTION: "Kontrol Gerekiyor",
  VERIFY_REQUIRED: "Bağlantı Testi Gerekli",
  AUTH_REQUIRED: "Yetkilendirme Gerekiyor",
  DISCONNECTED: "Bağlı Değil",
};

const fieldClass = "mt-2 h-11 w-full rounded-[13px] border border-[var(--line)] bg-white px-3 text-[12px] text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";

export default function AdvertisingConnectionsPage() {
  const canManage = hasPermission("communications", "manage");
  const [rows, setRows] = useState<Connection[]>([]);
  const [health, setHealth] = useState<ConnectionHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState("");
  const [connectingId, setConnectingId] = useState("");
  const [verifyingId, setVerifyingId] = useState("");
  const [discoveringId, setDiscoveringId] = useState("");
  const [selectingId, setSelectingId] = useState("");
  const [syncingId, setSyncingId] = useState("");
  const [webhookConfiguringId, setWebhookConfiguringId] = useState("");
  const [webhookSetup, setWebhookSetup] = useState<WebhookSetup | null>(null);
  const [metaPagesByConnection, setMetaPagesByConnection] = useState<Record<string, MetaPageResult["pages"]>>({});
  const [loadingMetaPagesId, setLoadingMetaPagesId] = useState("");
  const [subscribingMetaPageId, setSubscribingMetaPageId] = useState("");
  const [accountOptions, setAccountOptions] = useState<Record<string, DiscoveredAccounts["accounts"]>>({});
  const [error, setError] = useState("");
  const [provider, setProvider] = useState("META");
  const [displayName, setDisplayName] = useState("");
  const [externalAccountId, setExternalAccountId] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [connections, connectionHealth] = await Promise.all([
        api<Connection[]>("/corporate-communications/provider-connections"),
        api<ConnectionHealth>("/corporate-communications/provider-connections/health"),
      ]);
      setRows(connections);
      setHealth(connectionHealth);
    } catch (e) {
      setError(e instanceof ApiError ? userErrorMessage(e.message, "Entegrasyonlar yüklenemedi.") : "Entegrasyonlar yüklenemedi.");
    }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      await api("/corporate-communications/provider-connections", { method: "POST", body: { provider, displayName, externalAccountId: externalAccountId || undefined } });
      setDisplayName(""); setExternalAccountId(""); await load();
    } catch (e) { setError(e instanceof ApiError ? userErrorMessage(e.message, "Bağlantı kaydı oluşturulamadı.") : "Bağlantı kaydı oluşturulamadı."); }
    finally { setSaving(false); }
  }

  async function connect(id: string) {
    setConnectingId(id);
    setError("");
    try {
      const result = await api<{ authorizationUrl: string }>(
        `/corporate-communications/provider-connections/${id}/oauth/authorize`,
        { method: "POST" },
      );
      window.location.assign(result.authorizationUrl);
    } catch (e) {
      setError(e instanceof ApiError ? userErrorMessage(e.message, "Platform yetkilendirmesi başlatılamadı.") : "Platform yetkilendirmesi başlatılamadı.");
      setConnectingId("");
    }
  }

  async function verifyConnection(id: string) {
    setVerifyingId(id);
    setError("");
    try {
      await api(`/corporate-communications/provider-connections/${id}/oauth/verify`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? userErrorMessage(e.message, "Platform bağlantısı doğrulanamadı.") : "Platform bağlantısı doğrulanamadı.");
    } finally {
      setVerifyingId("");
    }
  }

  async function discoverAccounts(id: string) {
    setDiscoveringId(id);
    setError("");
    try {
      const result = await api<DiscoveredAccounts>(
        `/corporate-communications/provider-connections/${id}/accounts`,
      );
      setAccountOptions((current) => ({ ...current, [id]: result.accounts }));
      if (!result.accounts.length) {
        setError("Bu yetkilendirme kapsamında erişilebilir reklam hesabı bulunamadı.");
      }
    } catch (e) {
      setError(e instanceof ApiError ? userErrorMessage(e.message, "Reklam hesapları alınamadı.") : "Reklam hesapları alınamadı.");
    } finally {
      setDiscoveringId("");
    }
  }

  async function selectAccount(id: string, externalAccountId: string) {
    if (!externalAccountId) return;
    setSelectingId(id);
    setError("");
    try {
      await api(`/corporate-communications/provider-connections/${id}/accounts/select`, {
        method: "POST",
        body: { externalAccountId },
      });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? userErrorMessage(e.message, "Reklam hesabı seçilemedi.") : "Reklam hesabı seçilemedi.");
    } finally {
      setSelectingId("");
    }
  }

  async function syncConnection(id: string) {
    setSyncingId(id);
    setError("");
    try {
      await api(`/corporate-communications/provider-connections/${id}/sync`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? userErrorMessage(e.message, "Reklam verileri eşitlenemedi.") : "Reklam verileri eşitlenemedi.");
    } finally {
      setSyncingId("");
    }
  }

  async function loadMetaPages(id: string) {
    setLoadingMetaPagesId(id);
    setError("");
    try {
      const result = await api<MetaPageResult>(
        `/corporate-communications/provider-connections/${id}/meta/pages`,
      );
      setMetaPagesByConnection((current) => ({ ...current, [id]: result.pages }));
      if (!result.pages.length) {
        setError("Bu Meta yetkilendirmesi kapsamında erişilebilir Facebook Sayfası bulunamadı.");
      }
    } catch (e) {
      setError(e instanceof ApiError ? userErrorMessage(e.message, "Facebook Sayfaları alınamadı.") : "Facebook Sayfaları alınamadı.");
    } finally {
      setLoadingMetaPagesId("");
    }
  }

  async function subscribeMetaPage(connectionId: string, pageId: string) {
    setSubscribingMetaPageId(pageId);
    setError("");
    try {
      await api(
        `/corporate-communications/provider-connections/${connectionId}/meta/pages/${encodeURIComponent(pageId)}/subscribe`,
        { method: "POST" },
      );
      await loadMetaPages(connectionId);
    } catch (e) {
      setError(e instanceof ApiError ? userErrorMessage(e.message, "Meta lead aboneliği oluşturulamadı.") : "Meta lead aboneliği oluşturulamadı.");
    } finally {
      setSubscribingMetaPageId("");
    }
  }

  async function configureWebhook(id: string) {
    setWebhookConfiguringId(id);
    setError("");
    try {
      const result = await api<WebhookSetup>(
        `/corporate-communications/provider-connections/${id}/webhook/google-ads/configure`,
        { method: "POST" },
      );
      setWebhookSetup(result);
    } catch (e) {
      setError(e instanceof ApiError ? userErrorMessage(e.message, "Webhook kurulumu oluşturulamadı.") : "Webhook kurulumu oluşturulamadı.");
    } finally {
      setWebhookConfiguringId("");
    }
  }

  async function disconnect(id: string) {
    setDisconnectingId(id);
    setError("");
    try {
      await api(`/corporate-communications/provider-connections/${id}/disconnect`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? userErrorMessage(e.message, "Bağlantı kesilemedi.") : "Bağlantı kesilemedi.");
    } finally {
      setDisconnectingId("");
    }
  }

  if (loading && !rows.length) return <div className="py-20"><Spinner label="Entegrasyonlar yükleniyor..." /></div>;

  return <div className="space-y-6 pb-12">
    <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--accent)]">Kurumsal İletişim</p><h1 className="text-[30px] font-semibold tracking-[-.04em] text-[var(--ink)]">Entegrasyon Merkezi</h1><p className="mt-2 max-w-3xl text-[12px] leading-5 text-[var(--muted)]">Meta, Google Ads ve TikTok bağlantılarını, hesap durumlarını ve son veri eşitleme bilgilerini tek merkezden yönetin.</p></header>
    {error ? <Alert>{error}</Alert> : null}
    {webhookSetup ? (
      <section className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-semibold text-[var(--ink)]">Google Ads Webhook Kurulumu</h2>
          <CardInfo help={getCardHelp("Google Ads Webhook Kurulumu", "Bu adresi ve doğrulama anahtarını Google Ads potansiyel müşteri formunun webhook teslimat ayarına girin. Güvenlik nedeniyle anahtar daha sonra tekrar gösterilmez.")} />
        </div>
        <p className="mt-3 break-all text-[10px] text-[var(--muted)]"><strong>Webhook adresi:</strong> {webhookSetup.webhookUrl}</p>
        <p className="mt-2 break-all text-[10px] text-[var(--muted)]"><strong>Doğrulama anahtarı:</strong> {webhookSetup.webhookSecret}</p>
        <p className="mt-2 text-[10px] font-semibold text-amber-700">Bu anahtarı şimdi güvenli bir yere kaydedin; tekrar görüntülenmeyecek.</p>
      </section>
    ) : null}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric title="Tanımlı Bağlantı" value={String(health?.total ?? rows.length)} detail="VALOO içinde kayıtlı reklam ve pazarlama hesapları" />
      <Metric title="Çalışan Bağlantı" value={String(health?.connected ?? 0)} detail="Yetkilendirmesi bulunan ve sağlıklı görünen bağlantılar" />
      <Metric title="İşlem Gerektiren" value={String((health?.attention ?? 0) + (health?.verificationRequired ?? 0) + (health?.authorizationRequired ?? 0))} detail="Yeniden yetkilendirme veya bağlantı kontrolü gereken hesaplar" />
      <Metric title="Son Veri Eşitleme" value={health?.lastSyncAt ? new Date(health.lastSyncAt).toLocaleString("tr-TR") : "Henüz yok"} detail="Bağlı platformlardan alınan en son veri zamanı" />
    </section>

    <Alert>
      Bir hesabın burada kayıtlı olması, platformla canlı veri bağlantısının kurulduğu anlamına gelmez. Canlı bağlantılar yalnızca yetkilendirme bilgileri güvenli biçimde yapılandırıldıktan ve bağlantı sağlığı doğrulandıktan sonra “Bağlı ve Çalışıyor” olarak gösterilir.
    </Alert>

    <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
      {canManage ? <form onSubmit={(e) => void create(e)} className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5"><div className="flex items-center gap-2"><h2 className="text-[15px] font-semibold text-[var(--ink)]">Bağlantı Kaydı Ekle</h2><CardInfo help={getCardHelp("Bağlantı Kaydı Ekle", "Harici reklam hesabını VALOO içinde tanımlar. Gerçek bağlantı kurulumu için platform yetkilendirmesi ayrıca gerekir.")} /></div><p className="mt-1 text-[10px] leading-5 text-[var(--muted)]">Bu alanda şifre istenmez. Yalnızca reklam hesabını tanımlamak için gerekli temel bilgileri girin.</p><label className="mt-5 block text-[11px] font-semibold text-[var(--muted)]">Reklam Platformu<Select className={fieldClass} value={provider} onChange={(e) => setProvider(e.target.value)}><option value="META">Meta</option><option value="GOOGLE_ADS">Google Ads</option><option value="TIKTOK">TikTok</option><option value="OTHER">Diğer</option></Select></label><label className="mt-4 block text-[11px] font-semibold text-[var(--muted)]">Görünen Ad<input required className={fieldClass} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Örn. Merkez Meta Ads" /></label><label className="mt-4 block text-[11px] font-semibold text-[var(--muted)]">Reklam Hesabı Numarası<input className={fieldClass} value={externalAccountId} onChange={(e) => setExternalAccountId(e.target.value)} placeholder="Varsa platformdaki hesap numarası" /></label><Button className="mt-5" disabled={saving} type="submit">{saving ? "Kaydediliyor..." : "Bağlantı Kaydı Oluştur"}</Button></form> : null}
      <section className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5"><div className="flex items-center gap-2"><h2 className="text-[15px] font-semibold text-[var(--ink)]">Bağlantılar</h2><CardInfo help={getCardHelp("Bağlantılar", "Tanımlı reklam ve pazarlama hesaplarının bağlantı durumunu ve son eşitleme bilgisini gösterir.")} /></div>{rows.length ? <div className="mt-4 space-y-3">{rows.map((row) => {
        const connectionHealth = health?.connections.find((item) => item.id === row.id);
        return <div key={row.id} className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold text-[var(--ink)]">{row.displayName}</p>
              <p className="mt-1 text-[10px] text-[var(--muted)]">{userLabel(row.provider)} · {row.externalAccountId ?? "Hesap numarası belirtilmedi"}</p>
            </div>
            <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[9px] font-semibold text-[var(--accent)]">
              {healthLabel[connectionHealth?.health ?? "DISCONNECTED"]}
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <p className="text-[10px] text-[var(--muted)]">Yetkilendirme: {connectionHealth?.credentialsConfigured ? "Hazır" : "Gerekli"}</p>
            <p className="text-[10px] text-[var(--muted)]">Son eşitleme: {row.lastSyncAt ? new Date(row.lastSyncAt).toLocaleString("tr-TR") : "Henüz yapılmadı"}</p>
          </div>
          {row.lastError ? <p className="mt-2 text-[10px] text-red-600">Bağlantı sırasında bir sorun oluştu. Hesap yetkilerini ve bağlantı ayarlarını kontrol edin.</p> : null}
          {accountOptions[row.id]?.length ? (
            <label className="mt-3 block text-[10px] font-semibold text-[var(--muted)]">
              Erişilebilir Reklam Hesabı
              <Select
                className={fieldClass}
                value={row.externalAccountId ?? ""}
                disabled={selectingId === row.id}
                onChange={(event) => void selectAccount(row.id, event.target.value)}
              >
                <option value="">Hesap seçin</option>
                {accountOptions[row.id].map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {account.id}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}
          {canManage && ["META", "GOOGLE_ADS", "TIKTOK"].includes(row.provider) ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={connectingId === row.id}
                onClick={() => void connect(row.id)}
                className="rounded-[10px] bg-[var(--accent)] px-3 py-2 text-[10px] font-semibold text-white transition disabled:opacity-50"
              >
                {connectingId === row.id
                  ? "Platforma Yönlendiriliyor..."
                  : connectionHealth?.credentialsConfigured
                    ? "Yeniden Yetkilendir"
                    : "Platforma Bağlan"}
              </button>
              {connectionHealth?.credentialsConfigured ? (
                <button
                  type="button"
                  disabled={verifyingId === row.id}
                  onClick={() => void verifyConnection(row.id)}
                  className="rounded-[10px] border border-[var(--line)] px-3 py-2 text-[10px] font-semibold text-[var(--ink)] transition hover:border-[var(--accent)] disabled:opacity-50"
                >
                  {verifyingId === row.id ? "Bağlantı Test Ediliyor..." : "Bağlantıyı Test Et"}
                </button>
              ) : null}
              {connectionHealth?.credentialsConfigured ? (
                <button
                  type="button"
                  disabled={discoveringId === row.id}
                  onClick={() => void discoverAccounts(row.id)}
                  className="rounded-[10px] border border-[var(--line)] px-3 py-2 text-[10px] font-semibold text-[var(--ink)] transition hover:border-[var(--accent)] disabled:opacity-50"
                >
                  {discoveringId === row.id ? "Hesaplar Getiriliyor..." : "Hesapları Getir"}
                </button>
              ) : null}
              {row.provider === "META" && connectionHealth?.credentialsConfigured ? (
                <button
                  type="button"
                  disabled={loadingMetaPagesId === row.id}
                  onClick={() => void loadMetaPages(row.id)}
                  className="rounded-[10px] border border-[var(--line)] px-3 py-2 text-[10px] font-semibold text-[var(--ink)] transition hover:border-[var(--accent)] disabled:opacity-50"
                >
                  {loadingMetaPagesId === row.id ? "Sayfalar Getiriliyor..." : "Facebook Sayfalarını Getir"}
                </button>
              ) : null}
              {connectionHealth?.credentialsConfigured && row.externalAccountId ? (
                <button
                  type="button"
                  disabled={syncingId === row.id}
                  onClick={() => void syncConnection(row.id)}
                  className="rounded-[10px] border border-[var(--line)] px-3 py-2 text-[10px] font-semibold text-[var(--ink)] transition hover:border-[var(--accent)] disabled:opacity-50"
                >
                  {syncingId === row.id ? "Veriler Eşitleniyor..." : "Verileri Eşitle"}
                </button>
              ) : null}
              {row.provider === "GOOGLE_ADS" && connectionHealth?.credentialsConfigured ? (
                <button
                  type="button"
                  disabled={webhookConfiguringId === row.id}
                  onClick={() => void configureWebhook(row.id)}
                  className="rounded-[10px] border border-[var(--line)] px-3 py-2 text-[10px] font-semibold text-[var(--ink)] transition hover:border-[var(--accent)] disabled:opacity-50"
                >
                  {webhookConfiguringId === row.id ? "Webhook Hazırlanıyor..." : "Webhook Kurulumu"}
                </button>
              ) : null}
              {connectionHealth?.health !== "DISCONNECTED" ? (
                <button
                  type="button"
                  disabled={disconnectingId === row.id}
                  onClick={() => void disconnect(row.id)}
                  className="rounded-[10px] border border-[var(--line)] px-3 py-2 text-[10px] font-semibold text-[var(--muted)] transition hover:text-red-600 disabled:opacity-50"
                >
                  {disconnectingId === row.id ? "Bağlantı Kesiliyor..." : "Bağlantıyı Kes"}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>;
      })}</div> : <p className="mt-6 text-[12px] text-[var(--muted)]">Henüz reklam hesabı kaydı yok.</p>}</section>
    </div>
  </div>;
}


function Metric({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--muted-soft)]">{title}</p>
        <CardInfo help={getCardHelp(title, detail)} />
      </div>
      <p className="mt-3 text-[22px] font-semibold tracking-[-.04em] text-[var(--ink)]">{value}</p>
      <p className="mt-2 text-[10px] leading-5 text-[var(--muted)]">{detail}</p>
    </div>
  );
}
