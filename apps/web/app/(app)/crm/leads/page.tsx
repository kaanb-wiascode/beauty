"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import {
  leadSourceLabels,
  leadStatusLabels,
  type CrmAssignee,
  type CrmLead,
  type LeadStatus,
} from "@/lib/crm-types";

const emptyLead = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  source: "MANUAL",
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
          ? requestError.message
          : "Potansiyel Müşteri Listesi Yüklenemedi.",
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
    void api<CrmAssignee[]>("/crm/assignees")
      .then(setAssignees)
      .catch((requestError) =>
        setError(
          requestError instanceof ApiError
            ? requestError.message
            : "Müşteri İlişkileri Sorumluları Yüklenemedi.",
        ),
      );
  }, []);

  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get("new") === "1" &&
      canManage
    )
      setCreateOpen(true);
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

  async function createLead(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    if (
      !leadForm.firstName.trim() ||
      !leadForm.lastName.trim() ||
      (!leadForm.phone.trim() && !leadForm.email.trim())
    ) {
      setFormError("Ad, Soyad Ve En Az Bir İletişim Bilgisi Gereklidir.");
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
          ...(leadForm.email.trim() ? { email: leadForm.email.trim() } : {}),
          ...(leadForm.interestNote.trim()
            ? { interestNote: leadForm.interestNote.trim() }
            : {}),
          ...(leadForm.ownerUserId
            ? { ownerUserId: leadForm.ownerUserId }
            : {}),
        },
      });
      setCreateOpen(false);
      setLeadForm(emptyLead);
      showToast("Potansiyel Müşteri Oluşturuldu.", "success");
      await load();
    } catch (requestError) {
      setFormError(
        requestError instanceof ApiError
          ? requestError.message
          : "Potansiyel Müşteri Oluşturulamadı.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function qualifyLead(event: FormEvent) {
    event.preventDefault();
    if (!qualifying) return;
    setFormError("");
    if (!opportunityForm.title.trim()) {
      setFormError("Satış Fırsatı Başlığı Gereklidir.");
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
      showToast("Potansiyel Müşteri Satış Fırsatına Dönüştürüldü.", "success");
      await load();
    } catch (requestError) {
      setFormError(
        requestError instanceof ApiError
          ? requestError.message
          : "Potansiyel Müşteri Nitelendirilemedi.",
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
                setFormError("");
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
            <span className="text-[10px] text-[var(--muted)]">{label}</span>
            <strong className="ml-3 text-[20px]">{value}</strong>
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
                className="grid gap-3 px-4 py-4 transition-colors hover:bg-[#fbfaff] md:grid-cols-[minmax(220px,1.3fr)_minmax(150px,1fr)_130px_120px_auto] md:items-center"
              >
                <Link
                  href={`/crm/leads/${lead.id}`}
                  className="flex min-w-0 items-center gap-3"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eee9ff] text-[11px] font-bold text-[#7052df]">
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
                <span className="w-fit rounded-full bg-[#f1edff] px-2.5 py-1 text-[10px] font-semibold text-[#7052df]">
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
                    className="text-[11px] font-semibold text-[#7052df]"
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
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Yeni Potansiyel Müşteri"
        description="Müşteri Adayının Temel İletişim Ve İlgi Bilgilerini Kaydedin."
      >
        <form onSubmit={createLead} className="space-y-4">
          {formError ? <Alert>{formError}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ad" required>
              <TextInput
                value={leadForm.firstName}
                onChange={(e) =>
                  setLeadForm({ ...leadForm, firstName: e.target.value })
                }
              />
            </Field>
            <Field label="Soyad" required>
              <TextInput
                value={leadForm.lastName}
                onChange={(e) =>
                  setLeadForm({ ...leadForm, lastName: e.target.value })
                }
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Telefon">
              <TextInput
                value={leadForm.phone}
                onChange={(e) =>
                  setLeadForm({ ...leadForm, phone: e.target.value })
                }
              />
            </Field>
            <Field label="E-Posta">
              <TextInput
                type="email"
                value={leadForm.email}
                onChange={(e) =>
                  setLeadForm({ ...leadForm, email: e.target.value })
                }
              />
            </Field>
          </div>
          <Field label="Kaynak">
            <Select
              value={leadForm.source}
              onChange={(e) =>
                setLeadForm({ ...leadForm, source: e.target.value })
              }
            >
              {Object.entries(leadSourceLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sorumlu">
            <Select
              value={leadForm.ownerUserId}
              onChange={(e) =>
                setLeadForm({ ...leadForm, ownerUserId: e.target.value })
              }
            >
              <option value="">Oluşturan Kullanıcı</option>
              {assignees.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.firstName} {person.lastName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="İlgi / İhtiyaç Notu">
            <TextArea
              rows={3}
              value={leadForm.interestNote}
              onChange={(e) =>
                setLeadForm({ ...leadForm, interestNote: e.target.value })
              }
            />
          </Field>
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setCreateOpen(false)}
              disabled={saving}
            >
              Vazgeç
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Kaydediliyor..." : "Potansiyel Müşteri Oluştur"}
            </Button>
          </div>
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
            <TextInput
              type="date"
              value={opportunityForm.expectedCloseDate}
              onChange={(e) =>
                setOpportunityForm({
                  ...opportunityForm,
                  expectedCloseDate: e.target.value,
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
