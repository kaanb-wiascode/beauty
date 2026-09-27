import { CardInfo } from "@/components/card-info";
import { getCardHelp } from "@/lib/card-help";
import { OperationsUtilizationPanel } from "../resources/utilization-panel";

export default function OperationsUtilizationPage() {
  return (
    <div className="mx-auto max-w-[1420px] space-y-5 pb-10">
      <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-soft)]">
          Kapasite ve Kullanım
        </p>
        <div className="mt-2 flex items-start gap-2">
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
            Operasyon Kullanım Analizi
          </h1>
          <CardInfo help={getCardHelp("Operasyon Kullanım Analizi")} />
        </div>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
          Personel kullanım oranını ve hizmet talep dağılımını seçilen operasyon aralığında inceleyin. Vardiya ve izin bilgileri personel uygunluğu katmanıyla birlikte değerlendirilir.
        </p>
      </header>
      <OperationsUtilizationPanel />
    </div>
  );
}
