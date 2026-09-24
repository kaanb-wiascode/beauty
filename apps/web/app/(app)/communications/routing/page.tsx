"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Alert, Button, Spinner, Select } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type Rule = {
  id: string;
  name: string;
  priority: number;
  active: boolean;
  provider?: string | null;
  campaignId?: string | null;
  targetBranchName?: string | null;
  targetUserId?: string | null;
  strategy: string;
  conditions?: {
    autoFollowUp?: boolean;
    followUpSlaMinutes?: number;
    followUpChannel?: string;
  } | null;
};
type Campaign = { id: string; name: string };
const strategyLabels: Record<string, string> = { FIXED: "Sabit Atama", ROUND_ROBIN: "Sırayla Dağıtım", LEAST_LOADED: "En Az Yoğun Personele" };
const contactChannelLabels: Record<string, string> = { CALL: "Telefon", WHATSAPP: "WhatsApp", SMS: "SMS", EMAIL: "E-posta", IN_PERSON: "Yüz Yüze", OTHER: "Diğer" };

const fieldClass =
  "mt-2 h-11 w-full rounded-[13px] border border-[var(--line)] bg-white px-3 text-[12px] text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";

export default function RoutingPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [priority, setPriority] = useState("100");
  const [provider, setProvider] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [targetBranchId, setTargetBranchId] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [strategy, setStrategy] = useState("FIXED");
  const [autoFollowUp, setAutoFollowUp] = useState(true);
  const [followUpSlaMinutes, setFollowUpSlaMinutes] = useState("15");
  const [followUpChannel, setFollowUpChannel] = useState("CALL");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [ruleRows, campaignRows] = await Promise.all([
        api<Rule[]>("/corporate-communications/routing-rules"),
        api<Campaign[]>("/corporate-communications/campaigns?limit=200"),
      ]);
      setRules(ruleRows);
      setCampaigns(campaignRows);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Talep dağıtım kuralları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api("/corporate-communications/routing-rules", {
        method: "POST",
        body: {
          name,
          priority: Number(priority),
          provider: provider || undefined,
          campaignId: campaignId || undefined,
          targetBranchId: targetBranchId || undefined,
          targetUserId: targetUserId || undefined,
          strategy,
          conditions: {
            autoFollowUp,
            followUpSlaMinutes: Number(followUpSlaMinutes),
            followUpChannel,
          },
        },
      });
      setName("");
      setTargetBranchId("");
      setTargetUserId("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Talep dağıtım kuralı oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !rules.length) {
    return (
      <div className="py-20">
        <Spinner label="Talep dağıtım kuralları yükleniyor..." />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--accent)]">
          Kurumsal İletişim
        </p>
        <h1 className="text-[30px] font-semibold tracking-[-.04em] text-[var(--ink)]">
          Talep Dağıtımı
        </h1>
        <p className="mt-2 max-w-3xl text-[12px] leading-5 text-[var(--muted)]">
          Reklam kaynağı ve kampanyaya göre taleplerin hangi şube veya sorumluya yönlendirileceğini ve ilk temas süresini belirleyin.
          Müşteri ilişkilerine aktarılan talepler için ilk temas görevi otomatik oluşturulabilir.
        </p>
      </header>

      {error ? <Alert>{error}</Alert> : null}

      <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
        <form
          onSubmit={(e) => void create(e)}
          className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5"
        >
          <h2 className="text-[15px] font-semibold text-[var(--ink)]">Yeni Kural</h2>
          <label className="mt-5 block text-[11px] font-semibold text-[var(--muted)]">
            Kural Adı
            <input required className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-[11px] font-semibold text-[var(--muted)]">
              Öncelik
              <input type="number" min="1" className={fieldClass} value={priority} onChange={(e) => setPriority(e.target.value)} />
            </label>
            <label className="text-[11px] font-semibold text-[var(--muted)]">
              Strateji
              <Select className={fieldClass} value={strategy} onChange={(e) => setStrategy(e.target.value)}>
                <option value="FIXED">Sabit Atama</option>
                <option value="ROUND_ROBIN">Sırayla Dağıtım</option>
                <option value="LEAST_LOADED">En Az Yoğun Personele</option>
              </Select>
            </label>
          </div>
          <label className="mt-4 block text-[11px] font-semibold text-[var(--muted)]">
            Reklam Kaynağı
            <Select className={fieldClass} value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="">Tümü</option>
              <option value="META">Meta</option>
              <option value="GOOGLE_ADS">Google Ads</option>
              <option value="TIKTOK">TikTok</option>
              <option value="WEBSITE">Web Sitesi</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="OTHER">Diğer</option>
            </Select>
          </label>
          <label className="mt-4 block text-[11px] font-semibold text-[var(--muted)]">
            Kampanya
            <Select className={fieldClass} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              <option value="">Tümü</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
              ))}
            </Select>
          </label>
          <label className="mt-4 block text-[11px] font-semibold text-[var(--muted)]">
            Hedef Şube Kodu
            <input className={fieldClass} value={targetBranchId} onChange={(e) => setTargetBranchId(e.target.value)} placeholder="Şube kodunu girin" />
          </label>
          <label className="mt-4 block text-[11px] font-semibold text-[var(--muted)]">
            Hedef Sorumlu Kodu
            <input className={fieldClass} value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} placeholder="İsteğe bağlı" />
          </label>

          <div className="mt-5 rounded-[16px] border border-[var(--line)] bg-[var(--surface-soft)] p-4">
            <label className="flex items-center gap-3 text-[11px] font-semibold text-[var(--ink)]">
              <input type="checkbox" checked={autoFollowUp} onChange={(e) => setAutoFollowUp(e.target.checked)} />
              Müşteri ilişkilerine aktarılınca ilk temas görevi oluştur
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-[11px] font-semibold text-[var(--muted)]">
                İlk Temas Süresi (dk)
                <input type="number" min="1" max="10080" disabled={!autoFollowUp} className={fieldClass} value={followUpSlaMinutes} onChange={(e) => setFollowUpSlaMinutes(e.target.value)} />
              </label>
              <label className="text-[11px] font-semibold text-[var(--muted)]">
                Kanal
                <Select disabled={!autoFollowUp} className={fieldClass} value={followUpChannel} onChange={(e) => setFollowUpChannel(e.target.value)}>
                  <option value="CALL">Telefon</option>
                  <option value="WHATSAPP">WhatsApp</option>
                  <option value="SMS">SMS</option>
                  <option value="EMAIL">E-posta</option>
                  <option value="IN_PERSON">Yüz Yüze</option>
                  <option value="OTHER">Diğer</option>
                </Select>
              </label>
            </div>
          </div>

          <Button className="mt-5" disabled={saving} type="submit">
            {saving ? "Kaydediliyor..." : "Kuralı Kaydet"}
          </Button>
        </form>

        <section className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5">
          <h2 className="text-[15px] font-semibold text-[var(--ink)]">Kurallar</h2>
          {rules.length ? (
            <div className="mt-4 space-y-3">
              {rules.map((rule) => (
                <div key={rule.id} className="rounded-[16px] border border-[var(--line)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[13px] font-semibold text-[var(--ink)]">{rule.name}</p>
                      <p className="mt-1 text-[10px] text-[var(--muted)]">
                        Öncelik {rule.priority} · {rule.provider ? userLabel(rule.provider) : "Tüm kaynaklar"} · {strategyLabels[rule.strategy] ?? "Dağıtım kuralı"}
                      </p>
                    </div>
                    <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[9px] font-semibold text-[var(--accent)]">
                      {rule.active ? "Aktif" : "Pasif"}
                    </span>
                  </div>
                  <p className="mt-2 text-[10px] text-[var(--muted)]">
                    Hedef: {rule.targetBranchName ?? (rule.targetUserId ? "Belirli sorumlu" : "Dinamik dağıtım")}
                  </p>
                  <p className="mt-1 text-[10px] text-[var(--muted)]">
                    İlk temas: {rule.conditions?.autoFollowUp === false ? "Kapalı" : `${rule.conditions?.followUpSlaMinutes ?? 15} dk · ${contactChannelLabels[rule.conditions?.followUpChannel ?? "CALL"] ?? "Telefon"}`}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-6 text-[12px] text-[var(--muted)]">Henüz talep dağıtım kuralı yok.</p>
          )}
        </section>
      </div>
    </div>
  );
}
