"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, GlassCard, PageHeader, Select, Spinner, TextInput } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasActiveBranch, hasPermission } from "@/lib/auth";
import { opportunityStageLabels, type CrmAssignee, type OpportunityStage } from "@/lib/crm-types";

type Opportunity = {
  id: string;
  title: string;
  stage: OpportunityStage;
  estimatedValue: string | number | null;
  currency: string;
  probability: number;
  expectedCloseDate: string | null;
  ownerUserId: string | null;
  version: number;
};

export default function OpportunityCommercialEditPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const canManage = hasPermission("crm", "manage");
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [assignees, setAssignees] = useState<CrmAssignee[]>([]);
  const [estimatedValue, setEstimatedValue] = useState("");
  const [probability, setProbability] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { id } = await params;
        const [row, people] = await Promise.all([
          api<Opportunity>(`/crm/opportunities/${id}`),
          api<CrmAssignee[]>("/crm/assignees"),
        ]);
        if (cancelled) return;
        setOpportunity(row);
        setAssignees(people);
        setEstimatedValue(row.estimatedValue == null ? "" : String(row.estimatedValue));
        setProbability(String(row.probability));
        setExpectedCloseDate(row.expectedCloseDate ? new Date(row.expectedCloseDate).toISOString().slice(0, 10) : "");
        setOwnerUserId(row.ownerUserId ?? "");
      } catch (requestError) {
        if (!cancelled) setError(requestError instanceof ApiError ? requestError.message : "Fırsat bilgileri yüklenemedi.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [params]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!opportunity || !canManage) return;
    if (!hasActiveBranch()) {
      setError("Ticari bilgileri güncellemek için aktif bir şube seçin.");
      return;
    }
    const value = estimatedValue.trim() === "" ? null : Number(estimatedValue);
    const chance = Number(probability);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      setError("Tahmini değer sıfır veya pozitif olmalıdır.");
      return;
    }
    if (!Number.isInteger(chance) || chance < 0 || chance > 100) {
      setError("Kazanma olasılığı 0 ile 100 arasında tam sayı olmalıdır.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await api(`/crm/opportunities/${opportunity.id}/commercial`, {
        method: "PATCH",
        body: {
          version: opportunity.version,
          estimatedValue: value,
          probability: chance,
          expectedCloseDate: expectedCloseDate ? new Date(`${expectedCloseDate}T12:00:00`).toISOString() : null,
          ownerUserId: ownerUserId || null,
        },
      });
      router.push(`/crm/opportunities/${opportunity.id}`);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Ticari bilgiler güncellenemedi.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner label="Ticari bilgiler hazırlanıyor..." />;
  if (!opportunity) return <Alert>{error || "Satış fırsatı bulunamadı."}</Alert>;

  const closed = opportunity.stage === "WON" || opportunity.stage === "LOST";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Fırsat Ticari Bilgileri"
        description={`${opportunity.title} · ${opportunityStageLabels[opportunity.stage]} · v${opportunity.version}`}
        action={<Link href={`/crm/opportunities/${opportunity.id}`}><Button variant="secondary">Fırsata Dön</Button></Link>}
      />
      {!canManage ? <Alert>Bu işlem için CRM yönetim yetkisi gereklidir.</Alert> : null}
      {closed ? <Alert>Sonuçlanmış fırsatların ticari bilgileri değiştirilemez.</Alert> : null}
      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <GlassCard>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Tahmini Değer (${opportunity.currency})`}>
              <TextInput type="number" min="0" step="0.01" value={estimatedValue} onChange={(event) => setEstimatedValue(event.target.value)} disabled={saving || closed} />
            </Field>
            <Field label="Kazanma Olasılığı (%)">
              <TextInput type="number" min="0" max="100" step="1" value={probability} onChange={(event) => setProbability(event.target.value)} disabled={saving || closed} />
            </Field>
            <Field label="Beklenen Kapanış Tarihi">
              <TextInput type="date" value={expectedCloseDate} onChange={(event) => setExpectedCloseDate(event.target.value)} disabled={saving || closed} />
            </Field>
            <Field label="Fırsat Sahibi">
              <Select value={ownerUserId} onChange={(event) => setOwnerUserId(event.target.value)} disabled={saving || closed}>
                <option value="">Atanmamış</option>
                {assignees.map((person) => <option key={person.id} value={person.id}>{person.firstName} {person.lastName} · {person.email}</option>)}
              </Select>
            </Field>
          </div>
          <div className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)]/35 px-4 py-3 text-[11px] leading-5 text-[var(--muted)]">
            Bu işlem fırsat aşamasını değiştirmez. Kayıt optimistic version kontrolünden geçer ve CRM olay geçmişine ticari güncelleme olarak eklenir.
          </div>
          <div className="flex justify-end gap-3 border-t border-[var(--line)] pt-4">
            <Link href={`/crm/opportunities/${opportunity.id}`}><Button type="button" variant="secondary" disabled={saving}>Vazgeç</Button></Link>
            <Button type="submit" disabled={saving || closed || !canManage}>{saving ? "Kaydediliyor..." : "Ticari Bilgileri Kaydet"}</Button>
          </div>
        </form>
      </GlassCard>
    </div>
  );
}
