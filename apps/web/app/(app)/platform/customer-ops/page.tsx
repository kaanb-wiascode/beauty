"use client";

import { useState } from "react";
import { Alert, Button, EmptyState, Field, PageHeader, Spinner, TextInput } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type Data = Record<string, unknown>;
type Endpoint = readonly [string, string];

function rows(value: unknown) {
  if (Array.isArray(value)) return value.filter((item): item is Data => Boolean(item) && typeof item === "object");
  if (value && typeof value === "object") return [value as Data];
  return [];
}

function keys(value: unknown) {
  const records = rows(value);
  return records.length
    ? [...new Set(records.slice(0, 10).flatMap((item) => Object.keys(item)))]
        .filter((key) => typeof records[0]?.[key] !== "object")
        .slice(0, 9)
    : [];
}

function show(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Evet" : "Hayır";
  if (typeof value === "number") return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value);
  return String(value);
}

export default function PlatformCustomerOpsPage() {
  const [tenantId, setTenantId] = useState("");
  const [provisioningRunId, setProvisioningRunId] = useState("");
  const [supportTicketId, setSupportTicketId] = useState("");
  const [supportSessionId, setSupportSessionId] = useState("");
  const [data, setData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const endpoints: Endpoint[] = [];
    const tenant = tenantId.trim();

    if (tenant) {
      const id = encodeURIComponent(tenant);
      endpoints.push(
        ["Onboarding", `/platform/onboarding/${id}`],
        ["Abonelik", `/platform/customers/${id}/subscription`],
        ["Entitlement", `/platform/customers/${id}/entitlements`],
        ["Müşteri Başarısı", `/platform/customer-success/${id}`],
        ["Tenant Sağlığı", `/platform/customer-success/${id}/health`],
      );
    }
    if (provisioningRunId.trim()) {
      endpoints.push(["Provisioning Çalışması", `/platform/provisioning/${encodeURIComponent(provisioningRunId.trim())}`]);
    }
    if (supportTicketId.trim()) {
      endpoints.push(["Destek Talebi", `/platform/support/tickets/${encodeURIComponent(supportTicketId.trim())}`]);
    }
    if (supportSessionId.trim()) {
      endpoints.push(["Destek Oturumu", `/platform/support-sessions/${encodeURIComponent(supportSessionId.trim())}`]);
    }
    if (!endpoints.length) return;

    setLoading(true);
    setError("");
    const settled = await Promise.allSettled(endpoints.map(([, endpoint]) => api(endpoint)));
    const next: Record<string, unknown> = {};
    const failures: string[] = [];

    settled.forEach((result, index) => {
      const [title] = endpoints[index];
      if (result.status === "fulfilled") next[title] = result.value;
      else failures.push(result.reason instanceof ApiError ? result.reason.message : `${title} yüklenemedi.`);
    });

    setData(next);
    if (failures.length) setError(failures.join(" "));
    setLoading(false);
  }

  const hasLookup = Boolean(tenantId.trim() || provisioningRunId.trim() || supportTicketId.trim() || supportSessionId.trim());

  return (
    <div className="mx-auto max-w-[1450px] space-y-6 pb-12">
      <PageHeader
        title="Platform Müşteri Operasyonu"
        description="Tenant operasyonlarını, provisioning çalışmalarını ve destek kayıtlarını gerçek backend verileriyle tek platform-admin ekranında inceleyin."
      />

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Tenant ID">
            <TextInput value={tenantId} onChange={(event) => setTenantId(event.target.value)} placeholder="Tenant kimliği" />
          </Field>
          <Field label="Provisioning Run ID">
            <TextInput value={provisioningRunId} onChange={(event) => setProvisioningRunId(event.target.value)} placeholder="Provisioning çalışma kimliği" />
          </Field>
          <Field label="Destek Talebi ID">
            <TextInput value={supportTicketId} onChange={(event) => setSupportTicketId(event.target.value)} placeholder="Destek talebi kimliği" />
          </Field>
          <Field label="Destek Oturumu ID">
            <TextInput value={supportSessionId} onChange={(event) => setSupportSessionId(event.target.value)} placeholder="Destek oturumu kimliği" />
          </Field>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => void load()} disabled={loading || !hasLookup}>
            {loading ? "Yükleniyor..." : "Operasyon Kaydını Aç"}
          </Button>
        </div>
      </section>

      {loading ? (
        <Spinner label="Platform operasyon bilgileri yükleniyor..." />
      ) : Object.keys(data).length ? (
        <div className="grid gap-5">
          {Object.entries(data).map(([title, value]) => <Section key={title} title={title} value={value} />)}
        </div>
      ) : hasLookup ? (
        <EmptyState title="Veri bulunamadı" description="Girilen kimlikler için görüntülenebilen platform kaydı bulunamadı." />
      ) : null}
    </div>
  );
}

function Section({ title, value }: { title: string; value: unknown }) {
  const records = rows(value);
  const visibleKeys = keys(value);
  return (
    <section className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)]">
      <div className="border-b border-[var(--line)] px-5 py-4">
        <h2 className="text-[14px] font-semibold">{title}</h2>
      </div>
      {records.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--surface-2)]/40">
                {visibleKeys.map((key) => <th key={key} className="px-4 py-3">{key.replace(/([a-z])([A-Z])/g, "$1 $2")}</th>)}
              </tr>
            </thead>
            <tbody>
              {records.map((row, index) => (
                <tr key={String(row.id ?? row.tenantId ?? index)} className="border-b border-[var(--line)] last:border-0">
                  {visibleKeys.map((key) => <td key={key} className="max-w-[340px] truncate px-4 py-4 text-[var(--muted)]">{show(row[key])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="Kayıt bulunamadı" description="Bu başlık için kayıt bulunmuyor." />
      )}
    </section>
  );
}
