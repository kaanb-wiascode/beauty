"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Field, Select, Spinner, TextArea, TextInput } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";
import { hasActiveBranch, hasPermission } from "@/lib/auth";

type LeadTemperature = "COLD" | "WARM" | "HOT";

type ScoreExplanation = {
  engineVersion?: number;
  manualOverride?: boolean;
  reason?: string;
  thresholds?: { warmMin?: number; hotMin?: number };
  factors?: Array<{ factor?: string; points?: number }>;
};

type LeadScore = {
  id: string;
  score: number;
  temperature: LeadTemperature;
  scoreVersion: number;
  explanation: ScoreExplanation;
  overridden: boolean;
  overrideReason: string | null;
  updatedAt: string;
};

type LeadScoreHistory = {
  id: string;
  score: number;
  temperature: LeadTemperature;
  scoreVersion: number;
  explanation: ScoreExplanation;
  source: "AUTOMATIC" | "MANUAL_OVERRIDE";
  actorUserId: string | null;
  reason: string | null;
  createdAt: string;
};

const temperatureMeta: Record<LeadTemperature, { label: string; className: string }> = {
  HOT: { label: "HOT", className: "border-[#F3B4AF] bg-[#FFF1F0] text-[#B42318]" },
  WARM: { label: "WARM", className: "border-[#F1D494] bg-[#FFF8E8] text-[#9A6700]" },
  COLD: { label: "COLD", className: "border-[#B7D8EF] bg-[#EEF7FD] text-[#1674BD]" },
};

const factorLabels: Record<string, string> = {
  PHONE_AVAILABLE: "Telefon bilgisi",
  EMAIL_AVAILABLE: "E-posta bilgisi",
  ATTRIBUTED_SOURCE: "Kaynak sinyali",
  CAMPAIGN_ATTRIBUTION: "Kampanya ilişkilendirmesi",
  PRODUCT_INTEREST: "Hizmet / paket ilgisi",
  BUDGET_DEFINED: "Bütçe tanımlı",
  URGENCY_IMMEDIATE: "Satın alma aciliyeti: hemen",
  URGENCY_THIS_WEEK: "Satın alma aciliyeti: bu hafta",
  URGENCY_THIS_MONTH: "Satın alma aciliyeti: bu ay",
  CONSULTATION_SIGNAL: "Danışmanlık ihtiyacı",
  INTENT_DETAIL: "Detaylı müşteri niyeti",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function LeadScoringPanel({ leadId }: { leadId: string }) {
  const canManage = hasPermission("crm", "manage");
  const { showToast } = useToast();
  const [score, setScore] = useState<LeadScore | null>(null);
  const [history, setHistory] = useState<LeadScoreHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideScore, setOverrideScore] = useState("80");
  const [overrideTemperature, setOverrideTemperature] = useState<LeadTemperature>("HOT");
  const [overrideReason, setOverrideReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [scoreRow, historyRows] = await Promise.all([
        api<LeadScore>(`/crm/leads/${leadId}/score`),
        api<LeadScoreHistory[]>(`/crm/leads/${leadId}/score-history?limit=20`),
      ]);
      setScore(scoreRow);
      setHistory(historyRows);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Lead skoru yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => { void load(); }, [load]);

  const factors = useMemo(() => score?.explanation?.factors ?? [], [score]);

  function requireBranch() {
    if (hasActiveBranch()) return true;
    showToast("Lead Skorunu Değiştirmek İçin Önce Aktif Bir Şube Seçin.", "error");
    return false;
  }

  function openOverride() {
    if (!score || !requireBranch()) return;
    setOverrideScore(String(score.score));
    setOverrideTemperature(score.temperature);
    setOverrideReason(score.overrideReason ?? "");
    setOverrideOpen(true);
    setError("");
  }

  async function submitOverride(event: FormEvent) {
    event.preventDefault();
    if (!score || !requireBranch()) return;
    const numericScore = Number(overrideScore);
    if (!Number.isInteger(numericScore) || numericScore < 0 || numericScore > 100) {
      setError("Skor 0 ile 100 arasında tam sayı olmalıdır.");
      return;
    }
    if (overrideReason.trim().length < 3) {
      setError("Manuel skor değişikliği için gerekçe gereklidir.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await api(`/crm/leads/${leadId}/score-override`, {
        method: "POST",
        body: {
          score: numericScore,
          temperature: overrideTemperature,
          reason: overrideReason.trim(),
          version: score.scoreVersion,
        },
      });
      setOverrideOpen(false);
      showToast("Lead Skoru Manuel Olarak Güncellendi.", "success");
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Lead skoru güncellenemedi.");
    } finally {
      setSaving(false);
    }
  }

  async function recalculate() {
    if (!score || !requireBranch()) return;
    setSaving(true);
    setError("");
    try {
      await api(`/crm/leads/${leadId}/rescore`, { method: "POST" });
      showToast("Lead Skoru Güncel Verilerle Yeniden Hesaplandı.", "success");
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Lead skoru yeniden hesaplanamadı.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="mt-5 rounded-[22px] border border-[var(--line)] bg-white p-5 shadow-[var(--shadow-soft)]">
        <Spinner label="Lead Skoru Hazırlanıyor..." />
      </section>
    );
  }

  if (!score) {
    return error ? <div className="mt-5"><Alert>{error}</Alert></div> : null;
  }

  const temperature = temperatureMeta[score.temperature];
  const warmMin = score.explanation?.thresholds?.warmMin ?? 50;
  const hotMin = score.explanation?.thresholds?.hotMin ?? 80;

  return (
    <section className="mt-5 overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
        <div>
          <h2 className="text-[13px] font-semibold">Lead Intelligence</h2>
          <p className="mt-1 text-[10px] text-[var(--muted)]">Deterministik skor · v{score.scoreVersion}</p>
        </div>
        {canManage ? (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void recalculate()} disabled={saving}>Yeniden Hesapla</Button>
            <Button variant="secondary" onClick={openOverride} disabled={saving}>Manuel Skor</Button>
          </div>
        ) : null}
      </header>

      <div className="grid gap-5 p-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface-subtle)] p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-medium text-[var(--muted)]">Lead Skoru</p>
              <strong className="mt-1 block text-[36px] leading-none tracking-[-0.04em]">{score.score}</strong>
            </div>
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${temperature.className}`}>
              {temperature.label}
            </span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#E8EEF2]">
            <div className="h-full rounded-full bg-[#1674BD]" style={{ width: `${score.score}%` }} />
          </div>
          <p className="mt-3 text-[9px] leading-5 text-[var(--muted)]">COLD 0–{warmMin - 1} · WARM {warmMin}–{hotMin - 1} · HOT {hotMin}–100</p>
          {score.overridden ? (
            <div className="mt-4 rounded-[12px] border border-[#F1D494] bg-[#FFF8E8] p-3 text-[10px] text-[#7A5200]">
              <strong className="block">Manuel override aktif</strong>
              <span className="mt-1 block">{score.overrideReason}</span>
            </div>
          ) : null}
        </div>

        <div>
          <h3 className="text-[11px] font-semibold">Skoru Oluşturan Sinyaller</h3>
          {factors.length ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {factors.map((factor, index) => (
                <div key={`${factor.factor ?? "factor"}-${index}`} className="flex items-center justify-between rounded-[12px] border border-[var(--line)] px-3 py-2.5">
                  <span className="text-[10px] text-[var(--muted)]">{factorLabels[factor.factor ?? ""] ?? factor.factor ?? "Sinyal"}</span>
                  <strong className="text-[10px] text-[#1674BD]">+{factor.points ?? 0}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-[10px] text-[var(--muted)]">Henüz puan üreten bir sinyal bulunmuyor.</p>
          )}
          <p className="mt-4 text-[9px] text-[var(--muted)]">Son hesaplama: {formatDateTime(score.updatedAt)}</p>
        </div>
      </div>

      <div className="border-t border-[var(--line)] px-5 py-4">
        <h3 className="text-[11px] font-semibold">Skor Geçmişi</h3>
        {history.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left">
              <thead className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">
                <tr><th className="pb-2">Tarih</th><th className="pb-2">Skor</th><th className="pb-2">Sıcaklık</th><th className="pb-2">Kaynak</th><th className="pb-2">Gerekçe</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {history.map((row) => (
                  <tr key={row.id} className="text-[10px]">
                    <td className="py-2.5 text-[var(--muted)]">{formatDateTime(row.createdAt)}</td>
                    <td className="py-2.5 font-semibold">{row.score}</td>
                    <td className="py-2.5"><span className={`inline-flex rounded-full border px-2 py-0.5 font-bold ${temperatureMeta[row.temperature].className}`}>{row.temperature}</span></td>
                    <td className="py-2.5 text-[var(--muted)]">{row.source === "MANUAL_OVERRIDE" ? "Manuel" : "Otomatik"}</td>
                    <td className="max-w-[260px] truncate py-2.5 text-[var(--muted)]">{row.reason || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="mt-3 text-[10px] text-[var(--muted)]">Henüz skor geçmişi bulunmuyor.</p>}
      </div>

      {error ? <div className="px-5 pb-4"><Alert onClose={() => setError("")}>{error}</Alert></div> : null}

      {overrideOpen ? (
        <div className="border-t border-[var(--line)] bg-[var(--surface-subtle)] px-5 py-5">
          <form onSubmit={submitOverride} className="grid gap-4 lg:grid-cols-3">
            <Field label="Skor">
              <TextInput type="number" min={0} max={100} value={overrideScore} onChange={(event) => setOverrideScore(event.target.value)} />
            </Field>
            <Field label="Sıcaklık">
              <Select value={overrideTemperature} onChange={(event) => setOverrideTemperature(event.target.value as LeadTemperature)}>
                <option value="COLD">COLD</option><option value="WARM">WARM</option><option value="HOT">HOT</option>
              </Select>
            </Field>
            <div className="lg:col-span-3">
              <Field label="Değişiklik Gerekçesi">
                <TextArea value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} placeholder="Manuel skor değişikliğinin nedenini yazın..." />
              </Field>
            </div>
            <div className="flex gap-2 lg:col-span-3">
              <Button type="submit" disabled={saving}>{saving ? "Kaydediliyor..." : "Override Kaydet"}</Button>
              <Button type="button" variant="secondary" onClick={() => setOverrideOpen(false)} disabled={saving}>Vazgeç</Button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
