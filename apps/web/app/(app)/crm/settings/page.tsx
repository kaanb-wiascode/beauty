"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, EmptyState, Field, Select, Spinner, TextArea, TextInput } from "@/components/ui";
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
    if (!activeBranch) {
      setLoading(false);
      return;
    }
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
  }, [activeBranch]);

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

  const tabs: Array<{ value: SettingsTab; label: string; description: string }> = [
    { value: "OVERVIEW", label: "Genel Bakış", description: "CRM yapılandırma özeti" },
    { value: "TEAM_ACCESS", label: "Ekipler ve Yetkiler", description: "Kim neyi görür ve yönetir" },
    { value: "ASSIGNMENT", label: "Müşteri Dağıtımı", description: "Yeni kayıtlar kime düşer" },
    { value: "FOLLOW_UP", label: "Takip ve Otomatik İşler", description: "Süreler, uyarılar ve görevler" },
    { value: "CHANNELS", label: "İletişim Kanalları", description: "WhatsApp, SMS ve e-posta" },
    { value: "SURVEYORS", label: "Anketörler", description: "Anketör kullanımı ve kotalar" },
  ];

  return (
    <div className="space-y-5">
      <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[12px] font-medium text-[var(--muted)]">Müşteri ilişkileri yönetimi</p>
            <h1 className="mt-1 text-[32px] font-semibold tracking-[-.045em] text-[var(--ink)]">CRM Ayar Merkezi</h1>
            <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--muted)]">
              Satış ekiplerini, müşteri dağıtımını, takip sürelerini, otomatik görevleri ve iletişim kanallarını tek yerden yönetin.
            </p>
          </div>
          <Button variant="secondary" onClick={() => void load()} disabled={Boolean(saving)}>
            Ayarları Yenile
          </Button>
        </div>
      </header>

      {!activeBranch ? <Alert>CRM ayarlarını yönetmek için çalışma kapsamından bir şube seçin.</Alert> : null}
      {activeBranch && !canManage ? <Alert>Bu ayarları görüntüleyebilirsiniz; değişiklik yapmak için müşteri ilişkileri yönetim yetkisi gerekir.</Alert> : null}
      {error ? <Alert onClose={() => setError("")}>{userErrorMessage(error, "CRM ayarlarıyla ilgili işlem tamamlanamadı.")}</Alert> : null}

      <section className="overflow-x-auto rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-2 shadow-[var(--shadow-soft)]">
        <div className="flex min-w-max gap-1">
          {tabs.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setTab(item.value)}
              className={tab === item.value
                ? "min-w-[145px] rounded-[12px] bg-[var(--accent-soft)] px-4 py-3 text-left text-[var(--accent)]"
                : "min-w-[145px] rounded-[12px] px-4 py-3 text-left text-[var(--muted)] hover:bg-[var(--surface-2)]"}
            >
              <span className="block text-[10px] font-semibold">{item.label}</span>
              <span className="mt-1 block text-[8px] leading-4 opacity-80">{item.description}</span>
            </button>
          ))}
        </div>
      </section>

      {tab === "OVERVIEW" ? (
        <div className="space-y-4">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {[
              ["Aktif Satış Ekibi", settingsSummary.activeTeams, "Müşteri dağıtımında kullanılabilen ekipler"],
              ["Ekip Üyesi", settingsSummary.teamMembers, "CRM ekiplerinde yer alan benzersiz kullanıcılar"],
              ["Aktif Dağıtım Kuralı", settingsSummary.activeAssignmentRules, "Yeni müşteriyi otomatik yönlendiren kurallar"],
              ["Aktif Takip Kuralı", settingsSummary.activeTaskRules, "Otomatik görev oluşturan kurallar"],
              ["Aktif Süre Uyarısı", settingsSummary.activeTimeRules, "Dönüş ve takip süresi kontrolleri"],
              ["Aktif Anketör", settingsSummary.activeSurveyors, "Müşteri kaynağı olarak kullanılabilen anketörler"],
            ].map(([label, value, detail]) => (
              <article key={String(label)} className="rounded-[17px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)]">
                <span className="text-[9px] font-medium text-[var(--muted)]">{label}</span>
                <strong className="mt-3 block text-[23px] font-semibold tracking-[-.04em] text-[var(--ink)]">{value}</strong>
                <span className="mt-2 block text-[8px] leading-4 text-[var(--muted)]">{detail}</span>
              </article>
            ))}
          </section>

          <section className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {tabs.filter((item) => item.value !== "OVERVIEW").map((item) => (
              <button key={item.value} type="button" onClick={() => setTab(item.value)} className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5 text-left shadow-[var(--shadow-soft)] transition hover:border-[var(--line-strong)]">
                <h2 className="text-[13px] font-semibold text-[var(--ink)]">{item.label}</h2>
                <p className="mt-2 text-[9px] leading-5 text-[var(--muted)]">{item.description}</p>
                <span className="mt-4 inline-flex text-[9px] font-semibold text-[var(--accent)]">Ayarları Aç →</span>
              </button>
            ))}
            <Link href="/crm/compliance" className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)] transition hover:border-[var(--line-strong)]">
              <h2 className="text-[13px] font-semibold text-[var(--ink)]">Müşteri İletişim İzinleri</h2>
              <p className="mt-2 text-[9px] leading-5 text-[var(--muted)]">WhatsApp, SMS ve e-posta izinlarını müşteri bazında yönetin.</p>
              <span className="mt-4 inline-flex text-[9px] font-semibold text-[var(--accent)]">İzinleri Yönet →</span>
            </Link>
          </section>
        </div>
      ) : null}

      {tab === "TEAM_ACCESS" ? (
        <div className="space-y-4">
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
              <div className="border-b border-[var(--line)] p-5">
                <h2 className="text-[14px] font-semibold text-[var(--ink)]">Satış Ekipleri</h2>
                <p className="mt-1 text-[9px] text-[var(--muted)]">Ekip yöneticilerini, üyeleri ve dağıtımda kullanılacak uzmanlık etiketlerini yönetin.</p>
              </div>
              {teams.length ? <div className="divide-y divide-[var(--line)]">
                {teams.map((team) => {
                  const available = assignees.filter((person) => !team.members.some((member) => member.userId === person.id));
                  return <div key={team.id} className="p-5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <strong className="text-[12px] text-[var(--ink)]">{team.name}</strong>
                          <span className={team.active ? "rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[8px] font-semibold text-[var(--accent)]" : "rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[8px] font-semibold text-[var(--muted)]"}>{team.active ? "Aktif" : "Pasif"}</span>
                        </div>
                        <p className="mt-1 text-[9px] text-[var(--muted)]">Yönetici: {[team.managerFirstName, team.managerLastName].filter(Boolean).join(" ") || "Belirtilmedi"} · {team.members.length} üye</p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      {team.members.map((member) => {
                        const skillKey = team.id + ":" + member.userId;
                        const skillValue = memberSkillInputs[skillKey] ?? member.skills.join(", ");
                        return <div key={member.userId} className="rounded-[13px] bg-[var(--surface-2)] p-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[10px] font-semibold text-[var(--ink)]">{member.firstName} {member.lastName}</span>
                            {member.userId !== team.managerUserId ? <button type="button" onClick={() => void removeTeamMember(team.id, member.userId)} disabled={!canManage || saving === "member-" + team.id} className="text-[8px] font-medium text-[var(--muted)] hover:text-[var(--danger)]">Ekipten Çıkar</button> : <span className="text-[8px] text-[var(--accent)]">Ekip Yöneticisi</span>}
                          </div>
                          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                            <TextInput
                              value={skillValue}
                              disabled={!canManage}
                              onChange={(event) => setMemberSkillInputs((current) => ({ ...current, [skillKey]: event.target.value }))}
                              placeholder="Uzmanlık etiketleri: lazer, vip, kıdemli satış"
                            />
                            <Button type="button" variant="secondary" disabled={!canManage || saving === "skills-" + skillKey} onClick={() => void saveMemberSkills(team.id, member.userId)}>
                              {saving === "skills-" + skillKey ? "Kaydediliyor…" : "Uzmanlıkları Kaydet"}
                            </Button>
                          </div>
                        </div>;
                      })}
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                      <Select disabled={!canManage} value={memberSelections[team.id] ?? ""} onChange={(event) => setMemberSelections((current) => ({ ...current, [team.id]: event.target.value }))}>
                        <option value="">Ekip üyesi seçin</option>
                        {available.map((person) => <option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>)}
                      </Select>
                      <Button variant="secondary" disabled={!canManage || !memberSelections[team.id] || saving === "member-" + team.id} onClick={() => void addTeamMember(team.id)}>Üye Ekle</Button>
                    </div>
                  </div>;
                })}
              </div> : <div className="p-6"><EmptyState title="Satış ekibi yok" description="Henüz CRM satış ekibi oluşturulmamış." /></div>}
            </div>

            <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
              <h2 className="text-[14px] font-semibold text-[var(--ink)]">Yeni Satış Ekibi</h2>
              <p className="mt-1 text-[9px] text-[var(--muted)]">Yeni bir ekip oluşturun ve yöneticisini seçin.</p>
              <form onSubmit={createTeam} className="mt-5 space-y-4">
                <Field label="Ekip Adı" required><TextInput disabled={!canManage} value={teamForm.name} onChange={(event) => setTeamForm({ ...teamForm, name: event.target.value })} /></Field>
                <Field label="Ekip Yöneticisi" required><Select disabled={!canManage} value={teamForm.managerUserId} onChange={(event) => setTeamForm({ ...teamForm, managerUserId: event.target.value })}><option value="">Yönetici seçin</option>{assignees.map((person) => <option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>)}</Select></Field>
                <Button type="submit" className="w-full" disabled={!canManage || saving === "team"}>{saving === "team" ? "Oluşturuluyor…" : "Ekibi Oluştur"}</Button>
              </form>
            </div>
          </section>

          <section className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
            <div className="border-b border-[var(--line)] p-5">
              <h2 className="text-[14px] font-semibold text-[var(--ink)]">Kim Hangi CRM Kayıtlarını Görebilir?</h2>
              <p className="mt-1 text-[9px] text-[var(--muted)]">Her rolün müşteri, satış fırsatı, takip ve rapor verilerinde ne kadar geniş bir alan görebileceğini belirleyin.</p>
            </div>
            {accessPolicies.length ? <div className="divide-y divide-[var(--line)]">
              {accessPolicies.map((policy) => {
                const value = accessPolicyDrafts[policy.roleId] ?? "SELF";
                const disabled = policy.roleSlug === "owner" || !policy.hasCrmRead || !canManage;
                return <div key={policy.roleId} className="grid gap-3 p-4 lg:grid-cols-[minmax(220px,1fr)_260px_auto] lg:items-end">
                  <div>
                    <strong className="text-[11px] text-[var(--ink)]">{policy.roleName}</strong>
                    <p className="mt-1 text-[8px] text-[var(--muted)]">{policy.membershipCount} aktif kullanıcı · {policy.hasCrmRead ? (policy.hasCrmManage ? "Görüntüleyebilir ve yönetebilir" : "Yalnız görüntüleyebilir") : "CRM erişimi yok"}</p>
                  </div>
                  <Field label="Görebileceği Kayıtlar">
                    <Select value={value} disabled={disabled} onChange={(event) => setAccessPolicyDrafts((current) => ({ ...current, [policy.roleId]: event.target.value as CrmDataScope }))}>
                      {(Object.keys(dataScopeLabels) as CrmDataScope[]).map((scope) => <option key={scope} value={scope}>{dataScopeLabels[scope].label}</option>)}
                    </Select>
                  </Field>
                  <Button variant="secondary" disabled={disabled || saving === "access-" + policy.roleId} onClick={() => void saveAccessPolicy(policy.roleId)}>{saving === "access-" + policy.roleId ? "Kaydediliyor…" : "Kaydet"}</Button>
                  <p className="text-[8px] leading-4 text-[var(--muted)] lg:col-start-2 lg:col-span-2">{dataScopeLabels[value].description}</p>
                </div>;
              })}
            </div> : <div className="p-6"><EmptyState title="Rol bulunamadı" description="CRM erişim kapsamı tanımlanabilecek rol bulunmuyor." /></div>}
          </section>
        </div>
      ) : null}

      {tab === "ASSIGNMENT" ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
            <div className="border-b border-[var(--line)] p-5">
              <h2 className="text-[14px] font-semibold text-[var(--ink)]">Yeni Müşteriler Kime Atansın?</h2>
              <p className="mt-1 text-[9px] text-[var(--muted)]">Yeni potansiyel müşterilerin satış ekibine otomatik dağıtım sırasını yönetin. Daha küçük öncelik numarası önce çalışır.</p>
            </div>
            {assignmentRules.length ? <div className="divide-y divide-[var(--line)]">
              {assignmentRules.map((rule) => (
                <div key={rule.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(220px,1fr)_180px_110px_auto] lg:items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      <strong className="text-[11px] text-[var(--ink)]">{rule.name}</strong>
                      <span className={rule.active ? "rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[8px] font-semibold text-[var(--accent)]" : "rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[8px] text-[var(--muted)]"}>{rule.active ? "Aktif" : "Kapalı"}</span>
                    </div>
                    <p className="mt-1 text-[8px] text-[var(--muted)]">{rule.sourceFilter ? "Kaynak: " + (sourceLabels[rule.sourceFilter] ?? rule.sourceFilter) : "Tüm müşteri kaynakları"}{rule.skillKey ? " · Gerekli uzmanlık: " + rule.skillKey : ""}</p>
                  </div>
                  <span className="text-[9px] font-medium text-[var(--ink)]">{assignmentModeLabels[rule.mode]}</span>
                  <span className="text-[8px] text-[var(--muted)]">Sıra: {rule.priority}</span>
                  <Button variant="secondary" disabled={!canManage || saving === "assignment-" + rule.id} onClick={() => void toggleAssignmentRule(rule)}>{rule.active ? "Kapat" : "Aktifleştir"}</Button>
                </div>
              ))}
            </div> : <div className="p-6"><EmptyState title="Dağıtım kuralı yok" description="Kural yoksa yeni kayıt, oluşturan kullanıcıya atanır." /></div>}
          </div>

          <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
            <h2 className="text-[14px] font-semibold text-[var(--ink)]">Yeni Dağıtım Kuralı</h2>
            <p className="mt-1 text-[9px] leading-4 text-[var(--muted)]">Belirli bir kaynaktan gelen müşterileri uygun satış ekibine otomatik yönlendirin.</p>
            <form onSubmit={createAssignmentRule} className="mt-5 space-y-4">
              <Field label="Kural Adı" required><TextInput disabled={!canManage} value={assignmentForm.name} onChange={(event) => setAssignmentForm({ ...assignmentForm, name: event.target.value })} /></Field>
              <Field label="Müşteriler Nasıl Dağıtılsın?" required>
                <Select disabled={!canManage} value={assignmentForm.mode} onChange={(event) => setAssignmentForm({ ...assignmentForm, mode: event.target.value as AssignmentMode })}>
                  {Object.entries(assignmentModeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
              </Field>
              <Field label="Hangi Satış Ekibi?">
                <Select disabled={!canManage} value={assignmentForm.teamId} onChange={(event) => setAssignmentForm({ ...assignmentForm, teamId: event.target.value })}>
                  <option value="">Tüm aktif CRM ekipleri</option>
                  {teams.filter((team) => team.active).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </Select>
              </Field>
              <Field label="Hangi Kaynaktan Gelenler?">
                <Select disabled={!canManage} value={assignmentForm.sourceFilter} onChange={(event) => setAssignmentForm({ ...assignmentForm, sourceFilter: event.target.value })}>
                  <option value="">Tüm kaynaklar</option>
                  {Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
              </Field>
              {assignmentForm.mode === "SKILL_BASED" ? <Field label="Gerekli Uzmanlık Etiketi"><TextInput disabled={!canManage} value={assignmentForm.skillKey} onChange={(event) => setAssignmentForm({ ...assignmentForm, skillKey: event.target.value })} placeholder="Örn. lazer, vip, kıdemli satış" /></Field> : null}
              <Field label="Çalışma Sırası"><TextInput disabled={!canManage} type="number" min="1" max="10000" value={assignmentForm.priority} onChange={(event) => setAssignmentForm({ ...assignmentForm, priority: event.target.value })} /></Field>
              <Button type="submit" className="w-full" disabled={!canManage || saving === "assignment"}>{saving === "assignment" ? "Oluşturuluyor…" : "Kuralı Oluştur"}</Button>
            </form>
          </div>
        </section>
      ) : null}

      {tab === "FOLLOW_UP" ? (
        <div className="space-y-5">
          <section>
            <div className="mb-3">
              <h2 className="text-[14px] font-semibold text-[var(--ink)]">Müşteri Dönüş ve Takip Süreleri</h2>
              <p className="mt-1 text-[9px] text-[var(--muted)]">Satış ekibinin ne kadar sürede aksiyon alması gerektiğini iş diliyle belirleyin.</p>
            </div>
            <div className="grid gap-4 xl:grid-cols-3">
              {slaRules.map((rule) => {
                const meta = slaLabels[rule.ruleKey];
                const isLead = rule.ruleKey === "LEAD_FIRST_RESPONSE_SLA";
                const isFollowUp = rule.ruleKey === "FOLLOW_UP_OVERDUE_ESCALATION";
                const primaryKey = isLead ? "thresholdMinutes" : isFollowUp ? "graceMinutes" : "staleDays";
                const primaryLabel = isLead ? "En geç kaç dakikada dönüş yapılsın?" : isFollowUp ? "Takip kaç dakika gecikebilir?" : "Kaç gün hareketsiz kalabilir?";
                const primaryValue = Number(rule.config[primaryKey] ?? (isLead ? 60 : isFollowUp ? 30 : 7));
                const delay = Number(rule.config.escalationDelayMinutes ?? 15);
                return <article key={rule.ruleKey} className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
                  <div className="flex items-start justify-between gap-3">
                    <div><h3 className="text-[12px] font-semibold text-[var(--ink)]">{meta.title}</h3><p className="mt-2 text-[9px] leading-5 text-[var(--muted)]">{meta.description}</p></div>
                    <label className="flex items-center gap-2 text-[8px] font-semibold text-[var(--muted)]"><input type="checkbox" checked={rule.enabled} disabled={!canManage || saving === rule.ruleKey} onChange={(event) => void updateSla(rule, { ...rule.config }, event.target.checked)} /> {rule.enabled ? "Açık" : "Kapalı"}</label>
                  </div>
                  <div className="mt-5 space-y-4">
                    <Field label={primaryLabel}><TextInput disabled={!canManage} type="number" min="1" value={String(primaryValue)} onChange={(event) => setAutomationConfig(rule.ruleKey, primaryKey, Number(event.target.value))} /></Field>
                    <Field label="Uyarıdan sonra yeni aksiyon kaç dakika içinde oluşsun?"><TextInput disabled={!canManage} type="number" min="1" value={String(delay)} onChange={(event) => setAutomationConfig(rule.ruleKey, "escalationDelayMinutes", Number(event.target.value))} /></Field>
                    <Button variant="secondary" className="w-full" disabled={!canManage || saving === rule.ruleKey} onClick={() => void updateSla(rule, { ...rule.config, channel: String(rule.config.channel ?? "CALL") })}>{saving === rule.ruleKey ? "Kaydediliyor…" : "Süreleri Kaydet"}</Button>
                  </div>
                </article>;
              })}
            </div>
          </section>

          <section>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-[14px] font-semibold text-[var(--ink)]">Otomatik Takip Görevleri</h2>
                <p className="mt-1 text-[9px] text-[var(--muted)]">Sistem hangi durumda kendiliğinden takip görevi oluştursun?</p>
              </div>
              <Link href="/crm/automations" className="text-[9px] font-semibold text-[var(--accent)]">Çalışma Geçmişini Gör →</Link>
            </div>
            <div className="grid gap-4 xl:grid-cols-3">
              {taskAutomationRules.map((rule) => {
                const meta = taskAutomationLabels[rule.ruleKey];
                const channel = String(rule.config.channel ?? "CALL");
                return <article key={rule.ruleKey} className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
                  <div className="flex items-start justify-between gap-3">
                    <div><h3 className="text-[12px] font-semibold text-[var(--ink)]">{meta.title}</h3><p className="mt-2 text-[9px] leading-5 text-[var(--muted)]">{meta.description}</p></div>
                    <label className="flex items-center gap-2 text-[8px] font-semibold text-[var(--muted)]"><input type="checkbox" checked={rule.enabled} disabled={!canManage || saving === rule.ruleKey} onChange={(event) => setAutomationRules((current) => current.map((item) => item.ruleKey === rule.ruleKey ? { ...item, enabled: event.target.checked } : item))} /> {rule.enabled ? "Açık" : "Kapalı"}</label>
                  </div>
                  <div className="mt-5 space-y-4">
                    {rule.ruleKey === "LEAD_FIRST_TOUCH" ? <Field label="Yeni müşteri geldikten kaç saat sonra takip oluşsun?"><TextInput disabled={!canManage} type="number" min="1" max="720" value={String(automationNumber(rule, "delayHours", 24))} onChange={(event) => setAutomationConfig(rule.ruleKey, "delayHours", Number(event.target.value))} /></Field> : null}
                    {rule.ruleKey === "OPPORTUNITY_STAGE_FOLLOW_UP" ? <>
                      <Field label="Normal aşamalarda kaç gün sonra takip?"><TextInput disabled={!canManage} type="number" min="1" max="90" value={String(automationNumber(rule, "defaultDelayDays", 2))} onChange={(event) => setAutomationConfig(rule.ruleKey, "defaultDelayDays", Number(event.target.value))} /></Field>
                      <Field label="Karar beklenirken kaç gün sonra takip?"><TextInput disabled={!canManage} type="number" min="1" max="90" value={String(automationNumber(rule, "negotiationDelayDays", 1))} onChange={(event) => setAutomationConfig(rule.ruleKey, "negotiationDelayDays", Number(event.target.value))} /></Field>
                    </> : null}
                    {rule.ruleKey === "STALE_OPPORTUNITY_FOLLOW_UP" ? <>
                      <Field label="Kaç gün hareketsiz kalınca görev oluşsun?"><TextInput disabled={!canManage} type="number" min="1" max="90" value={String(automationNumber(rule, "staleDays", 14))} onChange={(event) => setAutomationConfig(rule.ruleKey, "staleDays", Number(event.target.value))} /></Field>
                      <Field label="Görev kaç saat sonrasına planlansın?"><TextInput disabled={!canManage} type="number" min="1" max="720" value={String(automationNumber(rule, "delayHours", 24))} onChange={(event) => setAutomationConfig(rule.ruleKey, "delayHours", Number(event.target.value))} /></Field>
                    </> : null}
                    <Field label="Varsayılan Takip Kanalı">
                      <Select disabled={!canManage} value={channel} onChange={(event) => setAutomationConfig(rule.ruleKey, "channel", event.target.value)}>
                        {Object.entries(channelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </Select>
                    </Field>

                    {rule.ruleKey === "LEAD_FIRST_TOUCH" || rule.ruleKey === "OPPORTUNITY_STAGE_FOLLOW_UP" ? <div className="rounded-[13px] border border-[var(--line)] bg-[var(--surface-2)]/45 p-3">
                      <label className="flex items-center justify-between gap-3">
                        <div><span className="block text-[9px] font-semibold text-[var(--ink)]">Müşteriye Otomatik Mesaj Gönder</span><span className="mt-1 block text-[8px] leading-4 text-[var(--muted)]">Takip görevi oluştuğunda müşteriye seçilen kanaldan mesaj gönderilsin.</span></div>
                        <input type="checkbox" disabled={!canManage} checked={rule.config.messageEnabled === true} onChange={(event) => setAutomationRules((current) => current.map((item) => item.ruleKey === rule.ruleKey ? { ...item, config: { ...item.config, messageEnabled: event.target.checked } } : item))} />
                      </label>
                      {rule.config.messageEnabled === true ? <div className="mt-3 space-y-3">
                        <Field label="Mesaj Kanalı">
                          <Select disabled={!canManage} value={String(rule.config.messageChannel ?? "WHATSAPP")} onChange={(event) => setAutomationConfig(rule.ruleKey, "messageChannel", event.target.value)}>
                            <option value="WHATSAPP">WhatsApp</option>
                            <option value="SMS">SMS</option>
                            <option value="EMAIL">E-posta</option>
                          </Select>
                        </Field>
                        <Field label="Gönderilecek Mesaj">
                          <TextArea disabled={!canManage} rows={4} maxLength={2000} value={String(rule.config.messageTemplate ?? "")} onChange={(event) => setAutomationRules((current) => current.map((item) => item.ruleKey === rule.ruleKey ? { ...item, config: { ...item.config, messageTemplate: event.target.value } } : item))} placeholder="Müşteriye gönderilecek mesajı yazın…" />
                        </Field>
                      </div> : null}
                    </div> : null}

                    <Button className="w-full" disabled={!canManage || saving === rule.ruleKey} onClick={() => void updateSla(rule, { ...rule.config })}>{saving === rule.ruleKey ? "Kaydediliyor…" : "Otomatik İşleri Kaydet"}</Button>
                  </div>
                </article>;
              })}
            </div>
          </section>
        </div>
      ) : null}

      {tab === "CHANNELS" ? (
        <div className="space-y-4">
          <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
            <h2 className="text-[14px] font-semibold text-[var(--ink)]">Müşteriyle Hangi Kanallardan İletişim Kurulabilir?</h2>
            <p className="mt-1 text-[9px] leading-5 text-[var(--muted)]">WhatsApp, SMS ve e-posta gönderim bağlantılarını bu alandan yönetin. Gizli bağlantı bilgileri kaydedildikten sonra tekrar gösterilmez.</p>
          </section>

          <CrmMessageProviderSettings />
          <CrmTwilioSmsSettings />
          <CrmResendEmailSettings />

          <section className="grid gap-3 lg:grid-cols-2">
            <Link href="/crm/compliance" className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)] transition hover:border-[var(--line-strong)]">
              <h3 className="text-[12px] font-semibold text-[var(--ink)]">Müşteri İletişim İzinleri</h3>
              <p className="mt-2 text-[9px] leading-5 text-[var(--muted)]">Belirli bir müşterinin WhatsApp, SMS ve e-posta iletişim iznini görüntüleyin veya güncelleyin.</p>
              <span className="mt-4 inline-flex text-[9px] font-semibold text-[var(--accent)]">İzinleri Yönet →</span>
            </Link>
            <Link href="/crm/communications" className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)] transition hover:border-[var(--line-strong)]">
              <h3 className="text-[12px] font-semibold text-[var(--ink)]">Bağlantı Sağlığı ve Teslimat Geçmişi</h3>
              <p className="mt-2 text-[9px] leading-5 text-[var(--muted)]">Gönderim hatalarını, gelen mesajları ve mesaj teslimat durumlarını inceleyin.</p>
              <span className="mt-4 inline-flex text-[9px] font-semibold text-[var(--accent)]">İletişim Durumunu Gör →</span>
            </Link>
          </section>
        </div>
      ) : null}

      {tab === "SURVEYORS" ? (
        <section className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
          <div className="border-b border-[var(--line)] p-5">
            <h2 className="text-[14px] font-semibold text-[var(--ink)]">Anketör Ayarları</h2>
            <p className="mt-1 text-[9px] text-[var(--muted)]">Hangi çalışanların müşteri kaynağı olarak kullanılacağını ve günlük/haftalık hedeflerini belirleyin.</p>
          </div>
          {surveyorCandidates.length ? <div className="divide-y divide-[var(--line)]">
            {surveyorCandidates.map((person) => {
              const draft = surveyorDrafts[person.staffId] ?? {
                active: person.active,
                dailyDeskQuota: person.dailyDeskQuota == null ? "" : String(person.dailyDeskQuota),
                weeklyDeskQuota: person.weeklyDeskQuota == null ? "" : String(person.weeklyDeskQuota),
              };
              return <div key={person.staffId} className="grid gap-3 p-4 lg:grid-cols-[minmax(180px,1fr)_150px_160px_160px_auto] lg:items-end">
                <div><strong className="text-[11px] text-[var(--ink)]">{person.firstName} {person.lastName}</strong><p className="mt-1 text-[8px] text-[var(--muted)]">{draft.active ? "Yeni müşteri kaydında anketör olarak seçilebilir" : "Anketör olarak kullanılmıyor"}</p></div>
                <label className="flex h-10 items-center gap-2 rounded-[10px] border border-[var(--line)] px-3 text-[9px]"><input disabled={!canManage} type="checkbox" checked={draft.active} onChange={(event) => setSurveyorDrafts((current) => ({ ...current, [person.staffId]: { ...draft, active: event.target.checked } }))} /> Anketör Olarak Kullan</label>
                <Field label="Günlük Hedef"><TextInput disabled={!canManage} type="number" min="0" step="1" value={draft.dailyDeskQuota} onChange={(event) => setSurveyorDrafts((current) => ({ ...current, [person.staffId]: { ...draft, dailyDeskQuota: event.target.value } }))} /></Field>
                <Field label="Haftalık Hedef"><TextInput disabled={!canManage} type="number" min="0" step="1" value={draft.weeklyDeskQuota} onChange={(event) => setSurveyorDrafts((current) => ({ ...current, [person.staffId]: { ...draft, weeklyDeskQuota: event.target.value } }))} /></Field>
                <Button variant="secondary" disabled={!canManage || saving === "surveyor-" + person.staffId} onClick={() => void saveSurveyorProfile(person.staffId)}>{saving === "surveyor-" + person.staffId ? "Kaydediliyor…" : "Kaydet"}</Button>
              </div>;
            })}
          </div> : <div className="p-6"><EmptyState title="Anketör adayı yok" description="Aktif şubede anketör olarak tanımlanabilecek çalışan bulunmuyor." /></div>}
        </section>
      ) : null}
    </div>
  );
}
