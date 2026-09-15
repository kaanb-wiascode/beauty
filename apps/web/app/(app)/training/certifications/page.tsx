"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FinanceEmpty, FinanceMetric, FinancePanel } from "@/components/finance-view";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";

type LifecycleStatus = "VALID" | "EXPIRING" | "EXPIRED" | "REVOKED";
type Certificate = {
  id: string;
  certificateNo: string;
  status: string;
  lifecycleStatus: LifecycleStatus;
  renewalState: "NONE" | "DUE" | "IN_PROGRESS";
  staffId: string;
  staffFirstName?: string | null;
  staffLastName?: string | null;
  courseCode: string;
  courseTitle: string;
  courseVersion: number;
  issuedAt: string;
  expiresAt?: string | null;
  daysToExpiry?: number | null;
  renewalAssignmentId?: string | null;
};
type LifecycleResponse = {
  warningDays: number;
  summary: { VALID: number; EXPIRING: number; EXPIRED: number; REVOKED: number; renewalInProgress: number };
  recertificationQueue: Certificate[];
  certificates: Certificate[];
};

function date(value?: string | null) {
  if (!value) return "Süresiz";
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(new Date(value));
}

function lifecycleLabel(value: LifecycleStatus) {
  return { VALID: "Geçerli", EXPIRING: "Süresi Yaklaşıyor", EXPIRED: "Süresi Dolmuş", REVOKED: "İptal" }[value];
}

export default function TrainingCertificationsPage() {
  const canManage = hasPermission("training", "manage");
  const [data, setData] = useState<LifecycleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [warningDays, setWarningDays] = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api<LifecycleResponse>(`/training/certificates/lifecycle?warningDays=${warningDays}&limit=500`));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Sertifika yaşam döngüsü yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [warningDays]);

  useEffect(() => { void load(); }, [load]);

  async function renew(certificateId: string) {
    setBusy(certificateId);
    setError("");
    setNotice("");
    try {
      const result = await api<{ assignmentId: string; duplicate?: boolean }>(`/training/certificates/${certificateId}/renew`, { method: "POST", body: JSON.stringify({}) });
      setNotice(result.duplicate ? "Bu sertifika için yenileme ataması zaten mevcut." : "Recertification ataması oluşturuldu.");
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Recertification ataması oluşturulamadı.");
    } finally {
      setBusy(null);
    }
  }

  async function processRecertification() {
    setBusy("batch");
    setError("");
    setNotice("");
    try {
      const result = await api<{ claimed: number; assigned: number; duplicates: number; failed: number }>(`/training/certificates/process-recertification?warningDays=${warningDays}&limit=200`, { method: "POST" });
      setNotice(`${result.claimed} sertifika incelendi; ${result.assigned} yeni recertification ataması oluşturuldu${result.failed ? `, ${result.failed} kayıt işlenemedi` : ""}.`);
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Recertification processor çalıştırılamadı.");
    } finally {
      setBusy(null);
    }
  }

  const queue = data?.recertificationQueue ?? [];
  const dueCount = useMemo(() => queue.filter((item) => item.renewalState === "DUE").length, [queue]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link href="/training" className="text-[11px] font-semibold text-[var(--accent)] hover:underline">← Learning Operations</Link>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--muted-soft)]">Competency & Certification</p>
          <h1 className="mt-1 text-[32px] font-semibold tracking-[-0.045em] text-[var(--ink)]">Sertifikasyon</h1>
          <p className="mt-2 max-w-[900px] text-[13px] leading-6 text-[var(--muted)]">Sertifika geçerliliğini, yaklaşan sona erme tarihlerini ve recertification atamalarını tek çalışma alanından yönetin. EXPIRING durumu kalıcı bir statü değil, son kullanma tarihinden türetilir.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[11px] text-[var(--muted)]">
            Uyarı penceresi
            <select value={warningDays} onChange={(event) => setWarningDays(Number(event.target.value))} className="bg-transparent font-semibold text-[var(--ink)] outline-none">
              <option value={15}>15 gün</option><option value={30}>30 gün</option><option value={60}>60 gün</option><option value={90}>90 gün</option>
            </select>
          </label>
          <Button variant="secondary" onClick={() => void load()} disabled={loading || busy !== null}>Yenile</Button>
          {canManage ? <Button onClick={() => void processRecertification()} disabled={busy !== null || dueCount === 0}>{busy === "batch" ? "İşleniyor..." : `Recertification Üret (${dueCount})`}</Button> : null}
        </div>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice("")}>{notice}</Alert> : null}

      {loading ? (
        <div className="flex min-h-[360px] items-center justify-center rounded-[22px] border border-[var(--line)] bg-[var(--surface)]"><Spinner label="Sertifikalar yükleniyor..." /></div>
      ) : data ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <FinanceMetric label="Geçerli" value={data.summary.VALID} detail="Geçerlilik penceresi dışında" tone="success" />
            <FinanceMetric label="Yaklaşan" value={data.summary.EXPIRING} detail={`Önümüzdeki ${data.warningDays} gün`} tone="warning" />
            <FinanceMetric label="Süresi Dolmuş" value={data.summary.EXPIRED} detail="Recertification gerekli" tone="danger" />
            <FinanceMetric label="Renewal Aktif" value={data.summary.renewalInProgress} detail="Ataması oluşturulmuş" tone="info" />
            <FinanceMetric label="İptal" value={data.summary.REVOKED} detail="Geçersiz sertifikalar" tone="neutral" />
          </section>

          <FinancePanel title="Recertification Kuyruğu" description="Süresi yaklaşan, dolmuş veya yenileme ataması devam eden sertifikalar. Toplu işlem mevcut idempotent renewal motorunu kullanır.">
            {!queue.length ? <FinanceEmpty title="Recertification bekleyen sertifika yok" description={`Önümüzdeki ${data.warningDays} günlük pencere temiz.`} /> : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-[11px]">
                  <thead><tr className="border-b border-[var(--line)] text-[10px] uppercase tracking-[0.1em] text-[var(--muted-soft)]"><th className="px-3 py-3">Personel</th><th className="px-3 py-3">Sertifika</th><th className="px-3 py-3">Kurs</th><th className="px-3 py-3">Son Tarih</th><th className="px-3 py-3">Lifecycle</th><th className="px-3 py-3">Renewal</th><th className="px-3 py-3 text-right">Aksiyon</th></tr></thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {queue.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-4"><Link href={`/training/staff/${item.staffId}`} className="font-semibold text-[var(--ink)] hover:text-[var(--accent)]">{[item.staffFirstName,item.staffLastName].filter(Boolean).join(" ") || item.staffId}</Link></td>
                        <td className="px-3 py-4"><span className="font-mono text-[10px] text-[var(--ink)]">{item.certificateNo}</span><p className="mt-1 text-[9px] text-[var(--muted-soft)]">v{item.courseVersion}</p></td>
                        <td className="px-3 py-4"><span className="font-semibold text-[var(--ink)]">{item.courseCode}</span><p className="mt-1 text-[10px] text-[var(--muted)]">{item.courseTitle}</p></td>
                        <td className="px-3 py-4"><span className="text-[var(--ink)]">{date(item.expiresAt)}</span><p className={`mt-1 text-[9px] font-semibold ${(item.daysToExpiry ?? 1) <= 0 ? "text-[var(--danger)]" : "text-[var(--warning)]"}`}>{item.daysToExpiry == null ? "" : item.daysToExpiry <= 0 ? `${Math.abs(item.daysToExpiry)} gün gecikmiş` : `${item.daysToExpiry} gün kaldı`}</p></td>
                        <td className="px-3 py-4"><span className="font-semibold text-[var(--ink)]">{lifecycleLabel(item.lifecycleStatus)}</span></td>
                        <td className="px-3 py-4">{item.renewalState === "IN_PROGRESS" ? <span className="font-semibold text-[var(--accent)]">Atama aktif</span> : <span className="text-[var(--muted)]">Bekliyor</span>}</td>
                        <td className="px-3 py-4 text-right">{canManage && item.renewalState === "DUE" ? <Button size="sm" variant="secondary" onClick={() => void renew(item.id)} disabled={busy !== null}>{busy === item.id ? "Oluşturuluyor..." : "Yenileme Ata"}</Button> : item.renewalAssignmentId ? <Link href="/training/assignments" className="text-[10px] font-semibold text-[var(--accent)] hover:underline">Atamaları Aç</Link> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </FinancePanel>

          <FinancePanel title="Sertifika Envanteri" description="Türetilmiş lifecycle durumu ile kalıcı workflow statüsü birlikte izlenir.">
            {!data.certificates.length ? <FinanceEmpty title="Sertifika bulunamadı" description="Tamamlanmış ve sertifika üretmiş bir eğitim henüz yok." /> : (
              <div className="grid gap-2 lg:grid-cols-2">
                {data.certificates.map((item) => <div key={item.id} className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)] p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[12px] font-semibold text-[var(--ink)]">{item.courseTitle}</p><p className="mt-1 font-mono text-[9px] text-[var(--muted-soft)]">{item.certificateNo}</p></div><span className="rounded-full border border-[var(--line)] px-2 py-1 text-[9px] font-semibold text-[var(--muted)]">{lifecycleLabel(item.lifecycleStatus)}</span></div><div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-[var(--muted)]"><span>{[item.staffFirstName,item.staffLastName].filter(Boolean).join(" ") || item.staffId}</span><span className="text-right">Son: {date(item.expiresAt)}</span></div></div>)}
              </div>
            )}
          </FinancePanel>
        </>
      ) : null}
    </div>
  );
}
