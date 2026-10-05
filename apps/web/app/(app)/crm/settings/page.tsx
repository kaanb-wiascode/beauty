"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, EmptyState, Field, GlassCard, Select, Spinner, TextInput } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { CrmMessageProviderSettings } from "@/components/crm-message-provider-settings";
import { CrmTwilioSmsSettings } from "@/components/crm-twilio-sms-settings";
import { CrmResendEmailSettings } from "@/components/crm-resend-email-settings";
import { hasActiveBranch, hasPermission } from "@/lib/auth";
import { userErrorMessage } from "@/lib/user-language";

type SettingsTab = "OVERVIEW" | "TEAM_ACCESS" | "ASSIGNMENT" | "FOLLOW_UP" | "CHANNELS" | "SURVEYORS";
type CrmDataScope = "SELF" | "TEAM" | "BRANCH" | "COMPANY" | "ALL";
type AccessPolicy = {
  roleId: string;
  roleName: string;
  roleSlug: string;
  roleScope: string;
  dataScope: CrmDataScope | null;
  hasCrmRead: boolean;
  hasCrmManage: boolean;
  membershipCount: number;
};

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
type SurveyorCandidate = {
  staffId: string;
  firstName: string;
  lastName: string;
  active: boolean;
  dailyDeskQuota: number | null;
  weeklyDeskQuota: number | null;
};

type CrmTeam = {
  id: string;
  name: string;
  branchId: string | null;
  managerUserId: string;
  managerFirstName: string | null;
  managerLastName: string | null;
  active: boolean;
  members: Array<{ userId: string; firstName: string; lastName: string; email: string; skills: string[] }>;
};

const dataScopeLabels: Record<CrmDataScope, { label: string; description: string }> = {
  SELF: { label: "Kendi kayıtları", description: "Kullanıcı yalnızca sorumlusu olduğu CRM kayıtlarını görür ve yönetir." },
  TEAM: { label: "Ekibi", description: "Kullanıcı kendi kayıtlarıyla birlikte üyesi veya yöneticisi olduğu CRM ekibinin kayıtlarını görür." },
  BRANCH: { label: "Şube", description: "Kullanıcı aktif şubedeki CRM kayıtlarını görür." },
  COMPANY: { label: "Şirket", description: "Kullanıcı şirket kapsamındaki CRM kayıtlarını görür." },
  ALL: { label: "Tüm yetkili veriler", description: "Kullanıcı rol ve organizasyon yetkilerinin izin verdiği tüm CRM kayıtlarını görür." },
};

const sourceLabels: Record<string, string> = {
  MANUAL: "Manuel",
  INSTAGRAM: "Instagram",
  GOOGLE: "Google",
  WEBSITE: "Web Sitesi",
  REFERRAL: "Tavsiye",
  WALK_IN: "Doğrudan",
  SURVEYOR: "Anketör",
  OTHER: "Diğer",
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
    title: "İlk Müşteri Dönüş Süresi",
    description: "Yeni potansiyel müşteriye belirtilen süre içinde dönüş yapılmazsa sistem uyarı oluşturur.",
  },
  FOLLOW_UP_OVERDUE_ESCALATION: {
    title: "Geciken Takip Uyarısı",
    description: "Planlanan takip geciktiğinde sorumlu kullanıcı için uyarı ve yeni aksiyon oluşturur.",
  },
  OPPORTUNITY_STALE_ESCALATION: {
    title: "Hareketsiz Satış Fırsatı Uyarısı",
    description: "Satış fırsatı belirtilen gün boyunca güncellenmezse sistem uyarı oluşturur.",
  },
};

const taskAutomationLabels: Record<string, { title: string; description: string }> = {
  LEAD_FIRST_TOUCH: {
    title: "Yeni Müşteriye İlk Takibi Otomatik Planla",
    description: "Yeni potansiyel müşteri geldiğinde sorumlu kullanıcıya otomatik takip görevi oluşturur.",
  },
  OPPORTUNITY_STAGE_FOLLOW_UP: {
    title: "Satış Aşaması Değişince Takip Planla",
    description: "Satış fırsatı yeni bir aşamaya geçtiğinde otomatik takip görevi oluşturur.",
  },
  STALE_OPPORTUNITY_FOLLOW_UP: {
    title: "Uzun Süre Bekleyen Fırsata Takip Oluştur",
    description: "Uzun süredir hareket görmeyen açık satış fırsatları için otomatik görev oluşturur.",
  },
};

const channelLabels: Record<string, string> = {
  CALL: "Telefon",
  WHATSAPP: "WhatsApp",
  SMS: "SMS",
  EMAIL: "E-posta",
  IN_PERSON: "Yüz yüze",
  OTHER: "Diğer",
};

export default function CrmSettingsPage() {
  const activeBranch = hasActiveBranch();
  const canManage = hasPermission("crm", "manage");
  const [tab, setTab] = useState<SettingsTab>("OVERVIEW");
  const [assignmentRules, setAssignmentRules] = useState<AssignmentRule[]>([]);
  const [accessPolicies, setAccessPolicies] = useState<AccessPolicy[]>([]);
  const [accessPolicyDrafts, setAccessPolicyDrafts] = useState<Record<string, CrmDataScope>>({});
  const [automationRules, setAutomationRules] = useState<AutomationRule[]>([]);
  const [teams, setTeams] = useState<CrmTeam[]>([]);
  const [assignees, setAssignees] = useState<CrmAssignee[]>([]);
  const [surveyorCandidates, setSurveyorCandidates] = useState<SurveyorCandidate[]>([]);
  const [surveyorDrafts, setSurveyorDrafts] = useState<Record<string, { active: boolean; dailyDeskQuota: string; weeklyDeskQuota: string }>>({});
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
  const [memberSkillInputs, setMemberSkillInputs] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [assignmentRows, automationRows, teamRows, assigneeRows, surveyorRows, policyRows] = await Promise.all([
        api<AssignmentRule[]>("/crm/assignment-rules"),
        api<AutomationRule[]>("/crm/automation-rules"),
        api<CrmTeam[]>("/crm/teams"),
        api<CrmAssignee[]>("/crm/assignees"),
        api<SurveyorCandidate[]>("/crm/surveyor-candidates"),
        api<AccessPolicy[]>("/crm/access-policies"),
      ]);
      setAssignmentRules(assignmentRows);
      setAutomationRules(automationRows);
      setTeams(teamRows);
      setAssignees(assigneeRows);
      setSurveyorCandidates(surveyorRows);
      setAccessPolicies(policyRows);
      setAccessPolicyDrafts(Object.fromEntries(policyRows.map((row) => {
        const fallback: CrmDataScope = row.roleSlug === "owner" ? "ALL" : row.hasCrmManage ? (row.roleScope === "CENTRAL" ? "ALL" : row.roleScope === "COMPANY" ? "COMPANY" : "BRANCH") : "SELF";
        return [row.roleId, row.dataScope ?? fallback];
      })));
      setSurveyorDrafts(Object.fromEntries(surveyorRows.map((row) => [row.staffId, {
        active: row.active,
        dailyDeskQuota: row.dailyDeskQuota == null ? "" : String(row.dailyDeskQuota),
        weeklyDeskQuota: row.weeklyDeskQuota == null ? "" : String(row.weeklyDeskQuota),
      }])));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "CRM ayarları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function toggleAssignmentRule(rule: AssignmentRule) {
    setSaving(`assignment-${rule.id}`);
    setError("");
    try {
      await api(`/crm/assignment-rules/${rule.id}`, {
        method: "PATCH",
        body: { active: !rule.active },
      });
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Atama kuralı güncellenemedi.");
    } finally {
      setSaving("");
    }
  }

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

  async function addTeamMember(teamId: string) {
    const userId = memberSelections[teamId];
    if (!userId) {
      setError("Eklenecek ekip üyesini seçin.");
      return;
    }
    setSaving(`member-${teamId}`);
    setError("");
    try {
      await api(`/crm/teams/${teamId}/members`, { method: "POST", body: { userId } });
      setMemberSelections((current) => ({ ...current, [teamId]: "" }));
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Ekip üyesi eklenemedi.");
    } finally {
      setSaving("");
    }
  }

  async function saveMemberSkills(teamId: string, userId: string) {
    const key = `${teamId}:${userId}`;
    const value = memberSkillInputs[key] ?? "";
    const skills = value.split(",").map((item) => item.trim()).filter(Boolean);
    setSaving(`skills-${key}`);
    setError("");
    try {
      await api(`/crm/teams/${teamId}/members/${userId}/skills`, {
        method: "PUT",
        body: { skills },
      });
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Üye yetkinlikleri güncellenemedi.");
    } finally {
      setSaving("");
    }
  }

  async function removeTeamMember(teamId: string, userId: string) {
    setSaving(`member-${teamId}`);
    setError("");
    try {
      await api(`/crm/teams/${teamId}/members/${userId}`, { method: "DELETE" });
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Ekip üyesi çıkarılamadı.");
    } finally {
      setSaving("");
    }
  }

  async function saveAccessPolicy(roleId: string) {
    const dataScope = accessPolicyDrafts[roleId];
    if (!dataScope) return;
    setSaving(`access-${roleId}`);
    setError("");
    try {
      await api(`/crm/access-policies/${roleId}`, {
        method: "PATCH",
        body: { dataScope },
      });
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "CRM veri erişim kapsamı güncellenemedi.");
    } finally {
      setSaving("");
    }
  }

  async function saveSurveyorProfile(staffId: string) {
    const draft = surveyorDrafts[staffId];
    if (!draft) return;
    const daily = draft.dailyDeskQuota.trim() === "" ? null : Number(draft.dailyDeskQuota);
    const weekly = draft.weeklyDeskQuota.trim() === "" ? null : Number(draft.weeklyDeskQuota);
    if ((daily !== null && (!Number.isInteger(daily) || daily < 0)) || (weekly !== null && (!Number.isInteger(weekly) || weekly < 0))) {
      setError("Anketör kotaları sıfır veya pozitif tam sayı olmalıdır.");
      return;
    }
    setSaving(`surveyor-${staffId}`);
    setError("");
    try {
      await api(`/crm/surveyors/${staffId}`, {
        method: "PATCH",
        body: { active: draft.active, dailyDeskQuota: daily, weeklyDeskQuota: weekly },
      });
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Anketör ayarları güncellenemedi.");
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
  const taskAutomationRules = automationRules.filter((rule) => taskAutomationLabels[rule.ruleKey]);

  const settingsSummary = useMemo(() => ({
    activeTeams: teams.filter((team) => team.active).length,
    teamMembers: new Set(teams.flatMap((team) => team.members.map((member) => member.userId))).size,
    activeAssignmentRules: assignmentRules.filter((rule) => rule.active).length,
    activeSurveyors: surveyorCandidates.filter((person) => surveyorDrafts[person.staffId]?.active ?? person.active).length,
    activeTimeRules: slaRules.filter((rule) => rule.enabled).length,
    activeTaskRules: taskAutomationRules.filter((rule) => rule.enabled).length,
  }), [assignmentRules, slaRules, surveyorCandidates, surveyorDrafts, taskAutomationRules, teams]);

  function automationNumber(rule: AutomationRule, key: string, fallback: number) {
    const value = Number(rule.config[key] ?? fallback);
    return Number.isFinite(value) ? value : fallback;
  }

  function setAutomationConfig(ruleKey: string, key: string, value: number | string) {
    setAutomationRules((current) => current.map((rule) =>
      rule.ruleKey === ruleKey ? { ...rule, config: { ...rule.config, [key]: value } } : rule
    ));
  }

  if (loading) return <Spinner label="CRM ayarları hazırlanıyor..." />;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="CRM Ayarları"
        description="Potansiyel müşteri dağıtımı, satış ekibi iş yükü ve müşteri dönüş sürelerini yönetin."
      />
      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section>
        <GlassCard className="p-0">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
            <div className="flex items-start gap-2">
              <CardInfo help={getCardHelp("Anketör Yönetimi", "Aktif şube çalışanlarını Anketör olarak tanımlar ve CRM kaynak takibinde kullanılacak günlük/haftalık masa kotalarını yönetir.")} />
              <div><h2 className="text-[15px] font-semibold">Anketör Yönetimi</h2><p className="mt-1 text-[10px] text-[var(--muted)]">Şube çalışanları, aktiflik ve masa kotaları</p></div>
            </div>
          </div>
          {surveyorCandidates.length ? <div className="divide-y divide-[var(--line)]">{surveyorCandidates.map((person) => {
            const draft = surveyorDrafts[person.staffId] ?? { active: person.active, dailyDeskQuota: person.dailyDeskQuota == null ? "" : String(person.dailyDeskQuota), weeklyDeskQuota: person.weeklyDeskQuota == null ? "" : String(person.weeklyDeskQuota) };
            return <div key={person.staffId} className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(180px,1fr)_140px_160px_160px_auto] lg:items-end">
              <div><p className="text-[12px] font-semibold">{person.firstName} {person.lastName}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{draft.active ? "CRM kaynak seçiminde aktif" : "Anketör olarak kullanılmıyor"}</p></div>
              <label className="flex h-10 items-center gap-2 rounded-[12px] border border-[var(--line)] px-3 text-[11px]"><input type="checkbox" checked={draft.active} onChange={(event) => setSurveyorDrafts((current) => ({ ...current, [person.staffId]: { ...draft, active: event.target.checked } }))} /> Anketör aktif</label>
              <Field label="Günlük masa kotası"><TextInput type="number" min="0" step="1" value={draft.dailyDeskQuota} onChange={(event) => setSurveyorDrafts((current) => ({ ...current, [person.staffId]: { ...draft, dailyDeskQuota: event.target.value } }))} /></Field>
              <Field label="Haftalık masa kotası"><TextInput type="number" min="0" step="1" value={draft.weeklyDeskQuota} onChange={(event) => setSurveyorDrafts((current) => ({ ...current, [person.staffId]: { ...draft, weeklyDeskQuota: event.target.value } }))} /></Field>
              <Button variant="secondary" disabled={saving === `surveyor-${person.staffId}`} onClick={() => void saveSurveyorProfile(person.staffId)}>{saving === `surveyor-${person.staffId}` ? "Kaydediliyor..." : "Kaydet"}</Button>
            </div>;
          })}</div> : <div className="px-5 py-8 text-center text-[12px] text-[var(--muted)]">Aktif şubede Anketör olarak tanımlanabilecek çalışan bulunmuyor.</div>}
        </GlassCard>
      </section>

      <section>
        <GlassCard className="p-0">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
            <div className="flex items-start gap-2">
              <CardInfo help={getCardHelp("CRM Veri Erişim Kapsamı", "Her rolün CRM içerisinde hangi müşterileri, potansiyel müşterileri, satış fırsatlarını, takipleri ve rapor verilerini görebileceğini belirler.")} />
              <div>
                <h2 className="text-[15px] font-semibold">CRM Veri Erişim Kapsamı</h2>
                <p className="mt-1 text-[10px] text-[var(--muted)]">Rol bazında müşteri ve satış verisi görünürlüğü</p>
              </div>
            </div>
          </div>
          {accessPolicies.length ? <div className="divide-y divide-[var(--line)]">{accessPolicies.map((policy) => {
            const value = accessPolicyDrafts[policy.roleId] ?? "SELF";
            const disabled = policy.roleSlug === "owner" || !policy.hasCrmRead;
            return <div key={policy.roleId} className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(220px,1fr)_260px_auto] lg:items-end">
              <div>
                <p className="text-[12px] font-semibold">{policy.roleName}</p>
                <p className="mt-1 text-[10px] text-[var(--muted)]">
                  {policy.membershipCount} aktif kullanıcı · {policy.hasCrmRead ? (policy.hasCrmManage ? "CRM görüntüleme ve yönetme yetkisi" : "CRM görüntüleme yetkisi") : "CRM erişim yetkisi yok"}
                </p>
              </div>
              <Field label="CRM veri kapsamı">
                <Select
                  value={value}
                  disabled={disabled}
                  onChange={(event) => setAccessPolicyDrafts((current) => ({ ...current, [policy.roleId]: event.target.value as CrmDataScope }))}
                >
                  {(Object.keys(dataScopeLabels) as CrmDataScope[]).map((scope) => <option key={scope} value={scope}>{dataScopeLabels[scope].label}</option>)}
                </Select>
              </Field>
              <Button
                variant="secondary"
                disabled={disabled || saving === `access-${policy.roleId}`}
                onClick={() => void saveAccessPolicy(policy.roleId)}
              >
                {saving === `access-${policy.roleId}` ? "Kaydediliyor..." : "Kapsamı Kaydet"}
              </Button>
              <p className="text-[10px] leading-5 text-[var(--muted)] lg:col-start-2 lg:col-span-2">{dataScopeLabels[value].description}</p>
            </div>;
          })}</div> : <div className="px-5 py-8 text-center text-[12px] text-[var(--muted)]">CRM erişim kapsamı tanımlanabilecek rol bulunmuyor.</div>}
        </GlassCard>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <GlassCard className="p-0">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <div className="flex items-start gap-2">
              <CardInfo help={getCardHelp("Satış Ekipleri", "Potansiyel müşteri dağıtımı ve SLA eskalasyonunda kullanılacak satış ekiplerini ve ekip üyelerini yönetir.")} />
              <div><h2 className="text-[15px] font-semibold">Satış Ekipleri</h2><p className="mt-1 text-[10px] text-[var(--muted)]">Ekip yöneticileri ve satış temsilcileri</p></div>
            </div>
          </div>
          {teams.length ? <div className="divide-y divide-[var(--line)]">{teams.map((team) => {
            const available = assignees.filter((person) => !team.members.some((member) => member.userId === person.id));
            return <div key={team.id} className="px-5 py-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div><p className="text-[12px] font-semibold">{team.name}</p><p className="mt-1 text-[10px] text-[var(--muted)]">Ekip yöneticisi: {[team.managerFirstName, team.managerLastName].filter(Boolean).join(" ") || "Belirtilmedi"} · {team.members.length} üye</p></div>
                <span className="text-[10px] font-medium text-[var(--muted)]">{team.active ? "Aktif" : "Pasif"}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">{team.members.map((member) => {
                const skillKey = `${team.id}:${member.userId}`;
                const skillValue = memberSkillInputs[skillKey] ?? member.skills.join(", ");
                return <div key={member.userId} className="rounded-[13px] border border-[var(--line)] bg-[var(--surface-2)]/35 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] font-medium">{member.firstName} {member.lastName}</span>
                    {member.userId !== team.managerUserId ? <button type="button" onClick={() => void removeTeamMember(team.id, member.userId)} disabled={saving === `member-${team.id}`} className="text-[10px] text-[var(--muted)] hover:text-[var(--danger)]">Ekipten çıkar</button> : null}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <TextInput
                      value={skillValue}
                      onChange={(event) => setMemberSkillInputs((current) => ({ ...current, [skillKey]: event.target.value }))}
                      placeholder="Yetkinlikler: lazer, vip, satış-kıdemli"
                    />
                    <Button type="button" variant="secondary" className="shrink-0" disabled={saving === `skills-${skillKey}`} onClick={() => void saveMemberSkills(team.id, member.userId)}>
                      {saving === `skills-${skillKey}` ? "Kaydediliyor..." : "Yetkinlikleri Kaydet"}
                    </Button>
                  </div>
                </div>;
              })}</div>
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                <Select value={memberSelections[team.id] ?? ""} onChange={(event) => setMemberSelections((current) => ({ ...current, [team.id]: event.target.value }))}>
                  <option value="">Ekip üyesi ekleyin</option>
                  {available.map((person) => <option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>)}
                </Select>
                <Button variant="secondary" disabled={!memberSelections[team.id] || saving === `member-${team.id}`} onClick={() => void addTeamMember(team.id)}>Üye Ekle</Button>
              </div>
            </div>;
          })}</div> : <div className="px-5 py-8 text-center text-[12px] text-[var(--muted)]">Henüz CRM satış ekibi oluşturulmamış.</div>}
        </GlassCard>

        <GlassCard>
          <div className="flex items-start gap-2">
            <CardInfo help={getCardHelp("Yeni Satış Ekibi", "Yeni bir CRM satış ekibi oluşturur ve seçilen kullanıcıyı ekip yöneticisi olarak tanımlar.")} />
            <div><h2 className="text-[15px] font-semibold">Yeni Satış Ekibi</h2><p className="mt-1 text-[10px] text-[var(--muted)]">Aktif şube için ekip oluşturun</p></div>
          </div>
          <form onSubmit={createTeam} className="mt-5 space-y-4">
            <Field label="Ekip adı" required><TextInput value={teamForm.name} onChange={(event) => setTeamForm({ ...teamForm, name: event.target.value })} /></Field>
            <Field label="Ekip yöneticisi" required><Select value={teamForm.managerUserId} onChange={(event) => setTeamForm({ ...teamForm, managerUserId: event.target.value })}><option value="">Yönetici seçin</option>{assignees.map((person) => <option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>)}</Select></Field>
            <Button type="submit" className="w-full" disabled={saving === "team"}>{saving === "team" ? "Oluşturuluyor..." : "Ekibi Oluştur"}</Button>
          </form>
        </GlassCard>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <GlassCard className="p-0">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <div className="flex items-start gap-2">
              <CardInfo help={getCardHelp("Potansiyel Müşteri Atama Kuralları", "Yeni potansiyel müşterilerin satış ekibine hangi yöntemle dağıtılacağını belirler.")} />
              <div>
                <h2 className="text-[15px] font-semibold">Potansiyel Müşteri Atama Kuralları</h2>
                <p className="mt-1 text-[10px] text-[var(--muted)]">Otomatik satış ekibi dağıtım politikaları</p>
              </div>
            </div>
          </div>
          {assignmentRules.length ? (
            <div className="divide-y divide-[var(--line)]">
              {assignmentRules.map((rule) => (
                <div key={rule.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_180px_100px_auto] sm:items-center">
                  <div>
                    <div className="flex items-center gap-2"><p className="text-[12px] font-semibold">{rule.name}</p><span className={rule.active ? "rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[9px] font-semibold text-[var(--accent)]" : "rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[9px] font-semibold text-[var(--muted)]"}>{rule.active ? "Aktif" : "Pasif"}</span></div>
                    <p className="mt-1 text-[10px] text-[var(--muted)]">
                      {rule.sourceFilter ? `Kaynak: ${sourceLabels[rule.sourceFilter] ?? rule.sourceFilter}` : "Tüm kaynaklar"}
                      {rule.skillKey ? ` · Yetkinlik: ${rule.skillKey}` : ""}
                    </p>
                  </div>
                  <span className="text-[11px] font-medium">{assignmentModeLabels[rule.mode]}</span>
                  <span className="text-[10px] text-[var(--muted)]">Öncelik: {rule.priority}</span>
                  <Button variant="secondary" className="min-h-8 px-3 text-[10px]" disabled={saving === `assignment-${rule.id}`} onClick={() => void toggleAssignmentRule(rule)}>{saving === `assignment-${rule.id}` ? "Kaydediliyor..." : rule.active ? "Pasife Al" : "Aktifleştir"}</Button>
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
            <Field label="Satış ekibi">
              <Select value={assignmentForm.teamId} onChange={(event) => setAssignmentForm({ ...assignmentForm, teamId: event.target.value })}>
                <option value="">Aktif şubedeki tüm CRM ekipleri</option>
                {teams.filter((team) => team.active).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
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
