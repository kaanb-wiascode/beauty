"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ConfirmDialog, Modal } from "@/components/modal";
import {
  Alert,
  Button,
  EmptyState,
  Field,
  PageHeader,
  Pagination,
  Panel,
  Spinner,
  TableWrap,
  Td,
  TextInput,
  Th,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { optionalText } from "@/lib/format";
import type { Customer, Paginated } from "@/lib/types";

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

function hasHealthData(form: HealthFormState) {
  return Object.values(form).some((value) => value.trim().length > 0);
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
    ...(form.birthDate ? { birthDate: form.birthDate } : {}),
    ...(form.customerSource
      ? { customerSource: form.customerSource }
      : {}),
    consents,
    ...(healthDataPresent
      ? {
          healthProfile: {
            allergies: optionalText(healthForm.allergies)
              ? healthForm.allergies.trim()
              : undefined,
            sensitivities: optionalText(healthForm.sensitivities)
              ? healthForm.sensitivities.trim()
              : undefined,
            medications: optionalText(healthForm.medications)
              ? healthForm.medications.trim()
              : undefined,
            conditions: optionalText(healthForm.conditions)
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
  const canCreateCustomer = hasPermission("customers", "create");
  const canUpdateCustomer = hasPermission("customers", "update");
  const canDeleteCustomer = hasPermission("customers", "delete");
  const { showToast } = useToast();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");

  const [form, setForm] = useState<FormState>(emptyForm);
  const [consents, setConsents] = useState<ConsentState>(emptyConsents);
  const [healthForm, setHealthForm] =
    useState<HealthFormState>(emptyHealthForm);

  const [formStep, setFormStep] = useState<1 | 2 | 3>(1);
  const [editing, setEditing] = useState<CustomerView | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Customer | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await api<Paginated<Customer>>(
        withQuery("/customers", {
          page,
          limit: 20,
          search: search.trim() || undefined,
        }),
      );

      setCustomers(result.data);
      setTotalPages(result.meta.totalPages || 1);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Müşteriler yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 180);

    return () => window.clearTimeout(timer);
  }, [load]);

  function handleSearch(value: string) {
    setSearch(value);
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
  }

  function openCreate() {
    if (!canCreateCustomer) return;

    setEditing(null);
    setForm(emptyForm);
    setConsents(emptyConsents);
    setHealthForm(emptyHealthForm);
    setFormStep(1);
    setFormError("");
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

  function validateCreateStep1() {
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();

    if (!firstName || !lastName) {
      setFormError("Ad ve soyad gerekli.");
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

    if (healthDataPresent && !consents.healthFormCompletion) {
      setFormError(
        "Sağlık bilgi formu için doğruluk beyanı tamamlanmalıdır.",
      );
      return false;
    }

    if (healthDataPresent && !consents.healthDataConsent) {
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

    if (!editing) {
      if (formStep === 1) {
        if (!validateCreateStep1()) return;

        setFormStep(2);
        return;
      }

      if (formStep === 2) {
        if (!validateConsents()) return;

        setFormStep(3);
        return;
      }
    }

    if (!validateCreateStep1()) {
      setFormStep(1);
      return;
    }

    setSaving(true);
    setFormError("");
    setError("");

    try {
      if (editing) {
        await api<Customer>(`/customers/${editing.id}`, {
          method: "PATCH",
          body: {
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            ...(optionalText(form.phone)
              ? { phone: form.phone.trim() }
              : { phone: null }),
            ...(optionalText(form.email)
              ? { email: form.email.trim().toLowerCase() }
              : { email: null }),
            birthDate: form.birthDate || null,
            customerSource: form.customerSource || null,
          },
        });

        showToast("Müşteri güncellendi.");
      } else {
        await api<Customer>("/customers", {
          method: "POST",
          body: toCreatePayload(form, consents, healthForm),
        });

        showToast("Müşteri başarıyla oluşturuldu.");
      }

      closeModal();
      await load();
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? err.message
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
          ? err.message
          : "Müşteri silinemedi.",
      );
      setPendingDelete(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <PageHeader
        title="Müşteriler"
        action={
          <Button
            onClick={openCreate}
            disabled={!canCreateCustomer}
          >
            + Yeni müşteri
          </Button>
        }
      />

      {error ? (
        <Alert onClose={() => setError("")}>{error}</Alert>
      ) : null}

      <Panel>
        <div className="mb-6 border-b border-[var(--line)] px-5 pb-6 pt-1 sm:px-7">
          <div className="mt-5 flex justify-center sm:justify-start">
            <div className="relative w-full sm:max-w-[560px]">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-[15px] text-[var(--muted-soft)]"
              >
                ⌕
              </span>

              <TextInput
                value={search}
                onChange={(event) =>
                  handleSearch(event.target.value)
                }
                placeholder="Müşteri, telefon veya e-posta ara..."
                aria-label="Müşteri, telefon veya e-posta ara"
                className="h-12 w-full rounded-full border border-[var(--line)] bg-[var(--surface)] pl-10 pr-5 text-[13px] shadow-[0_2px_8px_rgba(28,25,23,0.04)] placeholder:text-[var(--muted-soft)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <Spinner label="Müşteriler yükleniyor..." />
        ) : customers.length === 0 ? (
          <EmptyState
            title={
              search.trim()
                ? "Eşleşen müşteri yok"
                : "Henüz müşteri yok"
            }
            description={
              search.trim()
                ? "Arama kriterinizi değiştirerek tekrar deneyin."
                : "Yeni müşteri ekleyerek başlayın."
            }
          />
        ) : (
          <>
            <div className="md:hidden">
              <div className="divide-y divide-[var(--line)]">
                {customers.map((customer) => (
                  <Link
                    key={customer.id}
                    href={`/customers/${customer.id}`}
                    className="block px-5 py-5 transition-colors active:bg-[var(--surface-2)]"
                  >
                    <div className="flex items-start gap-3.5">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[11px] font-semibold text-[var(--accent)]">
                        {customer.firstName.charAt(0)}
                        {customer.lastName.charAt(0)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[14px] font-semibold text-[var(--ink)]">
                              {customer.firstName} {customer.lastName}
                            </p>
                            <p className="mt-1 text-[11px] text-[var(--muted)]">
                              Müşteri
                            </p>
                          </div>
                          <span className="shrink-0 text-[18px] leading-none text-[var(--muted-soft)]">
                            ›
                          </span>
                        </div>
                        <div className="mt-4 space-y-2.5">
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--muted-soft)]">
                              Telefon
                            </span>
                            <span className="truncate text-right text-[12px] text-[var(--ink)]">
                              {customer.phone ?? "Telefon yok"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--muted-soft)]">
                              E-posta
                            </span>
                            <span className="max-w-[62%] truncate text-right text-[12px] text-[var(--muted)]">
                              {customer.email ?? "E-posta yok"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4 border-t border-[var(--line)] pt-2.5">
                            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--muted-soft)]">
                              Kayıt
                            </span>
                            <span className="text-[12px] text-[var(--muted)]">
                              {new Intl.DateTimeFormat("tr-TR", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              }).format(new Date(customer.createdAt))}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            <div className="hidden md:block">
            <TableWrap>
              <colgroup>
                <col className="w-[38%]" />
                <col className="w-[27%]" />
                <col className="w-[15%]" />
                <col className="w-[20%]" />
              </colgroup>

              <thead className="border-b border-[var(--line)] bg-[var(--surface-2)]/45">
                <tr>
                  <Th>Müşteri</Th>
                  <Th>İletişim</Th>
                  <Th>Kayıt</Th>
                  <Th>
                    <span className="block text-center">
                      İşlemler
                    </span>
                  </Th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[var(--line)]">
                {customers.map((customer) => (
                  <tr
                    key={customer.id}
                    className="group transition-colors hover:bg-black/[0.018]"
                  >
                    <Td label="Müşteri">
                      <Link
                        href={`/customers/${customer.id}`}
                        className="flex min-w-0 items-center gap-3"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[10px] font-semibold text-[var(--accent)]">
                          {customer.firstName.charAt(0)}
                          {customer.lastName.charAt(0)}
                        </span>

                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold text-[var(--ink)]">
                            {customer.firstName} {customer.lastName}
                          </span>
                        </span>
                      </Link>
                    </Td>

                    <Td label="İletişim">
                      <div className="min-w-0">
                        <p className="truncate text-[12px] text-[var(--ink)]">
                          {customer.phone ?? "Telefon yok"}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">
                          {customer.email ?? "E-posta yok"}
                        </p>
                      </div>
                    </Td>

                    <Td label="Kayıt">
                      <span className="text-[12px] text-[var(--muted)]">
                        {new Intl.DateTimeFormat("tr-TR", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        }).format(new Date(customer.createdAt))}
                      </span>
                    </Td>

                    <Td label="İşlem" actions>
                      <div className="flex items-center justify-center gap-1.5 whitespace-nowrap max-md:w-full max-md:flex-wrap max-md:justify-end">
                        <Link
                          href={`/customers/${customer.id}`}
                          className="inline-flex h-9 items-center rounded-[12px] px-3 text-[12px] font-medium text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
                        >
                          Detay
                        </Link>

                        <Button
                          variant="ghost"
                          className="h-9 px-3 text-[12px]"
                          onClick={() => openEdit(customer)}
                        >
                          Düzenle
                        </Button>

                        <Button
                          variant="danger"
                          className="h-9 px-3 text-[12px]"
                          onClick={() =>
                            setPendingDelete(customer)
                          }
                        >
                          Sil
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </>
        )}
      </Panel>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={
          editing ? "Müşteriyi düzenle" : "Yeni müşteri"
        }
        description={
          editing
            ? "Müşteri bilgilerini güncelleyin."
            : "Müşteri kaydını birkaç sade adımda tamamlayın."
        }
      >
        <form
          onSubmit={onSubmit}
          className="flex max-h-[72vh] flex-col"
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
            <div className="space-y-5 pb-2">
          {!editing ? (
            <div className="grid grid-cols-3 gap-1.5 rounded-[18px] border border-[var(--line)] bg-[var(--surface-2)]/45 p-1">
              {[
                ["01", "Bilgiler"],
                ["02", "Belgeler & İzinler"],
                ["03", "Tamamla"],
              ].map(([number, label], index) => {
                const step = (index + 1) as 1 | 2 | 3;
                const active = formStep === step;
                const enabled = step <= formStep;

                return (
                  <button
                    key={number}
                    type="button"
                    disabled={!enabled}
                    onClick={() => setFormStep(step)}
                    className={[
                      "rounded-[14px] px-2.5 py-2.5 text-[11px] font-medium transition-[background-color,color,box-shadow] duration-150",
                      active
                        ? "bg-[var(--surface)] text-[var(--ink)] shadow-[0_2px_8px_rgba(28,25,23,0.06)]"
                        : "text-[var(--muted)]",
                      !enabled
                        ? "cursor-default opacity-55"
                        : "",
                    ].join(" ")}
                  >
                    <span className="mr-1.5 text-[10px] text-[var(--accent)]">
                      {number}
                    </span>
                    {label}
                  </button>
                );
              })}
            </div>
          ) : null}

          {editing || formStep === 1 ? (
            <section className="space-y-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
                  Temel bilgiler
                </p>
                <p className="mt-1 text-[12px] text-[var(--muted)]">
                  Müşteri profilinin temel bilgilerini doldurun.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Ad">
                  <TextInput
                    required
                    value={form.firstName}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        firstName: event.target.value,
                      }))
                    }
                  />
                </Field>

                <Field label="Soyad">
                  <TextInput
                    required
                    value={form.lastName}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        lastName: event.target.value,
                      }))
                    }
                  />
                </Field>

                <Field label="Telefon">
                  <TextInput
                    value={form.phone}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        phone: event.target.value,
                      }))
                    }
                  />
                </Field>

                <Field label="E-posta">
                  <TextInput
                    type="email"
                    value={form.email}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                  />
                </Field>

                <Field label="Doğum tarihi">
                  <TextInput
                    type="date"
                    value={form.birthDate}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        birthDate: event.target.value,
                      }))
                    }
                  />
                </Field>

                <Field label="Müşteri kaynağı">
                  <select
                    value={form.customerSource}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        customerSource:
                          event.target.value as CustomerSource | "",
                      }))
                    }
                    className="h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[13px] text-[var(--ink)] outline-none transition-[border-color,box-shadow] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
                  >
                    <option value="">Seçin</option>
                    <option value="INSTAGRAM">
                      Instagram
                    </option>
                    <option value="GOOGLE">Google</option>
                    <option value="REFERRAL">Tavsiye</option>
                    <option value="WALK_IN">
                      Doğrudan
                    </option>
                    <option value="OTHER">Diğer</option>
                  </select>
                </Field>
              </div>

              {formError ? <Alert>{formError}</Alert> : null}

              <div className="flex justify-end pt-1">
                {editing ? (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={closeModal}
                      disabled={saving}
                    >
                      Vazgeç
                    </Button>

                    <div className="ml-3">
                      <Button
                        type="submit"
                        disabled={saving}
                      >
                        {saving
                          ? "Kaydediliyor..."
                          : "Değişiklikleri kaydet"}
                      </Button>
                    </div>
                  </>
                ) : (
                  <Button type="submit">
                    Devam et
                  </Button>
                )}
              </div>
            </section>
          ) : null}

          {!editing && formStep === 2 ? (
            <section className="space-y-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
                  Belgeler ve izinler
                </p>
                <p className="mt-1 text-[12px] text-[var(--muted)]">
                  Her belge ve izin ayrı olarak kaydedilir.
                </p>
              </div>

              <div className="space-y-3">
                <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface-2)]/35 p-4">
                  <p className="text-[13px] font-semibold text-[var(--ink)]">
                    KVKK Aydınlatma
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">
                    Kişisel verilerin işlenmesi hakkında bilgilendirme.
                  </p>

                  <label className="mt-3 flex items-center gap-2 text-[12px] text-[var(--ink)]">
                    <input
                      type="checkbox"
                      checked={consents.kvkkAcknowledgement}
                      onChange={(event) =>
                        setConsents((current) => ({
                          ...current,
                          kvkkAcknowledgement:
                            event.target.checked,
                        }))
                      }
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    Bilgilendirildim.
                  </label>
                </div>

                <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface-2)]/35 p-4">
                  <p className="text-[13px] font-semibold text-[var(--ink)]">
                    Açık Rıza
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">
                    Açık rıza gerektiren veri işleme faaliyetleri.
                  </p>

                  <div className="mt-3 flex flex-wrap gap-4 text-[12px]">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="explicitConsent"
                        checked={consents.explicitConsent}
                        onChange={() =>
                          setConsents((current) => ({
                            ...current,
                            explicitConsent: true,
                          }))
                        }
                        className="accent-[var(--accent)]"
                      />
                      Rıza veriyorum
                    </label>

                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="explicitConsent"
                        checked={!consents.explicitConsent}
                        onChange={() =>
                          setConsents((current) => ({
                            ...current,
                            explicitConsent: false,
                          }))
                        }
                        className="accent-[var(--accent)]"
                      />
                      Rıza vermiyorum
                    </label>
                  </div>
                </div>

                <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface-2)]/35 p-4">
                  <p className="text-[13px] font-semibold text-[var(--ink)]">
                    Üyelik Sözleşmesi
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">
                    Üyelik şartları ve salon hizmet koşulları.
                  </p>

                  <label className="mt-3 flex items-center gap-2 text-[12px] text-[var(--ink)]">
                    <input
                      type="checkbox"
                      checked={consents.membershipAgreement}
                      onChange={(event) =>
                        setConsents((current) => ({
                          ...current,
                          membershipAgreement:
                            event.target.checked,
                        }))
                      }
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    Sözleşmeyi okudum ve kabul ediyorum.
                  </label>
                </div>

                <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface-2)]/35 p-4">
                  <div>
                    <p className="text-[13px] font-semibold text-[var(--ink)]">
                      Sağlık Bilgi Formu
                    </p>
                    <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">
                      Hizmet güvenliği için gerekli sağlık bilgileri.
                    </p>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Field label="Alerji / hassasiyet">
                      <TextInput
                        value={healthForm.allergies}
                        onChange={(event) =>
                          setHealthForm((current) => ({
                            ...current,
                            allergies: event.target.value,
                          }))
                        }
                      />
                    </Field>

                    <Field label="Cilt hassasiyetleri">
                      <TextInput
                        value={healthForm.sensitivities}
                        onChange={(event) =>
                          setHealthForm((current) => ({
                            ...current,
                            sensitivities: event.target.value,
                          }))
                        }
                      />
                    </Field>

                    <Field label="Kullanılan ilaçlar">
                      <TextInput
                        value={healthForm.medications}
                        onChange={(event) =>
                          setHealthForm((current) => ({
                            ...current,
                            medications: event.target.value,
                          }))
                        }
                      />
                    </Field>

                    <Field label="Bilinen sağlık bilgileri">
                      <TextInput
                        value={healthForm.conditions}
                        onChange={(event) =>
                          setHealthForm((current) => ({
                            ...current,
                            conditions: event.target.value,
                          }))
                        }
                      />
                    </Field>

                    <div className="sm:col-span-2">
                      <Field label="Ek not">
                        <TextInput
                          value={healthForm.notes}
                          onChange={(event) =>
                            setHealthForm((current) => ({
                              ...current,
                              notes: event.target.value,
                            }))
                          }
                        />
                      </Field>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    <label className="flex items-start gap-2 text-[12px] text-[var(--ink)]">
                      <input
                        type="checkbox"
                        checked={consents.healthFormCompletion}
                        onChange={(event) =>
                          setConsents((current) => ({
                            ...current,
                            healthFormCompletion:
                              event.target.checked,
                          }))
                        }
                        className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                      />
                      <span>
                        Bilgilerin doğru ve güncel olduğunu
                        beyan ediyorum.
                      </span>
                    </label>

                    <label className="flex items-start gap-2 text-[12px] text-[var(--ink)]">
                      <input
                        type="checkbox"
                        checked={consents.healthDataConsent}
                        onChange={(event) =>
                          setConsents((current) => ({
                            ...current,
                            healthDataConsent:
                              event.target.checked,
                          }))
                        }
                        className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                      />
                      <span>
                        Sağlık verilerimin işlenmesine ilişkin
                        açık rıza veriyorum.
                      </span>
                    </label>
                  </div>
                </div>

                <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface-2)]/35 p-4">
                  <p className="text-[13px] font-semibold text-[var(--ink)]">
                    İletişim tercihleri
                  </p>

                  <div className="mt-3 flex flex-wrap gap-5 text-[12px]">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={consents.marketingSms}
                        onChange={(event) =>
                          setConsents((current) => ({
                            ...current,
                            marketingSms:
                              event.target.checked,
                          }))
                        }
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                      SMS
                    </label>

                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={consents.marketingEmail}
                        onChange={(event) =>
                          setConsents((current) => ({
                            ...current,
                            marketingEmail:
                              event.target.checked,
                          }))
                        }
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                      E-posta
                    </label>

                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={consents.marketingPhone}
                        onChange={(event) =>
                          setConsents((current) => ({
                            ...current,
                            marketingPhone: event.target.checked,
                          }))
                        }
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                      Telefon
                    </label>
                  </div>
                </div>
              </div>

              {formError ? <Alert>{formError}</Alert> : null}

              <div className="flex items-center justify-between gap-3 pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setFormError("");
                    setFormStep(1);
                  }}
                  disabled={saving}
                >
                  Geri
                </Button>

                <Button type="submit" disabled={saving}>
                  Özeti gör
                </Button>
              </div>
            </section>
          ) : null}

          {!editing && formStep === 3 ? (
            <section className="space-y-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
                  Kaydı tamamla
                </p>
                <p className="mt-1 text-[12px] text-[var(--muted)]">
                  Kaydı göndermeden önce son kontrol.
                </p>
              </div>

              <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface-2)]/35 p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[12px] font-semibold text-[var(--accent)]">
                    {form.firstName.charAt(0)}
                    {form.lastName.charAt(0)}
                  </span>

                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-[var(--ink)]">
                      {form.firstName} {form.lastName}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">
                      {form.phone ||
                        form.email ||
                        "İletişim bilgisi eklenmedi"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {[
                  [
                    "KVKK Aydınlatma",
                    consents.kvkkAcknowledgement,
                  ],
                  [
                    "Açık Rıza",
                    consents.explicitConsent,
                  ],
                  [
                    "Üyelik Sözleşmesi",
                    consents.membershipAgreement,
                  ],
                  [
                    "Sağlık Formu",
                    consents.healthFormCompletion,
                  ],
                  [
                    "Sağlık Verisi Rızası",
                    consents.healthDataConsent,
                  ],
                ].map(([label, complete]) => (
                  <div
                    key={String(label)}
                    className="flex items-center justify-between rounded-[15px] border border-[var(--line)] px-4 py-3"
                  >
                    <span className="text-[12px] text-[var(--ink)]">
                      {label}
                    </span>
                    <span
                      className={[
                        "text-[11px] font-semibold",
                        complete
                          ? "text-[var(--accent)]"
                          : "text-[var(--muted-soft)]",
                      ].join(" ")}
                    >
                      {complete
                        ? "Tamamlandı"
                        : "Seçilmedi"}
                    </span>
                  </div>
                ))}
              </div>

              {formError ? <Alert>{formError}</Alert> : null}

              <div className="flex items-center justify-between gap-3 pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setFormError("");
                    setFormStep(2);
                  }}
                  disabled={saving}
                >
                  Geri
                </Button>

                <Button
                  type="submit"
                  disabled={saving}
                >
                  {saving
                    ? "Kaydediliyor..."
                    : "Müşteriyi kaydet"}
                </Button>
              </div>
            </section>
          ) : null}
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Müşteriyi sil"
        description="Bu müşteri kalıcı olarak silinecek. Devam edilsin mi?"
        loading={saving}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void onDelete()}
      />
    </div>
  );
}
