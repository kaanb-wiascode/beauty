"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Field,
  GlassCard,
  PageHeader,
  Select,
  Spinner,
  TextInput,
} from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasActiveBranch, hasPermission } from "@/lib/auth";

type RoutingStrategy = "ROUND_ROBIN" | "LEAST_ACTIVE";
type LeadTemperature = "COLD" | "WARM" | "HOT";
type PurchaseUrgency = "IMMEDIATE" | "THIS_WEEK" | "THIS_MONTH" | "LATER" | "UNKNOWN";
type ContactChannel = "CALL" | "SMS" | "EMAIL" | "WHATSAPP" | "IN_PERSON" | "OTHER";

type RoutingConditions = {
  sources?: string[];
  temperatures?: LeadTemperature[];
  minScore?: number;
  maxScore?: number;
  purchaseUrgencies?: PurchaseUrgency[];
  preferredContactChannels?: ContactChannel[];
  interestedServiceIds?: string[];
  interestedPackageIds?: string[];
};

type RoutingTarget = {
  id: string;
  userId: string;
  position: number;
  enabled: boolean;
};

type RoutingRule = {
  id: string;
  name: string;
  priority: number;
  strategy: RoutingStrategy;
  conditions: RoutingConditions;
  team: string | null;
  enabled: boolean;
  version: number;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: string;
  updatedAt: string;
  targets: RoutingTarget[];
};

type Assignee = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};

type RuleEvent = {
  id: string;
  eventType: "RULE_CREATED" | "RULE_UPDATED" | "TARGETS_REPLACED";
  actorUserId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type RuleDraft = {
  id: string | null;
  version: number | null;
  name: string;
  priority: string;
  strategy: RoutingStrategy;
  team: string;
  enabled: boolean;
  targetUserIds: string[];
  sources: string;
  temperatures: LeadTemperature[];
  minScore: string;
  maxScore: string;
  purchaseUrgencies: PurchaseUrgency[];
  preferredContactChannels: ContactChannel[];
  interestedServiceIds: string;
  interestedPackageIds: string;
};

const TEMPERATURES: Array<{ value: LeadTemperature; label: string }> = [
  { value: "HOT", label: "HOT" },
  { value: "WARM", label: "WARM" },
  { value: "COLD", label: "COLD" },
];

const URGENCIES: Array<{ value: PurchaseUrgency; label: string }> = [
  { value: "IMMEDIATE", label: "Hemen" },
  { value: "THIS_WEEK", label: "Bu hafta" },
  { value: "THIS_MONTH", label: "Bu ay" },
  { value: "LATER", label: "Daha sonra" },
  { value: "UNKNOWN", label: "Bilinmiyor" },
];

const CHANNELS: Array<{ value: ContactChannel; label: string }> = [
  { value: "CALL", label: "Arama" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "SMS", label: "SMS" },
  { value: "EMAIL", label: "E-posta" },
  { value: "IN_PERSON", label: "Yüz yüze" },
  { value: "OTHER", label: "Diğer" },
];

function emptyDraft(): RuleDraft {
  return {
    id: null,
    version: null,
    name: "",
    priority: "100",
    strategy: "ROUND_ROBIN",
    team: "",
    enabled: true,
    targetUserIds: [],
    sources: "",
    temperatures: [],
    minScore: "",
    maxScore: "",
    purchaseUrgencies: [],
    preferredContactChannels: [],
    interestedServiceIds: "",
    interestedPackageIds: "",
  };
}

function csv(values: string[] | undefined) {
  return values?.join(", ") ?? "";
}

function parseCsv(value: string) {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

function draftFromRule(rule: RoutingRule): RuleDraft {
  return {
    id: rule.id,
    version: rule.version,
    name: rule.name,
    priority: String(rule.priority),
    strategy: rule.strategy,
    team: rule.team ?? "",
    enabled: rule.enabled,
    targetUserIds: rule.targets.filter((target) => target.enabled).sort((a, b) => a.position - b.position).map((target) => target.userId),
    sources: csv(rule.conditions.sources),
    temperatures: rule.conditions.temperatures ?? [],
    minScore: rule.conditions.minScore === undefined ? "" : String(rule.conditions.minScore),
    maxScore: rule.conditions.maxScore === undefined ? "" : String(rule.conditions.maxScore),
    purchaseUrgencies: rule.conditions.purchaseUrgencies ?? [],
    preferredContactChannels: rule.conditions.preferredContactChannels ?? [],
    interestedServiceIds: csv(rule.conditions.interestedServiceIds),
    interestedPackageIds: csv(rule.conditions.interestedPackageIds),
  };
}

function conditionsFromDraft(draft: RuleDraft): RoutingConditions {
  const conditions: RoutingConditions = {};
  const sources = parseCsv(draft.sources);
  const serviceIds = parseCsv(draft.interestedServiceIds);
  const packageIds = parseCsv(draft.interestedPackageIds);
  if (sources.length) conditions.sources = sources;
  if (draft.temperatures.length) conditions.temperatures = draft.temperatures;
  if (draft.minScore !== "") conditions.minScore = Number(draft.minScore);
  if (draft.maxScore !== "") conditions.maxScore = Number(draft.maxScore);
  if (draft.purchaseUrgencies.length) conditions.purchaseUrgencies = draft.purchaseUrgencies;
  if (draft.preferredContactChannels.length) conditions.preferredContactChannels = draft.preferredContactChannels;
  if (serviceIds.length) conditions.interestedServiceIds = serviceIds;
  if (packageIds.length) conditions.interestedPackageIds = packageIds;
  return conditions;
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("tr-TR");
}

function displayAssignee(assignee: Assignee) {
  const name = [assignee.firstName, assignee.lastName].filter(Boolean).join(" ").trim();
  return name || assignee.email || assignee.id;
}

export default function CrmRoutingPage() {
  const activeBranch = hasActiveBranch();
  const canManage = hasPermission("crm", "manage");
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [draft, setDraft] = useState<RuleDraft>(emptyDraft);
  const [events, setEvents] = useState<RuleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const assigneeMap = useMemo(() => new Map(assignees.map((assignee) => [assignee.id, assignee])), [assignees]);

  const loadRules = useCallback(async (preferredRuleId?: string | null) => {
    if (!activeBranch) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [nextRules, nextAssignees] = await Promise.all([
        api<RoutingRule[]>("/crm/lead-routing/rules"),
        api<Assignee[]>("/crm/assignees"),
      ]);
      setRules(nextRules);
      setAssignees(nextAssignees);
      const selectedId = preferredRuleId ?? draft.id;
      const selected = selectedId ? nextRules.find((rule) => rule.id === selectedId) : undefined;
      if (selected) setDraft(draftFromRule(selected));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Lead routing kuralları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [activeBranch, draft.id]);

  const loadEvents = useCallback(async (ruleId: string | null) => {
    if (!ruleId || !activeBranch) {
      setEvents([]);
      return;
    }
    setLoadingEvents(true);
    try {
      setEvents(await api<RuleEvent[]>(`/crm/lead-routing/rules/${ruleId}/events?limit=30`));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Routing kural geçmişi yüklenemedi.");
    } finally {
      setLoadingEvents(false);
    }
  }, [activeBranch]);

  useEffect(() => {
    if (!activeBranch) {
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const [nextRules, nextAssignees] = await Promise.all([
          api<RoutingRule[]>("/crm/lead-routing/rules"),
          api<Assignee[]>("/crm/assignees"),
        ]);
        setRules(nextRules);
        setAssignees(nextAssignees);
      } catch (requestError) {
        setError(requestError instanceof ApiError ? requestError.message : "Lead routing kuralları yüklenemedi.");
      } finally {
        setLoading(false);
      }
    })();
  }, [activeBranch]);

  function startNewRule() {
    setDraft(emptyDraft());
    setEvents([]);
    setError("");
    setSuccess("");
  }

  function selectRule(rule: RoutingRule) {
    setDraft(draftFromRule(rule));
    setError("");
    setSuccess("");
    void loadEvents(rule.id);
  }

  function toggleTarget(userId: string) {
    setDraft((current) => ({
      ...current,
      targetUserIds: current.targetUserIds.includes(userId)
        ? current.targetUserIds.filter((id) => id !== userId)
        : [...current.targetUserIds, userId],
    }));
  }

  function toggleArrayValue<T extends string>(key: "temperatures" | "purchaseUrgencies" | "preferredContactChannels", value: T) {
    setDraft((current) => {
      const values = current[key] as string[];
      return {
        ...current,
        [key]: values.includes(value) ? values.filter((item) => item !== value) : [...values, value],
      } as RuleDraft;
    });
  }

  async function saveRule() {
    if (!canManage || !activeBranch || saving) return;
    if (!draft.name.trim()) {
      setError("Kural adı zorunludur.");
      return;
    }
    if (!draft.targetUserIds.length) {
      setError("En az bir routing hedefi seçin.");
      return;
    }
    const priority = Number(draft.priority);
    const minScore = draft.minScore === "" ? undefined : Number(draft.minScore);
    const maxScore = draft.maxScore === "" ? undefined : Number(draft.maxScore);
    if (!Number.isInteger(priority) || priority < 0 || priority > 10000) {
      setError("Öncelik 0 ile 10000 arasında tam sayı olmalıdır.");
      return;
    }
    if ((minScore !== undefined && (!Number.isInteger(minScore) || minScore < 0 || minScore > 100)) ||
        (maxScore !== undefined && (!Number.isInteger(maxScore) || maxScore < 0 || maxScore > 100))) {
      setError("Score eşikleri 0 ile 100 arasında tam sayı olmalıdır.");
      return;
    }
    if (minScore !== undefined && maxScore !== undefined && minScore > maxScore) {
      setError("Minimum score maksimum score değerinden büyük olamaz.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const body = {
        name: draft.name.trim(),
        priority,
        strategy: draft.strategy,
        conditions: conditionsFromDraft(draft),
        team: draft.team.trim() || null,
        enabled: draft.enabled,
        targetUserIds: draft.targetUserIds,
      };
      const saved = draft.id
        ? await api<RoutingRule>(`/crm/lead-routing/rules/${draft.id}`, {
            method: "PATCH",
            body: { ...body, version: draft.version },
          })
        : await api<RoutingRule>("/crm/lead-routing/rules", { method: "POST", body });
      setDraft(draftFromRule(saved));
      setSuccess(draft.id ? "Routing kuralı güncellendi." : "Routing kuralı oluşturuldu.");
      await loadRules(saved.id);
      await loadEvents(saved.id);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Routing kuralı kaydedilemedi.");
      if (draft.id) await loadRules(draft.id);
    } finally {
      setSaving(false);
    }
  }

  const activeRuleCount = rules.filter((rule) => rule.enabled).length;
  const targetCount = new Set(rules.flatMap((rule) => rule.targets.filter((target) => target.enabled).map((target) => target.userId))).size;
  const roundRobinCount = rules.filter((rule) => rule.enabled && rule.strategy === "ROUND_ROBIN").length;

  return <div className="space-y-6">
    <PageHeader
      title="Lead Yönlendirme"
      description="Branch bazlı lead routing kurallarını, hedef ekipleri ve deterministik dağıtım stratejilerini yönetin."
      action={canManage && activeBranch ? <Button onClick={startNewRule}>Yeni Kural</Button> : undefined}
    />

    {!activeBranch ? <Alert>Lead routing kurallarını görmek ve yönetmek için aktif bir şube seçin.</Alert> : null}
    {activeBranch && !canManage ? <Alert>Routing kurallarını görüntüleyebilirsiniz; değişiklik yapmak için crm.manage yetkisi gerekir.</Alert> : null}
    {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
    {success ? <Alert tone="success" onClose={() => setSuccess("")}>{success}</Alert> : null}

    {activeBranch ? <section className="grid gap-4 md:grid-cols-3">
      <MetricCard label="Aktif Kural" value={activeRuleCount} />
      <MetricCard label="Routing Hedefi" value={targetCount} />
      <MetricCard label="Round-robin Kuralı" value={roundRobinCount} />
    </section> : null}

    {loading ? <Spinner label="Lead routing kuralları yükleniyor..." /> : null}

    {!loading && activeBranch ? <div className="grid gap-5 xl:grid-cols-[.72fr_1.28fr]">
      <GlassCard>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">Rule Order</p>
            <h2 className="mt-1 text-[18px] font-semibold">Kural Önceliği</h2>
          </div>
          <span className="text-[10px] text-[var(--muted)]">Düşük sayı önce çalışır</span>
        </div>
        <div className="mt-4 space-y-3">
          {!rules.length ? <p className="text-[12px] text-[var(--muted)]">Henüz routing kuralı yok. İlk kuralı oluşturabilirsiniz.</p> : rules.map((rule) => <button
            key={rule.id}
            type="button"
            onClick={() => selectRule(rule)}
            className={`w-full rounded-[16px] border px-4 py-3 text-left transition-colors ${draft.id === rule.id ? "border-[var(--accent)] bg-[var(--surface-2)]" : "border-[var(--line)] bg-[var(--surface-2)]/35 hover:border-[var(--accent)]"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[12px] font-semibold text-[var(--ink)]">{rule.name}</p>
                <p className="mt-1 text-[10px] text-[var(--muted)]">P{rule.priority} · {rule.strategy === "ROUND_ROBIN" ? "Round-robin" : "Least active"} · v{rule.version}</p>
              </div>
              <span className={`rounded-full px-2 py-1 text-[9px] font-semibold ${rule.enabled ? "bg-[rgba(47,122,86,0.10)] text-[#2d5c45]" : "bg-[var(--surface-2)] text-[var(--muted)]"}`}>{rule.enabled ? "AKTİF" : "KAPALI"}</span>
            </div>
            <p className="mt-2 text-[10px] leading-4 text-[var(--muted)]">{conditionSummary(rule.conditions)}</p>
            <p className="mt-2 text-[10px] text-[var(--muted-soft)]">{rule.targets.filter((target) => target.enabled).length} hedef{rule.team ? ` · ${rule.team}` : ""}</p>
          </button>)}
        </div>
      </GlassCard>

      <RuleEditor
        draft={draft}
        assignees={assignees}
        canManage={canManage}
        saving={saving}
        onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
        onToggleTarget={toggleTarget}
        onToggleTemperature={(value) => toggleArrayValue("temperatures", value)}
        onToggleUrgency={(value) => toggleArrayValue("purchaseUrgencies", value)}
        onToggleChannel={(value) => toggleArrayValue("preferredContactChannels", value)}
        onSave={() => void saveRule()}
      />
    </div> : null}

    {!loading && activeBranch && draft.id ? <RuleHistory events={events} loading={loadingEvents} assigneeMap={assigneeMap} /> : null}

    <GlassCard>
      <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">Dağıtım Garantileri</p>
      <h2 className="mt-1 text-[18px] font-semibold">Deterministik ve branch-scope routing</h2>
      <div className="mt-4 grid gap-3 text-[12px] leading-5 text-[var(--muted)] md:grid-cols-2">
        <p>Kurallar <strong className="text-[var(--ink)]">priority + id</strong> sırasıyla değerlendirilir; ilk eşleşen aktif kural uygulanır.</p>
        <p>Round-robin cursor aynı transaction içinde <strong className="text-[var(--ink)]">FOR UPDATE</strong> kilidiyle ilerler; eşzamanlı lead&apos;ler aynı sırayı tüketemez.</p>
        <p>Least-active stratejisi mevcut <strong className="text-[var(--ink)]">crm_conversation_assignments</strong> ownership verisini kullanır; ikinci bir görev sahipliği modeli oluşturmaz.</p>
        <p>Kural değişiklikleri append-only audit history&apos;de, otomatik lead atamaları ise <strong className="text-[var(--ink)]">LEAD_ROUTED</strong> CRM event&apos;inde saklanır.</p>
      </div>
    </GlassCard>
  </div>;
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return <GlassCard>
    <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--muted)]">{label}</p>
    <p className="mt-2 text-[30px] font-semibold tracking-[-.04em] text-[var(--ink)]">{value}</p>
  </GlassCard>;
}

function RuleEditor({
  draft,
  assignees,
  canManage,
  saving,
  onChange,
  onToggleTarget,
  onToggleTemperature,
  onToggleUrgency,
  onToggleChannel,
  onSave,
}: {
  draft: RuleDraft;
  assignees: Assignee[];
  canManage: boolean;
  saving: boolean;
  onChange: (patch: Partial<RuleDraft>) => void;
  onToggleTarget: (userId: string) => void;
  onToggleTemperature: (value: LeadTemperature) => void;
  onToggleUrgency: (value: PurchaseUrgency) => void;
  onToggleChannel: (value: ContactChannel) => void;
  onSave: () => void;
}) {
  return <GlassCard>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">{draft.id ? `Routing Rule · v${draft.version}` : "New Routing Rule"}</p>
        <h2 className="mt-1 text-[18px] font-semibold">{draft.id ? "Kuralı Düzenle" : "Yeni Kural Oluştur"}</h2>
      </div>
      <label className="flex items-center gap-2 text-[12px] font-medium text-[var(--muted)]">
        <input type="checkbox" checked={draft.enabled} disabled={!canManage || saving} onChange={(event) => onChange({ enabled: event.target.checked })} className="h-4 w-4 rounded border-[var(--line)]" />
        {draft.enabled ? "Aktif" : "Kapalı"}
      </label>
    </div>

    <div className="mt-5 grid gap-4 md:grid-cols-2">
      <Field label="Kural adı"><TextInput value={draft.name} disabled={!canManage || saving} onChange={(event) => onChange({ name: event.target.value })} placeholder="Örn. HOT inbound lead" /></Field>
      <Field label="Ekip"><TextInput value={draft.team} disabled={!canManage || saving} onChange={(event) => onChange({ team: event.target.value })} placeholder="Örn. Inbound Sales" /></Field>
      <Field label="Öncelik"><TextInput type="number" min={0} max={10000} value={draft.priority} disabled={!canManage || saving} onChange={(event) => onChange({ priority: event.target.value })} /></Field>
      <Field label="Dağıtım stratejisi">
        <Select value={draft.strategy} disabled={!canManage || saving} onChange={(event) => onChange({ strategy: event.target.value as RoutingStrategy })}>
          <option value="ROUND_ROBIN">Round-robin</option>
          <option value="LEAST_ACTIVE">Least active conversations</option>
        </Select>
      </Field>
    </div>

    <div className="mt-6 border-t border-[var(--line)] pt-5">
      <p className="text-[11px] font-semibold text-[var(--ink)]">Eşleşme Koşulları</p>
      <p className="mt-1 text-[10px] text-[var(--muted)]">Boş bırakılan alanlar wildcard kabul edilir; girilen koşullar AND mantığıyla birlikte uygulanır.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Kaynaklar (virgülle)"><TextInput value={draft.sources} disabled={!canManage || saving} onChange={(event) => onChange({ sources: event.target.value })} placeholder="META_ADS, WEBSITE, REFERRAL" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Minimum score"><TextInput type="number" min={0} max={100} value={draft.minScore} disabled={!canManage || saving} onChange={(event) => onChange({ minScore: event.target.value })} placeholder="0" /></Field>
          <Field label="Maksimum score"><TextInput type="number" min={0} max={100} value={draft.maxScore} disabled={!canManage || saving} onChange={(event) => onChange({ maxScore: event.target.value })} placeholder="100" /></Field>
        </div>
        <Field label="Servis ID'leri (virgülle)"><TextInput value={draft.interestedServiceIds} disabled={!canManage || saving} onChange={(event) => onChange({ interestedServiceIds: event.target.value })} placeholder="UUID, UUID" /></Field>
        <Field label="Paket ID'leri (virgülle)"><TextInput value={draft.interestedPackageIds} disabled={!canManage || saving} onChange={(event) => onChange({ interestedPackageIds: event.target.value })} placeholder="UUID, UUID" /></Field>
      </div>

      <OptionGroup title="Lead sıcaklığı" items={TEMPERATURES} selected={draft.temperatures} disabled={!canManage || saving} onToggle={onToggleTemperature} />
      <OptionGroup title="Satın alma aciliyeti" items={URGENCIES} selected={draft.purchaseUrgencies} disabled={!canManage || saving} onToggle={onToggleUrgency} />
      <OptionGroup title="Tercih edilen kanal" items={CHANNELS} selected={draft.preferredContactChannels} disabled={!canManage || saving} onToggle={onToggleChannel} />
    </div>

    <div className="mt-6 border-t border-[var(--line)] pt-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold text-[var(--ink)]">Routing Hedefleri</p>
          <p className="mt-1 text-[10px] text-[var(--muted)]">Sıra, seçili kullanıcıların bu listedeki branch-scope sırasına göre belirlenir.</p>
        </div>
        <span className="text-[10px] font-semibold text-[var(--accent)]">{draft.targetUserIds.length} seçili</span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {assignees.map((assignee) => <label key={assignee.id} className={`flex cursor-pointer items-start gap-3 rounded-[14px] border px-3 py-3 ${draft.targetUserIds.includes(assignee.id) ? "border-[var(--accent)] bg-[var(--surface-2)]" : "border-[var(--line)] bg-[var(--surface-2)]/35"}`}>
          <input type="checkbox" checked={draft.targetUserIds.includes(assignee.id)} disabled={!canManage || saving} onChange={() => onToggleTarget(assignee.id)} className="mt-0.5 h-4 w-4 rounded border-[var(--line)]" />
          <span className="min-w-0">
            <span className="block truncate text-[11px] font-semibold text-[var(--ink)]">{displayAssignee(assignee)}</span>
            {assignee.email ? <span className="mt-0.5 block truncate text-[9px] text-[var(--muted)]">{assignee.email}</span> : null}
          </span>
        </label>)}
        {!assignees.length ? <p className="text-[11px] text-[var(--muted)]">Bu branch için aktif CRM assignee bulunamadı.</p> : null}
      </div>
    </div>

    {canManage ? <div className="mt-6 flex justify-end"><Button disabled={saving} onClick={onSave}>{saving ? "Kaydediliyor..." : draft.id ? "Değişiklikleri Kaydet" : "Kuralı Oluştur"}</Button></div> : null}
  </GlassCard>;
}

function OptionGroup<T extends string>({ title, items, selected, disabled, onToggle }: { title: string; items: Array<{ value: T; label: string }>; selected: T[]; disabled: boolean; onToggle: (value: T) => void }) {
  return <div className="mt-4">
    <p className="text-[10px] font-medium text-[var(--muted)]">{title}</p>
    <div className="mt-2 flex flex-wrap gap-2">
      {items.map((item) => <label key={item.value} className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] ${selected.includes(item.value) ? "border-[var(--accent)] bg-[var(--surface-2)] text-[var(--ink)]" : "border-[var(--line)] text-[var(--muted)]"}`}>
        <input type="checkbox" checked={selected.includes(item.value)} disabled={disabled} onChange={() => onToggle(item.value)} className="h-3.5 w-3.5 rounded border-[var(--line)]" />
        {item.label}
      </label>)}
    </div>
  </div>;
}

function RuleHistory({ events, loading, assigneeMap }: { events: RuleEvent[]; loading: boolean; assigneeMap: Map<string, Assignee> }) {
  return <GlassCard>
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">Audit History</p>
        <h2 className="mt-1 text-[18px] font-semibold">Kural Değişiklikleri</h2>
      </div>
      {loading ? <span className="text-[10px] text-[var(--muted)]">Yükleniyor...</span> : null}
    </div>
    <div className="mt-4 space-y-3">
      {!loading && !events.length ? <p className="text-[12px] text-[var(--muted)]">Henüz audit kaydı yok.</p> : events.map((event) => {
        const actor = assigneeMap.get(event.actorUserId);
        return <div key={event.id} className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)]/35 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-[var(--ink)]">{eventLabel(event.eventType)}</span>
            <span className="text-[10px] text-[var(--muted)]">{formatDate(event.createdAt)}</span>
          </div>
          <p className="mt-1 text-[10px] text-[var(--muted)]">Aktör: {actor ? displayAssignee(actor) : event.actorUserId}</p>
          <p className="mt-1 break-words text-[9px] leading-4 text-[var(--muted-soft)]">{eventMetadata(event.metadata)}</p>
        </div>;
      })}
    </div>
  </GlassCard>;
}

function conditionSummary(conditions: RoutingConditions) {
  const parts: string[] = [];
  if (conditions.temperatures?.length) parts.push(conditions.temperatures.join("/"));
  if (conditions.minScore !== undefined || conditions.maxScore !== undefined) parts.push(`Score ${conditions.minScore ?? 0}–${conditions.maxScore ?? 100}`);
  if (conditions.sources?.length) parts.push(`Kaynak: ${conditions.sources.join(", ")}`);
  if (conditions.purchaseUrgencies?.length) parts.push(`Aciliyet: ${conditions.purchaseUrgencies.join(", ")}`);
  if (conditions.preferredContactChannels?.length) parts.push(`Kanal: ${conditions.preferredContactChannels.join(", ")}`);
  if (conditions.interestedServiceIds?.length) parts.push(`${conditions.interestedServiceIds.length} servis`);
  if (conditions.interestedPackageIds?.length) parts.push(`${conditions.interestedPackageIds.length} paket`);
  return parts.length ? parts.join(" · ") : "Tüm lead'ler";
}

function eventLabel(eventType: RuleEvent["eventType"]) {
  if (eventType === "RULE_CREATED") return "Kural oluşturuldu";
  if (eventType === "TARGETS_REPLACED") return "Routing hedefleri değiştirildi";
  return "Kural güncellendi";
}

function eventMetadata(metadata: Record<string, unknown>) {
  if (Array.isArray(metadata.changedFields)) return `Değişen alanlar: ${metadata.changedFields.join(", ")}`;
  if (Array.isArray(metadata.targetUserIds)) return `Hedef sayısı: ${metadata.targetUserIds.length}`;
  if (typeof metadata.strategy === "string") return `Strateji: ${metadata.strategy} · Öncelik: ${String(metadata.priority ?? "—")}`;
  return `Versiyon: ${String(metadata.version ?? "—")}`;
}
