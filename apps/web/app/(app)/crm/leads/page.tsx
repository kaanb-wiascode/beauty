"use client";

import Link from "next/link";
import { CardInfo } from "@/components/card-info";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { DatePicker } from "@/components/date-picker";
import { FormActions, FormGrid, FormHint, FormSection, FormStepper } from "@/components/form-system";
import { Modal } from "@/components/modal";
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
  const [services, setServices] = useState<Service[]>([]);
  const [leadStep, setLeadStep] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<LeadStatus | "ALL">("ALL");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [qualifying, setQualifying] = useState<CrmLead | null>(null);
  const [leadForm, setLeadForm] = useState(emptyLead);
  const [opportunityForm, setOpportunityForm] = useState(emptyOpportunity);

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
      api<Paginated<Service>>(withQuery("/services", { page: 1, limit: 100 })),
    ])
      .then(([people, serviceResult]) => {
        setAssignees(people);
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

  function requireActiveBranch(message: string) {
    if (hasActiveBranch()) return true;
    showToast(message, "error");
    return false;
  }

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
  }, [canManage]);

  const counts = useMemo(
    () => ({
      total: leads.length,
      actionable: leads.filter((lead) =>
        ["NEW", "CONTACTED"].includes(lead.status),
      ).length,
      qualified: leads.filter((lead) => lead.status === "QUALIFIED").length,
    }),
    [leads],
  );
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
      <PageHeader
        title="Potansiyel Müşteri Havuzu"
        description="Yeni Müşteri Adaylarını Kaydedin, Temas Durumunu İzleyin Ve Uygun Adayları Satış Fırsatına Dönüştürün."
        action={
          canManage ? (
            <Button
              onClick={() => {
                if (
                  !requireActiveBranch(
                    "Yeni potansiyel müşteri oluşturmak için önce çalışma kapsamından bir şube seçin.",
                  )
                ) {
                  return;
                }
                setFormError("");
                setLeadStep(0);
                setLeadForm(emptyLead);
                setCreateOpen(true);
              }}
            >
              + Yeni Potansiyel Müşteri
            </Button>
          ) : undefined
        }
      />
      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ["Görünen Potansiyel Müşteri", counts.total],
          ["İşlem Bekleyen", counts.actionable],
          ["Nitelikli", counts.qualified],
        ].map(([label, value]) => (
          <article
            key={String(label)}
            className="rounded-[18px] border border-[var(--line)] bg-white px-4 py-3 shadow-[var(--shadow-soft)]"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="text-[10px] text-[var(--muted)]">{label}</span>
              <CardInfo help={getCardHelp(String(label))} />
            </div>
            <strong className="mt-2 block text-[20px]">{value}</strong>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 border-b border-[var(--line)] p-4 sm:flex-row">
          <TextInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Ad, Telefon Veya E-Posta Ara"
            aria-label="Potansiyel Müşteri Ara"
            className="sm:max-w-sm"
          />
          <Select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as LeadStatus | "ALL")
            }
            aria-label="Duruma Göre Filtrele"
            className="sm:max-w-[210px]"
          >
            {statuses.map((item) => (
              <option key={item} value={item}>
                {item === "ALL" ? "Tüm Durumlar" : leadStatusLabels[item]}
              </option>
            ))}
          </Select>
          <Select
            value={ownerUserId}
            onChange={(event) => setOwnerUserId(event.target.value)}
            aria-label="Sorumluya Göre Filtrele"
            className="sm:max-w-[220px]"
          >
            <option value="">Tüm Sorumlular</option>
            {assignees.map((person) => (
              <option key={person.id} value={person.id}>
                {person.firstName} {person.lastName}
              </option>
            ))}
          </Select>
        </div>
        {loading ? (
          <Spinner label="Potansiyel Müşteriler Yükleniyor..." />
        ) : leads.length ? (
          <div className="divide-y divide-[var(--line)]">
            {leads.map((lead) => (
              <div
                key={lead.id}
                className="grid gap-3 px-4 py-4 transition-colors hover:bg-[#f8fcfd] md:grid-cols-[minmax(220px,1.3fr)_minmax(150px,1fr)_130px_120px_auto] md:items-center"
              >
                <Link
                  href={`/crm/leads/${lead.id}`}
                  className="flex min-w-0 items-center gap-3"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EAF5FB] text-[11px] font-bold text-[#1674BD]">
                    {initials(lead)}
                  </span>
                  <span className="min-w-0">
                    <strong className="block truncate text-[13px]">
                      {lead.firstName} {lead.lastName}
                    </strong>
                    <small className="mt-1 block truncate text-[10px] text-[var(--muted)]">
                      {lead.phone || lead.email}
                    </small>
                  </span>
                </Link>
                <span className="min-w-0 text-[11px] text-[var(--muted)]">
                  <span className="block truncate">
                    {leadSourceLabels[lead.source] ?? lead.source}
                  </span>
                  <small className="mt-1 block truncate text-[9px] text-[var(--muted-soft)]">
                    {lead.ownerUserId
                      ? (assigneeNames.get(lead.ownerUserId) ??
                        "Atanmış Kullanıcı")
                      : "Sorumlu Yok"}
                  </small>
                </span>
                <span className="w-fit rounded-full bg-[#EAF5FB] px-2.5 py-1 text-[10px] font-semibold text-[#1674BD]">
                  {leadStatusLabels[lead.status]}
                </span>
                <time className="text-[10px] text-[var(--muted)]">
                  {formatDate(lead.updatedAt)}
                </time>
                {canManage &&
                ["NEW", "CONTACTED"].includes(lead.status) &&
                !lead.opportunityId ? (
                  <Button
                    variant="secondary"
                    className="min-h-8 px-3 py-1.5 text-[11px]"
                    onClick={() => {
                      if (
                        !requireActiveBranch(
                          "Potansiyel Müşteriyi Nitelendirmek İçin Önce Çalışma Kapsamından Bir Şube Seçin.",
                        )
                      ) {
                        return;
                      }
                      setFormError("");
                      setOpportunityForm({
                        ...emptyOpportunity,
                        title: `${lead.firstName} ${lead.lastName} Satış Fırsatı`,
                      });
                      setQualifying(lead);
                    }}
                  >
                    Nitelendir
                  </Button>
                ) : (
                  <Link
                    href={`/crm/leads/${lead.id}`}
                    className="text-[11px] font-semibold text-[#1674BD]"
                  >
                    Detay →
                  </Link>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Potansiyel Müşteri Bulunamadı"
            description="Arama Ve Filtreleri Değiştirin Veya Yeni Bir Potansiyel Müşteri Oluşturun."
          />
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
                  options={services.map((service) => ({
                    value: service.id,
                    label: service.name,
                    description: `${service.durationMinutes} dk · ₺${Number(service.price).toLocaleString("tr-TR")}`,
                  }))}
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
            <FormSection title="Satış ve kaynak bilgileri" description="Lead'in kaynağını, sıcaklığını ve sorumlusunu belirleyin.">
              <FormGrid>
                <Field label="Kaynak">
                  <ValooSelect
                    value={leadForm.source}
                    onChange={(source) => setLeadForm({ ...leadForm, source })}
                    searchable={false}
                    options={Object.entries(leadSourceLabels).map(([value, label]) => ({ value, label }))}
                  />
                </Field>
                <Field label="Kaynak detayı">
                  <TextInput value={leadForm.sourceDetail} onChange={(e) => setLeadForm({ ...leadForm, sourceDetail: e.target.value })} placeholder="Kampanya, yönlendiren kişi veya kanal detayı" />
                </Field>
                <Field label="Lead sıcaklığı">
                  <ValooSegmentedControl
                    value={leadForm.leadTemperature}
                    onChange={(leadTemperature) => setLeadForm({ ...leadForm, leadTemperature })}
                    ariaLabel="Lead sıcaklığı"
                    options={[
                      { value: "COLD", label: "Soğuk" },
                      { value: "WARM", label: "Ilık" },
                      { value: "HOT", label: "Sıcak" },
                    ]}
                  />
                </Field>
                <Field label="Lead skoru (0–100)">
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

      <Modal
        open={Boolean(qualifying)}
        onClose={() => setQualifying(null)}
        title="Satış Fırsatı Oluştur"
        description="Potansiyel Müşteriyi Nitelikli Hale Getirip Satış Sürecine Ekleyin."
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
