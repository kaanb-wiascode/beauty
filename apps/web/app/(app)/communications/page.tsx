"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { userLabel } from "@/lib/user-language";

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
};

type Campaign = {
  id: string;
  name: string;
  status: string;
  channel: string;
  plannedBudget: string | number;
  spentAmount: string | number;
  leadCount: number;
  revenue: string | number;
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

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });

export default function CommunicationsOverviewPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [leads, setLeads] = useState<MarketingLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [d, c, l] = await Promise.all([
        api<Dashboard>("/corporate-communications/dashboard"),
        api<Campaign[]>("/corporate-communications/campaigns?limit=6"),
        api<MarketingLead[]>("/corporate-communications/leads?limit=8"),
      ]);
      setDashboard(d);
      setCampaigns(c);
      setLeads(l);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Kurumsal İletişim verileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !dashboard) {
    return <div className="py-20"><Spinner label="Kurumsal İletişim hazırlanıyor..." /></div>;
  }

  if (!loading && error && !dashboard) {
    return (
      <div className="space-y-5">
        <Header />
        <Alert>{error}</Alert>
        <div className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-8 text-center">
          <p className="text-[13px] text-[var(--muted)]">Pazarlama verileri bilinmiyor; sıfır kampanya veya sıfır dönüşüm olarak yorumlanmadı.</p>
          <Button className="mt-5" onClick={() => void load()}>Tekrar Dene</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <Header />
      {error ? <Alert>{error}</Alert> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Aktif Kampanya" value={String(dashboard?.activeCampaigns ?? 0)} detail={`${dashboard?.totalCampaigns ?? 0} toplam kampanya`} />
        <Metric label="Pazarlama Harcaması" value={money.format(dashboard?.spend ?? 0)} detail={dashboard?.cpl == null ? "Potansiyel müşteri başına maliyet henüz hesaplanamadı" : `Potansiyel müşteri başına maliyet ${money.format(dashboard.cpl)}`} />
        <Metric label="Potansiyel müşteri" value={String(dashboard?.leads ?? 0)} detail={`${dashboard?.appointments ?? 0} randevuya dönüştü`} />
        <Metric label="Kampanyaya ilişkilendirilen gelir" value={money.format(dashboard?.revenue ?? 0)} detail={`${dashboard?.wonLeads ?? 0} kazanılan potansiyel müşteri`} />
        <Metric label="Reklam getirisi" value={dashboard?.roas == null ? "—" : `${dashboard.roas.toFixed(2)}x`} detail={dashboard?.cac == null ? "Müşteri kazanım maliyeti henüz hesaplanamadı" : `Müşteri kazanım maliyeti ${money.format(dashboard.cac)}`} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
        <Panel title="Kampanyalar" action={<Link className="text-[12px] font-semibold text-[var(--accent)]" href="/communications/campaigns">Tümünü Gör</Link>}>
          {campaigns.length ? (
            <div className="space-y-3">
              {campaigns.map((campaign) => (
                <div key={campaign.id} className="flex flex-col gap-3 rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)] p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-semibold text-[var(--ink)]">{campaign.name}</p>
                      <Status value={campaign.status} />
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--muted)]">{userLabel(campaign.channel)} · {campaign.leadCount} potansiyel müşteri</p>
                  </div>
                  <div className="text-left md:text-right">
                    <p className="text-[12px] font-semibold text-[var(--ink)]">{money.format(Number(campaign.spentAmount || 0))}</p>
                    <p className="mt-1 text-[10px] text-[var(--muted)]">Gelir {money.format(Number(campaign.revenue || 0))}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : <Empty text="Henüz kampanya oluşturulmadı." href="/communications/campaigns" label="İlk Kampanyayı Oluştur" />}
        </Panel>

        <Panel title="Son Talepler" action={<Link className="text-[12px] font-semibold text-[var(--accent)]" href="/communications/leads">Lead Inbox</Link>}>
          {leads.length ? (
            <div className="space-y-3">
              {leads.map((lead) => (
                <div key={lead.id} className="rounded-[16px] border border-[var(--line)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-[13px] font-semibold text-[var(--ink)]">{lead.firstName} {lead.lastName}</p>
                    <Status value={lead.status} />
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--muted)]">{userLabel(lead.provider)} · {lead.campaignName ?? "Kampanyasız"}</p>
                  {lead.serviceInterest ? <p className="mt-1 truncate text-[10px] text-[var(--muted-soft)]">İlgi: {lead.serviceInterest}</p> : null}
                </div>
              ))}
            </div>
          ) : <Empty text="Henüz marketing lead yok." href="/communications/leads" label="Lead Inbox'a Git" />}
        </Panel>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <QuickLink href="/communications/integrations" title="Reklam Hesapları" text="Meta, Google Ads ve TikTok bağlantı altyapısını yönetin." />
        <QuickLink href="/communications/brand" title="Marka Merkezi" text="Logo, guideline, font, şablon ve marka kurallarını tek yerde yönetin." />
        <QuickLink href="/communications/routing" title="Talep Dağıtımı" text="Kampanya taleplerini şube ve ekiplere otomatik dağıtacak kuralları hazırlayın." />
      </section>
    </div>
  );
}

function Header() {
  return (
    <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[0_12px_36px_rgba(17,70,104,0.04)]">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--accent)]">Büyüme & Marka Operasyonları</p>
      <h1 className="text-[32px] font-semibold tracking-[-.045em] text-[var(--ink)]">Kurumsal İletişim</h1>
      <p className="mt-2 max-w-4xl text-[13px] leading-6 text-[var(--muted)]">Kampanyaları, reklam kaynaklarını, potansiyel müşterileri, marka içeriklerini, şube dağıtımını ve kampanyalara bağlı gelirleri tek merkezden yönetin.</p>
    </header>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--muted-soft)]">{label}</p><p className="mt-3 text-[24px] font-semibold tracking-[-.04em] text-[var(--ink)]">{value}</p><p className="mt-2 text-[10px] text-[var(--muted)]">{detail}</p></div>;
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <div className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5"><div className="mb-4 flex items-center justify-between gap-4"><h2 className="text-[15px] font-semibold text-[var(--ink)]">{title}</h2>{action}</div>{children}</div>;
}

function Status({ value }: { value: string }) {
  return <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[9px] font-semibold text-[var(--accent)]">{userLabel(value)}</span>;
}

function Empty({ text, href, label }: { text: string; href: string; label: string }) {
  return <div className="rounded-[16px] border border-dashed border-[var(--line)] p-8 text-center"><p className="text-[12px] text-[var(--muted)]">{text}</p><Link href={href} className="mt-3 inline-block text-[12px] font-semibold text-[var(--accent)]">{label}</Link></div>;
}

function QuickLink({ href, title, text }: { href: string; title: string; text: string }) {
  return <Link href={href} className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 transition hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(17,70,104,.06)]"><p className="text-[14px] font-semibold text-[var(--ink)]">{title}</p><p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">{text}</p></Link>;
}
