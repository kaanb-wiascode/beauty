"use client";

import { CardInfo } from "@/components/card-info";

import { useEffect, useState } from "react";

import { Alert, Button, Field, Spinner, Select, TextInput } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { getCardHelp } from "@/lib/card-help";
import { hasActiveBranch, hasPermission } from "@/lib/auth";
import { ValooSelect } from "@/components/valoo-controls";
import type { Paginated, Service, Staff } from "@/lib/types";

type Mode = "OFF" | "WARN" | "BLOCK";
type EligibilityResult = {
  allowed: boolean;
  mode: Mode;
  blockers: Array<{ code: string; message: string }>;
  warnings: Array<{ code: string; message: string }>;
};

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
  const canManage = hasPermission("operations", "manage");
  const canReadStaff = hasPermission("staff", "read");
  const canReadServices = hasPermission("services", "read");
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [staffId, setStaffId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<EligibilityResult | null>(null);

  const load = async () => {
    if (!hasActiveBranch()) {
      setError("Personel uygunluk politikası için önce aktif bir şube seçin.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const [policyResult, staffResult, serviceResult] = await Promise.allSettled([
      api<Policy>("/operations/staff-eligibility/policy"),
      canReadStaff ? api<Paginated<Staff>>("/staff?page=1&limit=100&status=ACTIVE") : Promise.resolve(null),
      canReadServices ? api<Paginated<Service>>("/services?page=1&limit=100&status=ACTIVE") : Promise.resolve(null),
    ]);
    const errors: string[] = [];
    if (policyResult.status === "fulfilled") setPolicy(policyResult.value);
    else errors.push(policyResult.reason instanceof ApiError ? policyResult.reason.message : "Politika yüklenemedi.");
    if (staffResult.status === "fulfilled" && staffResult.value) {
      setStaff(staffResult.value.data);
      setStaffId((current) => current || staffResult.value?.data[0]?.id || "");
    } else if (staffResult.status === "rejected") {
      errors.push(staffResult.reason instanceof ApiError ? staffResult.reason.message : "Personel listesi yüklenemedi.");
    }
    if (serviceResult.status === "fulfilled" && serviceResult.value) {
      setServices(serviceResult.value.data);
      setServiceId((current) => current || serviceResult.value?.data[0]?.id || "");
    } else if (serviceResult.status === "rejected") {
      errors.push(serviceResult.reason instanceof ApiError ? serviceResult.reason.message : "Hizmet listesi yüklenemedi.");
    }
    if (errors.length) setError(Array.from(new Set(errors)).join(" "));
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const checkEligibility = async () => {
    if (!staffId || !serviceId || !startAt || !endAt) {
      setError("Uygunluk testi için personel, hizmet, başlangıç ve bitiş zamanı seçin.");
      return;
    }
    setChecking(true);
    setError("");
    setCheckResult(null);
    try {
      const params = new URLSearchParams({
        staffId,
        serviceId,
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
      });
      setCheckResult(await api<EligibilityResult>(`/operations/staff-eligibility/check?${params.toString()}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Personel uygunluğu kontrol edilemedi.");
    } finally {
      setChecking(false);
    }
  };

  const save = async () => {
    if (!policy || !canManage) return;
    setSaving(true);
    setError("");
    try {
      const next = await api<Policy>("/operations/staff-eligibility/policy", {
        method: "PUT",
        body: {
          mode: policy.mode,
          requirePublishedShift: policy.requirePublishedShift,
          requireServiceCertification: policy.requireServiceCertification,
          requireCompetency: policy.requireCompetency,
          expectedVersion: policy.version || undefined,
        },
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
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-soft)]">Randevu ve Hizmet Güvenliği</p>
        <div className="mt-2 flex items-start justify-between gap-3"><h1 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">Personel Uygunluk Politikası</h1><CardInfo help={getCardHelp("Personel Uygunluk Politikası")} /></div>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">İnsan Kaynakları vardiya, izin, sertifika ve yetkinlik bilgilerini randevu ve hizmet başlatma kararlarına bağlar. Varsayılan uyarı modu eksikleri görünür kılar ancak işlemi durdurmaz.</p>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="space-y-4 rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <div>
          <h2 className="text-sm font-semibold text-[var(--ink)]">Personel–Hizmet Uygunluk Testi</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Uygulamadaki gerçek personel, hizmet, vardiya, izin, sertifika, yetkinlik ve randevu çakışmalarını birlikte kontrol edin.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Personel">
            <ValooSelect
              value={staffId}
              onChange={setStaffId}
              placeholder="Personel seçin"
              searchPlaceholder="Personel ara…"
              emptyLabel={canReadStaff ? "Aktif personel bulunamadı." : "Personel okuma yetkisi yok."}
              options={staff.map((item) => ({ value: item.id, label: `${item.firstName} ${item.lastName}`.trim() }))}
            />
          </Field>
          <Field label="Hizmet">
            <ValooSelect
              value={serviceId}
              onChange={setServiceId}
              placeholder="Hizmet seçin"
              searchPlaceholder="Hizmet ara…"
              emptyLabel={canReadServices ? "Aktif hizmet bulunamadı." : "Hizmet okuma yetkisi yok."}
              options={services.map((item) => ({ value: item.id, label: item.name, description: `${item.durationMinutes} dk` }))}
            />
          </Field>
          <Field label="Başlangıç">
            <TextInput type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} />
          </Field>
          <Field label="Bitiş">
            <TextInput type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button
            variant="secondary"
            onClick={() => void checkEligibility()}
            disabled={checking || !canReadStaff || !canReadServices}
          >
            {checking ? "Kontrol Ediliyor..." : "Uygunluğu Kontrol Et"}
          </Button>
        </div>
        {checkResult ? (
          <div className={`rounded-[16px] border p-4 text-sm ${checkResult.allowed ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
            <p className="font-semibold">{checkResult.allowed ? "Personel bu hizmet için uygun." : "Personel bu hizmet için uygun değil."}</p>
            {[...checkResult.blockers, ...checkResult.warnings].length ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                {[...checkResult.blockers, ...checkResult.warnings].map((item) => <li key={item.code}>{item.message}</li>)}
              </ul>
            ) : (
              <p className="mt-1 text-xs">Aktif politika kapsamında engel veya uyarı bulunmadı.</p>
            )}
          </div>
        ) : null}
      </section>

      {policy ? (
        <section className="space-y-5 rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
          {policy.inheritedDefault ? <div className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)] p-4 text-sm text-[var(--muted)]">Bu şubede henüz özel kayıt yok; güvenli varsayılan <strong>Uyar</strong> modu uygulanıyor.</div> : null}

          <div>
            <label className="text-xs font-semibold text-[var(--ink)]">Uygulama modu</label>
            <Select className="mt-2 w-full rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm" value={policy.mode} onChange={(e) => setPolicy({ ...policy, mode: e.target.value as Mode })}>
              <option value="OFF">Kapalı — yalnız temel çakışma kontrolleri uygulanır</option>
              <option value="WARN">Uyar — eksikleri göster, işleme izin ver</option>
              <option value="BLOCK">Engelle — personel uygun değilse randevu veya hizmet başlatılamaz</option>
            </Select>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <Check label="Yayınlanmış vardiya zorunlu" checked={policy.requirePublishedShift} onChange={(value) => setPolicy({ ...policy, requirePublishedShift: value })} />
            <Check label="Hizmet sertifikası zorunlu" checked={policy.requireServiceCertification} onChange={(value) => setPolicy({ ...policy, requireServiceCertification: value })} />
            <Check label="Yetkinlik seviyesi zorunlu" checked={policy.requireCompetency} onChange={(value) => setPolicy({ ...policy, requireCompetency: value })} />
          </div>

          <div className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)] p-4 text-xs text-[var(--muted)]">
            Engelle modu, personel uygun değilse hizmet başlatmayı ve bekleme listesindeki uygun saati randevuya dönüştürmeyi durdurur. İzin bilgisi her modda değerlendirilir; ayrıca mevcut randevu çakışma kontrolleri çalışmaya devam eder.
          </div>

          <div className="flex justify-end"><Button onClick={save} disabled={!canManage || saving}>{saving ? "Kaydediliyor..." : "Politikayı Kaydet"}</Button></div>
        </section>
      ) : null}
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center gap-3 rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)] p-4 text-sm text-[var(--ink)]"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />{label}</label>;
}
