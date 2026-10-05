"use client";

import Link from "next/link";
import { CardInfo } from "@/components/card-info";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { DatePicker } from "@/components/date-picker";
import { FormActions, FormGrid, FormHint, FormSection, FormStepper } from "@/components/form-system";
import { Modal } from "@/components/modal";
import { MasterDataQuickCreate } from "@/components/master-data-quick-create";
import {
  Alert,
  Button,
  EmptyState,
  Field,
  PageHeader,
  Select,
  Spinner,
  TextArea,
  TextInput,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { ValooMultiSelect, ValooSegmentedControl, ValooSelect } from "@/components/valoo-controls";
import { api, ApiError, withQuery } from "@/lib/api";
import { getCardHelp } from "@/lib/card-help";
import { userErrorMessage } from "@/lib/user-language";
import { hasActiveBranch, hasPermission } from "@/lib/auth";
import {
  leadSourceLabels,
  leadStatusLabels,
  type CrmAssignee,
  type CrmLead,
  type CrmSurveyor,
  type LeadStatus,
} from "@/lib/crm-types";
import type { Paginated, Service } from "@/lib/types";

type LeadContactChannel = "CALL" | "SMS" | "EMAIL" | "WHATSAPP" | "IN_PERSON" | "OTHER";
type LeadUrgency = "IMMEDIATE" | "THIS_WEEK" | "THIS_MONTH" | "LATER" | "UNKNOWN";
type LeadConsultation = "REQUIRED" | "REQUESTED" | "NOT_NEEDED" | "UNKNOWN";
type LeadTemperature = "COLD" | "WARM" | "HOT";

const emptyLead = {
  firstName: "",
  lastName: "",
  phone: "",
  alternativePhone: "",
  email: "",
  preferredContactChannel: "" as LeadContactChannel | "",
  language: "tr",
  source: "MANUAL",
  sourceDetail: "",
  surveyorStaffId: "",
  surveyCampaign: "",
  surveyLocation: "",
  surveyDesk: "",
  surveyDate: "",
  interestedServiceIds: [] as string[],
  estimatedBudget: "",
  purchaseUrgency: "UNKNOWN" as LeadUrgency,
  consultationNeed: "UNKNOWN" as LeadConsultation,
  customerIntent: "",
  team: "",
  leadScore: "0",
  leadTemperature: "COLD" as LeadTemperature,
  interestNote: "",
  ownerUserId: "",
};
const emptyOpportunity = {
  title: "",
  estimatedValue: "",
  probability: "25",
  expectedCloseDate: "",
  ownerUserId: "",
};
const statuses: Array<LeadStatus | "ALL"> = [
  "ALL",
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "CONVERTED",
  "LOST",
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function initials(lead: CrmLead) {
  return `${lead.firstName[0] ?? ""}${lead.lastName[0] ?? ""}`.toUpperCase();
}

export default function CrmLeadsPage() {
  const canManage = hasPermission("crm", "manage");
  const { showToast } = useToast();
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [assignees, setAssignees] = useState<CrmAssignee[]>([]);
  const [surveyors, setSurveyors] = useState<CrmSurveyor[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [leadStep, setLeadStep] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<LeadStatus | "ALL">("ALL");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [temperature, setTemperature] = useState<LeadTemperature | "ALL">("ALL");
  const [assignmentFilter, setAssignmentFilter] = useState<"ALL" | "UNASSIGNED">("ALL");
  const [sortMode, setSortMode] = useState<"priority" | "newest" | "updated" | "score" | "value">("priority");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [qualifying, setQualifying] = useState<CrmLead | null>(null);
  const [leadForm, setLeadForm] = useState(emptyLead);
  const [opportunityForm, setOpportunityForm] = useState(emptyOpportunity);
  const [quickServiceName, setQuickServiceName] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (status !== "ALL") params.set("status", status);
      if (ownerUserId) params.set("ownerUserId", ownerUserId);
      if (search.trim()) params.set("search", search.trim());
      setLeads(await api<CrmLead[]>(`/crm/leads?${params}`));
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? userErrorMessage(requestError.message, "Potansiyel müşteri listesi yüklenemedi.")
          : "Potansiyel müşteri listesi yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }, [ownerUserId, search, status]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timeout);
  }, [load]);

  useEffect(() => {
    void Promise.all([
      api<CrmAssignee[]>("/crm/assignees"),
      api<CrmSurveyor[]>("/crm/surveyors"),
      api<Paginated<Service>>(withQuery("/services", { page: 1, limit: 100 })),
    ])
      .then(([people, surveyorRows, serviceResult]) => {
        setAssignees(people);
        setSurveyors(surveyorRows);
        setServices(serviceResult.data.filter((service) => service.status === "ACTIVE"));
      })
      .catch((requestError) =>
        setError(
          requestError instanceof ApiError
            ? userErrorMessage(requestError.message, "Potansiyel müşteri form seçenekleri yüklenemedi.")
            : "Potansiyel müşteri form seçenekleri yüklenemedi.",
        ),
      );
  }, []);

  const requireActiveBranch = useCallback((message: string) => {
    if (hasActiveBranch()) return true;
    showToast(message, "error");
    return false;
  }, [showToast]);

  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get("new") === "1" &&
      canManage
    ) {
      if (
        requireActiveBranch(
          "Yeni potansiyel müşteri oluşturmak için önce çalışma kapsamından bir şube seçin.",
        )
      ) {
        setLeadStep(0);
        setCreateOpen(true);
      }
    }
  }, [canManage, requireActiveBranch]);

  const counts = useMemo(
    () => ({
      total: leads.length,
      newLeads: leads.filter((lead) => lead.status === "NEW").length,
      hot: leads.filter((lead) => lead.leadTemperature === "HOT").length,
      qualified: leads.filter((lead) => lead.status === "QUALIFIED").length,
      unassigned: leads.filter((lead) => !lead.ownerUserId).length,
    }),
    [leads],
  );

  const visibleLeads = useMemo(() => {
    const rows = leads.filter((lead) => {
      if (temperature !== "ALL" && lead.leadTemperature !== temperature) return false;
      if (assignmentFilter === "UNASSIGNED" && lead.ownerUserId) return false;
      return true;
    });

    return [...rows].sort((a, b) => {
      if (sortMode === "newest") return +new Date(b.createdAt) - +new Date(a.createdAt);
      if (sortMode === "updated") return +new Date(b.updatedAt) - +new Date(a.updatedAt);
      if (sortMode === "score") return Number(b.leadScore ?? 0) - Number(a.leadScore ?? 0);
      if (sortMode === "value") return Number(b.estimatedValue ?? 0) - Number(a.estimatedValue ?? 0);

      const temperatureRank = { HOT: 3, WARM: 2, COLD: 1 } as const;
      const aRank = temperatureRank[a.leadTemperature ?? "COLD"];
      const bRank = temperatureRank[b.leadTemperature ?? "COLD"];
      if (aRank !== bRank) return bRank - aRank;
      if (Number(a.leadScore ?? 0) !== Number(b.leadScore ?? 0)) {
        return Number(b.leadScore ?? 0) - Number(a.leadScore ?? 0);
      }
      return +new Date(b.updatedAt) - +new Date(a.updatedAt);
    });
  }, [assignmentFilter, leads, sortMode, temperature]);
  const assigneeNames = useMemo(
    () =>
      new Map(
        assignees.map((person) => [
          person.id,
          `${person.firstName} ${person.lastName}`,
        ]),
      ),
    [assignees],
  );

  const duplicateLead = useMemo(() => {
    const phone = leadForm.phone.replace(/\D/g, "");
    const email = leadForm.email.trim().toLocaleLowerCase("tr-TR");
    if (!phone && !email) return null;
    return leads.find((lead) => {
      const leadPhone = (lead.phone ?? "").replace(/\D/g, "");
      const leadEmail = (lead.email ?? "").trim().toLocaleLowerCase("tr-TR");
      return Boolean((phone && leadPhone === phone) || (email && leadEmail === email));
    }) ?? null;
  }, [leadForm.email, leadForm.phone, leads]);

  async function createLead(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    if (
      !requireActiveBranch(
        "Potansiyel müşteri oluşturmak için önce çalışma kapsamından bir şube seçin.",
      )
    ) {
      return;
    }
    if (
      !leadForm.firstName.trim() ||
      !leadForm.lastName.trim() ||
      (!leadForm.phone.trim() && !leadForm.alternativePhone.trim() && !leadForm.email.trim())
    ) {
      setFormError("Ad, soyad ve en az bir iletişim bilgisi gereklidir.");
      return;
    }
    if (leadForm.source === "SURVEYOR" && !leadForm.surveyorStaffId) {
      setFormError("Kaynak olarak Anketör seçildiğinde anketör seçimi zorunludur.");
      return;
    }
    setSaving(true);
    try {
      await api("/crm/leads", {
        method: "POST",
        body: {
          firstName: leadForm.firstName.trim(),
          lastName: leadForm.lastName.trim(),
          source: leadForm.source,
          ...(leadForm.phone.trim() ? { phone: leadForm.phone.trim() } : {}),
          ...(leadForm.alternativePhone.trim() ? { alternativePhone: leadForm.alternativePhone.trim() } : {}),
          ...(leadForm.email.trim() ? { email: leadForm.email.trim().toLowerCase() } : {}),
          ...(leadForm.preferredContactChannel ? { preferredContactChannel: leadForm.preferredContactChannel } : {}),
          ...(leadForm.language.trim() ? { language: leadForm.language.trim() } : {}),
          ...(leadForm.sourceDetail.trim() ? { sourceDetail: leadForm.sourceDetail.trim() } : {}),
          ...(leadForm.source === "SURVEYOR" && leadForm.surveyorStaffId ? { surveyorStaffId: leadForm.surveyorStaffId } : {}),
          ...(leadForm.source === "SURVEYOR" && leadForm.surveyCampaign.trim() ? { surveyCampaign: leadForm.surveyCampaign.trim() } : {}),
          ...(leadForm.source === "SURVEYOR" && leadForm.surveyLocation.trim() ? { surveyLocation: leadForm.surveyLocation.trim() } : {}),
          ...(leadForm.source === "SURVEYOR" && leadForm.surveyDesk.trim() ? { surveyDesk: leadForm.surveyDesk.trim() } : {}),
          ...(leadForm.source === "SURVEYOR" && leadForm.surveyDate ? { surveyDate: leadForm.surveyDate } : {}),
          ...(leadForm.interestedServiceIds.length ? { interestedServiceIds: leadForm.interestedServiceIds } : {}),
          ...(leadForm.estimatedBudget ? { estimatedBudget: Number(leadForm.estimatedBudget), budgetCurrency: "TRY" } : {}),
          purchaseUrgency: leadForm.purchaseUrgency,
          consultationNeed: leadForm.consultationNeed,
          ...(leadForm.customerIntent.trim() ? { customerIntent: leadForm.customerIntent.trim() } : {}),
          ...(leadForm.team.trim() ? { team: leadForm.team.trim() } : {}),
          leadScore: Number(leadForm.leadScore),
          leadTemperature: leadForm.leadTemperature,
          ...(leadForm.interestNote.trim() ? { interestNote: leadForm.interestNote.trim() } : {}),
          ...(leadForm.ownerUserId ? { ownerUserId: leadForm.ownerUserId } : {}),
        },
      });
      setCreateOpen(false);
      setLeadStep(0);
      setLeadForm(emptyLead);
      showToast("Potansiyel müşteri oluşturuldu.", "success");
      await load();
    } catch (requestError) {
      setFormError(
        requestError instanceof ApiError
          ? userErrorMessage(requestError.message, "Potansiyel müşteri oluşturulamadı.")
          : "Potansiyel müşteri oluşturulamadı.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function qualifyLead(event: FormEvent) {
    event.preventDefault();
    if (!qualifying) return;
    setFormError("");
    if (
      !requireActiveBranch(
        "Satış fırsatı oluşturmak için önce çalışma kapsamından bir şube seçin.",
      )
    ) {
      return;
    }
    if (!opportunityForm.title.trim()) {
      setFormError("Satış fırsatı başlığı gereklidir.");
      return;
    }
    setSaving(true);
    try {
      await api(`/crm/leads/${qualifying.id}/qualify`, {
        method: "POST",
        body: {
          version: qualifying.version,
          title: opportunityForm.title.trim(),
          probability: Number(opportunityForm.probability),
          ...(opportunityForm.estimatedValue
            ? { estimatedValue: Number(opportunityForm.estimatedValue) }
            : {}),
          ...(opportunityForm.expectedCloseDate
            ? { expectedCloseDate: opportunityForm.expectedCloseDate }
            : {}),
          ...(opportunityForm.ownerUserId
            ? { ownerUserId: opportunityForm.ownerUserId }
            : {}),
        },
      });
      setQualifying(null);
      setOpportunityForm(emptyOpportunity);
      showToast("Potansiyel müşteri satış fırsatına dönüştürüldü.", "success");
      await load();
    } catch (requestError) {
      setFormError(
        requestError instanceof ApiError
          ? userErrorMessage(requestError.message, "Potansiyel müşteri satış fırsatına dönüştürülemedi.")
          : "Potansiyel müşteri satış fırsatına dönüştürülemedi.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-5 rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)] sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[12px] font-medium text-[var(--muted)]">Potansiyel müşteri yönetimi</p>
          <h1 className="mt-1 text-[32px] font-semibold tracking-[-.045em] text-[var(--ink)]">Potansiyel Müşteri Merkezi</h1>
          <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--muted)]">Yeni müşteri adaylarını önceliklendirin, sorumlulara dağıtın ve satışa en yakın kayıtları hızlıca satış fırsatına dönüştürün.</p>
        </div>
        {canManage ? <Button
          onClick={() => {
            if (!requireActiveBranch("Yeni potansiyel müşteri oluşturmak için önce çalışma kapsamından bir şube seçin.")) return;
            setFormError("");
            setLeadStep(0);
            setLeadForm(emptyLead);
            setCreateOpen(true);
          }}
        >Yeni Potansiyel Müşteri</Button> : null}
      </header>
      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <LeadSummaryCard label="Tüm Müşteriler" value={counts.total} detail="Mevcut filtre kapsamındaki kayıtlar" active={status==="ALL"&&temperature==="ALL"&&assignmentFilter==="ALL"} onClick={()=>{setStatus("ALL");setTemperature("ALL");setAssignmentFilter("ALL")}}/>
        <LeadSummaryCard label="Yeni Müşteriler" value={counts.newLeads} detail="İlk temas bekleyen kayıtlar" active={status==="NEW"} onClick={()=>{setStatus("NEW");setTemperature("ALL");setAssignmentFilter("ALL")}}/>
        <LeadSummaryCard label="Yüksek Öncelik" value={counts.hot} detail="Öncelikli satış görüşmesi gerekenler" active={temperature==="HOT"} tone="warning" onClick={()=>{setStatus("ALL");setTemperature("HOT");setAssignmentFilter("ALL")}}/>
        <LeadSummaryCard label="Satışa Hazır" value={counts.qualified} detail="Satış fırsatına dönüştürülebilir" active={status==="QUALIFIED"} onClick={()=>{setStatus("QUALIFIED");setTemperature("ALL");setAssignmentFilter("ALL")}}/>
        <LeadSummaryCard label="Sorumlusu Olmayan" value={counts.unassigned} detail="Henüz kullanıcıya atanmamış" active={assignmentFilter==="UNASSIGNED"} tone="warning" onClick={()=>{setStatus("ALL");setTemperature("ALL");setAssignmentFilter("UNASSIGNED")}}/>
      </section>

      <section className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
          <div><h2 className="text-[14px] font-semibold text-[var(--ink)]">Bugünkü Öncelikler</h2><p className="mt-1 text-[10px] text-[var(--muted)]">Satış ekibinin önce ele alması gereken müşteri grupları</p></div>
        </div>
        <div className="grid gap-2 p-4 md:grid-cols-3">
          <button type="button" onClick={()=>{setStatus("NEW");setTemperature("ALL");setAssignmentFilter("ALL")}} className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] p-3 text-left transition hover:border-[var(--line-strong)]">
            <b className="block text-[10px] font-semibold text-[var(--ink)]">{counts.newLeads} yeni müşteri ilk temas bekliyor</b><span className="mt-1.5 block text-[9px] leading-4 text-[var(--muted)]">Yeni kayıtlarla mümkün olan en kısa sürede iletişime geçin.</span>
          </button>
          <button type="button" onClick={()=>{setStatus("ALL");setTemperature("HOT");setAssignmentFilter("ALL")}} className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] p-3 text-left transition hover:border-[var(--line-strong)]">
            <b className="block text-[10px] font-semibold text-[var(--ink)]">{counts.hot} yüksek öncelikli müşteri var</b><span className="mt-1.5 block text-[9px] leading-4 text-[var(--muted)]">Satın alma ihtimali yüksek müşterileri öncelikli değerlendirin.</span>
          </button>
          <button type="button" onClick={()=>{setStatus("ALL");setTemperature("ALL");setAssignmentFilter("UNASSIGNED")}} className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] p-3 text-left transition hover:border-[var(--line-strong)]">
            <b className="block text-[10px] font-semibold text-[var(--ink)]">{counts.unassigned} müşteri sorumlusuz</b><span className="mt-1.5 block text-[9px] leading-4 text-[var(--muted)]">Sorumlusu olmayan kayıtları satış ekibine dağıtın.</span>
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 border-b border-[var(--line)] p-4 lg:flex-row lg:items-center lg:justify-between">
          <TextInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Ad, telefon veya e-posta ara"
            aria-label="Potansiyel müşteri ara"
            className="lg:max-w-[430px]"
          />

          <div className="flex flex-wrap items-center gap-2">
            <details className="relative">
              <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-[10px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[10px] font-semibold text-[var(--ink)] transition hover:bg-[var(--surface-2)]">
                Filtreler
                {(status!=="ALL"||temperature!=="ALL"||ownerUserId||assignmentFilter==="UNASSIGNED")?<span className="rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-[8px] text-[var(--accent)]">Aktif</span>:null}
                <span className="text-[11px] text-[var(--muted)]">⌄</span>
              </summary>
              <div className="absolute right-0 z-40 mt-2 w-[320px] space-y-2 rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[0_18px_48px_rgba(23,35,28,.14)]">
                <Select value={status} onChange={(event)=>setStatus(event.target.value as LeadStatus|"ALL")} aria-label="Duruma göre filtrele">
                  {statuses.map((item)=><option key={item} value={item}>{item==="ALL"?"Tüm Durumlar":leadStatusLabels[item]}</option>)}
                </Select>
                <Select value={temperature} onChange={(event)=>setTemperature(event.target.value as LeadTemperature|"ALL")} aria-label="Önceliğe göre filtrele">
                  <option value="ALL">Tüm Öncelikler</option>
                  <option value="HOT">Yüksek Öncelik</option>
                  <option value="WARM">Orta Öncelik</option>
                  <option value="COLD">Normal Öncelik</option>
                </Select>
                <Select value={ownerUserId} onChange={(event)=>{setOwnerUserId(event.target.value);setAssignmentFilter("ALL")}} aria-label="Sorumluya göre filtrele">
                  <option value="">Tüm Sorumlular</option>
                  {assignees.map((person)=><option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>)}
                </Select>
                <button
                  type="button"
                  onClick={()=>setAssignmentFilter(assignmentFilter==="UNASSIGNED"?"ALL":"UNASSIGNED")}
                  className={`w-full rounded-[10px] border px-3 py-2 text-left text-[10px] font-semibold transition ${assignmentFilter==="UNASSIGNED"?"border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]":"border-[var(--line)] text-[var(--muted)] hover:bg-[var(--surface-2)]"}`}
                >
                  Sadece sorumlusu olmayanlar
                </button>
                <button
                  type="button"
                  onClick={()=>{setStatus("ALL");setTemperature("ALL");setOwnerUserId("");setAssignmentFilter("ALL")}}
                  className="w-full rounded-[10px] px-3 py-2 text-left text-[10px] font-semibold text-[var(--muted)] hover:bg-[var(--surface-2)]"
                >
                  Filtreleri Temizle
                </button>
              </div>
            </details>

            <Select
              value={sortMode}
              onChange={(event)=>setSortMode(event.target.value as typeof sortMode)}
              aria-label="Sıralama"
              className="max-w-[210px]"
            >
              <option value="priority">Önceliğe Göre</option>
              <option value="score">Müşteri Puanına Göre</option>
              <option value="value">Tahmini Değere Göre</option>
              <option value="newest">En Yeni</option>
              <option value="updated">En Son Güncellenen</option>
            </Select>
          </div>
        </div>

        {loading ? (
          <Spinner label="Potansiyel müşteriler yükleniyor..." />
        ) : visibleLeads.length ? (
          <div>
            <div className={`hidden ${grid} items-center gap-4 border-b border-[var(--line)] bg-[var(--surface-2)] px-4 py-2.5 lg:grid`}>
              <span className="text-[9px] font-semibold text-[var(--muted)]">Müşteri</span>
              <span className="text-[9px] font-semibold text-[var(--muted)]">Öncelik</span>
              <span className="text-[9px] font-semibold text-[var(--muted)]">Sorumlu / Tahmini Satış</span>
              <span className="text-[9px] font-semibold text-[var(--muted)]">Durum / Güncelleme</span>
              <span className="text-right text-[9px] font-semibold text-[var(--muted)]">İşlemler</span>
            </div>

            <div className="divide-y divide-[var(--line)]">
              {visibleLeads.map((lead)=>{
                const priority=lead.leadTemperature==="HOT"?"Yüksek":lead.leadTemperature==="WARM"?"Orta":"Normal";
                const priorityClass=lead.leadTemperature==="HOT"?"text-[var(--danger)]":lead.leadTemperature==="WARM"?"text-[var(--warning)]":"text-[var(--muted)]";
                const score=Number(lead.leadScore??0);
                const sourceLabel=leadSourceLabels[lead.source]??"Diğer Kaynak";
                return <article key={lead.id} className="px-4 py-3 transition-colors hover:bg-[var(--surface-2)]">
                  <div className={`grid gap-3 lg:items-center lg:gap-4 ${grid}`}>
                    <Link href={`/crm/leads/${lead.id}`} className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[10px] font-bold text-[var(--accent)]">{initials(lead)}</span>
                      <span className="min-w-0">
                        <strong className="block truncate text-[12px] text-[var(--ink)]">{lead.firstName} {lead.lastName}</strong>
                        <small className="mt-0.5 block truncate text-[9px] text-[var(--muted)]">{lead.phone||lead.email||"İletişim bilgisi yok"} · {sourceLabel}</small>
                      </span>
                    </Link>

                    <div className="min-w-0 lg:pr-3">
                      <div className="flex items-center gap-2">
                        <span className={`whitespace-nowrap text-[9px] font-semibold ${priorityClass}`}>{priority} Öncelik</span>
                        {score>0?<span className="whitespace-nowrap text-[9px] font-semibold text-[var(--ink)]">{score} puan</span>:<span className="whitespace-nowrap text-[9px] text-[var(--muted-soft)]">Henüz puanlanmadı</span>}
                      </div>
                      {score>0?<div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--surface-2)]"><span className="block h-full rounded-full bg-[var(--accent)]" style={{width:`${Math.min(100,score)}%`}}/></div>:null}
                    </div>

                    <div className="min-w-0">
                      <span className={`block truncate text-[10px] font-medium ${lead.ownerUserId?"text-[var(--ink)]":"text-[var(--warning)]"}`}>
                        {lead.ownerUserId?(assigneeNames.get(lead.ownerUserId)??"Atanmış kullanıcı"):"Sorumlu atanmamış"}
                      </span>
                      {lead.estimatedValue!=null?<span className="mt-0.5 block truncate text-[9px] text-[var(--muted)]">Tahmini satış {Number(lead.estimatedValue).toLocaleString("tr-TR")} ₺</span>:<span className="mt-0.5 block truncate text-[9px] text-[var(--muted)]">Tahmini satış değeri yok</span>}
                    </div>

                    <div className="min-w-0">
                      <span className="inline-flex max-w-full truncate rounded-full bg-[var(--accent-soft)] px-2 py-1 text-[9px] font-semibold text-[var(--accent)]">{leadStatusLabels[lead.status]}</span>
                      <time className="mt-1 block whitespace-nowrap text-[8px] text-[var(--muted)]">{formatDate(lead.updatedAt)}</time>
                    </div>

                    <div className="flex min-h-8 items-center gap-2 lg:justify-end">
                      {canManage&&["NEW","CONTACTED"].includes(lead.status)&&!lead.opportunityId?<Button
                        variant="secondary"
                        className="min-h-8 whitespace-nowrap px-3 py-1.5 text-[9px]"
                        onClick={()=>{
                          if(!requireActiveBranch("Potansiyel müşteriyi satış fırsatına dönüştürmek için önce çalışma kapsamından bir şube seçin."))return;
                          setFormError("");
                          setOpportunityForm({...emptyOpportunity,title:`${lead.firstName} ${lead.lastName} Satış Fırsatı`});
                          setQualifying(lead);
                        }}
                      >Satışa Dönüştür</Button>:<span className="hidden lg:block lg:w-[118px]" aria-hidden="true" />}
                      <Link href={`/crm/leads/${lead.id}`} className="inline-flex min-h-8 w-[56px] items-center justify-center rounded-[9px] px-2 text-[9px] font-semibold text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--ink)]">Detay</Link>
                    </div>
                  </div>
                </article>;
              })}
            </div>
          </div>
        ) : (
          <EmptyState title="Potansiyel müşteri bulunamadı" description="Arama ve filtreleri değiştirin veya yeni bir potansiyel müşteri oluşturun." />
        )}
      </section>

      <Modal
        size="xl"
        open={createOpen}
        onClose={() => !saving && setCreateOpen(false)}
        title="Yeni Potansiyel Müşteri"
        description="İletişim, ihtiyaç ve satış bilgilerini tek kayıtta tamamlayın."
      >
        <form onSubmit={createLead} className="space-y-5">
          <FormStepper
            current={leadStep}
            onStepChange={(next) => {
              if (next <= leadStep) setLeadStep(next);
            }}
            steps={[
              { key: "contact", label: "İletişim", description: "Kimlik ve iletişim" },
              { key: "interest", label: "İhtiyaç", description: "Hizmet ve bütçe" },
              { key: "sales", label: "Satış", description: "Kaynak ve sorumlu" },
            ]}
          />

          {formError ? <Alert>{formError}</Alert> : null}
          {duplicateLead ? (
            <FormHint tone="warning" title="Benzer kayıt bulundu">
              Aynı telefon veya e-posta ile kayıtlı {duplicateLead.firstName} {duplicateLead.lastName} adlı bir potansiyel müşteri var. Yeni kayıt oluşturmadan önce mevcut kaydı kontrol edin.
            </FormHint>
          ) : null}

          {leadStep === 0 ? (
            <FormSection title="İletişim bilgileri" description="En az bir telefon veya e-posta bilgisi gereklidir.">
              <FormGrid>
                <Field label="Ad" required>
                  <TextInput value={leadForm.firstName} onChange={(e) => setLeadForm({ ...leadForm, firstName: e.target.value })} />
                </Field>
                <Field label="Soyad" required>
                  <TextInput value={leadForm.lastName} onChange={(e) => setLeadForm({ ...leadForm, lastName: e.target.value })} />
                </Field>
                <Field label="Telefon">
                  <TextInput value={leadForm.phone} onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })} />
                </Field>
                <Field label="Alternatif telefon">
                  <TextInput value={leadForm.alternativePhone} onChange={(e) => setLeadForm({ ...leadForm, alternativePhone: e.target.value })} />
                </Field>
                <Field label="E-posta">
                  <TextInput type="email" value={leadForm.email} onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })} />
                </Field>
                <Field label="Tercih edilen iletişim">
                  <ValooSelect
                    value={leadForm.preferredContactChannel}
                    onChange={(preferredContactChannel) => setLeadForm({ ...leadForm, preferredContactChannel: preferredContactChannel as LeadContactChannel })}
                    searchable={false}
                    placeholder="Seçin"
                    options={[
                      { value: "WHATSAPP", label: "WhatsApp" },
                      { value: "CALL", label: "Telefon" },
                      { value: "SMS", label: "SMS" },
                      { value: "EMAIL", label: "E-posta" },
                      { value: "IN_PERSON", label: "Yüz yüze" },
                      { value: "OTHER", label: "Diğer" },
                    ]}
                  />
                </Field>
                <Field label="Dil">
                  <TextInput value={leadForm.language} onChange={(e) => setLeadForm({ ...leadForm, language: e.target.value })} placeholder="tr" />
                </Field>
              </FormGrid>
            </FormSection>
          ) : null}

          {leadStep === 1 ? (
            <FormSection title="İhtiyaç ve ticari potansiyel" description="Müşteri adayının ne aradığını ve satın alma niyetini kaydedin.">
              <Field label="İlgilendiği hizmetler">
                <ValooMultiSelect
                  values={leadForm.interestedServiceIds}
                  onChange={(interestedServiceIds) => setLeadForm({ ...leadForm, interestedServiceIds })}
                  placeholder="Hizmet seçin"
                  searchPlaceholder="Hizmet ara…"
                  emptyLabel="Hizmet bulunamadı."
                  options={services.map((service) => ({
                    value: service.id,
                    label: service.name,
                    description: `${service.durationMinutes} dk · ₺${Number(service.price).toLocaleString("tr-TR")}`,
                  }))}
                  createAction={hasPermission("services", "create") ? {
                    label: "Yeni hizmet oluştur",
                    onClick: (query) => setQuickServiceName(query),
                  } : undefined}
                />
              </Field>
              <FormGrid className="mt-4">
                <Field label="Tahmini bütçe">
                  <TextInput type="number" min="0" inputMode="decimal" value={leadForm.estimatedBudget} onChange={(e) => setLeadForm({ ...leadForm, estimatedBudget: e.target.value })} placeholder="₺" />
                </Field>
                <Field label="Satın alma zamanı">
                  <ValooSelect
                    value={leadForm.purchaseUrgency}
                    onChange={(purchaseUrgency) => setLeadForm({ ...leadForm, purchaseUrgency: purchaseUrgency as LeadUrgency })}
                    searchable={false}
                    options={[
                      { value: "IMMEDIATE", label: "Hemen" },
                      { value: "THIS_WEEK", label: "Bu hafta" },
                      { value: "THIS_MONTH", label: "Bu ay" },
                      { value: "LATER", label: "Daha sonra" },
                      { value: "UNKNOWN", label: "Belirsiz" },
                    ]}
                  />
                </Field>
                <Field label="Danışmanlık ihtiyacı">
                  <ValooSelect
                    value={leadForm.consultationNeed}
                    onChange={(consultationNeed) => setLeadForm({ ...leadForm, consultationNeed: consultationNeed as LeadConsultation })}
                    searchable={false}
                    options={[
                      { value: "REQUIRED", label: "Gerekli" },
                      { value: "REQUESTED", label: "Talep edildi" },
                      { value: "NOT_NEEDED", label: "Gerekli değil" },
                      { value: "UNKNOWN", label: "Belirsiz" },
                    ]}
                  />
                </Field>
                <Field label="Müşteri niyeti">
                  <TextInput value={leadForm.customerIntent} onChange={(e) => setLeadForm({ ...leadForm, customerIntent: e.target.value })} placeholder="Örn. fiyat araştırıyor, hızlı karar verebilir" />
                </Field>
              </FormGrid>
            </FormSection>
          ) : null}

          {leadStep === 2 ? (
            <FormSection title="Satış ve kaynak bilgileri" description="Potansiyel müşterinin kaynağını, önceliğini ve sorumlu kişisini belirleyin.">
              <FormGrid>
                <Field label="Kaynak">
                  <ValooSelect
                    value={leadForm.source}
                    onChange={(source) => setLeadForm({ ...leadForm, source, ...(source === "SURVEYOR" ? {} : { surveyorStaffId: "", surveyCampaign: "", surveyLocation: "", surveyDesk: "", surveyDate: "" }) })}
                    searchable={false}
                    options={Object.entries(leadSourceLabels).map(([value, label]) => ({ value, label }))}
                  />
                </Field>
                <Field label="Kaynak detayı">
                  <TextInput value={leadForm.sourceDetail} onChange={(e) => setLeadForm({ ...leadForm, sourceDetail: e.target.value })} placeholder="Kampanya, yönlendiren kişi veya kanal detayı" />
                </Field>
                {leadForm.source === "SURVEYOR" ? <>
                  <Field label="Anketör" required>
                    <ValooSelect
                      value={leadForm.surveyorStaffId}
                      onChange={(surveyorStaffId) => setLeadForm({ ...leadForm, surveyorStaffId })}
                      placeholder="Anketör seçin"
                      searchPlaceholder="Anketör ara…"
                      options={surveyors.map((person) => ({ value: person.staffId, label: `${person.firstName} ${person.lastName}`, description: person.weeklyDeskQuota == null ? undefined : `Haftalık masa kotası: ${person.weeklyDeskQuota}` }))}
                    />
                  </Field>
                  <Field label="Anket tarihi">
                    <DatePicker value={leadForm.surveyDate} max={new Date().toISOString().slice(0, 10)} ariaLabel="Anket tarihi" onChange={(surveyDate) => setLeadForm({ ...leadForm, surveyDate })} />
                  </Field>
                  <Field label="Çalışma noktası">
                    <TextInput value={leadForm.surveyLocation} onChange={(e) => setLeadForm({ ...leadForm, surveyLocation: e.target.value })} placeholder="Örn. AVM, etkinlik alanı veya saha noktası" />
                  </Field>
                  <Field label="Masa / nokta">
                    <TextInput value={leadForm.surveyDesk} onChange={(e) => setLeadForm({ ...leadForm, surveyDesk: e.target.value })} placeholder="Örn. Masa 4" />
                  </Field>
                  <Field label="Anket kampanyası">
                    <TextInput value={leadForm.surveyCampaign} onChange={(e) => setLeadForm({ ...leadForm, surveyCampaign: e.target.value })} placeholder="Varsa kampanya veya saha çalışması" />
                  </Field>
                </> : null}
                <Field label="Potansiyel müşteri önceliği">
                  <ValooSegmentedControl
                    value={leadForm.leadTemperature}
                    onChange={(leadTemperature) => setLeadForm({ ...leadForm, leadTemperature })}
                    ariaLabel="Potansiyel müşteri önceliği"
                    options={[
                      { value: "COLD", label: "Soğuk" },
                      { value: "WARM", label: "Ilık" },
                      { value: "HOT", label: "Sıcak" },
                    ]}
                  />
                </Field>
                <Field label="Potansiyel müşteri puanı (0–100)">
                  <TextInput type="number" min="0" max="100" value={leadForm.leadScore} onChange={(e) => setLeadForm({ ...leadForm, leadScore: e.target.value })} />
                </Field>
                <Field label="Ekip">
                  <TextInput value={leadForm.team} onChange={(e) => setLeadForm({ ...leadForm, team: e.target.value })} placeholder="Örn. Merkez satış" />
                </Field>
                <Field label="Sorumlu">
                  <ValooSelect
                    value={leadForm.ownerUserId}
                    onChange={(ownerUserId) => setLeadForm({ ...leadForm, ownerUserId })}
                    placeholder="Oluşturan kullanıcı"
                    searchPlaceholder="Sorumlu ara…"
                    options={assignees.map((person) => ({
                      value: person.id,
                      label: `${person.firstName} ${person.lastName}`,
                    }))}
                  />
                </Field>
              </FormGrid>
              <div className="mt-4">
                <Field label="İlgi / ihtiyaç notu">
                  <TextArea rows={4} value={leadForm.interestNote} onChange={(e) => setLeadForm({ ...leadForm, interestNote: e.target.value })} placeholder="Görüşmede öğrenilen ihtiyaç, itiraz veya önemli not…" />
                </Field>
              </div>
            </FormSection>
          ) : null}

          <FormActions sticky>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (leadStep === 0) setCreateOpen(false);
                else setLeadStep((step) => step - 1);
              }}
              disabled={saving}
            >
              {leadStep === 0 ? "Vazgeç" : "Geri"}
            </Button>
            {leadStep < 2 ? (
              <Button
                type="button"
                onClick={() => {
                  if (leadStep === 0 && (!leadForm.firstName.trim() || !leadForm.lastName.trim() || (!leadForm.phone.trim() && !leadForm.alternativePhone.trim() && !leadForm.email.trim()))) {
                    setFormError("Ad, soyad ve en az bir iletişim bilgisi gereklidir.");
                    return;
                  }
                  setFormError("");
                  setLeadStep((step) => step + 1);
                }}
              >
                Devam
              </Button>
            ) : (
              <Button type="submit" disabled={saving}>
                {saving ? "Kaydediliyor..." : "Potansiyel Müşteri Oluştur"}
              </Button>
            )}
          </FormActions>
        </form>
      </Modal>

      {quickServiceName !== null ? (
        <MasterDataQuickCreate
          open
          kind="service"
          initialName={quickServiceName}
          onClose={() => setQuickServiceName(null)}
          onCreated={(entity) => {
            const created = {
              id: entity.id,
              name: entity.name ?? quickServiceName,
              price: entity.price ?? 0,
              durationMinutes: entity.durationMinutes ?? 60,
              status: (entity.status ?? "ACTIVE") as Service["status"],
            } as Service;
            setServices((current) => [
              ...current.filter((item) => item.id !== created.id),
              created,
            ]);
            setLeadForm((current) => ({
              ...current,
              interestedServiceIds: Array.from(
                new Set([...current.interestedServiceIds, created.id]),
              ),
            }));
            setQuickServiceName(null);
          }}
        />
      ) : null}

      <Modal
        open={Boolean(qualifying)}
        onClose={() => setQualifying(null)}
        title="Satış Fırsatı Oluştur"
        description="Müşteriyi satış fırsatına dönüştürerek satış sürecine ekleyin."
      >
        <form onSubmit={qualifyLead} className="space-y-4">
          {formError ? <Alert>{formError}</Alert> : null}
          <Field label="Satış Fırsatı Başlığı" required>
            <TextInput
              value={opportunityForm.title}
              onChange={(e) =>
                setOpportunityForm({
                  ...opportunityForm,
                  title: e.target.value,
                })
              }
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tahmini Değer">
              <TextInput
                type="number"
                min="0"
                value={opportunityForm.estimatedValue}
                onChange={(e) =>
                  setOpportunityForm({
                    ...opportunityForm,
                    estimatedValue: e.target.value,
                  })
                }
              />
            </Field>
            <Field label="Olasılık (%)">
              <TextInput
                type="number"
                min="0"
                max="100"
                value={opportunityForm.probability}
                onChange={(e) =>
                  setOpportunityForm({
                    ...opportunityForm,
                    probability: e.target.value,
                  })
                }
              />
            </Field>
          </div>
          <Field label="Beklenen Kapanış">
            <DatePicker
              value={opportunityForm.expectedCloseDate}
              min={new Date().toISOString().slice(0, 10)}
              ariaLabel="Beklenen kapanış tarihi"
              onChange={(expectedCloseDate) =>
                setOpportunityForm({
                  ...opportunityForm,
                  expectedCloseDate,
                })
              }
            />
          </Field>
          <Field label="Satış Fırsatı Sorumlusu">
            <Select
              value={opportunityForm.ownerUserId}
              onChange={(e) =>
                setOpportunityForm({
                  ...opportunityForm,
                  ownerUserId: e.target.value,
                })
              }
            >
              <option value="">Potansiyel Müşteri Sorumlusunu Kullan</option>
              {assignees.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.firstName} {person.lastName}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setQualifying(null)}
              disabled={saving}
            >
              Vazgeç
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Dönüştürülüyor..." : "Satış Sürecine Ekle"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}


function LeadSummaryCard({label,value,detail,active,onClick,tone="neutral"}:{label:string;value:number;detail:string;active:boolean;onClick:()=>void;tone?:"neutral"|"warning"}){
  return <button type="button" onClick={onClick} className={`rounded-[18px] border bg-[var(--surface)] p-4 text-left shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 ${active?"border-[var(--accent)] ring-2 ring-[var(--accent-soft)]":"border-[var(--line)] hover:border-[var(--line-strong)]"}`}>
    <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-medium text-[var(--muted)]">{label}</span><span className={`h-2 w-2 rounded-full ${tone==="warning"?"bg-[var(--warning)]":"bg-[var(--accent)]"}`}/></div>
    <strong className="mt-3 block text-[24px] leading-none tracking-[-.04em] text-[var(--ink)]">{value}</strong>
    <span className="mt-2 block text-[9px] leading-4 text-[var(--muted)]">{detail}</span>
  </button>;
}
