"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { CardInfo } from "@/components/card-info";
import { Alert, Button, Field, GlassCard, PageHeader, Select, Spinner, TextInput } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { getCardHelp } from "@/lib/card-help";

type AssignmentMode = "MANUAL" | "ROUND_ROBIN" | "LOAD_BALANCED" | "BRANCH_BASED" | "SKILL_BASED";
type AssignmentRule = {
  id: string;
  name: string;
  mode: AssignmentMode;
  branchId: string | null;
  teamId: string | null;
  sourceFilter: string | null;
  skillKey: string | null;
  active: boolean;
  priority: number;
  lastAssignedUserId: string | null;
};
type AutomationRule = {
  ruleKey: string;
  enabled: boolean;
  config: Record<string, unknown>;
  version: number;
  overridden: boolean;
};
type CrmAssignee = { id: string; firstName: string; lastName: string; email: string };
type CrmTeam = {
  id: string;
  name: string;
  branchId: string | null;
  managerUserId: string;
  managerFirstName: string | null;
  managerLastName: string | null;
  active: boolean;
  members: Array<{ userId: string; firstName: string; lastName: string; email: string }>;
};

const assignmentModeLabels: Record<AssignmentMode, string> = {
  MANUAL: "Manuel atama",
  ROUND_ROBIN: "Sırayla dağıtım",
  LOAD_BALANCED: "İş yüküne göre dağıtım",
  BRANCH_BASED: "Şube bazlı dağıtım",
  SKILL_BASED: "Yetkinliğe göre dağıtım",
};

const slaLabels: Record<string, { title: string; description: string }> = {
  LEAD_FIRST_RESPONSE_SLA: {
    title: "İlk Dönüş Süresi",
    description: "Yeni potansiyel müşteriye ilk yanıt verilmezse eskalasyon oluşturur.",
  },
  FOLLOW_UP_OVERDUE_ESCALATION: {
    title: "Geciken Takip Eskalasyonu",
    description: "Takip süresi aşıldığında ekip lideri veya sorumlu için uyarı ve yeni aksiyon oluşturur.",
  },
  OPPORTUNITY_STALE_ESCALATION: {
    title: "Hareketsiz Satış Fırsatı",
    description: "Belirlenen gün boyunca güncellenmeyen açık satış fırsatlarını eskale eder.",
  },
};

export default function CrmSettingsPage() {
  const [assignmentRules, setAssignmentRules] = useState<AssignmentRule[]>([]);
  const [automationRules, setAutomationRules] = useState<AutomationRule[]>([]);
  const [teams, setTeams] = useState<CrmTeam[]>([]);
  const [assignees, setAssignees] = useState<CrmAssignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [assignmentForm, setAssignmentForm] = useState({
    name: "Şube satış ekibi otomatik dağıtımı",
    mode: "ROUND_ROBIN" as AssignmentMode,
    sourceFilter: "",
    skillKey: "",
    teamId: "",
    priority: "100",
  });
  const [teamForm, setTeamForm] = useState({ name: "Satış Ekibi", managerUserId: "" });
  const [memberSelections, setMemberSelections] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [assignmentRows, automationRows, teamRows, assigneeRows] = await Promise.all([
        api<AssignmentRule[]>("/crm/assignment-rules"),
        api<AutomationRule[]>("/crm/automation-rules"),
        api<CrmTeam[]>("/crm/teams"),
        api<CrmAssignee[]>("/crm/assignees"),
      ]);
      setAssignmentRules(assignmentRows);
      setAutomationRules(automationRows);
      setTeams(teamRows);
      setAssignees(assigneeRows);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "CRM ayarları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createAssignmentRule(event: FormEvent) {
    event.preventDefault();
    if (!assignmentForm.name.trim()) {
      setError("Atama kuralı adı gereklidir.");
      return;
    }
    setSaving("assignment");
    setError("");
    try {
      await api("/crm/assignment-rules", {
        method: "POST",
        body: {
          name: assignmentForm.name.trim(),
          mode: assignmentForm.mode,
          ...(assignmentForm.teamId ? { teamId: assignmentForm.teamId } : {}),
          ...(assignmentForm.sourceFilter.trim() ? { sourceFilter: assignmentForm.sourceFilter.trim() } : {}),
          ...(assignmentForm.skillKey.trim() ? { skillKey: assignmentForm.skillKey.trim() } : {}),
          priority: Number(assignmentForm.priority || 100),
        },
      });
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Atama kuralı oluşturulamadı.");
    } finally {
      setSaving("");
    }
  }

  async function createTeam(event: FormEvent) {
    event.preventDefault();
    if (!teamForm.name.trim() || !teamForm.managerUserId) {
      setError("Ekip adı ve ekip yöneticisi gereklidir.");
      return;
    }
    setSaving("team");
    setError("");
    try {
      await api("/crm/teams", { method: "POST", body: { name: teamForm.name.trim(), managerUserId: teamForm.managerUserId } });
      setTeamForm({ name: "Satış Ekibi", managerUserId: "" });
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "CRM ekibi oluşturulamadı.");
    } finally {
      setSaving("");
    }
  }

  async function updateSla(rule: AutomationRule, config: Record<string, unknown>, enabled = rule.enabled) {
    setSaving(rule.ruleKey);
    setError("");
    try {
      await api(`/crm/automation-rules/${rule.ruleKey}`, {
        method: "PATCH",
        body: { enabled, version: rule.version, config },
      });
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "SLA ayarı güncellenemedi.");
    } finally {
      setSaving("");
    }
  }

  const slaRules = automationRules.filter((rule) => slaLabels[rule.ruleKey]);

  if (loading) return <Spinner label="CRM ayarları hazırlanıyor..." />;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="CRM Ayarları"
        description="Potansiyel müşteri dağıtımı, satış ekibi iş yükü ve müşteri dönüş sürelerini yönetin."
      />
      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <GlassCard className="p-0">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <div className="flex items-start gap-2">
              <CardInfo help={getCardHelp("Lead Atama Kuralları", "Yeni potansiyel müşterilerin satış ekibine hangi yöntemle dağıtılacağını belirler.")} />
              <div>
                <h2 className="text-[15px] font-semibold">Potansiyel Müşteri Atama Kuralları</h2>
                <p className="mt-1 text-[10px] text-[var(--muted)]">Otomatik satış ekibi dağıtım politikaları</p>
              </div>
            </div>
          </div>
          {assignmentRules.length ? (
            <div className="divide-y divide-[var(--line)]">
              {assignmentRules.map((rule) => (
                <div key={rule.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_180px_100px] sm:items-center">
                  <div>
                    <p className="text-[12px] font-semibold">{rule.name}</p>
                    <p className="mt-1 text-[10px] text-[var(--muted)]">
                      {rule.sourceFilter ? `Kaynak: ${rule.sourceFilter}` : "Tüm kaynaklar"}
                      {rule.skillKey ? ` · Yetkinlik: ${rule.skillKey}` : ""}
                    </p>
                  </div>
                  <span className="text-[11px] font-medium">{assignmentModeLabels[rule.mode]}</span>
                  <span className="text-[10px] text-[var(--muted)]">Öncelik: {rule.priority}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-8 text-center text-[12px] text-[var(--muted)]">
              Henüz otomatik atama kuralı oluşturulmamış. Kural yoksa kayıt, oluşturan kullanıcıya atanır.
            </div>
          )}
        </GlassCard>

        <GlassCard>
          <div className="flex items-start gap-2">
            <CardInfo help={getCardHelp("Yeni Atama Kuralı", "Kaynak ve dağıtım yöntemine göre yeni potansiyel müşterilerin sorumlusunu otomatik belirler.")} />
            <div><h2 className="text-[15px] font-semibold">Yeni Atama Kuralı</h2><p className="mt-1 text-[10px] text-[var(--muted)]">Aktif şube için kural oluşturun</p></div>
          </div>
          <form onSubmit={createAssignmentRule} className="mt-5 space-y-4">
            <Field label="Kural adı" required>
              <TextInput value={assignmentForm.name} onChange={(event) => setAssignmentForm({ ...assignmentForm, name: event.target.value })} />
            </Field>
            <Field label="Dağıtım yöntemi" required>
              <Select value={assignmentForm.mode} onChange={(event) => setAssignmentForm({ ...assignmentForm, mode: event.target.value as AssignmentMode })}>
                {Object.entries(assignmentModeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </Field>
            <Field label="Müşteri kaynağı filtresi">
              <Select value={assignmentForm.sourceFilter} onChange={(event) => setAssignmentForm({ ...assignmentForm, sourceFilter: event.target.value })}>
                <option value="">Tüm kaynaklar</option>
                <option value="MANUAL">Manuel</option>
                <option value="INSTAGRAM">Instagram</option>
                <option value="GOOGLE">Google</option>
                <option value="WEBSITE">Web Sitesi</option>
                <option value="REFERRAL">Tavsiye</option>
                <option value="WALK_IN">Doğrudan</option>
                <option value="SURVEYOR">Anketör</option>
                <option value="OTHER">Diğer</option>
              </Select>
            </Field>
            {assignmentForm.mode === "SKILL_BASED" ? <Field label="Yetkinlik anahtarı"><TextInput value={assignmentForm.skillKey} onChange={(event) => setAssignmentForm({ ...assignmentForm, skillKey: event.target.value })} placeholder="Örn. lazer, satış-kıdemli" /></Field> : null}
            <Field label="Öncelik sırası"><TextInput type="number" min="1" max="10000" value={assignmentForm.priority} onChange={(event) => setAssignmentForm({ ...assignmentForm, priority: event.target.value })} /></Field>
            <Button type="submit" disabled={saving === "assignment"} className="w-full">{saving === "assignment" ? "Oluşturuluyor..." : "Kuralı Oluştur"}</Button>
          </form>
        </GlassCard>
      </section>

      <section className="space-y-3">
        <div className="flex items-start gap-2">
          <CardInfo help={getCardHelp("SLA ve Eskalasyon", "Müşteriye dönüş, takip ve satış fırsatı güncelleme süreleri aşıldığında otomatik aksiyon üretir.")} />
          <div><h2 className="text-[17px] font-semibold">SLA ve Eskalasyon</h2><p className="mt-1 text-[11px] text-[var(--muted)]">Satış ekibinin hizmet ve takip sürelerini yönetin</p></div>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {slaRules.map((rule) => {
            const meta = slaLabels[rule.ruleKey];
            const isLead = rule.ruleKey === "LEAD_FIRST_RESPONSE_SLA";
            const isFollowUp = rule.ruleKey === "FOLLOW_UP_OVERDUE_ESCALATION";
            const primaryKey = isLead ? "thresholdMinutes" : isFollowUp ? "graceMinutes" : "staleDays";
            const primaryLabel = isLead ? "İlk dönüş süresi (dakika)" : isFollowUp ? "Gecikme toleransı (dakika)" : "Hareketsizlik süresi (gün)";
            const primaryValue = Number(rule.config[primaryKey] ?? (isLead ? 60 : isFollowUp ? 30 : 7));
            const escalationDelay = Number(rule.config.escalationDelayMinutes ?? 15);
            return (
              <GlassCard key={rule.ruleKey}>
                <div className="flex items-start gap-2">
                  <CardInfo help={getCardHelp(meta.title, meta.description)} />
                  <div><h3 className="text-[13px] font-semibold">{meta.title}</h3><p className="mt-1 text-[10px] leading-5 text-[var(--muted)]">{meta.description}</p></div>
                </div>
                <div className="mt-5 space-y-4">
                  <label className="flex items-center justify-between gap-3 rounded-[13px] border border-[var(--line)] px-3 py-2.5">
                    <span className="text-[11px] font-medium">Kural aktif</span>
                    <input type="checkbox" checked={rule.enabled} onChange={(event) => void updateSla(rule, { ...rule.config }, event.target.checked)} disabled={saving === rule.ruleKey} />
                  </label>
                  <Field label={primaryLabel}>
                    <TextInput
                      type="number"
                      min="1"
                      value={String(primaryValue)}
                      onChange={(event) => setAutomationRules((current) => current.map((item) => item.ruleKey === rule.ruleKey ? { ...item, config: { ...item.config, [primaryKey]: Number(event.target.value) } } : item))}
                    />
                  </Field>
                  <Field label="Eskalasyon aksiyonu süresi (dakika)">
                    <TextInput
                      type="number"
                      min="1"
                      value={String(escalationDelay)}
                      onChange={(event) => setAutomationRules((current) => current.map((item) => item.ruleKey === rule.ruleKey ? { ...item, config: { ...item.config, escalationDelayMinutes: Number(event.target.value) } } : item))}
                    />
                  </Field>
                  <Button variant="secondary" className="w-full" disabled={saving === rule.ruleKey} onClick={() => void updateSla(rule, { ...rule.config, channel: String(rule.config.channel ?? "CALL") })}>
                    {saving === rule.ruleKey ? "Kaydediliyor..." : "SLA Ayarını Kaydet"}
                  </Button>
                </div>
              </GlassCard>
            );
          })}
        </div>
      </section>
    </div>
  );
}
