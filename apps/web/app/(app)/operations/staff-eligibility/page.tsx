"use client";

import { useEffect, useState } from "react";

import { Alert, Button, Spinner, Select } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasActiveBranch } from "@/lib/auth";

type Mode = "OFF" | "WARN" | "BLOCK";
type Policy = {
  id: string | null;
  mode: Mode;
  requirePublishedShift: boolean;
  requireServiceCertification: boolean;
  requireCompetency: boolean;
  version: number;
  inheritedDefault?: boolean;
};

export default function StaffEligibilityPolicyPage() {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!hasActiveBranch()) {
      setError("Personel uygunluk politikası için önce aktif bir şube seçin.");
      setLoading(false);
      return;
    }
    setLoading(true);
    api<Policy>("/operations/staff-eligibility/policy")
      .then(setPolicy)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Politika yüklenemedi."))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const save = async () => {
    if (!policy) return;
    setSaving(true);
    setError("");
    try {
      const next = await api<Policy>("/operations/staff-eligibility/policy", {
        method: "PUT",
        body: JSON.stringify({
          mode: policy.mode,
          requirePublishedShift: policy.requirePublishedShift,
          requireServiceCertification: policy.requireServiceCertification,
          requireCompetency: policy.requireCompetency,
          expectedVersion: policy.version || undefined,
        }),
      });
      setPolicy(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Politika kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="mx-auto max-w-[1100px] py-10"><Spinner label="Uygunluk politikası yükleniyor..." /></div>;

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 pb-10">
      <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-soft)]">Scheduling Safety</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">Personel Uygunluk Politikası</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">HR vardiya, izin, sertifika ve yetkinlik verilerini Operations booking ve hizmet başlatma kararlarına bağlar. Varsayılan WARN mevcut akışları kırmadan eksikleri görünür kılar.</p>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      {policy ? (
        <section className="space-y-5 rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
          {policy.inheritedDefault ? <div className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)] p-4 text-sm text-[var(--muted)]">Bu şubede henüz özel kayıt yok; güvenli varsayılan <strong>WARN</strong> uygulanıyor.</div> : null}

          <div>
            <label className="text-xs font-semibold text-[var(--ink)]">Uygulama modu</label>
            <Select className="mt-2 w-full rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm" value={policy.mode} onChange={(e) => setPolicy({ ...policy, mode: e.target.value as Mode })}>
              <option value="OFF">OFF — yalnız Operations’ın mevcut conflict kuralları</option>
              <option value="WARN">WARN — HR eksiklerini göster, işleme izin ver</option>
              <option value="BLOCK">BLOCK — HR uygunluğu yoksa booking/execution engelle</option>
            </Select>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <Check label="Yayınlanmış vardiya zorunlu" checked={policy.requirePublishedShift} onChange={(value) => setPolicy({ ...policy, requirePublishedShift: value })} />
            <Check label="Hizmet sertifikası zorunlu" checked={policy.requireServiceCertification} onChange={(value) => setPolicy({ ...policy, requireServiceCertification: value })} />
            <Check label="Yetkinlik seviyesi zorunlu" checked={policy.requireCompetency} onChange={(value) => setPolicy({ ...policy, requireCompetency: value })} />
          </div>

          <div className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)] p-4 text-xs text-[var(--muted)]">
            BLOCK modu ServiceExecution başlangıcını ve waitlist slot kabulünü durdurabilir. İzin her modda HR eligibility sinyalinin parçasıdır; booking güvenliği için ayrıca mevcut Operations conflict kontrolleri çalışmaya devam eder.
          </div>

          <div className="flex justify-end"><Button onClick={save} disabled={saving}>{saving ? "Kaydediliyor..." : "Politikayı Kaydet"}</Button></div>
        </section>
      ) : null}
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center gap-3 rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)] p-4 text-sm text-[var(--ink)]"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />{label}</label>;
}
