"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, Button, EmptyState, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { leadStatusLabels, opportunityStageLabels, type CrmLeadDetail, type CrmOpportunity } from "@/lib/crm-types";

type SubjectType = "CUSTOMER" | "LEAD" | "OPPORTUNITY";
type CustomerContext = {
  id: string; firstName: string; lastName: string; phone: string | null; email: string | null;
  customerSource: string | null; createdAt: string;
  stats: { totalAppointments: number; completedAppointments: number; upcomingAppointments: number; netSpent: number };
};
type OpportunityContext = CrmOpportunity & { followUps?: Array<{ id: string; status: string; dueAt: string; channel: string }> };
type Context = CustomerContext | CrmLeadDetail | OpportunityContext;

function money(value: number | string | null | undefined, currency = "TRY") {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value ?? 0));
}
function date(value: string | null | undefined) {
  return value ? new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—";
}
function Row({ label, value }: { label: string; value: string | number }) {
  return <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] py-2.5 last:border-0"><span className="text-[9px] text-[var(--muted)]">{label}</span><strong className="max-w-[62%] text-right text-[10px] font-semibold">{value}</strong></div>;
}

export function ConversationContextPanel({ subjectType, subjectId, href }: { subjectType: SubjectType; subjectId: string; href: string }) {
  const [context, setContext] = useState<Context | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setContext(null);
    const endpoint = subjectType === "CUSTOMER" ? `/customers/${subjectId}` : subjectType === "LEAD" ? `/crm/leads/${subjectId}` : `/crm/opportunities/${subjectId}`;
    void api<Context>(endpoint).then((result) => { if (active) setContext(result); }).catch((requestError) => {
      if (active) setError(requestError instanceof ApiError ? requestError.message : "CRM bağlamı yüklenemedi.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [subjectId, subjectType]);

  return <aside className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
    <div className="border-b border-[var(--line)] px-4 py-4"><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">CRM 360</p><h3 className="mt-1 text-[13px] font-semibold">Operasyonel Bağlam</h3></div>
    <div className="p-4">{loading ? <Spinner label="CRM bağlamı yükleniyor..." /> : error ? <Alert>{error}</Alert> : !context ? <EmptyState title="Bağlam Yok" description="Bu konuşma için CRM kaydı bulunamadı." /> : subjectType === "CUSTOMER" ? (() => {
      const item = context as CustomerContext;
      return <div><div className="mb-4"><p className="text-[14px] font-semibold">{item.firstName} {item.lastName}</p><p className="mt-1 text-[9px] text-[var(--muted)]">Müşteri · {item.customerSource || "Kaynak belirtilmemiş"}</p></div><Row label="Telefon" value={item.phone || "—"} /><Row label="E-posta" value={item.email || "—"} /><Row label="Yaklaşan randevu" value={item.stats?.upcomingAppointments ?? 0} /><Row label="Tamamlanan randevu" value={item.stats?.completedAppointments ?? 0} /><Row label="Net harcama" value={money(item.stats?.netSpent)} /><Row label="Müşteri tarihi" value={date(item.createdAt)} /></div>;
    })() : subjectType === "LEAD" ? (() => {
      const item = context as CrmLeadDetail;
      const openFollowUps = item.followUps?.filter((followUp) => followUp.status === "OPEN") ?? [];
      return <div><div className="mb-4"><p className="text-[14px] font-semibold">{item.firstName} {item.lastName}</p><p className="mt-1 text-[9px] text-[var(--muted)]">Lead · {leadStatusLabels[item.status]}</p></div><Row label="Telefon" value={item.phone || "—"} /><Row label="E-posta" value={item.email || "—"} /><Row label="Açık takip" value={openFollowUps.length} /><Row label="Fırsat sayısı" value={item.opportunities?.length ?? 0} /><Row label="İlgi notu" value={item.interestNote || "—"} /><Row label="Son güncelleme" value={date(item.updatedAt)} /></div>;
    })() : (() => {
      const item = context as OpportunityContext;
      const contact = [item.customerFirstName || item.leadFirstName, item.customerLastName || item.leadLastName].filter(Boolean).join(" ") || "—";
      return <div><div className="mb-4"><p className="text-[14px] font-semibold">{item.title}</p><p className="mt-1 text-[9px] text-[var(--muted)]">Fırsat · {opportunityStageLabels[item.stage]}</p></div><Row label="İlgili kişi" value={contact} /><Row label="Tahmini değer" value={money(item.estimatedValue, item.currency)} /><Row label="Olasılık" value={`%${item.probability}`} /><Row label="Beklenen kapanış" value={date(item.expectedCloseDate)} /><Row label="Son güncelleme" value={date(item.updatedAt)} /></div>;
    })()}</div>
    <div className="border-t border-[var(--line)] p-4"><Link href={href}><Button variant="secondary" className="w-full">Tam CRM Kaydını Aç</Button></Link></div>
  </aside>;
}
