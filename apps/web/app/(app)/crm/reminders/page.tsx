"use client";

import { CardInfo } from "@/components/card-info";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, EmptyState, PageHeader, Select, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { getCardHelp } from "@/lib/card-help";
import { followUpChannelLabels, opportunityStageLabels, type CrmFollowUp, type OpportunityStage } from "@/lib/crm-types";

type ReminderScope = "MINE" | "TEAM";
type ReminderSeverity = "CRITICAL" | "HIGH" | "MEDIUM";
type ReminderKind =
  | "FOLLOW_UP_OVERDUE"
  | "FOLLOW_UP_TODAY"
  | "OPPORTUNITY_CLOSE_OVERDUE"
  | "OPPORTUNITY_CLOSE_SOON"
  | "OPPORTUNITY_STALE";

type FollowUpReminder = {
  category: "FOLLOW_UP";
  severity: ReminderSeverity;
  kind: ReminderKind;
  id: string;
  leadId: string | null;
  opportunityId: string | null;
  assignedUserId: string;
  channel: CrmFollowUp["channel"];
  dueAt: string;
  note: string | null;
  version: number;
  subjectLabel: string;
};

type OpportunityReminder = {
  category: "OPPORTUNITY";
  severity: ReminderSeverity;
  kind: ReminderKind;
  id: string;
  leadId: string | null;
  customerId: string | null;
  ownerUserId: string | null;
  title: string;
  stage: OpportunityStage;
  estimatedValue: string | number | null;
  currency: string;
  probability: number;
  expectedCloseDate: string | null;
  updatedAt: string;
  subjectLabel: string;
};

type ReminderItem = FollowUpReminder | OpportunityReminder;
type ReminderFeed = {
  scope: ReminderScope;
  generatedAt: string;
  counts: { total: number; critical: number; high: number; medium: number };
  items: ReminderItem[];
};

function ymd(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function reminderWindow() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const closeThrough = new Date(start);
  closeThrough.setDate(closeThrough.getDate() + 7);
  const staleBefore = new Date(start);
  staleBefore.setDate(staleBefore.getDate() - 14);
  return {
    dayStart: start.toISOString(),
    dayEnd: end.toISOString(),
    today: ymd(start),
    closeThrough: ymd(closeThrough),
    staleBefore: staleBefore.toISOString(),
  };
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function dateOnly(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function money(value: string | number | null, currency: string) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

const kindLabels: Record<ReminderKind, string> = {
  FOLLOW_UP_OVERDUE: "Geciken Takip",
  FOLLOW_UP_TODAY: "Bugünkü Takip",
  OPPORTUNITY_CLOSE_OVERDUE: "Kapanış Gecikti",
  OPPORTUNITY_CLOSE_SOON: "Kapanış Yaklaşıyor",
  OPPORTUNITY_STALE: "Durağan Fırsat",
};

const severityLabels: Record<ReminderSeverity, string> = {
  CRITICAL: "Kritik",
  HIGH: "Yüksek",
  MEDIUM: "Orta",
};

function reminderHref(item: ReminderItem) {
  if (item.category === "FOLLOW_UP") {
    if (item.opportunityId) return `/crm/opportunities/${item.opportunityId}`;
    if (item.leadId) return `/crm/leads/${item.leadId}`;
    return "/crm/follow-ups";
  }
  return `/crm/opportunities/${item.id}`;
}

export default function CrmRemindersPage() {
  const [scope, setScope] = useState<ReminderScope>("MINE");
  const [feed, setFeed] = useState<ReminderFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        scope,
        ...reminderWindow(),
        limit: "200",
      });
      const result = await api<ReminderFeed>(`/crm/operations/reminders?${params}`);
      setFeed(result);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "CRM hatırlatmaları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => { void load(); }, [load]);

  const counts = feed?.counts ?? { total: 0, critical: 0, high: 0, medium: 0 };

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM Hatırlatma Merkezi"
        description="Geciken ve bugünkü takipleri, yaklaşan veya gecikmiş fırsat kapanışlarını ve durağan satış fırsatlarını tek öncelik kuyruğunda yönetin."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/crm/actions?view=overdue"><Button variant="secondary">Aksiyon Merkezi</Button></Link>
            <Button onClick={() => void load()} disabled={loading}>{loading ? "Güncelleniyor..." : "Yenile"}</Button>
          </div>
        }
      />

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <div className="flex justify-end">
        <Select value={scope} onChange={(event) => setScope(event.target.value as ReminderScope)} className="sm:max-w-[220px]" aria-label="Hatırlatma kapsamı">
          <option value="MINE">Bana Ait İşler</option>
          <option value="TEAM">Şube Ekibi</option>
        </Select>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Toplam Uyarı", counts.total, "Tüm öncelikler"],
          ["Kritik", counts.critical, "Gecikmiş işler"],
          ["Yüksek", counts.high, "Bugün / 7 gün"],
          ["Orta", counts.medium, "14+ gün hareketsiz"],
        ].map(([label, value, detail]) => (
          <article key={String(label)} className="rounded-[20px] border border-[var(--line)] bg-white p-4 shadow-[var(--shadow-soft)]">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[11px] text-[var(--muted)]">{label}</p>
              <CardInfo help={getCardHelp(String(label), String(detail))} />
            </div>
            <strong className="mt-3 block text-[24px] font-semibold tracking-[-.04em] text-[var(--ink)]">{value}</strong>
            <p className="mt-2 text-[10px] text-[var(--muted-soft)]">{detail}</p>
          </article>
        ))}
      </section>

      {loading && !feed ? (
        <Spinner label="CRM hatırlatmaları hazırlanıyor..." />
      ) : feed?.items.length ? (
        <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
            <div>
              <h2 className="text-[14px] font-semibold text-[var(--ink)]">Öncelik Kuyruğu</h2>
              <p className="mt-1 text-[10px] text-[var(--muted)]">Kritik → yüksek → orta öncelik sırasıyla</p>
            </div>
            {feed.generatedAt ? <time className="text-[10px] text-[var(--muted-soft)]">{dateTime(feed.generatedAt)}</time> : null}
          </div>
          <div className="divide-y divide-[var(--line)]">
            {feed.items.map((item) => (
              <Link key={`${item.category}-${item.kind}-${item.id}`} href={reminderHref(item)} className="block px-5 py-4 transition-colors hover:bg-[#f8fcfd]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={item.severity === "CRITICAL" ? "rounded-full bg-[#f7e8e4] px-2 py-1 text-[9px] font-semibold text-[#9c513f]" : item.severity === "HIGH" ? "rounded-full bg-[#fff2d8] px-2 py-1 text-[9px] font-semibold text-[#8a651d]" : "rounded-full bg-[#eaf5fb] px-2 py-1 text-[9px] font-semibold text-[#1674BD]"}>{severityLabels[item.severity]}</span>
                      <span className="text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--muted)]">{kindLabels[item.kind]}</span>
                    </div>
                    <h3 className="mt-2 text-[13px] font-semibold text-[var(--ink)]">{item.category === "FOLLOW_UP" ? item.subjectLabel : item.title}</h3>
                    <p className="mt-1 text-[11px] text-[var(--muted)]">{item.category === "FOLLOW_UP" ? `${followUpChannelLabels[item.channel]} · ${item.note || "Takip notu bulunmuyor"}` : `${item.subjectLabel} · ${opportunityStageLabels[item.stage]}`}</p>
                    {item.category === "OPPORTUNITY" ? <p className="mt-2 text-[10px] text-[var(--muted-soft)]">{money(item.estimatedValue, item.currency)} · %{item.probability} olasılık</p> : null}
                  </div>
                  <div className="shrink-0 text-left sm:text-right">
                    {item.category === "FOLLOW_UP" ? <><p className="text-[10px] text-[var(--muted-soft)]">Takip zamanı</p><p className="mt-1 text-[11px] font-medium text-[var(--ink)]">{dateTime(item.dueAt)}</p></> : item.expectedCloseDate ? <><p className="text-[10px] text-[var(--muted-soft)]">Beklenen kapanış</p><p className="mt-1 text-[11px] font-medium text-[var(--ink)]">{dateOnly(item.expectedCloseDate)}</p></> : <><p className="text-[10px] text-[var(--muted-soft)]">Son aktivite</p><p className="mt-1 text-[11px] font-medium text-[var(--ink)]">{dateTime(item.updatedAt)}</p></>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <EmptyState
          title="Aktif CRM Hatırlatması Yok"
          description={scope === "MINE" ? "Size atanmış geciken veya yaklaşan CRM işi bulunmuyor." : "Aktif şube kapsamında ekip için geciken veya yaklaşan CRM işi bulunmuyor."}
          action={<Link href="/crm"><Button variant="secondary">CRM Genel Bakış</Button></Link>}
        />
      )}
    </div>
  );
}
