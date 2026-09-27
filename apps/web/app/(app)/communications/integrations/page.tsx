"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Spinner, Select } from "@/components/ui";
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

type ConfigurationReadiness = {
  ready: boolean;
  providers: Array<{
    provider: "META" | "GOOGLE_ADS" | "TIKTOK";
    label: string;
    ready: boolean;
    configuredCount: number;
    requiredCount: number;
    missing: string[];
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

const configurationHelp: Record<string, { label: string; help: { title: string; description: string; interpretation?: string; source?: string } }> = {
  MARKETING_INTEGRATION_MASTER_KEY: {
    label: "VALOO Entegrasyon Şifreleme Anahtarı",
    help: {
      title: "VALOO Entegrasyon Şifreleme Anahtarı",
      description: "OAuth erişim ve yenileme anahtarlarını veritabanında şifreli saklamak için VALOO sunucusunda kullanılan merkezi güvenlik anahtarıdır. Kullanıcıdan alınmaz ve platform hesabıyla ilişkili değildir.",
      interpretation: "Render ortam değişkenlerinde yalnızca platform yöneticisi tarafından bir kez tanımlanır. Son kullanıcı bu değeri hiçbir zaman görmez veya girmez.",
      source: "VALOO sunucu güvenlik yapılandırması",
    },
  },
  META_OAUTH_CLIENT_ID: {
    label: "Meta Uygulama Kimliği (App ID)",
    help: {
      title: "Meta Uygulama Kimliği (App ID)",
      description: "VALOO adına oluşturulan merkezi Meta Developer uygulamasının kimliğidir. Meta'nın kullanıcıyı hangi uygulamanın izin istediğini tanıması için gerekir.",
      interpretation: "Meta for Developers içinde VALOO uygulaması oluşturulduktan sonra App Dashboard > Settings > Basic bölümündeki App ID alınır ve Render'da META_OAUTH_CLIENT_ID olarak yalnızca bir kez tanımlanır.",
      source: "Meta for Developers",
    },
  },
  META_OAUTH_CLIENT_SECRET: {
    label: "Meta Uygulama Gizli Anahtarı",
    help: {
      title: "Meta Uygulama Gizli Anahtarı",
      description: "VALOO'nun Meta'ya sunucu tarafında kendisini doğrulamasını sağlayan gizli uygulama anahtarıdır.",
      interpretation: "Meta App Dashboard > Settings > Basic bölümündeki App Secret değeri alınır ve yalnızca Render secret/env alanına kaydedilir. Arayüzde veya kaynak kodda gösterilmemelidir.",
      source: "Meta for Developers",
    },
  },
  META_GRAPH_API_VERSION: {
    label: "Meta Graph API Sürümü",
    help: {
      title: "Meta Graph API Sürümü",
      description: "VALOO'nun Meta Graph API çağrılarında kullanacağı desteklenen API sürümünü belirler.",
      interpretation: "Meta uygulamasının desteklediği güncel sürüm seçilir ve Render'da META_GRAPH_API_VERSION olarak tanımlanır. Sürüm yükseltmeleri platform yöneticisi tarafından merkezi olarak yapılır.",
      source: "Meta Graph API dokümantasyonu",
    },
  },
  GOOGLE_OAUTH_CLIENT_ID: {
    label: "Google OAuth İstemci Kimliği",
    help: {
      title: "Google OAuth İstemci Kimliği",
      description: "VALOO'nun Google izin ekranını açabilmesi için Google Cloud projesinde oluşturulan Web application OAuth istemcisinin kimliğidir.",
      interpretation: "Google Cloud Console > APIs & Services > Credentials > Create Credentials > OAuth client ID yolundan Web application oluşturulur. Yetkili redirect URI olarak VALOO OAuth callback adresi eklenir ve Client ID Render'a kaydedilir.",
      source: "Google Cloud / Google Ads API",
    },
  },
  GOOGLE_OAUTH_CLIENT_SECRET: {
    label: "Google OAuth İstemci Gizli Anahtarı",
    help: {
      title: "Google OAuth İstemci Gizli Anahtarı",
      description: "Google'dan dönen authorization code değerini erişim/yenileme tokenına çevirmek için VALOO backend'inin kullandığı gizli anahtardır.",
      interpretation: "Google Cloud Console'daki aynı OAuth istemcisinden alınır ve yalnızca Render'da GOOGLE_OAUTH_CLIENT_SECRET olarak saklanır. Kullanıcıya gösterilmez.",
      source: "Google Cloud OAuth 2.0",
    },
  },
  GOOGLE_OAUTH_REDIRECT_URI: {
    label: "Google Geri Dönüş Adresi",
    help: {
      title: "Google OAuth Geri Dönüş Adresi",
      description: "Google izin ekranı tamamlandığında kullanıcının VALOO'ya geri gönderileceği adrestir.",
      interpretation: "Google Cloud OAuth istemcisindeki Authorized redirect URIs listesine https://valoo-staging-web.onrender.com/communications/integrations/oauth/callback adresi birebir eklenmelidir. Protokol, yol ve sondaki karakterler tam eşleşmelidir.",
      source: "Google OAuth 2.0 Web Server Applications",
    },
  },
  TIKTOK_BUSINESS_APP_ID: {
    label: "TikTok for Business App ID",
    help: {
      title: "TikTok for Business App ID",
      description: "VALOO adına TikTok API for Business portalında oluşturulan developer uygulamasının kimliğidir.",
      interpretation: "TikTok API for Business > My Apps bölümünde VALOO developer app oluşturulur. Basic Information alanındaki App ID alınır ve Render'da TIKTOK_BUSINESS_APP_ID olarak tanımlanır.",
      source: "TikTok API for Business",
    },
  },
  TIKTOK_BUSINESS_SECRET: {
    label: "TikTok for Business App Secret",
    help: {
      title: "TikTok for Business App Secret",
      description: "TikTok authorization code değerini access token'a çevirmek için VALOO backend'inin kullandığı gizli uygulama anahtarıdır.",
      interpretation: "TikTok API for Business > My Apps > Basic Information alanından alınır. Yalnızca Render secret/env alanında saklanır; son kullanıcıya gösterilmez.",
      source: "TikTok API for Business",
    },
  },
  TIKTOK_BUSINESS_AUTHORIZATION_URL: {
    label: "TikTok Reklamveren Yetkilendirme Adresi",
    help: {
      title: "TikTok Reklamveren Yetkilendirme Adresi",
      description: "Kullanıcı 'Bağla' dediğinde VALOO'nun yönlendireceği TikTok resmi izin ekranı adresidir.",
      interpretation: "TikTok API for Business > My Apps içinde redirect URL olarak VALOO callback adresi tanımlanır ve portalın ürettiği Advertiser authorization URL Render'da TIKTOK_BUSINESS_AUTHORIZATION_URL olarak kaydedilir.",
      source: "TikTok API for Business Authorization",
    },
  },
};

const providerSetupHelp: Record<string, { title: string; description: string; interpretation: string; source: string }> = {
  META: {
    title: "Meta Entegrasyonu Nasıl Kurulur?",
    description: "VALOO için merkezi bir Meta Developer uygulaması bir kez oluşturulur. Uygulamada Facebook Login/Business yetkileri, gerekli reklam ve Lead Ads izinleri ile OAuth callback adresi yapılandırılır.",
    interpretation: "Platform kurulumu tamamlandıktan sonra müşteriler App ID veya Secret girmez. Yalnızca 'Bağla' düğmesine basar, Meta izin ekranında onay verir ve VALOO'ya geri döner.",
    source: "Meta for Developers",
  },
  GOOGLE_ADS: {
    title: "Google Ads Entegrasyonu Nasıl Kurulur?",
    description: "VALOO için bir Google Cloud projesi oluşturulur, Google Ads API etkinleştirilir, OAuth consent screen hazırlanır ve Web application tipinde OAuth istemcisi oluşturulur.",
    interpretation: "Callback URI Google Cloud'da yetkili redirect URI olarak tanımlandıktan sonra Client ID ve Client Secret yalnızca sunucuya kaydedilir. Google Ads developer token artık yeni erişim modelinde zorunlu kurulum kapısı değildir.",
    source: "Google Ads API / Google Cloud",
  },
  TIKTOK: {
    title: "TikTok Ads Entegrasyonu Nasıl Kurulur?",
    description: "TikTok for Business hesabıyla developer kaydı yapılır, VALOO için developer app oluşturulur, gerekli Marketing API izinleri ve redirect URL tanımlanır.",
    interpretation: "TikTok portalının oluşturduğu Advertiser authorization URL VALOO'ya kaydedilir. Son kullanıcı 'Bağla' ile TikTok izin ekranına gider; onay sonrası code otomatik olarak VALOO callback'ine döner.",
    source: "TikTok API for Business",
  },
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
  const [configurationReadiness, setConfigurationReadiness] = useState<ConfigurationReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnectingId, setDisconnectingId] = useState("");
  const [connectingId, setConnectingId] = useState("");
  const [startingProvider, setStartingProvider] = useState("");
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

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [connections, connectionHealth, readiness] = await Promise.all([
        api<Connection[]>("/corporate-communications/provider-connections"),
        api<ConnectionHealth>("/corporate-communications/provider-connections/health"),
        api<ConfigurationReadiness>("/corporate-communications/provider-connections/configuration-readiness"),
      ]);
      setRows(connections);
      setHealth(connectionHealth);
      setConfigurationReadiness(readiness);
    } catch (e) {
      setError(e instanceof ApiError ? userErrorMessage(e.message, "Entegrasyonlar yüklenemedi.") : "Entegrasyonlar yüklenemedi.");
    }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function connectProvider(provider: "META" | "GOOGLE_ADS" | "TIKTOK") {
    setStartingProvider(provider);
    setError("");
    try {
      const result = await api<{ authorizationUrl: string }>(
        "/corporate-communications/provider-connections/oauth/start",
        { method: "POST", body: { provider } },
      );
      window.location.assign(result.authorizationUrl);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? userErrorMessage(e.message, "Platform bağlantısı başlatılamadı.")
          : "Platform bağlantısı başlatılamadı.",
      );
      setStartingProvider("");
    }
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
    {configurationReadiness ? (
      <section className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-semibold text-[var(--ink)]">Platform Hazırlık Durumu</h2>
          <CardInfo help={getCardHelp("Platform Hazırlık Durumu", "Gerçek Meta, Google Ads ve TikTok bağlantılarının başlayabilmesi için sunucu tarafında gerekli ayarların tanımlı olup olmadığını gösterir. Güvenlik nedeniyle gizli değerler gösterilmez.")} />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {configurationReadiness.providers.map((provider) => (
            <div key={provider.provider} className="rounded-[14px] border border-[var(--line)] bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-[var(--ink)]">{provider.label}</p>
                <span className={`rounded-full px-2 py-1 text-[9px] font-semibold ${provider.ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  {provider.ready ? "Hazır" : "Eksik Ayar"}
                </span>
              </div>
              <p className="mt-2 text-[10px] text-[var(--muted)]">
                {provider.configuredCount}/{provider.requiredCount} gerekli ayar tanımlı
              </p>
              {!provider.ready ? (
                <div className="mt-3 space-y-2">
                  {provider.missing.map((key) => {
                    const item = configurationHelp[key];
                    return (
                      <div key={key} className="flex items-center justify-between gap-2 rounded-[10px] border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-2">
                        <span className="text-[9px] font-medium text-[var(--ink)]">
                          {item?.label ?? key}
                        </span>
                        {item ? <CardInfo help={item.help} /> : null}
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[9px] font-semibold text-amber-700">Kurulum rehberi</span>
                    <CardInfo help={providerSetupHelp[provider.provider] ?? getCardHelp(provider.label, "Platform kurulumu hakkında bilgi.")} />
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    ) : null}
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

    <section className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-[13px] font-semibold text-[var(--ink)]">Entegrasyon Nasıl Çalışır?</h2>
        <CardInfo help={getCardHelp("Entegrasyon Nasıl Çalışır?", "Teknik uygulama kimlikleri VALOO platform yöneticisi tarafından yalnızca bir kez kurulur. Son kullanıcı bu anahtarları görmez; yalnızca platform hesabına giriş yapıp izin verir.")} />
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] p-3">
          <p className="text-[10px] font-semibold text-[var(--ink)]">1. VALOO Platform Kurulumu · Tek Sefer</p>
          <p className="mt-1 text-[9px] leading-4 text-[var(--muted)]">Meta, Google ve TikTok geliştirici uygulamaları oluşturulur; App ID/Secret ve callback adresleri güvenli sunucu ortamına tanımlanır.</p>
        </div>
        <div className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] p-3">
          <p className="text-[10px] font-semibold text-[var(--ink)]">2. İşletme Hesabı Bağlama · Otomatik</p>
          <p className="mt-1 text-[9px] leading-4 text-[var(--muted)]">Kullanıcı yalnızca “Bağla” der → resmi platform izin ekranında onay verir → VALOO’ya döner → reklam hesapları otomatik keşfedilir.</p>
        </div>
      </div>
    </section>

    <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
      {canManage ? (
        <section className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-[var(--ink)]">Platform Bağla</h2>
            <CardInfo help={getCardHelp("Platform Bağla", "Bir platform seçtiğinizde VALOO bağlantı kaydını otomatik oluşturur ve sizi platformun resmi izin ekranına yönlendirir. Reklam hesabı numarası veya teknik kimlik girmeniz gerekmez.")} />
          </div>
          <p className="mt-1 text-[10px] leading-5 text-[var(--muted)]">
            Hesabınızı seçin, platformun resmi izin ekranında erişime onay verin ve otomatik olarak VALOO’ya geri dönün.
          </p>
          <div className="mt-4 space-y-3">
            {([
              ["META", "Meta", "Facebook ve Instagram reklam hesapları, Lead Ads ve performans verileri"],
              ["GOOGLE_ADS", "Google Ads", "Google Ads hesapları, kampanyalar ve potansiyel müşteri formları"],
              ["TIKTOK", "TikTok Ads", "TikTok reklam hesapları, kampanyalar ve Lead Generation verileri"],
            ] as const).map(([providerKey, label, detail]) => {
              const readiness = configurationReadiness?.providers.find((item) => item.provider === providerKey);
              return (
                <div key={providerKey} className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[12px] font-semibold text-[var(--ink)]">{label}</p>
                      <p className="mt-1 text-[10px] leading-4 text-[var(--muted)]">{detail}</p>
                    </div>
                    <button
                      type="button"
                      disabled={startingProvider === providerKey || readiness?.ready === false}
                      onClick={() => void connectProvider(providerKey)}
                      className="rounded-[10px] bg-[var(--accent)] px-4 py-2.5 text-[10px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {startingProvider === providerKey
                        ? "Platforma Yönlendiriliyor..."
                        : readiness?.ready === false
                          ? "Kurulum Bekleniyor"
                          : "Bağla"}
                    </button>
                  </div>
                  {readiness?.ready === false ? (
                    <p className="mt-2 text-[9px] leading-4 text-amber-700">
                      VALOO platform yapılandırması tamamlandığında bu bağlantı otomatik olarak aktif olacaktır.
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
      <section className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5"><div className="flex items-center gap-2"><h2 className="text-[15px] font-semibold text-[var(--ink)]">Bağlantılar</h2><CardInfo help={getCardHelp("Bağlantılar", "Tanımlı reklam ve pazarlama hesaplarının bağlantı durumunu ve son eşitleme bilgisini gösterir.")} /></div>{rows.length ? <div className="mt-4 space-y-3">{rows.map((row) => {
        const connectionHealth = health?.connections.find((item) => item.id === row.id);
        const providerReadiness = configurationReadiness?.providers.find((item) => item.provider === row.provider);
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
          {row.provider === "META" && metaPagesByConnection[row.id]?.length ? (
            <div className="mt-3 space-y-2 rounded-[12px] border border-[var(--line)] bg-white p-3">
              <p className="text-[10px] font-semibold text-[var(--ink)]">Facebook Sayfaları</p>
              {metaPagesByConnection[row.id].map((page) => (
                <div key={page.id} className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-semibold text-[var(--ink)]">{page.name}</p>
                    <p className="text-[9px] text-[var(--muted)]">{page.id}</p>
                  </div>
                  <button
                    type="button"
                    disabled={page.subscribed || subscribingMetaPageId === page.id}
                    onClick={() => void subscribeMetaPage(row.id, page.id)}
                    className="rounded-[9px] border border-[var(--line)] px-2.5 py-1.5 text-[9px] font-semibold text-[var(--ink)] disabled:opacity-50"
                  >
                    {page.subscribed
                      ? "Lead Aboneliği Aktif"
                      : subscribingMetaPageId === page.id
                        ? "Abone Olunuyor..."
                        : "Lead Aboneliğini Aç"}
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          {canManage && ["META", "GOOGLE_ADS", "TIKTOK"].includes(row.provider) ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={connectingId === row.id || providerReadiness?.ready === false}
                onClick={() => void connect(row.id)}
                className="rounded-[10px] bg-[var(--accent)] px-3 py-2 text-[10px] font-semibold text-white transition disabled:opacity-50"
              >
                {connectingId === row.id
                  ? "Platforma Yönlendiriliyor..."
                  : providerReadiness?.ready === false
                    ? "Kurulum Gerekiyor"
                    : connectionHealth?.credentialsConfigured
                      ? "Yeniden Yetkilendir"
                      : "Platforma Bağlan"}
              </button>
              {providerReadiness?.ready === false ? (
                <CardInfo help={providerSetupHelp[row.provider] ?? getCardHelp(userLabel(row.provider), "Platform kurulumu tamamlanmadan hesap yetkilendirmesi başlatılamaz.")} />
              ) : null}
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
