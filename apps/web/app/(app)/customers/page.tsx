"use client";

import Link from "next/link";
import {
  FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  DataView,
  DataViewMeta,
  DataViewToolbar,
  FilterChip,
  SearchField,
} from "@/components/data-view";
import { CheckboxField, FormActions, FormGrid, FormHint, FormSection, FormStepper } from "@/components/form-system";
import { ConfirmDialog, Modal } from "@/components/modal";
import {
  Alert,
  Button,
  EmptyState,
  Field,
  Pagination,
  Spinner,
  TableWrap,
  Td,
  TextInput,
  Th,
} from "@/components/ui";
import { DatePicker } from "@/components/date-picker";
import { useToast } from "@/components/toast";
import { ValooSelect } from "@/components/valoo-controls";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasActiveBranch, hasPermission } from "@/lib/auth";
import { optionalText } from "@/lib/format";
import type { Customer } from "@/lib/types";
import { userErrorMessage } from "@/lib/user-language";

type CustomerSource =
  | "INSTAGRAM"
  | "GOOGLE"
  | "REFERRAL"
  | "WALK_IN"
  | "OTHER";

type CustomerView = Customer & {
  birthDate?: string | null;
  customerSource?: CustomerSource | null;
};

type CustomerListSegment = "ALL" | "RECENT" | "UPCOMING" | "NEEDS_ATTENTION";

type CustomerListItem = CustomerView & {
  summary: {
    totalAppointments: number;
    completedAppointments: number;
    lastVisitAt: string | null;
    nextAppointmentAt: string | null;
    netSpent: number;
    openCareEventCount: number;
    criticalCareEventCount: number;
    nextCareFollowUpAt: string | null;
  };
};

type CustomerListSummary = {
  totalCustomers: number;
  newCustomersLast7Days: number;
  customersWithUpcomingAppointments: number;
  customersNeedingAttention: number;
};

type CustomerListResponse = {
  data: CustomerListItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    summary: CustomerListSummary;
  };
};

type FormState = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  birthDate: string;
  customerSource: CustomerSource | "";
};

type ConsentState = {
  kvkkAcknowledgement: boolean;
  explicitConsent: boolean;
  membershipAgreement: boolean;
  healthFormCompletion: boolean;
  healthDataConsent: boolean;
  marketingSms: boolean;
  marketingEmail: boolean;
  marketingPhone: boolean;
};

type HealthFormState = {
  allergies: string;
  sensitivities: string;
  medications: string;
  conditions: string;
  notes: string;
};

const emptyForm: FormState = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  birthDate: "",
  customerSource: "",
};

const emptyConsents: ConsentState = {
  kvkkAcknowledgement: false,
  explicitConsent: false,
  membershipAgreement: false,
  healthFormCompletion: false,
  healthDataConsent: false,
  marketingSms: false,
  marketingEmail: false,
  marketingPhone: false,
};

const emptyHealthForm: HealthFormState = {
  allergies: "",
  sensitivities: "",
  medications: "",
  conditions: "",
  notes: "",
};

const sourceLabels: Record<CustomerSource, string> = {
  INSTAGRAM: "Instagram",
  GOOGLE: "Google",
  REFERRAL: "Tavsiye",
  WALK_IN: "Doğrudan",
  OTHER: "Diğer",
};

function hasHealthData(form: HealthFormState) {
  return Object.values(form).some(
    (value) => value.trim().length > 0,
  );
}

function initials(customer: Customer) {
  return `${customer.firstName.charAt(0)}${customer.lastName.charAt(0)}`.toUpperCase();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(value);
}

function toCreatePayload(
  form: FormState,
  consents: ConsentState,
  healthForm: HealthFormState,
) {
  const healthDataPresent = hasHealthData(healthForm);

  return {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    ...(optionalText(form.phone)
      ? { phone: form.phone.trim() }
      : {}),
    ...(optionalText(form.email)
      ? { email: form.email.trim() }
      : {}),
    ...(form.birthDate
      ? { birthDate: form.birthDate }
      : {}),
    ...(form.customerSource
      ? { customerSource: form.customerSource }
      : {}),
    consents,
    ...(healthDataPresent
      ? {
          healthProfile: {
            allergies: optionalText(
              healthForm.allergies,
            )
              ? healthForm.allergies.trim()
              : undefined,
            sensitivities: optionalText(
              healthForm.sensitivities,
            )
              ? healthForm.sensitivities.trim()
              : undefined,
            medications: optionalText(
              healthForm.medications,
            )
              ? healthForm.medications.trim()
              : undefined,
            conditions: optionalText(
              healthForm.conditions,
            )
              ? healthForm.conditions.trim()
              : undefined,
            notes: optionalText(healthForm.notes)
              ? healthForm.notes.trim()
              : undefined,
          },
        }
      : {}),
  };
}

export default function CustomersPage() {
  const canCreateCustomer = hasPermission(
    "customers",
    "create",
  );
  const canUpdateCustomer = hasPermission(
    "customers",
    "update",
  );
  const canDeleteCustomer = hasPermission(
    "customers",
    "delete",
  );
  const canManageCrm = hasPermission("crm", "manage");
  const { showToast } = useToast();

  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [duplicateCustomer, setDuplicateCustomer] = useState<Customer | null>(null);
  const [segment, setSegment] = useState<CustomerListSegment>("ALL");
  const [summary, setSummary] = useState<CustomerListSummary>({
    totalCustomers: 0,
    newCustomersLast7Days: 0,
    customersWithUpcomingAppointments: 0,
    customersNeedingAttention: 0,
  });
  const [form, setForm] = useState<FormState>(emptyForm);
  const [consents, setConsents] =
    useState<ConsentState>(emptyConsents);
  const [healthForm, setHealthForm] =
    useState<HealthFormState>(emptyHealthForm);
  const [formStep, setFormStep] = useState<1 | 2 | 3>(1);
  const [editing, setEditing] =
    useState<CustomerView | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingDelete, setPendingDelete] =
    useState<Customer | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await api<CustomerListResponse>(
        withQuery("/customers", {
          page,
          limit: 20,
          search: search.trim() || undefined,
          segment,
        }),
      );

      setCustomers(result.data);
      setTotalPages(result.meta.totalPages || 1);
      setTotalCustomers(result.meta.total || 0);
      setSummary(result.meta.summary);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? userErrorMessage(err.message, "Müşteriler yüklenemedi.")
          : "Müşteriler yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }, [page, search, segment]);

  useEffect(() => {
    const timer = window.setTimeout(
      () => void load(),
      180,
    );

    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!modalOpen || editing || (!form.phone.trim() && !form.email.trim())) {
      setDuplicateCustomer(null);
      return;
    }

    const timer = window.setTimeout(() => {
      const needle = form.phone.trim() || form.email.trim();
      void api<CustomerListResponse>(
        withQuery("/customers", { page: 1, limit: 10, search: needle }),
      )
        .then((result) => {
          const phone = form.phone.replace(/\D/g, "");
          const email = form.email.trim().toLocaleLowerCase("tr-TR");
          const duplicate =
            result.data.find((customer) => {
              const candidatePhone = (customer.phone ?? "").replace(/\D/g, "");
              const candidateEmail = (customer.email ?? "")
                .trim()
                .toLocaleLowerCase("tr-TR");
              return Boolean(
                (phone && candidatePhone === phone) ||
                  (email && candidateEmail === email),
              );
            }) ?? null;
          setDuplicateCustomer(duplicate);
        })
        .catch(() => setDuplicateCustomer(null));
    }, 300);

    return () => window.clearTimeout(timer);
  }, [editing, form.email, form.phone, modalOpen]);

  function handleSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleSegment(value: CustomerListSegment) {
    setSegment(value);
    setPage(1);
  }

  function closeModal() {
    if (saving) return;

    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setConsents(emptyConsents);
    setHealthForm(emptyHealthForm);
    setFormStep(1);
    setFormError("");
    setDuplicateCustomer(null);
  }

  function openCreate() {
    if (!canCreateCustomer) return;
    if (!hasActiveBranch()) {
      showToast(
        "Yeni Müşteri Oluşturmak İçin Önce Çalışma Kapsamından Bir Şube Seçin.",
        "error",
      );
      return;
    }

    setEditing(null);
    setForm(emptyForm);
    setConsents(emptyConsents);
    setHealthForm(emptyHealthForm);
    setFormStep(1);
    setFormError("");
    setDuplicateCustomer(null);
    setModalOpen(true);
  }

  function openEdit(customer: Customer) {
    if (!canUpdateCustomer) return;

    const view = customer as CustomerView;

    setEditing(view);
    setForm({
      firstName: view.firstName,
      lastName: view.lastName,
      phone: view.phone ?? "",
      email: view.email ?? "",
      birthDate: view.birthDate
        ? view.birthDate.slice(0, 10)
        : "",
      customerSource: view.customerSource ?? "",
    });
    setConsents(emptyConsents);
    setHealthForm(emptyHealthForm);
    setFormStep(1);
    setFormError("");
    setModalOpen(true);
  }

  function validateStep1() {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setFormError("Ad ve soyad gerekli.");
      return false;
    }

    if (!form.phone.trim() && !form.email.trim()) {
      setFormError("Telefon veya e-posta bilgilerinden en az biri gereklidir.");
      return false;
    }

    setFormError("");
    return true;
  }

  function validateConsents() {
    if (!consents.kvkkAcknowledgement) {
      setFormError(
        "KVKK Aydınlatma Metni bilgilendirmesi tamamlanmalıdır.",
      );
      return false;
    }

    if (!consents.membershipAgreement) {
      setFormError(
        "Üyelik Sözleşmesi kabul edilmelidir.",
      );
      return false;
    }

    const healthDataPresent = hasHealthData(healthForm);

    if (
      healthDataPresent &&
      !consents.healthFormCompletion
    ) {
      setFormError(
        "Sağlık bilgi formu için doğruluk beyanı tamamlanmalıdır.",
      );
      return false;
    }

    if (
      healthDataPresent &&
      !consents.healthDataConsent
    ) {
      setFormError(
        "Sağlık verilerinin işlenmesi için açık rıza gereklidir.",
      );
      return false;
    }

    setFormError("");
    return true;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    if (!editing && !hasActiveBranch()) {
      setFormError(
        "Yeni Müşteri Oluşturmak İçin Önce Çalışma Kapsamından Bir Şube Seçin.",
      );
      return;
    }

    if (!editing) {
      if (formStep === 1) {
        if (!validateStep1()) return;
        setFormStep(2);
        return;
      }

      if (formStep === 2) {
        if (!validateConsents()) return;
        setFormStep(3);
        return;
      }
    }

    if (!validateStep1()) {
      setFormStep(1);
      return;
    }

    setSaving(true);
    setFormError("");
    setError("");

    try {
      if (editing) {
        await api<Customer>(
          `/customers/${editing.id}`,
          {
            method: "PATCH",
            body: {
              firstName: form.firstName.trim(),
              lastName: form.lastName.trim(),
              ...(optionalText(form.phone)
                ? { phone: form.phone.trim() }
                : { phone: null }),
              ...(optionalText(form.email)
                ? {
                    email: form.email
                      .trim()
                      .toLowerCase(),
                  }
                : { email: null }),
              birthDate: form.birthDate || null,
              customerSource:
                form.customerSource || null,
            },
          },
        );

        showToast("Müşteri güncellendi.");
      } else {
        await api<Customer>("/customers", {
          method: "POST",
          body: toCreatePayload(
            form,
            consents,
            healthForm,
          ),
        });

        showToast("Müşteri başarıyla oluşturuldu.");
      }

      closeModal();
      await load();
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? userErrorMessage(err.message, "Müşteri kaydedilemedi.")
          : "Müşteri kaydedilemedi.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!canDeleteCustomer || !pendingDelete) return;

    setSaving(true);
    setError("");

    try {
      await api(`/customers/${pendingDelete.id}`, {
        method: "DELETE",
      });

      setPendingDelete(null);
      showToast("Müşteri silindi.");
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? userErrorMessage(err.message, "Müşteri silinemedi.")
          : "Müşteri silinemedi.",
      );
      setPendingDelete(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1420px] space-y-5 pb-10">
      <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[12px] font-medium text-[var(--muted)]">Müşteri yönetimi</p>
            <h1 className="mt-1 text-[32px] font-semibold tracking-[-.045em] text-[var(--ink)]">Müşteri Merkezi</h1>
            <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--muted)]">
              Müşterileri yalnızca iletişim bilgileriyle değil; ziyaret, randevu, harcama ve takip durumlarıyla birlikte yönetin.
            </p>
          </div>
          <Button onClick={openCreate} disabled={!canCreateCustomer}>Yeni Müşteri</Button>
        </div>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CustomerSummaryCard
          label="Toplam Müşteri"
          value={summary.totalCustomers}
          detail="Aktif çalışma kapsamındaki tüm kayıtlar"
          active={segment === "ALL"}
          onClick={() => handleSegment("ALL")}
        />
        <CustomerSummaryCard
          label="Son 7 Günde Eklenen"
          value={summary.newCustomersLast7Days}
          detail="Yeni oluşturulan müşteri kayıtları"
          active={segment === "RECENT"}
          onClick={() => handleSegment("RECENT")}
        />
        <CustomerSummaryCard
          label="Yaklaşan Randevusu Var"
          value={summary.customersWithUpcomingAppointments}
          detail="Planlanmış veya onaylanmış randevusu bulunanlar"
          active={segment === "UPCOMING"}
          onClick={() => handleSegment("UPCOMING")}
        />
        <CustomerSummaryCard
          label="Dikkat Gerektiren"
          value={summary.customersNeedingAttention}
          detail="Açık bakım, şikâyet veya takip kaydı bulunanlar"
          active={segment === "NEEDS_ATTENTION"}
          onClick={() => handleSegment("NEEDS_ATTENTION")}
          alert={summary.customersNeedingAttention > 0}
        />
      </section>

      <DataView>
        <DataViewToolbar
          search={
            <SearchField
              value={search}
              onChange={(event) => handleSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  handleSearch("");
                  event.currentTarget.blur();
                }
              }}
              placeholder="Ad, telefon veya e-posta ile ara…"
              aria-label="Müşteri ara"
            />
          }
          filters={
            <>
              <FilterChip active={segment === "ALL"} onClick={() => handleSegment("ALL")} count={summary.totalCustomers}>Tümü</FilterChip>
              <FilterChip active={segment === "RECENT"} onClick={() => handleSegment("RECENT")} count={summary.newCustomersLast7Days}>Son 7 Gün</FilterChip>
              <FilterChip active={segment === "UPCOMING"} onClick={() => handleSegment("UPCOMING")} count={summary.customersWithUpcomingAppointments}>Yaklaşan Randevu</FilterChip>
              <FilterChip active={segment === "NEEDS_ATTENTION"} onClick={() => handleSegment("NEEDS_ATTENTION")} count={summary.customersNeedingAttention}>Dikkat Gerektiren</FilterChip>
            </>
          }
        />

        {loading ? (
          <Spinner label="Müşteriler hazırlanıyor..." />
        ) : customers.length === 0 ? (
          <EmptyState
            title={search.trim() ? "Eşleşen müşteri bulunamadı" : segment === "ALL" ? "Henüz müşteri bulunmuyor" : "Bu grupta müşteri bulunmuyor"}
            description={
              search.trim()
                ? "Arama ifadenizi değiştirerek tekrar deneyin."
                : segment === "RECENT"
                  ? "Son 7 günde yeni müşteri kaydı oluşturulmamış."
                  : segment === "UPCOMING"
                    ? "Yaklaşan randevusu bulunan müşteri yok."
                    : segment === "NEEDS_ATTENTION"
                      ? "Açık bakım veya takip kaydı bulunan müşteri yok."
                      : "Yeni müşteri ekleyerek başlayın."
            }
            action={canCreateCustomer && segment === "ALL" ? <Button onClick={openCreate}>Yeni Müşteri Ekle</Button> : undefined}
          />
        ) : (
          <>
            <div className="hidden lg:block">
              <TableWrap>
                <colgroup>
                  <col className="w-[26%]" />
                  <col className="w-[20%]" />
                  <col className="w-[13%]" />
                  <col className="w-[13%]" />
                  <col className="w-[15%]" />
                  <col className="w-[13%]" />
                </colgroup>
                <thead className="border-b border-[var(--line)] bg-[var(--surface-2)]/45">
                  <tr>
                    <Th>Müşteri</Th>
                    <Th>Ziyaret & Randevu</Th>
                    <Th>Randevu Geçmişi</Th>
                    <Th>Müşteri Değeri</Th>
                    <Th>Dikkat</Th>
                    <Th><span className="block text-right">İşlemler</span></Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {customers.map((customer) => (
                    <tr key={customer.id} className="group transition-colors hover:bg-[var(--surface-2)]/35">
                      <Td label="Müşteri">
                        <Link href={"/customers/" + customer.id} className="flex min-w-0 items-start gap-3">
                          <CustomerAvatar customer={customer} />
                          <span className="min-w-0">
                            <span className="block truncate text-[12px] font-semibold text-[var(--ink)]">
                              {customer.firstName} {customer.lastName}
                            </span>
                            <span className="mt-1 block truncate text-[9px] text-[var(--muted)]">
                              {customer.phone ?? customer.email ?? "İletişim bilgisi yok"}
                            </span>
                            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <SourceBadge customer={customer} />
                              <span className="text-[8px] text-[var(--muted-soft)]">Kayıt: {formatDate(customer.createdAt)}</span>
                            </span>
                          </span>
                        </Link>
                      </Td>

                      <Td label="Ziyaret & Randevu">
                        <div className="space-y-1.5">
                          <div>
                            <span className="block text-[8px] text-[var(--muted)]">Yaklaşan</span>
                            <strong className={customer.summary.nextAppointmentAt ? "mt-0.5 block text-[10px] font-semibold text-[var(--accent)]" : "mt-0.5 block text-[10px] font-medium text-[var(--muted-soft)]"}>
                              {customer.summary.nextAppointmentAt ? formatDateTime(customer.summary.nextAppointmentAt) : "Planlı randevu yok"}
                            </strong>
                          </div>
                          <div>
                            <span className="block text-[8px] text-[var(--muted)]">Son tamamlanan ziyaret</span>
                            <span className="mt-0.5 block text-[9px] text-[var(--ink)]">
                              {customer.summary.lastVisitAt ? formatDate(customer.summary.lastVisitAt) : "Henüz tamamlanmış ziyaret yok"}
                            </span>
                          </div>
                        </div>
                      </Td>

                      <Td label="Randevu Geçmişi">
                        <strong className="block text-[12px] text-[var(--ink)]">{customer.summary.completedAppointments}</strong>
                        <span className="mt-1 block text-[8px] text-[var(--muted)]">
                          {customer.summary.totalAppointments} toplam randevudan tamamlandı
                        </span>
                      </Td>

                      <Td label="Müşteri Değeri">
                        <strong className="block text-[12px] font-semibold text-[var(--ink)]">{formatMoney(customer.summary.netSpent)}</strong>
                        <span className="mt-1 block text-[8px] text-[var(--muted)]">Net tahsilat</span>
                      </Td>

                      <Td label="Dikkat">
                        {customer.summary.openCareEventCount ? (
                          <div>
                            <span className={customer.summary.criticalCareEventCount ? "inline-flex rounded-full bg-[var(--danger-soft)] px-2.5 py-1 text-[8px] font-semibold text-[var(--danger)]" : "inline-flex rounded-full bg-[var(--warning-soft)] px-2.5 py-1 text-[8px] font-semibold text-[var(--warning)]"}>
                              {customer.summary.openCareEventCount} açık kayıt
                            </span>
                            {customer.summary.nextCareFollowUpAt ? (
                              <span className="mt-1.5 block text-[8px] text-[var(--muted)]">Takip: {formatDateTime(customer.summary.nextCareFollowUpAt)}</span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="inline-flex rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[8px] font-semibold text-[var(--accent)]">Açık kayıt yok</span>
                        )}
                      </Td>

                      <Td label="İşlemler">
                        <CustomerRowActions
                          customer={customer}
                          canUpdate={canUpdateCustomer}
                          canDelete={canDeleteCustomer}
                          canManageCrm={canManageCrm}
                          onEdit={openEdit}
                          onDelete={setPendingDelete}
                        />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </div>

            <div className="divide-y divide-[var(--line)] lg:hidden">
              {customers.map((customer) => (
                <article key={customer.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <CustomerAvatar customer={customer} />
                    <div className="min-w-0 flex-1">
                      <Link href={"/customers/" + customer.id} className="block truncate text-[13px] font-semibold text-[var(--ink)]">
                        {customer.firstName} {customer.lastName}
                      </Link>
                      <p className="mt-1 truncate text-[10px] text-[var(--muted)]">{customer.phone ?? customer.email ?? "İletişim bilgisi yok"}</p>
                      <div className="mt-2"><SourceBadge customer={customer} /></div>
                    </div>
                    {customer.summary.openCareEventCount ? (
                      <span className={customer.summary.criticalCareEventCount ? "rounded-full bg-[var(--danger-soft)] px-2 py-1 text-[8px] font-semibold text-[var(--danger)]" : "rounded-full bg-[var(--warning-soft)] px-2 py-1 text-[8px] font-semibold text-[var(--warning)]"}>
                        {customer.summary.openCareEventCount} açık
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <CustomerMiniStat label="Yaklaşan Randevu" value={customer.summary.nextAppointmentAt ? formatDateTime(customer.summary.nextAppointmentAt) : "Yok"} />
                    <CustomerMiniStat label="Net Tahsilat" value={formatMoney(customer.summary.netSpent)} />
                    <CustomerMiniStat label="Son Ziyaret" value={customer.summary.lastVisitAt ? formatDate(customer.summary.lastVisitAt) : "Yok"} />
                    <CustomerMiniStat label="Tamamlanan / Toplam" value={String(customer.summary.completedAppointments) + " / " + String(customer.summary.totalAppointments)} />
                  </div>

                  <div className="mt-3 border-t border-[var(--line)] pt-3">
                    <CustomerRowActions
                      customer={customer}
                      canUpdate={canUpdateCustomer}
                      canDelete={canDeleteCustomer}
                      canManageCrm={canManageCrm}
                      onEdit={openEdit}
                      onDelete={setPendingDelete}
                    />
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        <DataViewMeta>
          <span>Bu görünümde {customers.length} kayıt</span>
          <span>
            {search.trim() || segment !== "ALL"
              ? "Filtre sonucu " + totalCustomers.toLocaleString("tr-TR") + " müşteri · Toplam " + summary.totalCustomers.toLocaleString("tr-TR")
              : "Toplam " + summary.totalCustomers.toLocaleString("tr-TR") + " müşteri"}
          </span>
        </DataViewMeta>
      </DataView>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      <CustomerModal
        open={modalOpen}
        editing={editing}
        form={form}
        setForm={setForm}
        consents={consents}
        setConsents={setConsents}
        healthForm={healthForm}
        setHealthForm={setHealthForm}
        formStep={formStep}
        setFormStep={setFormStep}
        error={formError}
        duplicateCustomer={duplicateCustomer}
        saving={saving}
        onClose={closeModal}
        onSubmit={onSubmit}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Müşteri Kaydı Silinsin mi?"
        description={
          pendingDelete
            ? pendingDelete.firstName + " " + pendingDelete.lastName + " kaydı kalıcı olarak silinecek. Randevu, ödeme veya bağlantılı kayıtlar nedeniyle silme işlemi engellenebilir."
            : ""
        }
        confirmLabel="Müşteriyi Sil"
        onCancel={() => setPendingDelete(null)}
        onConfirm={onDelete}
        loading={saving}
      />
    </div>
  );
}

function CustomerAvatar({ customer }: { customer: Customer }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[var(--accent-soft)] text-[11px] font-semibold text-[var(--accent)]">
      {initials(customer)}
    </span>
  );
}

function SourceBadge({ customer }: { customer: Customer }) {
  const source = (customer as CustomerView).customerSource;
  return (
    <span className="inline-flex rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[8px] font-medium text-[var(--muted)]">
      {source ? sourceLabels[source] : "Kaynak belirtilmedi"}
    </span>
  );
}

function CustomerSummaryCard({
  label,
  value,
  detail,
  active,
  alert,
  onClick,
}: {
  label: string;
  value: number;
  detail: string;
  active: boolean;
  alert?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active
        ? "rounded-[18px] border border-[var(--accent)] bg-[var(--accent-soft)] p-4 text-left shadow-[var(--shadow-soft)]"
        : "rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4 text-left shadow-[var(--shadow-soft)] transition hover:border-[var(--line-strong)]"}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[9px] font-medium text-[var(--muted)]">{label}</span>
        {alert && value > 0 ? <span className="rounded-full bg-[var(--danger-soft)] px-2 py-0.5 text-[7px] font-semibold text-[var(--danger)]">Kontrol</span> : null}
      </div>
      <strong className="mt-3 block text-[24px] font-semibold tracking-[-.04em] text-[var(--ink)]">{value.toLocaleString("tr-TR")}</strong>
      <span className="mt-2 block text-[8px] leading-4 text-[var(--muted)]">{detail}</span>
    </button>
  );
}

function CustomerMiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] bg-[var(--surface-2)] p-3">
      <span className="block text-[7px] text-[var(--muted)]">{label}</span>
      <strong className="mt-1 block text-[9px] font-semibold text-[var(--ink)]">{value}</strong>
    </div>
  );
}

function CustomerRowActions({
  customer,
  canUpdate,
  canDelete,
  canManageCrm,
  onEdit,
  onDelete,
}: {
  customer: CustomerListItem;
  canUpdate: boolean;
  canDelete: boolean;
  canManageCrm: boolean;
  onEdit: (customer: Customer) => void;
  onDelete: (customer: Customer) => void;
}) {
  const label = encodeURIComponent(customer.firstName + " " + customer.lastName);
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <Link
        href={"/customers/" + customer.id}
        className="inline-flex min-h-8 items-center justify-center rounded-[9px] border border-[var(--line)] px-2.5 text-[8px] font-semibold text-[var(--ink)] hover:bg-[var(--surface-2)]"
      >
        Profili Aç
      </Link>
      <Link
        href={"/appointments?customerId=" + customer.id}
        className="inline-flex min-h-8 items-center justify-center rounded-[9px] border border-[var(--line)] px-2.5 text-[8px] font-semibold text-[var(--ink)] hover:bg-[var(--surface-2)]"
      >
        Randevu
      </Link>
      <details className="relative">
        <summary className="flex min-h-8 cursor-pointer list-none items-center justify-center rounded-[9px] border border-[var(--line)] px-2.5 text-[10px] font-semibold text-[var(--muted)] hover:bg-[var(--surface-2)]">•••</summary>
        <div className="absolute right-0 z-40 mt-1 w-[190px] rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-1.5 shadow-[0_18px_48px_rgba(23,35,28,.14)]">
          {canManageCrm ? (
            <Link href={"/crm/interactions?new=1&customerId=" + customer.id + "&label=" + label} className="block rounded-[8px] px-3 py-2 text-[9px] font-medium text-[var(--ink)] hover:bg-[var(--surface-2)]">
              Görüşme Kaydet
            </Link>
          ) : null}
          {canUpdate ? (
            <button type="button" onClick={() => onEdit(customer)} className="block w-full rounded-[8px] px-3 py-2 text-left text-[9px] font-medium text-[var(--ink)] hover:bg-[var(--surface-2)]">
              Müşteriyi Düzenle
            </button>
          ) : null}
          {canDelete ? (
            <button type="button" onClick={() => onDelete(customer)} className="block w-full rounded-[8px] px-3 py-2 text-left text-[9px] font-medium text-[var(--danger)] hover:bg-[var(--danger-soft)]">
              Müşteriyi Sil
            </button>
          ) : null}
        </div>
      </details>
    </div>
  );
}

function CustomerModal({
  open,
  editing,
  form,
  setForm,
  consents,
  setConsents,
  healthForm,
  setHealthForm,
  formStep,
  setFormStep,
  error,
  duplicateCustomer,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean;
  editing: CustomerView | null;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  consents: ConsentState;
  setConsents: React.Dispatch<React.SetStateAction<ConsentState>>;
  healthForm: HealthFormState;
  setHealthForm: React.Dispatch<React.SetStateAction<HealthFormState>>;
  formStep: 1 | 2 | 3;
  setFormStep: React.Dispatch<React.SetStateAction<1 | 2 | 3>>;
  error: string;
  duplicateCustomer: Customer | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <Modal
      size="xl"
      open={open}
      onClose={onClose}
      title={editing ? "Müşteriyi düzenle" : "Yeni müşteri"}
      description={
        editing
          ? "Müşteri bilgilerini güncelleyin."
          : "Yeni müşteri kaydını adım adım tamamlayın."
      }
    >
      <form onSubmit={onSubmit} className="space-y-5">
        {!editing ? (
          <FormStepper
            current={formStep - 1}
            onStepChange={(index) => {
              const next = (index + 1) as 1 | 2 | 3;
              if (next <= formStep) setFormStep(next);
            }}
            steps={[
              { key: "info", label: "Bilgiler", description: "Kimlik ve iletişim" },
              { key: "consent", label: "Onaylar", description: "İzin ve tercihler" },
              { key: "health", label: "Sağlık", description: "Opsiyonel sağlık kaydı" },
            ]}
          />
        ) : null}

        {duplicateCustomer ? (
          <FormHint tone="warning" title="Mevcut müşteri kaydı bulundu">
            Aynı telefon veya e-posta ile {duplicateCustomer.firstName} {duplicateCustomer.lastName} adlı bir müşteri zaten kayıtlı. Yeni kayıt oluşturmadan önce mevcut profili kontrol edin.
          </FormHint>
        ) : null}

        {editing || formStep === 1 ? (
          <FormSection
            title="Kimlik ve iletişim"
            description="Müşterinin temel kimlik, iletişim ve kaynak bilgilerini tamamlayın."
          >
            <FormGrid>
              <Field label="Ad" required>
                <TextInput
                  required
                  value={form.firstName}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      firstName: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Soyad" required>
                <TextInput
                  required
                  value={form.lastName}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      lastName: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Telefon">
                <TextInput
                  value={form.phone}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      phone: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="E-posta">
                <TextInput
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      email: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Doğum tarihi">
                <DatePicker
                  value={form.birthDate}
                  max={new Date().toISOString().slice(0, 10)}
                  ariaLabel="Doğum tarihi"
                  onChange={(value) =>
                    setForm({
                      ...form,
                      birthDate: value,
                    })
                  }
                />
              </Field>
              <Field label="Müşteri kaynağı">
                <ValooSelect
                  value={form.customerSource}
                  onChange={(customerSource) =>
                    setForm({
                      ...form,
                      customerSource: customerSource as FormState["customerSource"],
                    })
                  }
                  searchable={false}
                  placeholder="Seçin"
                  options={Object.entries(sourceLabels).map(([value, label]) => ({
                    value,
                    label,
                  }))}
                />
              </Field>
            </FormGrid>
          </FormSection>
        ) : null}

        {!editing && formStep === 2 ? (
          <FormSection
            title="Onaylar ve iletişim tercihleri"
            description="Yasal bilgilendirmeleri ve müşterinin iletişim tercihlerini açık şekilde kaydedin."
          >
            <div className="grid gap-3 min-[760px]:grid-cols-2">
              <CheckboxField
                checked={consents.kvkkAcknowledgement}
                onChange={(checked) => setConsents({ ...consents, kvkkAcknowledgement: checked })}
                label="KVKK Aydınlatma Metni bilgilendirmesi tamamlandı"
                description="Müşteriye kişisel verilerin işlenmesine ilişkin bilgilendirme yapılmıştır."
              />
              <CheckboxField
                checked={consents.membershipAgreement}
                onChange={(checked) => setConsents({ ...consents, membershipAgreement: checked })}
                label="Üyelik Sözleşmesi kabul edildi"
              />
              <CheckboxField
                checked={consents.explicitConsent}
                onChange={(checked) => setConsents({ ...consents, explicitConsent: checked })}
                label="Açık rıza verildi"
                description="Zorunlu olmayan veri işleme faaliyetleri için müşterinin tercihini kaydeder."
              />
            </div>
            <div className="border-t border-[var(--line)] pt-4">
              <p className="mb-3 text-[11px] font-semibold text-[var(--ink)]">Pazarlama iletişim tercihleri</p>
              <div className="grid gap-2 min-[700px]:grid-cols-3">
                <CheckboxField checked={consents.marketingSms} onChange={(checked) => setConsents({ ...consents, marketingSms: checked })} label="SMS" />
                <CheckboxField checked={consents.marketingEmail} onChange={(checked) => setConsents({ ...consents, marketingEmail: checked })} label="E-posta" />
                <CheckboxField checked={consents.marketingPhone} onChange={(checked) => setConsents({ ...consents, marketingPhone: checked })} label="Telefon" />
              </div>
            </div>
          </FormSection>
        ) : null}

        {!editing && formStep === 3 ? (
          <FormSection
            title="Sağlık bilgileri"
            description="Yalnızca hizmet güvenliği ve müşteri deneyimi için gerekli sağlık bilgilerini kaydedin."
          >
            <FormGrid>
              <Field label="Alerjiler">
                <TextInput
                  value={healthForm.allergies}
                  onChange={(event) =>
                    setHealthForm({
                      ...healthForm,
                      allergies: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Hassasiyetler">
                <TextInput
                  value={healthForm.sensitivities}
                  onChange={(event) =>
                    setHealthForm({
                      ...healthForm,
                      sensitivities: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="İlaçlar">
                <TextInput
                  value={healthForm.medications}
                  onChange={(event) =>
                    setHealthForm({
                      ...healthForm,
                      medications: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Bilinen sağlık durumları">
                <TextInput
                  value={healthForm.conditions}
                  onChange={(event) =>
                    setHealthForm({
                      ...healthForm,
                      conditions: event.target.value,
                    })
                  }
                />
              </Field>
            </FormGrid>
            <Field label="Sağlık notları">
              <TextInput
                value={healthForm.notes}
                onChange={(event) =>
                  setHealthForm({
                    ...healthForm,
                    notes: event.target.value,
                  })
                }
              />
            </Field>

            {hasHealthData(healthForm) ? (
              <div className="grid gap-3 border-t border-[var(--line)] pt-4 min-[760px]:grid-cols-2">
                <CheckboxField
                  checked={consents.healthFormCompletion}
                  onChange={(checked) => setConsents({ ...consents, healthFormCompletion: checked })}
                  label="Sağlık bilgilerinin doğru olduğu beyan edildi"
                />
                <CheckboxField
                  checked={consents.healthDataConsent}
                  onChange={(checked) => setConsents({ ...consents, healthDataConsent: checked })}
                  label="Sağlık verilerinin işlenmesine açık rıza verildi"
                />
              </div>
            ) : null}
          </FormSection>
        ) : null}

        {error ? <Alert>{error}</Alert> : null}

        <FormActions sticky>
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={saving}
          >
            Vazgeç
          </Button>

          {!editing && formStep > 1 ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setFormStep((formStep - 1) as 1 | 2 | 3)
              }
              disabled={saving}
            >
              Geri
            </Button>
          ) : null}

          <Button type="submit" disabled={saving}>
            {saving
              ? "Kaydediliyor..."
              : editing || formStep === 3
                ? "Kaydet"
                : "Devam et"}
          </Button>
        </FormActions>
      </form>
    </Modal>
  );
}