import Link from "next/link";

import { EnterpriseDataPage } from "@/components/enterprise-data-page";

export default function PosTransactionOperationsPage() {
  return (
    <div className="space-y-5">
      <EnterpriseDataPage
        eyebrow="Finans Yönetimi · POS İşlemleri"
        title="POS İşlem Yönetimi"
        description="POS hareketlerini, hesaba geçişleri ve mutabakat durumunu izleyin. Teknik kayıt kodları kullanıcıdan istenmez; eşleştirme ve sağlayıcı işlemleri otomatik finans akışları üzerinden yürütülür."
        sections={[
          { title: "POS Tahsilat Geçişleri", path: "/financial-integrations/pos/settlements" },
          { title: "Mutabakat Özeti", path: "/financial-integrations/pos/reconciliation/summary" },
          { title: "14 Günlük Tahsilat Tahmini", path: "/financial-integrations/pos/settlement-forecast?days=14" },
          { title: "Son POS İşlem Kayıtları", path: "/financial-integrations/pos/webhooks?limit=100" },
        ]}
        actions={[
          {
            label: "POS Ödemelerini Otomatik Bağla",
            path: "/financial-integrations/pos/payment-links/auto",
            body: { limit: 300 },
            success: "POS ödemeleri otomatik eşleştirme için işlendi.",
          },
          {
            label: "Mutabakatı Otomatik Çalıştır",
            path: "/financial-integrations/pos/reconciliation/auto-match",
            body: { limit: 300 },
            success: "POS ve banka hareketleri otomatik mutabakat için işlendi.",
          },
        ]}
      />
      <section className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5">
        <h2 className="text-[14px] font-semibold text-[var(--ink)]">İstisna Yönetimi</h2>
        <p className="mt-2 max-w-3xl text-[11px] leading-5 text-[var(--muted)]">
          Otomatik eşleşmeyen POS veya banka hareketlerini kayıt kodu girmek yerine Mutabakat Merkezi'nden seçerek yönetin. Bağlantı kimlik bilgileri ve sağlayıcı senkronizasyonları Finans Bağlantıları ekranından yönetilir.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/finance/reconciliation" className="inline-flex rounded-[12px] bg-[var(--accent)] px-4 py-2.5 text-[11px] font-semibold text-white">
            Mutabakat Merkezine Git
          </Link>
          <Link href="/finance/integrations" className="inline-flex rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-[11px] font-semibold text-[var(--ink)]">
            Finans Bağlantılarını Yönet
          </Link>
        </div>
      </section>
    </div>
  );
}
