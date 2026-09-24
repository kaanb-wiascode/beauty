"use client";

import Link from "next/link";
import { Select, FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { CustomerSearchPicker } from "@/components/customer-search-picker";
import { Alert, Button, Field, GlassCard, PageHeader, Spinner, TextInput } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";

type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
};

type Assignee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
};

type Opportunity = {
  id: string;
  title: string;
  stage: string;
  estimatedValue: string | number | null;
  currency: string;
  probability: number;
  expectedCloseDate: string | null;
  ownerUserId: string | null;
  version: number;
};

type FormState = {
  title: string;
  estimatedValue: string;
  currency: string;
  probability: string;
  expectedCloseDate: string;
  ownerUserId: string;
};

function fullName(customer: Pick<Customer, "firstName" | "lastName">) {
  return `${customer.firstName} ${customer.lastName}`.trim();
}

export default function NewCustomerOpportunityPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCustomerId = searchParams.get("customerId") ?? "";
  const canManageCrm = hasPermission("crm", "manage");

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<FormState>({
    title: "",
    estimatedValue: "",
    currency: "TRY",
    probability: "25",
    expectedCloseDate: "",
    ownerUserId: "",
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError("");
        const assigneePromise = api<Assignee[]>("/crm/assignees");
        if (initialCustomerId) {
          const [customerResult, assigneeResult] = await Promise.all([
            api<Customer>(`/customers/${initialCustomerId}`),
            assigneePromise,
          ]);
          if (cancelled) return;
          setCustomer(customerResult);
          setAssignees(assigneeResult);
          setForm((current) => ({
            ...current,
            title: current.title || `${fullName(customerResult)} - Satış fırsatı`,
          }));
          return;
        }
        const assigneeResult = await assigneePromise;
        if (!cancelled) setAssignees(assigneeResult);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Fırsat formu hazırlanamadı.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [initialCustomerId]);

  const customerDescription = useMemo(() => {
    if (!customer) return "Müşteriyi ad, telefon veya e-posta ile arayıp CRM satış fırsatı oluşturun.";
    const contact = customer.phone || customer.email;
    return contact ? `${fullName(customer)} · ${contact}` : fullName(customer);
  }, [customer]);

  function chooseCustomer(next: Customer | null) {
    setCustomer(next);
    setError("");
    if (next) {
      setForm((current) => ({
        ...current,
        title: `${fullName(next)} - Satış fırsatı`,
      }));
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!customer || !canManageCrm) return;
    if (!form.title.trim()) {
      setError("Fırsat başlığı gereklidir.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const opportunity = await api<Opportunity>("/crm/opportunities", {
        method: "POST",
        body: {
          customerId: customer.id,
          title: form.title.trim(),
          ...(form.estimatedValue ? { estimatedValue: Number(form.estimatedValue) } : {}),
          currency: form.currency.trim().toUpperCase(),
          probability: Number(form.probability),
          ...(form.expectedCloseDate ? { expectedCloseDate: form.expectedCloseDate } : {}),
          ...(form.ownerUserId ? { ownerUserId: form.ownerUserId } : {}),
        },
      });
      router.push(`/crm/opportunities/${opportunity.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Satış fırsatı oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Yeni satış fırsatı" />
        <div className="mt-10"><Spinner label="Müşteri ve CRM bilgileri hazırlanıyor..." /></div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Yeni satış fırsatı"
        description={customerDescription}
        action={customer ? <Link href={`/customers/${customer.id}`}><Button variant="secondary">Müşteriye dön</Button></Link> : <Link href="/crm"><Button variant="secondary">CRM&apos;e dön</Button></Link>}
      />

      {!canManageCrm ? <Alert>Satış fırsatı oluşturmak için CRM yönetim yetkisi gereklidir.</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}

      {canManageCrm ? (
        <GlassCard>
          <form onSubmit={submit} className="space-y-5">
            {!initialCustomerId ? (
              <Field label="Müşteri">
                <CustomerSearchPicker selected={customer} disabled={saving} onSelect={chooseCustomer} />
              </Field>
            ) : null}

            {customer ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Field label="Fırsat başlığı">
                      <TextInput
                        required
                        maxLength={200}
                        value={form.title}
                        onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                        placeholder="Örn. Premium cilt bakım paketi"
                      />
                    </Field>
                  </div>

                  <Field label="Tahmini değer">
                    <TextInput
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.estimatedValue}
                      onChange={(event) => setForm((current) => ({ ...current, estimatedValue: event.target.value }))}
                      placeholder="0,00"
                    />
                  </Field>

                  <Field label="Para birimi">
                    <TextInput
                      required
                      maxLength={3}
                      value={form.currency}
                      onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
                    />
                  </Field>

                  <Field label="Kazanma olasılığı (%)">
                    <TextInput
                      required
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={form.probability}
                      onChange={(event) => setForm((current) => ({ ...current, probability: event.target.value }))}
                    />
                  </Field>

                  <Field label="Beklenen kapanış tarihi">
                    <TextInput
                      type="date"
                      value={form.expectedCloseDate}
                      onChange={(event) => setForm((current) => ({ ...current, expectedCloseDate: event.target.value }))}
                    />
                  </Field>

                  <div className="sm:col-span-2">
                    <Field label="Fırsat sahibi">
                      <Select
                        value={form.ownerUserId}
                        onChange={(event) => setForm((current) => ({ ...current, ownerUserId: event.target.value }))}
                        className="h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
                      >
                        <option value="">Oluşturan kullanıcı</option>
                        {assignees.map((assignee) => (
                          <option key={assignee.id} value={assignee.id}>
                            {assignee.firstName} {assignee.lastName} · {assignee.email}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                </div>

                <div className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)]/35 px-4 py-3">
                  <p className="text-[11px] leading-5 text-[var(--muted)]">
                    Fırsat CRM Pipeline&apos;da QUALIFIED aşamasında açılır. Aşama ilerlemeleri mevcut optimistic version ve yetki kontrolleri üzerinden yönetilir.
                  </p>
                </div>

                <div className="flex flex-col-reverse gap-2 border-t border-[var(--line)] pt-4 sm:flex-row sm:justify-end">
                  <Link href={customer ? `/customers/${customer.id}` : "/crm"}><Button type="button" variant="secondary" disabled={saving}>Vazgeç</Button></Link>
                  <Button type="submit" disabled={saving}>{saving ? "Oluşturuluyor..." : "Fırsatı oluştur"}</Button>
                </div>
              </>
            ) : (
              <p className="rounded-[16px] border border-dashed border-[var(--line)] px-4 py-5 text-[12px] text-[var(--muted)]">Devam etmek için en az iki karakterle müşteri arayın ve bir kayıt seçin.</p>
            )}
          </form>
        </GlassCard>
      ) : null}
    </div>
  );
}
