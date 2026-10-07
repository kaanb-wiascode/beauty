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

  if (loading && !rows.length) {
    return (
      <div className="py-20">
        <Spinner label="Platform bağlantıları yükleniyor..." />
      </div>
    );
  }

  const issueCount =
    (health?.attention ?? 0) +
    (health?.verificationRequired ?? 0) +
    (health?.authorizationRequired ?? 0) +
    (health?.disconnected ?? 0);

  return (
    <div className="space-y-5 pb-12">
      <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--accent)]">
              Kurumsal İletişim
            </p>
            <h1 className="mt-2 text-[30px] font-semibold tracking-[-.04em] text-[var(--ink)]">
              Platform Bağlantıları
            </h1>
            <p className="mt-2 max-w-4xl text-[12px] leading-5 text-[var(--muted)]">
              Meta, Google Ads ve TikTok hesaplarının bağlantı sağlığını,
              yetkilendirmesini ve veri eşitlemesini tek merkezden yönetin.
            </p>
          </div>

          <span
            className={
              issueCount
                ? "inline-flex rounded-full bg-[var(--warning-soft)] px-3 py-1.5 text-[9px] font-semibold text-[var(--warning)]"
                : "inline-flex rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-[9px] font-semibold text-[var(--accent)]"
            }
          >
            {issueCount
              ? issueCount + " bağlantı işlemi gerekiyor"
              : "Bağlantılar sağlıklı"}
          </span>
        </div>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      {webhookSetup ? (
        <section className="rounded-[18px] border border-[var(--warning)]/25 bg-[var(--warning-soft)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[11px] font-semibold text-[var(--ink)]">
                Google Ads Form Bağlantısı Hazır
              </h2>
              <p className="mt-1 text-[8px] leading-4 text-[var(--muted)]">
                Aşağıdaki bilgileri Google Ads potansiyel müşteri formunun
                teslimat ayarına kaydedin. Doğrulama anahtarı yalnızca bu
                aşamada gösterilir.
              </p>
            </div>
            <CardInfo
              help={getCardHelp(
                "Google Ads Form Bağlantısı",
                "Bu adres ve doğrulama anahtarı Google Ads lead form webhook teslimatı için kullanılır.",
              )}
            />
          </div>
          <div className="mt-3 grid gap-2 lg:grid-cols-2">
            <div className="rounded-[12px] bg-white p-3">
              <span className="block text-[7px] text-[var(--muted)]">
                Teslimat Adresi
              </span>
              <strong className="mt-1 block break-all text-[8px] text-[var(--ink)]">
                {webhookSetup.webhookUrl}
              </strong>
            </div>
            <div className="rounded-[12px] bg-white p-3">
              <span className="block text-[7px] text-[var(--muted)]">
                Doğrulama Anahtarı
              </span>
              <strong className="mt-1 block break-all text-[8px] text-[var(--ink)]">
                {webhookSetup.webhookSecret}
              </strong>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          title="Tanımlı Bağlantı"
          value={String(health?.total ?? rows.length)}
          detail="VALOO içinde kayıtlı platform bağlantıları"
        />
        <Metric
          title="Çalışan Bağlantı"
          value={String(health?.connected ?? 0)}
          detail="Yetkili ve sağlıklı veri akışı"
        />
        <Metric
          title="İşlem Gerektiren"
          value={String(issueCount)}
          detail="Yetki, doğrulama veya bağlantı kontrolü"
          attention={issueCount > 0}
        />
        <Metric
          title="Son Veri Eşitleme"
          value={
            health?.lastSyncAt
              ? new Date(health.lastSyncAt).toLocaleString("tr-TR")
              : "Henüz yok"
          }
          detail="Platformlardan alınan son veri zamanı"
        />
      </section>

      {canManage ? (
        <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
          <div className="mb-4">
            <h2 className="text-[13px] font-semibold text-[var(--ink)]">
              Yeni Platform Bağla
            </h2>
            <p className="mt-1 text-[8px] leading-4 text-[var(--muted)]">
              Platformu seçin; resmi izin ekranında onay verdikten sonra reklam
              hesapları VALOO tarafından keşfedilir.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {([
              [
                "META",
                "Meta",
                "Facebook, Instagram, Lead Ads ve reklam performansı",
              ],
              [
                "GOOGLE_ADS",
                "Google Ads",
                "Kampanyalar, reklam hesapları ve lead formları",
              ],
              [
                "TIKTOK",
                "TikTok Ads",
                "Reklam hesapları, kampanyalar ve lead verileri",
              ],
            ] as const).map(([providerKey, label, detail]) => {
              const readiness = configurationReadiness?.providers.find(
                (item) => item.provider === providerKey,
              );
              const connected = health?.connections.some(
                (item) =>
                  item.provider === providerKey &&
                  item.health === "HEALTHY",
              );

              return (
                <div
                  key={providerKey}
                  className="rounded-[15px] border border-[var(--line)] bg-[var(--surface-2)] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold text-[var(--ink)]">
                        {label}
                      </p>
                      <p className="mt-1 text-[8px] leading-4 text-[var(--muted)]">
                        {detail}
                      </p>
                    </div>
                    <span
                      className={
                        connected
                          ? "rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[7px] font-semibold text-[var(--accent)]"
                          : readiness?.ready === false
                            ? "rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-[7px] font-semibold text-[var(--warning)]"
                            : "rounded-full bg-white px-2 py-0.5 text-[7px] font-semibold text-[var(--muted)]"
                      }
                    >
                      {connected
                        ? "Bağlı"
                        : readiness?.ready === false
                          ? "Kurulum Eksik"
                          : "Bağlanabilir"}
                    </span>
                  </div>

                  <button
                    type="button"
                    disabled={
                      startingProvider === providerKey ||
                      readiness?.ready === false
                    }
                    onClick={() => void connectProvider(providerKey)}
                    className="mt-4 inline-flex h-9 items-center rounded-[10px] bg-[var(--accent)] px-3 text-[9px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {startingProvider === providerKey
                      ? "Yönlendiriliyor..."
                      : connected
                        ? "Yeni Hesap Bağla"
                        : readiness?.ready === false
                          ? "Platform Kurulumu Gerekli"
                          : "Platforma Bağlan"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
        <div className="border-b border-[var(--line)] p-4">
          <h2 className="text-[13px] font-semibold text-[var(--ink)]">
            Bağlı Hesaplar
          </h2>
          <p className="mt-1 text-[8px] text-[var(--muted)]">
            Yetkilendirme, reklam hesabı seçimi, bağlantı testi ve eşitleme
            işlemlerini buradan yönetin.
          </p>
        </div>

        {rows.length ? (
          <div className="divide-y divide-[var(--line)]">
            {rows.map((row) => {
              const connectionHealth = health?.connections.find(
                (item) => item.id === row.id,
              );
              const providerReadiness =
                configurationReadiness?.providers.find(
                  (item) => item.provider === row.provider,
                );
              const healthKey =
                connectionHealth?.health ?? "DISCONNECTED";

              return (
                <article key={row.id} className="p-4 sm:p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[12px] font-semibold text-[var(--ink)]">
                          {row.displayName}
                        </h3>
                        <HealthBadge state={healthKey} />
                      </div>
                      <p className="mt-1 text-[8px] text-[var(--muted)]">
                        {userLabel(row.provider)} ·{" "}
                        {row.externalAccountId
                          ? "Hesap " + row.externalAccountId
                          : "Reklam hesabı henüz seçilmedi"}
                      </p>
                    </div>

                    <div className="grid min-w-[280px] grid-cols-2 gap-2">
                      <ConnectionFact
                        label="Yetkilendirme"
                        value={
                          connectionHealth?.credentialsConfigured
                            ? "Hazır"
                            : "Gerekli"
                        }
                      />
                      <ConnectionFact
                        label="Son Eşitleme"
                        value={
                          row.lastSyncAt
                            ? new Date(row.lastSyncAt).toLocaleString("tr-TR")
                            : "Henüz yok"
                        }
                      />
                    </div>
                  </div>

                  {row.lastError ? (
                    <div className="mt-3 rounded-[12px] bg-[var(--danger-soft)] px-3 py-2.5 text-[8px] leading-4 text-[var(--danger)]">
                      Bağlantı sırasında sorun oluştu. Yetkilendirmeyi test edin
                      veya platform hesabını yeniden bağlayın.
                    </div>
                  ) : null}

                  {accountOptions[row.id]?.length ? (
                    <label className="mt-4 block max-w-xl text-[9px] font-semibold text-[var(--muted)]">
                      Kullanılacak Reklam Hesabı
                      <Select
                        className={fieldClass}
                        value={row.externalAccountId ?? ""}
                        disabled={selectingId === row.id}
                        onChange={(event) =>
                          void selectAccount(row.id, event.target.value)
                        }
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

                  {row.provider === "META" &&
                  metaPagesByConnection[row.id]?.length ? (
                    <div className="mt-4 rounded-[14px] bg-[var(--surface-2)] p-3">
                      <p className="text-[9px] font-semibold text-[var(--ink)]">
                        Facebook Sayfaları
                      </p>
                      <div className="mt-2 space-y-2">
                        {metaPagesByConnection[row.id].map((page) => (
                          <div
                            key={page.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-white px-3 py-2"
                          >
                            <div>
                              <p className="text-[9px] font-semibold text-[var(--ink)]">
                                {page.name}
                              </p>
                              <p className="mt-0.5 text-[7px] text-[var(--muted)]">
                                {page.subscribed
                                  ? "Yeni talepler otomatik alınır"
                                  : "Talep aktarımı henüz açık değil"}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={
                                page.subscribed ||
                                subscribingMetaPageId === page.id
                              }
                              onClick={() =>
                                void subscribeMetaPage(row.id, page.id)
                              }
                              className="rounded-[9px] border border-[var(--line)] px-2.5 py-1.5 text-[8px] font-semibold text-[var(--ink)] disabled:opacity-50"
                            >
                              {page.subscribed
                                ? "Talep Aktarımı Aktif"
                                : subscribingMetaPageId === page.id
                                  ? "Aktifleştiriliyor..."
                                  : "Talep Aktarımını Aç"}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {canManage &&
                  ["META", "GOOGLE_ADS", "TIKTOK"].includes(row.provider) ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <ActionButton
                        primary={!connectionHealth?.credentialsConfigured}
                        disabled={
                          connectingId === row.id ||
                          providerReadiness?.ready === false
                        }
                        onClick={() => void connect(row.id)}
                      >
                        {connectingId === row.id
                          ? "Yönlendiriliyor..."
                          : providerReadiness?.ready === false
                            ? "Kurulum Gerekiyor"
                            : connectionHealth?.credentialsConfigured
                              ? "Yeniden Yetkilendir"
                              : "Platforma Bağlan"}
                      </ActionButton>

                      {connectionHealth?.credentialsConfigured ? (
                        <>
                          <ActionButton
                            disabled={verifyingId === row.id}
                            onClick={() => void verifyConnection(row.id)}
                          >
                            {verifyingId === row.id
                              ? "Test Ediliyor..."
                              : "Bağlantıyı Test Et"}
                          </ActionButton>

                          <ActionButton
                            disabled={discoveringId === row.id}
                            onClick={() => void discoverAccounts(row.id)}
                          >
                            {discoveringId === row.id
                              ? "Hesaplar Getiriliyor..."
                              : "Reklam Hesaplarını Getir"}
                          </ActionButton>
                        </>
                      ) : null}

                      {row.provider === "META" &&
                      connectionHealth?.credentialsConfigured ? (
                        <ActionButton
                          disabled={loadingMetaPagesId === row.id}
                          onClick={() => void loadMetaPages(row.id)}
                        >
                          {loadingMetaPagesId === row.id
                            ? "Sayfalar Getiriliyor..."
                            : "Facebook Sayfalarını Getir"}
                        </ActionButton>
                      ) : null}

                      {connectionHealth?.credentialsConfigured &&
                      row.externalAccountId ? (
                        <ActionButton
                          disabled={syncingId === row.id}
                          onClick={() => void syncConnection(row.id)}
                        >
                          {syncingId === row.id
                            ? "Eşitleniyor..."
                            : "Verileri Eşitle"}
                        </ActionButton>
                      ) : null}

                      {row.provider === "GOOGLE_ADS" &&
                      connectionHealth?.credentialsConfigured ? (
                        <ActionButton
                          disabled={webhookConfiguringId === row.id}
                          onClick={() => void configureWebhook(row.id)}
                        >
                          {webhookConfiguringId === row.id
                            ? "Hazırlanıyor..."
                            : "Form Bağlantısını Kur"}
                        </ActionButton>
                      ) : null}

                      {connectionHealth?.health !== "DISCONNECTED" ? (
                        <ActionButton
                          danger
                          disabled={disconnectingId === row.id}
                          onClick={() => void disconnect(row.id)}
                        >
                          {disconnectingId === row.id
                            ? "Bağlantı Kesiliyor..."
                            : "Bağlantıyı Kes"}
                        </ActionButton>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="p-10 text-center text-[9px] text-[var(--muted)]">
            Henüz platform bağlantısı bulunmuyor.
          </div>
        )}
      </section>

      <details className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4">
          <div>
            <h2 className="text-[11px] font-semibold text-[var(--ink)]">
              Platform Kurulum Bilgileri
            </h2>
            <p className="mt-1 text-[8px] text-[var(--muted)]">
              Yalnızca VALOO platform yöneticisinin yapması gereken teknik
              kurulumları görüntüleyin.
            </p>
          </div>
          <span className="text-[10px] font-semibold text-[var(--muted)]">
            Aç
          </span>
        </summary>

        <div className="border-t border-[var(--line)] p-4">
          {configurationReadiness ? (
            <div className="grid gap-3 md:grid-cols-3">
              {configurationReadiness.providers.map((provider) => (
                <div
                  key={provider.provider}
                  className="rounded-[14px] bg-[var(--surface-2)] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold text-[var(--ink)]">
                      {provider.label}
                    </p>
                    <span
                      className={
                        provider.ready
                          ? "rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[7px] font-semibold text-[var(--accent)]"
                          : "rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-[7px] font-semibold text-[var(--warning)]"
                      }
                    >
                      {provider.ready ? "Hazır" : "Eksik"}
                    </span>
                  </div>

                  <p className="mt-2 text-[8px] text-[var(--muted)]">
                    {provider.configuredCount}/{provider.requiredCount} gerekli
                    ayar tanımlı
                  </p>

                  {!provider.ready ? (
                    <div className="mt-3 space-y-2">
                      {provider.missing.map((key) => {
                        const item = configurationHelp[key];
                        return (
                          <div
                            key={key}
                            className="flex items-center justify-between gap-2 rounded-[9px] bg-white px-2.5 py-2"
                          >
                            <span className="text-[8px] font-medium text-[var(--ink)]">
                              {item?.label ?? key}
                            </span>
                            {item ? <CardInfo help={item.help} /> : null}
                          </div>
                        );
                      })}
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-[8px] font-semibold text-[var(--warning)]">
                          Kurulum Açıklaması
                        </span>
                        <CardInfo
                          help={
                            providerSetupHelp[provider.provider] ??
                            getCardHelp(
                              provider.label,
                              "Platform kurulumu hakkında bilgi.",
                            )
                          }
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[9px] text-[var(--muted)]">
              Platform hazırlık bilgisi alınamadı.
            </p>
          )}
        </div>
      </details>
    </div>
  );
}


function Metric({
  title,
  value,
  detail,
  attention,
}: {
  title: string;
  value: string;
  detail: string;
  attention?: boolean;
}) {
  return (
    <div
      className={
        attention
          ? "rounded-[18px] border border-[var(--warning)]/25 bg-[var(--warning-soft)] p-4"
          : "rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)]"
      }
    >
      <p className="text-[8px] font-semibold uppercase tracking-[.12em] text-[var(--muted)]">
        {title}
      </p>
      <p className="mt-3 text-[20px] font-semibold tracking-[-.04em] text-[var(--ink)]">
        {value}
      </p>
      <p className="mt-2 text-[8px] leading-4 text-[var(--muted)]">
        {detail}
      </p>
    </div>
  );
}

function HealthBadge({
  state,
}: {
  state: ConnectionHealth["connections"][number]["health"] | "DISCONNECTED";
}) {
  const risky = ["ATTENTION", "AUTH_REQUIRED", "VERIFY_REQUIRED"].includes(
    state,
  );
  const healthy = state === "HEALTHY";

  return (
    <span
      className={
        healthy
          ? "rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[7px] font-semibold text-[var(--accent)]"
          : risky
            ? "rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-[7px] font-semibold text-[var(--warning)]"
            : "rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[7px] font-semibold text-[var(--muted)]"
      }
    >
      {healthLabel[state] ?? "Bağlı Değil"}
    </span>
  );
}

function ConnectionFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[11px] bg-[var(--surface-2)] p-2.5">
      <span className="block text-[7px] text-[var(--muted)]">{label}</span>
      <strong className="mt-1 block text-[8px] font-semibold text-[var(--ink)]">
        {value}
      </strong>
    </div>
  );
}

function ActionButton({
  children,
  disabled,
  onClick,
  primary,
  danger,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
}) {
  const className = primary
    ? "inline-flex h-9 items-center rounded-[10px] bg-[var(--accent)] px-3 text-[8px] font-semibold text-white transition disabled:opacity-50"
    : danger
      ? "inline-flex h-9 items-center rounded-[10px] border border-[var(--line)] px-3 text-[8px] font-semibold text-[var(--muted)] transition hover:border-[var(--danger)]/30 hover:text-[var(--danger)] disabled:opacity-50"
      : "inline-flex h-9 items-center rounded-[10px] border border-[var(--line)] px-3 text-[8px] font-semibold text-[var(--ink)] transition hover:border-[var(--accent)] disabled:opacity-50";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={className}
    >
      {children}
    </button>
  );
}
