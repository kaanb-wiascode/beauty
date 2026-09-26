import { OperationsUtilizationPanel } from "../resources/utilization-panel";

export default function OperationsUtilizationPage() {
  return (
    <div className="mx-auto max-w-[1420px] space-y-5 pb-10">
      <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-soft)]">
          Capacity & Utilization
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
          Operasyon Kullanım Analizi
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
          Personel kullanım oranını ve hizmet talep dağılımını seçilen operasyon penceresinde inceleyin. Shift ve izin entegrasyonu ayrı availability katmanında eklenecektir.
        </p>
      </header>
      <OperationsUtilizationPanel />
    </div>
  );
}
