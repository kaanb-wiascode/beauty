"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DataView } from "@/components/data-view";
import { FinanceEmpty, FinanceMetric, FinancePanel } from "@/components/finance-view";
import { Alert, Button, Spinner, TextInput } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type LevelBand = { code: string; label: string; minScore: number; maxScore: number };
type Requirement = {
  competencyId: string;
  competencyCode: string;
  competencyName: string;
  requiredLevel: number;
  requiredBand: LevelBand | null;
  currentLevel: number | null;
  currentBand: LevelBand | null;
  gap: number;
  meetsRequirement: boolean;
  weight: number;
  latestSource?: string | null;
  lastAssessedAt?: string | null;
};
type MatrixPerson = {
  staffId: string;
  firstName: string;
  lastName: string;
  branchId: string;
  position?: string | null;
  profile: { id: string; code: string; name: string; version: number } | null;
  requirements: Requirement[];
};

export default function TrainingSkillMatrixPage() {
  const [rows, setRows] = useState<MatrixPerson[]>([]);
  const [levels, setLevels] = useState<LevelBand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [onlyGaps, setOnlyGaps] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [matrix, scale] = await Promise.all([
        api<MatrixPerson[]>("/training/competencies/skill-matrix"),
        api<LevelBand[]>("/training/competencies/level-scale"),
      ]);
      setRows(matrix ?? []);
      setLevels(scale ?? []);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Skill Matrix yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const competencies = useMemo(() => {
    const map = new Map<string, { id: string; code: string; name: string }>();
    for (const person of rows) for (const item of person.requirements) map.set(item.competencyId, { id: item.competencyId, code: item.competencyCode, name: item.competencyName });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }, [rows]);

  const visibleRows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("tr-TR");
    return rows.filter((person) => {
      const matchesSearch = !needle || `${person.firstName} ${person.lastName} ${person.position ?? ""} ${person.profile?.name ?? ""}`.toLocaleLowerCase("tr-TR").includes(needle);
      const hasGap = person.requirements.some((item) => !item.meetsRequirement);
      return matchesSearch && (!onlyGaps || hasGap);
    });
  }, [onlyGaps, rows, search]);

  const profileCount = rows.filter((person) => person.profile).length;
  const gapStaffCount = rows.filter((person) => person.requirements.some((item) => !item.meetsRequirement)).length;
  const compliantCount = rows.filter((person) => person.profile && person.requirements.length > 0 && person.requirements.every((item) => item.meetsRequirement)).length;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 pb-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link href="/training" className="text-[11px] font-semibold text-[var(--accent)] hover:underline">← Learning Operations</Link>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--muted-soft)]">Competency Management</p>
          <h1 className="mt-1 text-[32px] font-semibold tracking-[-0.045em] text-[var(--ink)]">Skill Matrix</h1>
          <p className="mt-2 max-w-[900px] text-[13px] leading-6 text-[var(--muted)]">Pozisyon/profil gereksinimlerini personelin en güncel yetkinlik kanıtlarıyla karşılaştırın. 0–100 skor motoru korunur; L0–L5 seviyeleri okunabilir ürün dili sağlar.</p>
        </div>
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>Yenile</Button>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      {loading ? (
        <div className="flex min-h-[360px] items-center justify-center rounded-[22px] border border-[var(--line)] bg-[var(--surface)]"><Spinner label="Skill Matrix hazırlanıyor..." /></div>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <FinanceMetric label="Aktif Personel" value={rows.length} detail="Aktif organizasyon kapsamı" tone="info" />
            <FinanceMetric label="Profil Atanmış" value={profileCount} detail={`${rows.length - profileCount} profilsiz personel`} tone={profileCount === rows.length ? "success" : "warning"} />
            <FinanceMetric label="Gap Taşıyan" value={gapStaffCount} detail="En az bir gereksinim eksik" tone={gapStaffCount ? "danger" : "success"} />
            <FinanceMetric label="Tam Uyumlu" value={compliantCount} detail="Tüm required competency seviyeleri karşılanıyor" tone="success" />
          </section>

          <FinancePanel title="Seviye Skalası" description="Roadmap varsayılan L0–L5 gösterimi. Assessment ve profile skorları veri tabanında 0–100 olarak tutulmaya devam eder.">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {levels.map((level) => (
                <div key={level.code} className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-3">
                  <p className="text-[12px] font-semibold text-[var(--accent)]">{level.code}</p>
                  <p className="mt-1 text-[11px] font-semibold text-[var(--ink)]">{level.label}</p>
                  <p className="mt-1 text-[10px] text-[var(--muted-soft)]">{level.minScore}–{level.maxScore}</p>
                </div>
              ))}
            </div>
          </FinancePanel>

          <FinancePanel title="Personel × Yetkinlik" description="Hücrelerde mevcut seviye/skor ve profilin istediği hedef seviye birlikte gösterilir.">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="w-full sm:max-w-[420px]"><TextInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Personel, pozisyon veya profil ara..." /></div>
              <label className="flex items-center gap-2 text-[11px] font-medium text-[var(--muted)]">
                <input type="checkbox" checked={onlyGaps} onChange={(event) => setOnlyGaps(event.target.checked)} />
                Yalnız gap taşıyan personel
              </label>
            </div>

            {!rows.length ? <FinanceEmpty title="Skill Matrix verisi yok" description="Aktif personel bulunamadı." /> : !visibleRows.length ? <FinanceEmpty title="Filtreye uyan personel yok" description="Arama veya gap filtresini değiştirin." /> : (
              <DataView>
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-[var(--line)] bg-[var(--surface-2)]">
                        <th className="sticky left-0 z-10 min-w-[250px] bg-[var(--surface-2)] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-soft)]">Personel</th>
                        {competencies.map((competency) => <th key={competency.id} className="min-w-[170px] px-3 py-3 text-[10px] font-semibold text-[var(--muted)]"><span className="block text-[var(--accent)]">{competency.code}</span>{competency.name}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--line)]">
                      {visibleRows.map((person) => (
                        <tr key={person.staffId} className="align-top">
                          <td className="sticky left-0 z-10 bg-[var(--surface)] px-4 py-4">
                            <Link href={`/training/staff/${person.staffId}`} className="text-[12px] font-semibold text-[var(--ink)] hover:text-[var(--accent)]">{person.firstName} {person.lastName}</Link>
                            <p className="mt-1 text-[10px] text-[var(--muted-soft)]">{person.position || "Pozisyon tanımsız"}</p>
                            <p className="mt-1 text-[10px] text-[var(--muted)]">{person.profile ? `${person.profile.code} · v${person.profile.version}` : "Competency profili yok"}</p>
                          </td>
                          {competencies.map((competency) => {
                            const item = person.requirements.find((requirement) => requirement.competencyId === competency.id);
                            if (!item) return <td key={competency.id} className="px-3 py-4 text-[11px] text-[var(--muted-soft)]">—</td>;
                            const current = item.currentLevel == null ? "Ölçülmedi" : `${item.currentBand?.code ?? "—"} · ${item.currentLevel}`;
                            const target = `${item.requiredBand?.code ?? "—"} · ${item.requiredLevel}`;
                            return (
                              <td key={competency.id} className="px-3 py-4">
                                <div className={`rounded-[12px] border px-3 py-2 ${item.meetsRequirement ? "border-[var(--success)]/25 bg-[var(--success-soft)]" : "border-[var(--danger)]/25 bg-[var(--danger-soft)]"}`}>
                                  <p className={`text-[11px] font-semibold ${item.meetsRequirement ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>{current}</p>
                                  <p className="mt-1 text-[9px] text-[var(--muted)]">Hedef {target}</p>
                                  {!item.meetsRequirement ? <p className="mt-1 text-[9px] font-semibold text-[var(--danger)]">Gap {item.gap}</p> : <p className="mt-1 text-[9px] font-semibold text-[var(--success)]">Uygun</p>}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </DataView>
            )}
          </FinancePanel>
        </>
      )}
    </div>
  );
}
