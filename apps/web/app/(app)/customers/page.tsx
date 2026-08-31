"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog, Modal } from "@/components/modal";
import {
  Alert,
  Button,
  EmptyState,
  Field,
  PageHeader,
  Pagination,
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

const sourceLabels: Record<CustomerSource, string> = {
  INSTAGRAM: "Instagram",
  GOOGLE: "Google",
  REFERRAL: "Tavsiye",
  WALK_IN: "Doğrudan",
  OTHER: "Diğer",
};

function hasHealthData(form: HealthFormState) {
  return Object.values(form).some((value) => value.trim().length > 0);
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

function toCreatePayload(
  form: FormState,
  consents: ConsentState,
  healthForm: HealthFormState,
) {
  const healthDataPresent = hasHealthData(healthForm);

  return {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    ...(optionalText(form.phone) ? { phone: form.phone.trim() } : {}),
    ...(optionalText(form.email) ? { email: form.email.trim() } : {}),
    ...(form.birthDate ? { birthDate: form.birthDate } : {}),
    ...(form.customerSource ? { customerSource: form.customerSource } : {}),
    consents,
    ...(healthDataPresent
      ? {
          healthProfile: {
            allergies: optionalText(healthForm.allergies) ? healthForm.allergies.trim() : undefined,
            sensitivities: optionalText(healthForm.sensitivities) ? healthForm.sensitivities.trim() : undefined,
            medications: optionalText(healthForm.medications) ? healthForm.medications.trim() : undefined,
            conditions: optionalText(healthForm.conditions) ? healthForm.conditions.trim() : undefined,
            notes: optionalText(healthForm.notes) ? healthForm.notes.trim() : undefined,
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
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [listFilter, setListFilter] = useState<"all" | "recent">("all");

  const [form, setForm] = useState<FormState>(emptyForm);
  const [consents, setConsents] = useState<ConsentState>(emptyConsents);
  const [healthForm, setHealthForm] = useState<HealthFormState>(emptyHealthForm);
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
      setTotalCustomers(result.meta.total || 0);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Müşteriler yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180);
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
      birthDate: view.birthDate ? view.birthDate.slice(0, 10) : "",
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
    setFormError("");
    return true;
  }

  function validateConsents() {
    if (!consents.kvkkAcknowledgement) {
      setFormError("KVKK Aydınlatma Metni bilgilendirmesi tamamlanmalıdır.");
      return false;
    }
    if (!consents.membershipAgreement) {
      setFormError("Üyelik Sözleşmesi kabul edilmelidir.");
      return false;
    }
    const healthDataPresent = hasHealthData(healthForm);
    if (healthDataPresent && !consents.healthFormCompletion) {
      setFormError("Sağlık bilgi formu için doğruluk beyanı tamamlanmalıdır.");
      return false;
    }
    if (healthDataPresent && !consents.healthDataConsent) {
      setFormError("Sağlık verilerinin işlenmesi için açık rıza gereklidir.");
      return false;
    }
    setFormError("");
    return true;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

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
        await api<Customer>(`/customers/${editing.id}`, {
          method: "PATCH",
          body: {
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            ...(optionalText(form.phone) ? { phone: form.phone.trim() } : { phone: null }),
            ...(optionalText(form.email) ? { email: form.email.trim().toLowerCase() } : { email: null }),
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
      setFormError(err instanceof ApiError ? err.message : "Müşteri kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!canDeleteCustomer || !pendingDelete) return;
    setSaving(true);
    setError("");
    try {
      await api(`/customers/${pendingDelete.id}`, { method: "DELETE" });
      setPendingDelete(null);
      showToast("Müşteri silindi.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Müşteri silinemedi.");
      setPendingDelete(null);
    } finally {
      setSaving(false);
    }
  }

  const recentCustomers = useMemo(() => {
    if (listFilter === "all") return customers;
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return customers.filter((customer) => new Date(customer.createdAt).getTime() >= cutoff);
  }, [customers, listFilter]);

  const newThisPage = useMemo(
    () => customers.filter((customer) => Date.now() - new Date(customer.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000).length,
    [customers],
  );
  const withPhone = useMemo(() => customers.filter((customer) => Boolean(customer.phone)).length, [customers]);
  const withEmail = useMemo(() => customers.filter((customer) => Boolean(customer.email)).length, [customers]);

  return (
    <div className="mx-auto w-full max-w-[1320px] space-y-6 pb-10">
      <PageHeader
        title="Müşteriler"
        description="Müşteri ilişkilerinizi ve müşteri geçmişinizi yönetin."
        action={
          <Button onClick={openCreate} disabled={!canCreateCustomer}>
            + Yeni müşteri
          </Button>
        }
      />

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Toplam müşteri" value={totalCustomers} detail="kayıtlı müşteri" tone="neutral" />
        <MetricCard label="Yeni müşteri" value={newThisPage} detail="son 7 gün · bu sayfa" tone="blue" />
        <MetricCard label="Telefon bilgisi" value={withPhone} detail="bu sayfadaki kayıtlar" tone="green" />
        <MetricCard label="E-posta bilgisi" value={withEmail} detail="bu sayfadaki kayıtlar" tone="peach" />
      </section>

      <section className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_10px_30px_rgba(28,25,23,0.045)]">
        <div className="border-b border-[var(--line)] px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[18px] text-[var(--muted-soft)]">⌕</span>
              <TextInput
                value={search}
                onChange={(event) => handleSearch(event.target.value)}
                placeholder="Müşteri, telefon veya e-posta ara..."
                aria-label="Müşteri, telefon veya e-posta ara"
                className="h-11 w-full rounded-[14px] bg-[var(--surface-2)]/45 pl-11 pr-4 text-[13px] shadow-none"
              />
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" className="inline-flex h-11 items-center rounded-[14px] border border-[var(--line)] px-4 text-[12px] font-medium text-[var(--muted)] hover:bg-[var(--surface-2)]">Filtrele</button>
              <button type="button" className="inline-flex h-11 items-center rounded-[14px] border border-[var(--line)] px-4 text-[12px] font-medium text-[var(--muted)] hover:bg-[var(--surface-2)]">Sırala</button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {[
              ["all", "Tümü"],
              ["recent", "Son eklenen"],
            ].map(([key, label]) => {
              const active = listFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setListFilter(key as "all" | "recent")}
                  className={[
                    "h-8 rounded-full px-3.5 text-[11px] font-medium transition-colors",
                    active
                      ? "bg-[var(--ink)] text-white"
                      : "border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--surface-2)]",
                  ].join(" ")}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <Spinner label="Müşteriler yükleniyor..." />
        ) : recentCustomers.length === 0 ? (
          <EmptyState
            title={search.trim() ? "Eşleşen müşteri yok" : "Henüz müşteri yok"}
            description={search.trim() ? "Arama kriterinizi değiştirerek tekrar deneyin." : "Yeni müşteri ekleyerek başlayın."}
          />
        ) : (
          <>
            <div className="hidden md:block">
              <TableWrap>
                <colgroup>
                  <col className="w-[31%]" />
                  <col className="w-[27%]" />
                  <col className="w-[16%]" />
                  <col className="w-[15%]" />
                  <col className="w-[11%]" />
                </colgroup>
                <thead className="border-b border-[var(--line)] bg-[var(--surface-2)]/35">
                  <tr>
                    <Th>Müşteri</Th>
                    <Th>İletişim</Th>
                    <Th>Kaynak</Th>
                    <Th>Kayıt</Th>
                    <Th><span className="block text-right">İşlem</span></Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {recentCustomers.map((customer) => (
                    <tr key={customer.id} className="group transition-colors hover:bg-black/[0.018]">
                      <Td label="Müşteri">
                        <Link href={`/customers/${customer.id}`} className="flex min-w-0 items-center gap-3.5">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[11px] font-semibold text-[var(--accent)]">{initials(customer)}</span>
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-semibold text-[var(--ink)]">{customer.firstName} {customer.lastName}</span>
                            <span className="mt-1 block truncate text-[11px] text-[var(--muted)]">Müşteri profili</span>
                          </span>
                        </Link>
                      </Td>
                      <Td label="İletişim">
                        <div className="min-w-0">
                          <p className="truncate text-[12px] text-[var(--ink)]">{customer.phone ?? "Telefon yok"}</p>
                          <p className="mt-1 truncate text-[11px] text-[var(--muted)]">{customer.email ?? "E-posta yok"}</p>
                        </div>
                      </Td>
                      <Td label="Kaynak">
                        {customer.customerSource ? (
                          <span className="inline-flex rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[10px] font-medium text-[var(--muted)]">{sourceLabels[customer.customerSource]}</span>
                        ) : <span className="text-[12px] text-[var(--muted-soft)]">—</span>}
                      </Td>
                      <Td label="Kayıt"><span className="text-[12px] text-[var(--muted)]">{formatDate(customer.createdAt)}</span></Td>
                      <Td label="İşlem" actions>
                        <div className="flex items-center justify-end gap-1 opacity-80 transition-opacity group-hover:opacity-100">
                          <Link href={`/customers/${customer.id}`} className="inline-flex h-8 items-center rounded-[10px] px-2.5 text-[11px] font-medium text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]">Detay</Link>
                          {canUpdateCustomer ? <Button variant="ghost" className="h-8 px-2.5 text-[11px]" onClick={() => openEdit(customer)}>Düzenle</Button> : null}
                          {canDeleteCustomer ? <Button variant="danger" className="h-8 px-2.5 text-[11px]" onClick={() => setPendingDelete(customer)}>Sil</Button> : null}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </div>

            <div className="divide-y divide-[var(--line)] md:hidden">
              {recentCustomers.map((customer) => (
                <Link key={customer.id} href={`/customers/${customer.id}`} className="block px-5 py-4 active:bg-[var(--surface-2)]">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[11px] font-semibold text-[var(--accent)]">{initials(customer)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-[13px] font-semibold text-[var(--ink)]">{customer.firstName} {customer.lastName}</p>
                        <span className="text-[18px] text-[var(--muted-soft)]">›</span>
                      </div>
                      <p className="mt-1 truncate text-[11px] text-[var(--muted)]">{customer.phone ?? customer.email ?? "İletişim bilgisi yok"}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            <div className="border-t border-[var(--line)]">
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[0_10px_30px_rgba(28,25,23,0.04)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">Müşteri deneyimi</p>
          <h2 className="mt-2 text-[17px] font-semibold text-[var(--ink)]">Müşteri kaydından profile geçiş</h2>
          <p className="mt-2 max-w-2xl text-[12px] leading-5 text-[var(--muted)]">Bir müşteriye tıkladığınızda randevu geçmişi, ödemeler, sağlık bilgileri ve bakım kayıtları tek ekranda devam eder. Böylece liste operasyonel, detay sayfası ise müşteri geçmişinin merkezi olur.</p>
        </section>
        <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[0_10px_30px_rgba(28,25,23,0.04)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">Hızlı işlem</p>
              <h2 className="mt-2 text-[17px] font-semibold text-[var(--ink)]">Yeni müşteri oluştur</h2>
              <p className="mt-2 text-[12px] leading-5 text-[var(--muted)]">Yeni müşteri akışı bu sayfadan açılır; kullanıcıyı Müşteriler listesine geri göndermek yerine form kartı açılır.</p>
            </div>
            <button type="button" onClick={openCreate} disabled={!canCreateCustomer} className="shrink-0 rounded-full border border-[var(--line)] px-3 py-2 text-[11px] font-medium text-[var(--muted)] hover:bg-[var(--surface-2)]">+ Aç</button>
          </div>
        </section>
      </div>

      <Modal open={modalOpen} onClose={closeModal} title={editing ? "Müşteriyi düzenle" : "Yeni müşteri"} description={editing ? "Müşteri bilgilerini güncelleyin." : "Müşteri kaydını birkaç sade adımda tamamlayın."}>
        <form onSubmit={onSubmit} className="flex max-h-[72vh] flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
            <div className="space-y-5 pb-2">
              {!editing ? (
                <div className="grid grid-cols-3 gap-1.5 rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)]/45 p-1">
                  {[[1, "Temel bilgiler"], [2, "KVKK & izinler"], [3, "Tamamla"]].map(([step, label]) => {
                    const numericStep = step as 1 | 2 | 3;
                    const active = formStep === numericStep;
                    const enabled = numericStep <= formStep;
                    return (
                      <button key={step} type="button" disabled={!enabled} onClick={() => setFormStep(numericStep)} className={["rounded-[12px] px-2 py-2.5 text-[10px] font-medium", active ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm" : "text-[var(--muted)]", !enabled ? "opacity-50" : ""].join(" ")}>{String(step).padStart(2, "0")} · {label}</button>
                    );
                  })}
                </div>
              ) : null}

              {editing || formStep === 1 ? (
                <section className="space-y-4">
                  <div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">Temel bilgiler</p><p className="mt-1 text-[12px] text-[var(--muted)]">Profil için gerekli temel iletişim bilgileri.</p></div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Ad"><TextInput required value={form.firstName} onChange={(e) => setForm((v) => ({ ...v, firstName: e.target.value }))} /></Field>
                    <Field label="Soyad"><TextInput required value={form.lastName} onChange={(e) => setForm((v) => ({ ...v, lastName: e.target.value }))} /></Field>
                    <Field label="Telefon"><TextInput value={form.phone} onChange={(e) => setForm((v) => ({ ...v, phone: e.target.value }))} /></Field>
                    <Field label="E-posta"><TextInput type="email" value={form.email} onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))} /></Field>
                    <Field label="Doğum tarihi"><TextInput type="date" value={form.birthDate} onChange={(e) => setForm((v) => ({ ...v, birthDate: e.target.value }))} /></Field>
                    <Field label="Müşteri kaynağı"><select value={form.customerSource} onChange={(e) => setForm((v) => ({ ...v, customerSource: e.target.value as CustomerSource | "" }))} className="h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"><option value="">Seçin</option><option value="INSTAGRAM">Instagram</option><option value="GOOGLE">Google</option><option value="REFERRAL">Tavsiye</option><option value="WALK_IN">Doğrudan</option><option value="OTHER">Diğer</option></select></Field>
                  </div>
                  {formError ? <Alert>{formError}</Alert> : null}
                  <div className="flex justify-end pt-1">{editing ? <><Button type="button" variant="secondary" onClick={closeModal} disabled={saving}>Vazgeç</Button><div className="ml-3"><Button type="submit" disabled={saving}>{saving ? "Kaydediliyor..." : "Değişiklikleri kaydet"}</Button></div></> : <Button type="submit">Devam et</Button>}</div>
                </section>
              ) : null}

              {!editing && formStep === 2 ? (
                <section className="space-y-4">
                  <div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">KVKK ve izinler</p><p className="mt-1 text-[12px] text-[var(--muted)]">Yasal onayları ve isteğe bağlı sağlık bilgilerini kaydedin.</p></div>
                  <ConsentCard title="KVKK Aydınlatma" description="Kişisel verilerin işlenmesi hakkında bilgilendirme."><label className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={consents.kvkkAcknowledgement} onChange={(e) => setConsents((v) => ({ ...v, kvkkAcknowledgement: e.target.checked }))} className="h-4 w-4 accent-[var(--accent)]" /> Bilgilendirildim.</label></ConsentCard>
                  <ConsentCard title="Açık Rıza" description="Açık rıza gerektiren veri işleme faaliyetleri."><div className="flex gap-4 text-[12px]"><label className="flex items-center gap-2"><input type="radio" name="explicitConsent" checked={consents.explicitConsent} onChange={() => setConsents((v) => ({ ...v, explicitConsent: true }))} className="accent-[var(--accent)]" /> Rıza veriyorum</label><label className="flex items-center gap-2"><input type="radio" name="explicitConsent" checked={!consents.explicitConsent} onChange={() => setConsents((v) => ({ ...v, explicitConsent: false }))} className="accent-[var(--accent)]" /> Rıza vermiyorum</label></div></ConsentCard>
                  <ConsentCard title="Üyelik Sözleşmesi" description="Üyelik şartları ve salon hizmet koşulları."><label className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={consents.membershipAgreement} onChange={(e) => setConsents((v) => ({ ...v, membershipAgreement: e.target.checked }))} className="h-4 w-4 accent-[var(--accent)]" /> Sözleşmeyi okudum ve kabul ediyorum.</label></ConsentCard>
                  <ConsentCard title="Sağlık Bilgi Formu" description="Hizmet güvenliği için gerekli sağlık bilgileri."><div className="grid gap-3 sm:grid-cols-2"><Field label="Alerji / hassasiyet"><TextInput value={healthForm.allergies} onChange={(e) => setHealthForm((v) => ({ ...v, allergies: e.target.value }))} /></Field><Field label="Cilt hassasiyetleri"><TextInput value={healthForm.sensitivities} onChange={(e) => setHealthForm((v) => ({ ...v, sensitivities: e.target.value }))} /></Field><Field label="Kullanılan ilaçlar"><TextInput value={healthForm.medications} onChange={(e) => setHealthForm((v) => ({ ...v, medications: e.target.value }))} /></Field><Field label="Bilinen sağlık bilgileri"><TextInput value={healthForm.conditions} onChange={(e) => setHealthForm((v) => ({ ...v, conditions: e.target.value }))} /></Field><div className="sm:col-span-2"><Field label="Ek not"><TextInput value={healthForm.notes} onChange={(e) => setHealthForm((v) => ({ ...v, notes: e.target.value }))} /></Field></div></div><div className="mt-4 space-y-3"><label className="flex items-start gap-2 text-[12px]"><input type="checkbox" checked={consents.healthFormCompletion} onChange={(e) => setConsents((v) => ({ ...v, healthFormCompletion: e.target.checked }))} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" /><span>Bilgilerin doğru ve güncel olduğunu beyan ediyorum.</span></label><label className="flex items-start gap-2 text-[12px]"><input type="checkbox" checked={consents.healthDataConsent} onChange={(e) => setConsents((v) => ({ ...v, healthDataConsent: e.target.checked }))} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" /><span>Sağlık verilerimin işlenmesine ilişkin açık rıza veriyorum.</span></label></div></ConsentCard>
                  <ConsentCard title="İletişim tercihleri"><div className="flex flex-wrap gap-5 text-[12px]"><label className="flex items-center gap-2"><input type="checkbox" checked={consents.marketingSms} onChange={(e) => setConsents((v) => ({ ...v, marketingSms: e.target.checked }))} className="h-4 w-4 accent-[var(--accent)]" /> SMS</label><label className="flex items-center gap-2"><input type="checkbox" checked={consents.marketingEmail} onChange={(e) => setConsents((v) => ({ ...v, marketingEmail: e.target.checked }))} className="h-4 w-4 accent-[var(--accent)]" /> E-posta</label><label className="flex items-center gap-2"><input type="checkbox" checked={consents.marketingPhone} onChange={(e) => setConsents((v) => ({ ...v, marketingPhone: e.target.checked }))} className="h-4 w-4 accent-[var(--accent)]" /> Telefon</label></div></ConsentCard>
                  {formError ? <Alert>{formError}</Alert> : null}
                  <div className="flex items-center justify-between"><Button type="button" variant="secondary" onClick={() => { setFormError(""); setFormStep(1); }}>Geri</Button><Button type="submit">Özeti gör</Button></div>
                </section>
              ) : null}

              {!editing && formStep === 3 ? (
                <section className="space-y-4">
                  <div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">Kaydı tamamla</p><p className="mt-1 text-[12px] text-[var(--muted)]">Kaydı göndermeden önce son kontrol.</p></div>
                  <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface-2)]/35 p-4"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[12px] font-semibold text-[var(--accent)]">{form.firstName.charAt(0)}{form.lastName.charAt(0)}</span><div><p className="text-[14px] font-semibold">{form.firstName} {form.lastName}</p><p className="mt-0.5 text-[11px] text-[var(--muted)]">{form.phone || form.email || "İletişim bilgisi eklenmedi"}</p></div></div></div>
                  <div className="space-y-2">{[["KVKK Aydınlatma", consents.kvkkAcknowledgement], ["Açık Rıza", consents.explicitConsent], ["Üyelik Sözleşmesi", consents.membershipAgreement], ["Sağlık Formu", consents.healthFormCompletion], ["Sağlık Verisi Rızası", consents.healthDataConsent]].map(([label, complete]) => <div key={String(label)} className="flex items-center justify-between rounded-[14px] border border-[var(--line)] px-4 py-3"><span className="text-[12px]">{label}</span><span className={complete ? "text-[11px] font-semibold text-[var(--accent)]" : "text-[11px] text-[var(--muted-soft)]"}>{complete ? "Tamamlandı" : "Seçilmedi"}</span></div>)}</div>
                  {formError ? <Alert>{formError}</Alert> : null}
                  <div className="flex items-center justify-between"><Button type="button" variant="secondary" onClick={() => { setFormError(""); setFormStep(2); }} disabled={saving}>Geri</Button><Button type="submit" disabled={saving}>{saving ? "Kaydediliyor..." : "Müşteriyi kaydet"}</Button></div>
                </section>
              ) : null}
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={Boolean(pendingDelete)} title="Müşteriyi sil" description="Bu müşteri kalıcı olarak silinecek. Devam edilsin mi?" loading={saving} onClose={() => setPendingDelete(null)} onConfirm={() => void onDelete()} />
    </div>
  );
}

function MetricCard({ label, value, detail, tone }: { label: string; value: number; detail: string; tone: "neutral" | "blue" | "green" | "peach" }) {
  const toneClass = { neutral: "bg-[var(--surface-2)]/55", blue: "bg-[#eef6fb]", green: "bg-[#eef8f1]", peach: "bg-[#fbf2e8]" }[tone];
  return <article className="min-w-0 rounded-[17px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_6px_18px_rgba(28,25,23,0.035)]"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[10px] font-medium text-[var(--muted)]">{label}</p><p className="mt-2 text-[23px] font-semibold tracking-[-0.03em] text-[var(--ink)]">{value.toLocaleString("tr-TR")}</p></div><span className={["mt-0.5 h-7 w-7 shrink-0 rounded-[9px]", toneClass].join(" ")} /></div><p className="mt-2 truncate text-[10px] text-[var(--muted-soft)]">{detail}</p></article>;
}

function ConsentCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <div className="rounded-[17px] border border-[var(--line)] bg-[var(--surface-2)]/30 p-4"><p className="text-[13px] font-semibold text-[var(--ink)]">{title}</p>{description ? <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">{description}</p> : null}<div className="mt-3">{children}</div></div>;
}
