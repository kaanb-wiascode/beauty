"use client";

import { useEffect, useMemo, useState } from "react";

import { DataView, DataViewMeta } from "@/components/data-view";
import { FinanceEmpty, FinanceMetric, FinancePanel, FinanceStatus } from "@/components/finance-view";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";

type PayrollDashboard = {
  period: { year: number; month: number };
  totals: {
    employeeCount: number;
    gross: number | string;
    net: number | string;
    employerCost: number | string;
    tax: number | string;
    social: number | string;
    other: number | string;
  };
  settlements: {
    salaryPaid: number | string;
    salaryRemaining: number;
    taxPaid: number | string;
    taxRemaining: number;
    socialPaid: number | string;
    socialRemaining: number;
    otherPaid: number | string;
    otherRemaining: number;
  };
  costCenters: Array<{
    costCenterId: string | null;
    code: string;
    name: string;
    amount: number | string;
    employeeCount: number;
  }>;
  periods: Array<{
    id: string;
    year: number;
    month: number;
    status: string;
    branchId: string | null;
    branchName: string | null;
    approvedAt: string | null;
    postedAt: string | null;
    cancelledAt: string | null;
    reversedAt: string | null;
  }>;
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Taslak",
  SUBMITTED: "Onay Bekliyor",
  APPROVED: "Onaylandı",
  POSTED: "Muhasebeleşti",
  CANCELLED: "İptal",
  REVERSED: "Ters Kayıt",
};

export default function PayrollDashboardPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<PayrollDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setData(await api<PayrollDashboard>(withQuery("/hr/payroll/dashboard", { year, month })));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Bordro kontrol merkezi yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [year, month]);

  const employerCost = Number(data?.totals.employerCost ?? 0);
  const costCenters = useMemo(() => data?.costCenters ?? [], [data]);
  const totalTaxAndSocialRemaining =
    Number(data?.settlements.taxRemaining ?? 0) +
    Number(data?.settlements.socialRemaining ?? 0) +
    Number(data?.settlements.otherRemaining ?? 0);

  return (
    <div className="mx-auto max-w-[1380px] space-y-6 pb-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[.15em] text-[var(--muted-soft)]">
            İnsan Kaynakları / Bordro
          </p>
          <h1 className="mt-1 text-[30px] font-semibold tracking-[-.035em] text-[var(--ink)]">
            Bordro Kontrol Merkezi
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-6 text-[var(--muted)]">
            Tahakkuk, ödeme, yükümlülük ve maliyet merkezi dağılımını tek ekrandan izleyin.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            className="control h-10 w-24"
            type="number"
            min="2000"
            max="2100"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            aria-label="Bordro yılı"
          />
          <select
            className="control h-10 min-w-[120px]"
            value={month}
            onChange={(event) => setMonth(Number(event.target.value))}
            aria-label="Bordro ayı"
          >
            {Array.from({ length: 12 }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                {index + 1}. Ay
              </option>
            ))}
          </select>
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            Yenile
          </Button>
        </div>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-[22px] border border-[var(--line)] bg-[var(--surface)]">
          <Spinner label="Bordro kontrol merkezi hazırlanıyor..." />
        </div>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <FinanceMetric
              label="İşveren Maliyeti"
              value={money(data?.totals.employerCost)}
              detail={`${Number(data?.totals.employeeCount ?? 0)} çalışan`}
              tone="info"
            />
            <FinanceMetric
              label="Net Ücret"
              value={money(data?.totals.net)}
              detail={`Ödenen ${money(data?.settlements.salaryPaid)}`}
              tone="success"
            />
            <FinanceMetric
              label="Kalan Maaş Borcu"
              value={money(data?.settlements.salaryRemaining)}
              detail="335 Personele Borçlar"
              tone={Number(data?.settlements.salaryRemaining ?? 0) > 0 ? "warning" : "success"}
            />
            <FinanceMetric
              label="Vergi + SGK Kalan"
              value={money(totalTaxAndSocialRemaining)}
              detail="360 / 361 / 369"
              tone={totalTaxAndSocialRemaining > 0 ? "warning" : "success"}
            />
          </section>

          <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
            <FinancePanel
              title="Yükümlülük Durumu"
              description="Bordro tahakkuku ile gerçekleşen ödeme karşılaştırması."
            >
              <div className="space-y-4">
                <Liability
                  label="Maaş"
                  due={Number(data?.totals.net ?? 0)}
                  paid={Number(data?.settlements.salaryPaid ?? 0)}
                  remaining={Number(data?.settlements.salaryRemaining ?? 0)}
                />
                <Liability
                  label="Vergi"
                  due={Number(data?.totals.tax ?? 0)}
                  paid={Number(data?.settlements.taxPaid ?? 0)}
                  remaining={Number(data?.settlements.taxRemaining ?? 0)}
                />
                <Liability
                  label="SGK / İşsizlik"
                  due={Number(data?.totals.social ?? 0)}
                  paid={Number(data?.settlements.socialPaid ?? 0)}
                  remaining={Number(data?.settlements.socialRemaining ?? 0)}
                />
                <Liability
                  label="Diğer"
                  due={Number(data?.totals.other ?? 0)}
                  paid={Number(data?.settlements.otherPaid ?? 0)}
                  remaining={Number(data?.settlements.otherRemaining ?? 0)}
                />
              </div>
            </FinancePanel>

            <FinancePanel
              title="Maliyet Merkezi Dağılımı"
              description="İşveren maliyetinin cost-center kırılımı."
            >
              <div className="space-y-3">
                {costCenters.map((costCenter) => {
                  const amount = Number(costCenter.amount ?? 0);
                  const percent = employerCost > 0 ? Math.round((amount / employerCost) * 1000) / 10 : 0;
                  return (
                    <div key={costCenter.costCenterId ?? "unallocated"} className="rounded-[14px] border border-[var(--line)] p-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-semibold text-[var(--ink)]">
                            {costCenter.code} · {costCenter.name}
                          </p>
                          <p className="mt-1 text-[10px] text-[var(--muted)]">
                            {costCenter.employeeCount} çalışan · %{percent}
                          </p>
                        </div>
                        <p className="shrink-0 text-[12px] font-semibold text-[var(--ink)]">{money(amount)}</p>
                      </div>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
                        <div
                          className="h-full rounded-full bg-[var(--accent)]"
                          style={{ width: `${Math.min(100, percent)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {!costCenters.length ? (
                  <FinanceEmpty title="Maliyet merkezi dağılımı yok" description="Bu dönem için cost-center kırılımı bulunamadı." />
                ) : null}
              </div>
            </FinancePanel>
          </div>

          <DataView>
            <div className="border-b border-[var(--line)] px-5 py-4">
              <h2 className="text-[15px] font-semibold text-[var(--ink)]">Son Bordro Dönemleri</h2>
              <p className="mt-1 text-[10px] text-[var(--muted)]">Lifecycle ve muhasebeleştirme görünümü.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-[11px]">
                <thead>
                  <tr className="border-b border-[var(--line)] bg-[var(--surface-2)]/40 text-[10px] uppercase tracking-[.08em] text-[var(--muted-soft)]">
                    <th className="p-4">Dönem</th>
                    <th className="p-4">Şube</th>
                    <th className="p-4">Durum</th>
                    <th className="p-4">Onay</th>
                    <th className="p-4">Muhasebe</th>
                    <th className="p-4">İptal / Ters</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.periods ?? []).map((period) => (
                    <tr key={period.id} className="border-b border-[var(--line)] last:border-0">
                      <td className="p-4 font-medium text-[var(--ink)]">
                        {period.year}/{String(period.month).padStart(2, "0")}
                      </td>
                      <td className="p-4 text-[var(--muted)]">{period.branchName ?? "Şirket Geneli"}</td>
                      <td className="p-4">
                        <FinanceStatus status={period.status}>{STATUS_LABELS[period.status] ?? period.status}</FinanceStatus>
                      </td>
                      <td className="p-4 text-[var(--muted)]">{dateTime(period.approvedAt)}</td>
                      <td className="p-4 text-[var(--muted)]">{dateTime(period.postedAt)}</td>
                      <td className="p-4 text-[var(--muted)]">
                        {period.reversedAt
                          ? `Ters: ${dateTime(period.reversedAt)}`
                          : period.cancelledAt
                            ? `İptal: ${dateTime(period.cancelledAt)}`
                            : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data?.periods.length ? (
              <div className="p-6">
                <FinanceEmpty title="Bordro dönemi bulunamadı" description="Seçilen dönem için bordro lifecycle kaydı yok." />
              </div>
            ) : null}
            <DataViewMeta>
              <span>{data?.periods.length ?? 0} dönem</span>
              <span>{year}/{String(month).padStart(2, "0")} kontrol görünümü</span>
            </DataViewMeta>
          </DataView>
        </>
      )}
    </div>
  );
}

function Liability({ label, due, paid, remaining }: { label: string; due: number; paid: number; remaining: number }) {
  const percent = due > 0 ? Math.min(100, Math.round((paid / due) * 1000) / 10) : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <span className="font-medium text-[var(--ink)]">{label}</span>
        <span className="text-[var(--muted)]">{money(paid)} / {money(due)}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-1 text-right text-[10px] text-[var(--muted)]">Kalan {money(remaining)}</div>
    </div>
  );
}

function money(value: number | string | undefined) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

function dateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
