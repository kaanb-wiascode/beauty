"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { userErrorMessage, userLabel } from "@/lib/user-language";

type Dashboard = {
  activeCampaigns: number;
  totalCampaigns: number;
  spend: number;
  leads: number;
  appointments: number;
  wonLeads: number;
  revenue: number;
  cpl: number | null;
  cac: number | null;
  roas: number | null;
  funnel: {
    leads: number;
    crmLeads: number;
    customers: number;
    appointments: number;
    sales: number;
    revenue: number;
  };
  channels: Array<{
    provider: string;
    leads: number;
    appointments: number;
    sales: number;
    revenue: number;
    appointmentRate: number;
    saleRate: number;
  }>;
};

type Campaign = {
  id: string;
  name: string;
  status: string;
  channel: string;
  objective?: string | null;
  plannedBudget: string | number;
  spentAmount: string | number;
  leadCount: number;
  revenue: string | number;
  startsAt?: string | null;
  endsAt?: string | null;
};

type MarketingLead = {
  id: string;
  provider: string;
  firstName: string;
  lastName: string;
  status: string;
  campaignName?: string | null;
  serviceInterest?: string | null;
  receivedAt: string;
};

type ContentItem = {
  id: string;
  title: string;
  platform: string;
  format: string;
  status: string;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  updatedAt: string;
};

type Approval = {
  id: string;
  status: string;
  title: string;
  platform: string;
  createdAt: string;
};

type ConnectionHealth = {
  total: number;
  connected: number;
  attention: number;
  authorizationRequired: number;
  verificationRequired: number;
  disconnected: number;
  lastSyncAt?: string | null;
};

type PrActivity = {
  id: string;
  title: string;
  activityType: string;
  status: string;
  startsAt?: string | null;
  actualReach?: number | string | null;
  estimatedReach?: number | string | null;
  estimatedMediaValue?: number | string | null;
};

type Vendor = {
  id: string;
  name: string;
  status: string;
  vendorType: string;
  contractEndsAt?: string | null;
  monthlyFee?: number | string | null;
};

type Creator = {
  id: string;
  displayName: string;
  status: string;
  primaryPlatform: string;
  followerCount?: number | string | null;
  engagementRate?: number | string | null;
};

type Asset = {
  id: string;
  name: string;
  assetType: string;
  licenseState: "VALID" | "EXPIRING" | "EXPIRED" | "UNTRACKED";
  licenseExpiresAt?: string | null;
};

type RoutingRule = {
  id: string;
  name: string;
  active: boolean;
};

type BrandGovernance = {
  id?: string;
  name?: string;
};

type OperationalData = {
  dashboard: Dashboard | null;
  campaigns: Campaign[];
  leads: MarketingLead[];
  content: ContentItem[];
  approvals: Approval[];
  connectionHealth: ConnectionHealth | null;
  prActivities: PrActivity[];
  vendors: Vendor[];
  creators: Creator[];
  assets: Asset[];
  routingRules: RoutingRule[];
  brandGovernance: BrandGovernance[];
};

const emptyData: OperationalData = {
  dashboard: null,
  campaigns: [],
  leads: [],
  content: [],
  approvals: [],
  connectionHealth: null,
  prActivities: [],
  vendors: [],
  creators: [],
  assets: [],
  routingRules: [],
  brandGovernance: [],
};

const money = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 0,
});

const number = new Intl.NumberFormat("tr-TR", {
  maximumFractionDigits: 0,
});

function settledValue<T>(
  result: PromiseSettledResult<T>,
  fallback: T,
): T {
  return result.status === "fulfilled" ? result.value : fallback;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function CommunicationsOverviewPage() {
  const [data, setData] = useState<OperationalData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const results = await Promise.allSettled([
        api<Dashboard>("/corporate-communications/dashboard"),
        api<Campaign[]>("/corporate-communications/campaigns?limit=30"),
        api<MarketingLead[]>("/corporate-communications/leads?limit=12"),
        api<ContentItem[]>("/corporate-communications/content?limit=100"),
        api<Approval[]>("/corporate-communications/approvals"),
        api<ConnectionHealth>("/corporate-communications/provider-connections/health"),
        api<PrActivity[]>("/corporate-communications/pr-media?limit=100"),
        api<Vendor[]>("/corporate-communications/vendors?limit=100"),
        api<Creator[]>("/corporate-communications/creators?limit=100"),
        api<Asset[]>("/corporate-communications/digital-assets?limit=100"),
        api<RoutingRule[]>("/corporate-communications/routing-rules"),
        api<BrandGovernance[]>("/corporate-communications/brand-governance"),
      ] as const);

      setData({
        dashboard: settledValue(results[0], null),
        campaigns: settledValue(results[1], []),
        leads: settledValue(results[2], []),
        content: settledValue(results[3], []),
        approvals: settledValue(results[4], []),
        connectionHealth: settledValue(results[5], null),
        prActivities: settledValue(results[6], []),
        vendors: settledValue(results[7], []),
        creators: settledValue(results[8], []),
        assets: settledValue(results[9], []),
        routingRules: settledValue(results[10], []),
        brandGovernance: settledValue(results[11], []),
      });

      const failedSections = [
        "performans",
        "kampanyalar",
        "potansiyel müşteriler",
        "içerikler",
        "onaylar",
        "bağlantılar",
        "PR ve medya",
        "iş ortakları",
        "içerik üreticileri",
        "varlık kütüphanesi",
        "talep dağıtımı",
        "marka kuralları",
      ].filter((_, index) => results[index].status === "rejected");

      if (failedSections.length) {
        setError(
          "Bazı kurumsal iletişim verileri yüklenemedi: " +
            failedSections.join(", ") +
            ". Diğer alanlar kullanılmaya devam edebilir.",
        );
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? userErrorMessage(
              err.message,
              "Kurumsal İletişim merkezi yüklenemedi.",
            )
          : "Kurumsal İletişim merkezi yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const operational = useMemo(() => {
    const now = new Date();
    const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const inThirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const pendingApprovals = data.approvals.filter(
      (item) => item.status === "PENDING",
    );

    const scheduledThisWeek = data.content
      .filter((item) => {
        if (item.status !== "SCHEDULED" || !item.scheduledAt) return false;
        const value = new Date(item.scheduledAt);
        return value >= now && value <= inSevenDays;
      })
      .sort(
        (a, b) =>
          new Date(a.scheduledAt ?? 0).getTime() -
          new Date(b.scheduledAt ?? 0).getTime(),
      );

    const overdueScheduled = data.content.filter((item) => {
      if (item.status !== "SCHEDULED" || !item.scheduledAt) return false;
      return new Date(item.scheduledAt) < now;
    });

    const contentFlow = {
      idea: data.content.filter((item) => item.status === "IDEA").length,
      brief: data.content.filter((item) => item.status === "BRIEF").length,
      production: data.content.filter((item) => item.status === "PRODUCTION")
        .length,
      review: data.content.filter((item) => item.status === "REVIEW").length,
      approved: data.content.filter((item) => item.status === "APPROVED").length,
      scheduled: data.content.filter((item) => item.status === "SCHEDULED")
        .length,
      published: data.content.filter((item) => item.status === "PUBLISHED")
        .length,
    };

    const connectionIssues =
      (data.connectionHealth?.attention ?? 0) +
      (data.connectionHealth?.authorizationRequired ?? 0) +
      (data.connectionHealth?.verificationRequired ?? 0) +
      (data.connectionHealth?.disconnected ?? 0);

    const expiredAssets = data.assets.filter(
      (item) => item.licenseState === "EXPIRED",
    );
    const expiringAssets = data.assets.filter(
      (item) => item.licenseState === "EXPIRING",
    );

    const expiringVendors = data.vendors.filter((item) => {
      if (
        !item.contractEndsAt ||
        !["ACTIVE", "PAUSED"].includes(item.status)
      ) {
        return false;
      }
      const end = new Date(item.contractEndsAt);
      return end >= now && end <= inThirtyDays;
    });

    const budgetRisks = data.campaigns.filter((item) => {
      const budget = Number(item.plannedBudget || 0);
      const spent = Number(item.spentAmount || 0);
      return (
        ["ACTIVE", "PLANNED"].includes(item.status) &&
        budget > 0 &&
        spent / budget >= 0.9
      );
    });

    const activePr = data.prActivities.filter(
      (item) => !["COMPLETED", "CANCELLED"].includes(item.status),
    );
    const activeVendors = data.vendors.filter(
      (item) => item.status === "ACTIVE",
    );
    const activeCreators = data.creators.filter(
      (item) => item.status === "ACTIVE",
    );
    const activeRoutingRules = data.routingRules.filter((item) => item.active);

    const totalCreatorReach = activeCreators.reduce(
      (sum, item) => sum + Number(item.followerCount || 0),
      0,
    );

    const attentionItems = [
      pendingApprovals.length
        ? {
            title: pendingApprovals.length + " içerik onay bekliyor",
            detail: "Yayın akışının ilerlemesi için karar gerekiyor.",
            href: "/communications/approvals",
            tone: "warning" as const,
          }
        : null,
      connectionIssues
        ? {
            title: connectionIssues + " platform bağlantısı kontrol edilmeli",
            detail:
              "Reklam verisi ve otomatik talep akışı etkilenebilir.",
            href: "/communications/integrations",
            tone: "danger" as const,
          }
        : null,
      overdueScheduled.length
        ? {
            title:
              overdueScheduled.length +
              " planlı içerik yayın zamanını geçti",
            detail: "İçerik durumlarını ve yayın akışını kontrol edin.",
            href: "/communications/content",
            tone: "danger" as const,
          }
        : null,
      expiredAssets.length || expiringAssets.length
        ? {
            title:
              expiredAssets.length +
              " süresi dolmuş, " +
              expiringAssets.length +
              " süresi yaklaşan varlık",
            detail: "Kullanım ve lisans durumlarını kontrol edin.",
            href: "/communications/assets",
            tone: expiredAssets.length ? ("danger" as const) : ("warning" as const),
          }
        : null,
      expiringVendors.length
        ? {
            title:
              expiringVendors.length +
              " iş ortağı sözleşmesi 30 gün içinde sona eriyor",
            detail: "Yenileme veya kapanış kararını planlayın.",
            href: "/communications/vendors",
            tone: "warning" as const,
          }
        : null,
      budgetRisks.length
        ? {
            title:
              budgetRisks.length +
              " kampanya planlanan bütçenin %90'ına ulaştı",
            detail: "Bütçe ve devam kararını gözden geçirin.",
            href: "/communications/campaigns",
            tone: "warning" as const,
          }
        : null,
      (data.dashboard?.leads ?? 0) > 0 && activeRoutingRules.length === 0
        ? {
            title: "Aktif talep dağıtım kuralı bulunmuyor",
            detail:
              "Yeni reklam taleplerinin otomatik şube veya sorumlu ataması yapılamaz.",
            href: "/communications/routing",
            tone: "warning" as const,
          }
        : null,
    ].filter(Boolean) as Array<{
      title: string;
      detail: string;
      href: string;
      tone: "warning" | "danger";
    }>;

    return {
      pendingApprovals,
      scheduledThisWeek,
      overdueScheduled,
      contentFlow,
      connectionIssues,
      expiredAssets,
      expiringAssets,
      expiringVendors,
      budgetRisks,
      activePr,
      activeVendors,
      activeCreators,
      activeRoutingRules,
      totalCreatorReach,
      attentionItems,
    };
  }, [data]);

  if (loading && !data.dashboard) {
    return (
      <div className="py-20">
        <Spinner label="Kurumsal İletişim merkezi hazırlanıyor..." />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-12">
      <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--accent)]">
              Marka, içerik ve büyüme operasyonları
            </p>
            <h1 className="mt-2 text-[32px] font-semibold tracking-[-.045em] text-[var(--ink)]">
              Kurumsal İletişim Merkezi
            </h1>
            <p className="mt-2 max-w-4xl text-[13px] leading-6 text-[var(--muted)]">
              Kampanyaları, içerik üretimini, onayları, marka standartlarını,
              medya ilişkilerini, dış iş birliklerini ve dijital platform
              bağlantılarını tek operasyon merkezinden yönetin.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/communications/campaigns">
              <Button variant="secondary">Kampanyalar</Button>
            </Link>
            <Link href="/communications/content">
              <Button variant="secondary">İçerik Merkezi</Button>
            </Link>
            <Link href="/communications/reports">
              <Button variant="secondary">Raporlar</Button>
            </Link>
            <Link href="/communications/pr-media">
              <Button>PR Faaliyeti</Button>
            </Link>
          </div>
        </div>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewMetric
          label="Aktif Kampanya"
          value={data.dashboard?.activeCampaigns ?? 0}
          detail={(data.dashboard?.totalCampaigns ?? 0) + " toplam kampanya"}
          href="/communications/campaigns"
        />
        <OverviewMetric
          label="Onay Bekleyen"
          value={operational.pendingApprovals.length}
          detail="İçerik kararınızı bekliyor"
          href="/communications/approvals"
          attention={operational.pendingApprovals.length > 0}
        />
        <OverviewMetric
          label="Bu Hafta Yayınlanacak"
          value={operational.scheduledThisWeek.length}
          detail="Önümüzdeki 7 gün için planlandı"
          href="/communications/content"
        />
        <OverviewMetric
          label="Dikkat Gerektiren"
          value={operational.attentionItems.length}
          detail="Operasyonel kontrol başlığı"
          href="#attention"
          attention={operational.attentionItems.length > 0}
        />
      </section>

      <section
        id="attention"
        className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]"
      >
        <Panel
          title="Bugün & Dikkat Gerektirenler"
          description="İletişim operasyonunda karar veya müdahale bekleyen başlıklar."
        >
          {operational.attentionItems.length ? (
            <div className="divide-y divide-[var(--line)]">
              {operational.attentionItems.slice(0, 7).map((item) => (
                <Link
                  key={item.title}
                  href={item.href}
                  className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          item.tone === "danger"
                            ? "h-2 w-2 rounded-full bg-[var(--danger)]"
                            : "h-2 w-2 rounded-full bg-[var(--warning)]"
                        }
                      />
                      <p className="text-[11px] font-semibold text-[var(--ink)]">
                        {item.title}
                      </p>
                    </div>
                    <p className="mt-1 pl-4 text-[9px] leading-4 text-[var(--muted)]">
                      {item.detail}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] font-semibold text-[var(--accent)]">
                    İncele →
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <HealthyState>
              Şu anda acil müdahale gerektiren iletişim operasyonu bulunmuyor.
            </HealthyState>
          )}
        </Panel>

        <Panel
          title="Bu Haftanın Yayın Planı"
          description="Önümüzdeki yedi gün içinde planlanan içerikler."
          action={
            <Link
              href="/communications/content"
              className="text-[10px] font-semibold text-[var(--accent)]"
            >
              İçerik Merkezini Aç
            </Link>
          }
        >
          {operational.scheduledThisWeek.length ? (
            <div className="space-y-2">
              {operational.scheduledThisWeek.slice(0, 6).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-4 rounded-[12px] bg-[var(--surface-2)] px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[10px] font-semibold text-[var(--ink)]">
                      {item.title}
                    </p>
                    <p className="mt-1 text-[8px] text-[var(--muted)]">
                      {userLabel(item.platform)} · {userLabel(item.format)}
                    </p>
                  </div>
                  <span className="shrink-0 text-[9px] font-semibold text-[var(--ink)]">
                    {formatDateTime(item.scheduledAt)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyInline>
              Bu hafta için planlanmış içerik bulunmuyor.
            </EmptyInline>
          )}
        </Panel>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
        <Panel
          title="İçerik Operasyonu"
          description="İçeriklerin fikirden yayına kadar hangi aşamada olduğunu izleyin."
          action={
            <Link
              href="/communications/content"
              className="text-[10px] font-semibold text-[var(--accent)]"
            >
              Tüm İçerikler
            </Link>
          }
        >
          <ContentFlow flow={operational.contentFlow} />
        </Panel>

        <Panel
          title="Platform Bağlantıları"
          description="Reklam platformlarının veri ve talep akışı sağlığı."
          action={
            <Link
              href="/communications/integrations"
              className="text-[10px] font-semibold text-[var(--accent)]"
            >
              Bağlantıları Yönet
            </Link>
          }
        >
          <ConnectionSummary health={data.connectionHealth} />
        </Panel>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
        <Panel
          title="Kampanya & Bütçe"
          description="Aktif ve planlanan kampanyalarda bütçe kullanımı ve gelir ilişkisi."
          action={
            <Link
              href="/communications/campaigns"
              className="text-[10px] font-semibold text-[var(--accent)]"
            >
              Tüm Kampanyalar
            </Link>
          }
        >
          {data.campaigns.length ? (
            <div className="space-y-3">
              {data.campaigns.slice(0, 6).map((campaign) => {
                const budget = Number(campaign.plannedBudget || 0);
                const spent = Number(campaign.spentAmount || 0);
                const usage = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;

                return (
                  <div
                    key={campaign.id}
                    className="rounded-[14px] border border-[var(--line)] p-3.5"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-[11px] font-semibold text-[var(--ink)]">
                            {campaign.name}
                          </p>
                          <Status value={campaign.status} />
                        </div>
                        <p className="mt-1 text-[8px] text-[var(--muted)]">
                          {userLabel(campaign.channel)} · {campaign.leadCount} potansiyel müşteri
                        </p>
                      </div>

                      <div className="text-left sm:text-right">
                        <p className="text-[10px] font-semibold text-[var(--ink)]">
                          {money.format(spent)} / {money.format(budget)}
                        </p>
                        <p className="mt-1 text-[8px] text-[var(--muted)]">
                          Gelir {money.format(Number(campaign.revenue || 0))}
                        </p>
                      </div>
                    </div>

                    {budget > 0 ? (
                      <div className="mt-3">
                        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
                          <div
                            className="h-full rounded-full bg-[var(--accent)]"
                            style={{ width: usage + "%" }}
                          />
                        </div>
                        <div className="mt-1.5 flex justify-between text-[7px] text-[var(--muted)]">
                          <span>Bütçe kullanımı</span>
                          <span>%{Math.round(usage)}</span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyInline>Henüz kampanya oluşturulmadı.</EmptyInline>
          )}
        </Panel>

        <Panel
          title="Pazarlama Performansı"
          description="Kampanya kaynaklı harcama, gelir ve dönüşüm özeti."
        >
          <div className="grid grid-cols-2 gap-2">
            <MiniMetric
              label="Harcama"
              value={money.format(data.dashboard?.spend ?? 0)}
            />
            <MiniMetric
              label="Gelir"
              value={money.format(data.dashboard?.revenue ?? 0)}
            />
            <MiniMetric
              label="Reklam Getirisi"
              value={
                data.dashboard?.roas == null
                  ? "—"
                  : data.dashboard.roas.toFixed(2) + "x"
              }
            />
            <MiniMetric
              label="Müşteri Kazanım Maliyeti"
              value={
                data.dashboard?.cac == null
                  ? "—"
                  : money.format(data.dashboard.cac)
              }
            />
          </div>

          <div className="mt-4">
            <Funnel dashboard={data.dashboard} />
          </div>
        </Panel>
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <OperationalArea
          title="Marka Yönetimi"
          href="/communications/brand"
          primary={
            data.brandGovernance.length
              ? "Marka politikası tanımlı"
              : "Marka politikası bekliyor"
          }
          rows={[
            ["Dijital varlık", String(data.assets.length)],
            ["Lisansı yaklaşan", String(operational.expiringAssets.length)],
            ["Lisansı dolmuş", String(operational.expiredAssets.length)],
          ]}
          attention={
            !data.brandGovernance.length ||
            operational.expiredAssets.length > 0
          }
        />

        <OperationalArea
          title="PR & Medya"
          href="/communications/pr-media"
          primary={operational.activePr.length + " aktif çalışma"}
          rows={[
            [
              "Toplam faaliyet",
              String(data.prActivities.length),
            ],
            [
              "Tahmini / gerçek erişim",
              number.format(
                data.prActivities.reduce(
                  (sum, item) =>
                    sum +
                    Number(item.actualReach || item.estimatedReach || 0),
                  0,
                ),
              ),
            ],
            [
              "Tahmini medya değeri",
              money.format(
                data.prActivities.reduce(
                  (sum, item) =>
                    sum + Number(item.estimatedMediaValue || 0),
                  0,
                ),
              ),
            ],
          ]}
        />

        <OperationalArea
          title="İş Birlikleri"
          href="/communications/vendors"
          primary={
            operational.activeVendors.length +
            " iş ortağı · " +
            operational.activeCreators.length +
            " içerik üreticisi"
          }
          rows={[
            [
              "30 günde sözleşmesi bitecek",
              String(operational.expiringVendors.length),
            ],
            [
              "Aktif içerik üreticisi",
              String(operational.activeCreators.length),
            ],
            [
              "Toplam erişim potansiyeli",
              number.format(operational.totalCreatorReach),
            ],
          ]}
          attention={operational.expiringVendors.length > 0}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
        <Panel
          title="Kanal Performansı"
          description="Talep, randevu ve satış dönüşümünü kaynak bazında karşılaştırın."
        >
          <ChannelPerformance channels={data.dashboard?.channels ?? []} />
        </Panel>

        <Panel
          title="Son Pazarlama Talepleri"
          description="Reklam ve dijital kaynaklardan gelen son müşteri talepleri."
          action={
            <Link
              href="/communications/leads"
              className="text-[10px] font-semibold text-[var(--accent)]"
            >
              Tüm Talepler
            </Link>
          }
        >
          {data.leads.length ? (
            <div className="divide-y divide-[var(--line)]">
              {data.leads.slice(0, 7).map((lead) => (
                <div
                  key={lead.id}
                  className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[10px] font-semibold text-[var(--ink)]">
                      {lead.firstName} {lead.lastName}
                    </p>
                    <p className="mt-1 truncate text-[8px] text-[var(--muted)]">
                      {userLabel(lead.provider)} ·{" "}
                      {lead.campaignName ?? "Kampanyasız"}
                    </p>
                  </div>
                  <div className="text-right">
                    <Status value={lead.status} />
                    <p className="mt-1 text-[7px] text-[var(--muted-soft)]">
                      {formatDate(lead.receivedAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyInline>Henüz pazarlama talebi bulunmuyor.</EmptyInline>
          )}
        </Panel>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <QuickAccess
          href="/communications/approvals"
          title="Onay Merkezi"
          detail="Yayın öncesi karar bekleyen içerikler"
          value={operational.pendingApprovals.length}
        />
        <QuickAccess
          href="/communications/assets"
          title="Varlık Kütüphanesi"
          detail="Marka dosyaları, lisanslar ve kullanım hakları"
          value={data.assets.length}
        />
        <QuickAccess
          href="/communications/routing"
          title="Talep Dağıtımı"
          detail="Şube ve sorumlu atama kuralları"
          value={operational.activeRoutingRules.length}
        />
        <QuickAccess
          href="/communications/reports"
          title="Yönetim Raporları"
          detail="Dönem karşılaştırmaları, dönüşüm ve gider analizi"
          value={data.dashboard?.leads ?? 0}
        />
        <QuickAccess
          href="/communications/integrations"
          title="Platform Bağlantıları"
          detail="Meta, Google Ads ve TikTok bağlantıları"
          value={data.connectionHealth?.connected ?? 0}
        />
      </section>
    </div>
  );
}

function OverviewMetric({
  label,
  value,
  detail,
  href,
  attention,
}: {
  label: string;
  value: string | number;
  detail: string;
  href: string;
  attention?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        attention
          ? "rounded-[18px] border border-[var(--warning)]/25 bg-[var(--warning-soft)] p-4"
          : "rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)] transition hover:border-[var(--line-strong)]"
      }
    >
      <span className="text-[8px] font-semibold uppercase tracking-[.12em] text-[var(--muted)]">
        {label}
      </span>
      <strong className="mt-3 block text-[25px] font-semibold tracking-[-.04em] text-[var(--ink)]">
        {typeof value === "number" ? number.format(value) : value}
      </strong>
      <span className="mt-2 block text-[8px] leading-4 text-[var(--muted)]">
        {detail}
      </span>
    </Link>
  );
}

function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[14px] font-semibold text-[var(--ink)]">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-[8px] leading-4 text-[var(--muted)]">
              {description}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ContentFlow({
  flow,
}: {
  flow: {
    idea: number;
    brief: number;
    production: number;
    review: number;
    approved: number;
    scheduled: number;
    published: number;
  };
}) {
  const steps = [
    ["Fikir", flow.idea],
    ["İçerik Özeti", flow.brief],
    ["Hazırlanıyor", flow.production],
    ["İncelemede", flow.review],
    ["Onaylandı", flow.approved],
    ["Planlandı", flow.scheduled],
    ["Yayınlandı", flow.published],
  ] as const;

  return (
    <div className="grid gap-2 sm:grid-cols-4 xl:grid-cols-7">
      {steps.map(([label, value]) => (
        <div
          key={label}
          className="rounded-[12px] bg-[var(--surface-2)] p-3"
        >
          <span className="block text-[7px] text-[var(--muted)]">{label}</span>
          <strong className="mt-2 block text-[18px] font-semibold text-[var(--ink)]">
            {value}
          </strong>
        </div>
      ))}
    </div>
  );
}

function ConnectionSummary({
  health,
}: {
  health: ConnectionHealth | null;
}) {
  if (!health) {
    return <EmptyInline>Bağlantı sağlığı verisi alınamadı.</EmptyInline>;
  }

  const issues =
    health.attention +
    health.authorizationRequired +
    health.verificationRequired +
    health.disconnected;

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <span className="text-[8px] text-[var(--muted)]">
            Sağlıklı bağlantı
          </span>
          <strong className="mt-1 block text-[24px] font-semibold text-[var(--ink)]">
            {health.connected} / {health.total}
          </strong>
        </div>
        <span
          className={
            issues
              ? "rounded-full bg-[var(--danger-soft)] px-2.5 py-1 text-[8px] font-semibold text-[var(--danger)]"
              : "rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[8px] font-semibold text-[var(--accent)]"
          }
        >
          {issues ? issues + " kontrol" : "Bağlantılar sağlıklı"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <MiniMetric label="Yetki Bekleyen" value={String(health.authorizationRequired)} />
        <MiniMetric label="Doğrulama Bekleyen" value={String(health.verificationRequired)} />
        <MiniMetric label="Hata" value={String(health.attention)} />
        <MiniMetric label="Bağlı Değil" value={String(health.disconnected)} />
      </div>

      <p className="mt-3 text-[8px] text-[var(--muted)]">
        Son veri eşitleme: {health.lastSyncAt ? formatDateTime(health.lastSyncAt) : "Henüz yok"}
      </p>
    </div>
  );
}

function OperationalArea({
  title,
  href,
  primary,
  rows,
  attention,
}: {
  title: string;
  href: string;
  primary: string;
  rows: Array<[string, string]>;
  attention?: boolean;
}) {
  return (
    <Link
      href={href}
      className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)] transition hover:border-[var(--line-strong)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-semibold text-[var(--ink)]">
            {title}
          </h2>
          <p className="mt-2 text-[10px] font-semibold text-[var(--ink)]">
            {primary}
          </p>
        </div>
        {attention ? (
          <span className="rounded-full bg-[var(--warning-soft)] px-2 py-1 text-[7px] font-semibold text-[var(--warning)]">
            Kontrol
          </span>
        ) : null}
      </div>

      <div className="mt-4 divide-y divide-[var(--line)]">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0"
          >
            <span className="text-[8px] text-[var(--muted)]">{label}</span>
            <strong className="text-[9px] text-[var(--ink)]">{value}</strong>
          </div>
        ))}
      </div>
    </Link>
  );
}

function QuickAccess({
  href,
  title,
  detail,
  value,
}: {
  href: string;
  title: string;
  detail: string;
  value: number;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-4 rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-4 transition hover:border-[var(--line-strong)]"
    >
      <div>
        <p className="text-[10px] font-semibold text-[var(--ink)]">{title}</p>
        <p className="mt-1 text-[7px] leading-4 text-[var(--muted)]">{detail}</p>
      </div>
      <strong className="text-[18px] font-semibold text-[var(--ink)]">
        {value}
      </strong>
    </Link>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] bg-[var(--surface-2)] p-3">
      <span className="block text-[7px] text-[var(--muted)]">{label}</span>
      <strong className="mt-1.5 block text-[11px] font-semibold text-[var(--ink)]">
        {value}
      </strong>
    </div>
  );
}

function Status({ value }: { value: string }) {
  return (
    <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[7px] font-semibold text-[var(--accent)]">
      {userLabel(value)}
    </span>
  );
}

function HealthyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[14px] bg-[var(--accent-soft)] p-4 text-[9px] leading-5 text-[var(--accent-strong)]">
      {children}
    </div>
  );
}

function EmptyInline({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[14px] border border-dashed border-[var(--line)] p-5 text-center text-[9px] leading-5 text-[var(--muted)]">
      {children}
    </div>
  );
}

function Funnel({ dashboard }: { dashboard: Dashboard | null }) {
  const funnel = dashboard?.funnel ?? {
    leads: 0,
    crmLeads: 0,
    customers: 0,
    appointments: 0,
    sales: 0,
    revenue: 0,
  };
  const steps = [
    { label: "Potansiyel Müşteri", value: funnel.leads },
    { label: "CRM'e Aktarılan", value: funnel.crmLeads },
    { label: "Müşteriye Dönüşen", value: funnel.customers },
    { label: "Randevu Oluşan", value: funnel.appointments },
    { label: "Satışa Dönüşen", value: funnel.sales },
  ];
  const base = Math.max(1, funnel.leads);

  return (
    <div className="space-y-2.5">
      {steps.map((step) => {
        const rate = step.value / base;
        return (
          <div key={step.label}>
            <div className="mb-1 flex items-center justify-between gap-3 text-[8px]">
              <span className="font-medium text-[var(--ink)]">{step.label}</span>
              <span className="font-semibold text-[var(--muted)]">
                {step.value} · %{Math.round(rate * 100)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
              <div
                className="h-full rounded-full bg-[var(--accent)]"
                style={{
                  width:
                    Math.max(
                      step.value ? 4 : 0,
                      Math.min(100, rate * 100),
                    ) + "%",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ChannelPerformance({
  channels,
}: {
  channels: Dashboard["channels"];
}) {
  if (!channels.length) {
    return (
      <EmptyInline>
        Kanal performansı oluşturacak yeterli veri bulunmuyor.
      </EmptyInline>
    );
  }

  return (
    <div className="space-y-2">
      {channels.slice(0, 6).map((channel) => (
        <div
          key={channel.provider}
          className="rounded-[12px] bg-[var(--surface-2)] p-3"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[9px] font-semibold text-[var(--ink)]">
                {userLabel(channel.provider)}
              </p>
              <p className="mt-1 text-[7px] text-[var(--muted)]">
                {channel.leads} talep · {channel.appointments} randevu ·{" "}
                {channel.sales} satış
              </p>
            </div>
            <p className="text-[9px] font-semibold text-[var(--ink)]">
              {money.format(channel.revenue)}
            </p>
          </div>
          <p className="mt-2 text-[7px] text-[var(--muted)]">
            Randevu %{Math.round(channel.appointmentRate * 100)} · Satış %
            {Math.round(channel.saleRate * 100)}
          </p>
        </div>
      ))}
    </div>
  );
}
