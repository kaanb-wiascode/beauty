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
import { optionalText } from "@/lib/format";
import type { CreateCustomerInput, Customer, Paginated } from "@/lib/types";

type FormState = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
};

const emptyForm: FormState = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
};

function toPayload(form: FormState): CreateCustomerInput {
  return {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    ...(optionalText(form.phone) ? { phone: form.phone.trim() } : {}),
    ...(optionalText(form.email) ? { email: form.email.trim() } : {}),
  };
}

export default function CustomersPage() {
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
  const [editing, setEditing] = useState<Customer | null>(null);
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

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormError("");
    setModalOpen(true);
  }

  function openEdit(customer: Customer) {
    setEditing(customer);
    setForm({
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone: customer.phone ?? "",
      email: customer.email ?? "",
    });
    setFormError("");
    setModalOpen(true);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();

    if (!firstName || !lastName) {
      setFormError("Ad ve soyad gerekli.");
      return;
    }

    setSaving(true);
    setFormError("");
    setError("");

    try {
      const payload = toPayload(form);

      if (editing) {
        await api<Customer>(`/customers/${editing.id}`, {
          method: "PATCH",
          body: payload,
        });
      } else {
        await api<Customer>("/customers", {
          method: "POST",
          body: payload,
        });
      }

      setModalOpen(false);
      showToast(editing ? "Müşteri güncellendi." : "Müşteri eklendi.");
      await load();
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Müşteri kaydedilemedi.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!pendingDelete) return;

    setSaving(true);
    setError("");

    try {
      await api(`/customers/${pendingDelete.id}`, { method: "DELETE" });
      setPendingDelete(null);
      showToast("Müşteri silindi.");
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Müşteri silinemedi.",
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
        description="Kayıtlı müşterileri yönetin."
        action={<Button onClick={openCreate}>Yeni müşteri</Button>}
      />

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <Panel>
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-md">
            <TextInput
              value={search}
              onChange={(event) => handleSearch(event.target.value)}
              placeholder="Müşteri ara..."
              aria-label="Müşteri ara"
            />
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[12px] text-[var(--muted)]">
              {search.trim()
                ? `"${search.trim()}" sonuçları`
                : "Tüm müşteriler"}
            </span>

            {search ? (
              <Button
                variant="ghost"
                className="px-3 py-1.5"
                onClick={() => handleSearch("")}
              >
                Temizle
              </Button>
            ) : null}
          </div>
        </div>

        {loading ? (
          <Spinner label="Müşteriler yükleniyor..." />
        ) : customers.length === 0 ? (
          <EmptyState
            title={search.trim() ? "Eşleşen müşteri yok" : "Henüz müşteri yok"}
            description={
              search.trim()
                ? "Arama kriterinizi değiştirerek tekrar deneyin."
                : "Yeni müşteri ekleyerek başlayın."
            }
          />
        ) : (
          <>
            <TableWrap>
              <thead className="border-b border-stone-100 bg-stone-50/80">
                <tr>
                  <Th>Ad</Th>
                  <Th>Soyad</Th>
                  <Th>Telefon</Th>
                  <Th>E-posta</Th>
                  <Th>İşlemler</Th>
                </tr>
              </thead>

              <tbody className="divide-y divide-stone-100">
                {customers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-stone-50/60">
                    <Td label="Ad" className="font-medium">
                      {customer.firstName}
                    </Td>
                    <Td label="Soyad">{customer.lastName}</Td>
                    <Td label="Telefon">{customer.phone ?? "—"}</Td>
                    <Td label="E-posta">{customer.email ?? "—"}</Td>

                    <Td label="İşlemler" actions>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/customers/${customer.id}`}
                          className="inline-flex items-center justify-center rounded-[10px] px-3 py-1.5 text-[13px] font-medium text-[var(--ink)] transition-colors hover:bg-black/[0.05]"
                        >
                          Detay
                        </Link>

                        <Button
                          variant="ghost"
                          className="px-3 py-1.5"
                          onClick={() => openEdit(customer)}
                        >
                          Düzenle
                        </Button>

                        <Button
                          variant="danger"
                          className="px-3 py-1.5"
                          onClick={() => setPendingDelete(customer)}
                        >
                          Sil
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>

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
        onClose={() => {
          if (!saving) {
            setModalOpen(false);
            setFormError("");
          }
        }}
        title={editing ? "Müşteriyi düzenle" : "Yeni müşteri"}
        description="Müşteri iletişim bilgilerini girin."
      >
        <form onSubmit={onSubmit} className="space-y-4">
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
          </div>

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

          {formError ? <Alert>{formError}</Alert> : null}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => setModalOpen(false)}
              disabled={saving}
            >
              Vazgeç
            </Button>

            <Button type="submit" disabled={saving}>
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </Button>
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
