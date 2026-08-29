"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog, Modal } from "@/components/modal";
import {
  Alert,
  Button,
  EmptyState,
  Field,
  GlassCard,
  PageHeader,
  Pagination,
  Panel,
  Spinner,
  StatusBadge,
  TableWrap,
  Td,
  TextInput,
  Th,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError, withQuery } from "@/lib/api";
import { optionalText, staffStatusLabel } from "@/lib/format";
import type { CreateStaffInput, Paginated, Staff } from "@/lib/types";

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

function toPayload(form: FormState): CreateStaffInput {
  return {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    ...(optionalText(form.phone) ? { phone: form.phone.trim() } : {}),
    ...(optionalText(form.email) ? { email: form.email.trim() } : {}),
  };
}

type Performance = {
  id: string;
  name?: string;
  collected: number;
  appointmentCount: number;
  completedAppointments?: number;
};

type PerformanceResponse = Performance[] | {
  data?: Performance[];
};

export default function StaffPage() {
  const { showToast } = useToast();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [performance, setPerformance] = useState<Record<string, Performance>>({});
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Staff | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await api<Paginated<Staff>>(
        withQuery("/staff", {
          page,
          limit: 20,
          search: search.trim() || undefined,
        }),
      );

      const from = new Date();
      from.setHours(0, 0, 0, 0);

      const to = new Date();
      to.setHours(23, 59, 59, 999);

      const performanceResult = await api<PerformanceResponse>(
        withQuery("/staff/performance", {
          from: from.toISOString(),
          to: to.toISOString(),
        }),
      );

      const rows = Array.isArray(performanceResult)
        ? performanceResult
        : performanceResult.data ?? [];

      const performanceMap: Record<string, Performance> = {};
      for (const row of rows) {
        performanceMap[row.id] = row;
      }

      setStaff(result.data);
      setPerformance(performanceMap);
      setTotalPages(result.meta.totalPages || 1);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Personel listesi yüklenemedi.",
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

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormError("");
    setModalOpen(true);
  }

  function openEdit(member: Staff) {
    setEditing(member);
    setForm({
      firstName: member.firstName,
      lastName: member.lastName,
      phone: member.phone ?? "",
      email: member.email ?? "",
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
        await api<Staff>(`/staff/${editing.id}`, {
          method: "PATCH",
          body: payload,
        });
      } else {
        await api<Staff>("/staff", {
          method: "POST",
          body: payload,
        });
      }

      setModalOpen(false);
      showToast(editing ? "Personel güncellendi." : "Personel eklendi.");
      await load();
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Personel kaydedilemedi.",
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
      await api(`/staff/${pendingDelete.id}`, { method: "DELETE" });
      setPendingDelete(null);
      showToast("Personel arşivlendi.");
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Personel silinemedi.",
      );
      setPendingDelete(null);
    } finally {
      setSaving(false);
    }
  }

  const activeCount = useMemo(
    () => staff.filter((member) => member.status === "ACTIVE").length,
    [staff],
  );

  const archivedCount = useMemo(
    () => staff.filter((member) => member.status === "ARCHIVED").length,
    [staff],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <PageHeader
        title="Personel"
        description="Salon personelini yönetin."
        action={<Button onClick={openCreate}>Yeni personel</Button>}
      />

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Toplam personel" value={staff.length} />
        <SummaryCard label="Aktif" value={activeCount} />
        <SummaryCard label="Arşivlenen" value={archivedCount} />
      </section>

      <Panel>
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-md">
            <TextInput
              value={search}
              placeholder="Personel ara..."
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>

          <span className="text-[12px] text-[var(--muted)]">
            {search.trim() ? `"${search.trim()}" sonuçları` : "Tüm personel"}
          </span>
        </div>

        {loading ? (
          <Spinner label="Personel yükleniyor..." />
        ) : staff.length === 0 ? (
          <EmptyState
            title={search.trim() ? "Eşleşen personel yok" : "Henüz personel yok"}
            description={
              search.trim()
                ? "Arama kriterinizi değiştirerek tekrar deneyin."
                : "Yeni personel ekleyerek başlayın."
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
                  <Th>Durum</Th>
                  <Th>Bugün</Th>
                  <Th>İşlemler</Th>
                </tr>
              </thead>

              <tbody className="divide-y divide-stone-100">
                {staff.map((member) => {
                  const stats = performance[member.id];

                  return (
                    <tr key={member.id} className="hover:bg-stone-50/60">
                      <Td label="Ad" className="font-medium">
                        {member.firstName}
                      </Td>
                      <Td label="Soyad">{member.lastName}</Td>
                      <Td label="Telefon">{member.phone ?? "—"}</Td>
                      <Td label="E-posta">{member.email ?? "—"}</Td>
                      <Td label="Durum">
                        <StatusBadge
                          status={member.status}
                          label={staffStatusLabel(member.status)}
                        />
                      </Td>
                      <Td label="Bugün">
                        <div className="text-[12px] text-[var(--muted)]">
                          <div>
                            {stats?.appointmentCount ?? 0} randevu
                          </div>
                          <div className="mt-1 font-medium text-[var(--ink)]">
                            {new Intl.NumberFormat("tr-TR", {
                              style: "currency",
                              currency: "TRY",
                              maximumFractionDigits: 0,
                            }).format(stats?.collected ?? 0)}
                          </div>
                        </div>
                      </Td>
                      <Td label="İşlemler" actions>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="ghost"
                            className="px-3 py-1.5"
                            onClick={() => openEdit(member)}
                          >
                            Düzenle
                          </Button>

                          <Button
                            variant="danger"
                            className="px-3 py-1.5"
                            onClick={() => setPendingDelete(member)}
                            disabled={member.status === "ARCHIVED"}
                          >
                            Arşivle
                          </Button>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
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
        title={editing ? "Personeli düzenle" : "Yeni personel"}
        description="Personel iletişim bilgilerini girin."
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
        title="Personeli arşivle"
        description="Bu personel arşivlenecek. Devam edilsin mi?"
        loading={saving}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void onDelete()}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <GlassCard>
      <p className="text-[12px] font-medium text-[var(--muted)]">{label}</p>
      <p className="mt-3 text-[30px] font-semibold tracking-[-0.04em] text-[var(--ink)]">
        {value}
      </p>
    </GlassCard>
  );
}
