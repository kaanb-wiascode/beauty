import { EnterpriseDataPage } from "@/components/enterprise-data-page";

export default function PosTransactionOperationsPage() {
  return (
    <EnterpriseDataPage
      eyebrow="Finans Yönetimi · POS İşlemleri"
      title="POS İşlem Yönetimi"
      description="POS kayıtlarını satış ödemeleriyle ilişkilendirin, otomatik eşleştirmeyi çalıştırın ve iade/ters ibraz finans olaylarını kontrollü biçimde yönetin."
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
      ]}
      forms={[
        {
          title: "Bağlantı Kimlik Bilgilerini Döndür",
          path: "/financial-integrations/{integrationId}/credentials/rotate",
          fields: [
            { name: "integrationId", label: "Finansal Entegrasyon Kodu", required: true },
          ],
        },
        {
          title: "Elle POS Tahsilat Kaydı Oluştur",
          path: "/financial-integrations/{integrationId}/pos/settlements",
          fields: [
            { name: "integrationId", label: "Finansal Entegrasyon Kodu", required: true },
            { name: "providerSettlementId", label: "Sağlayıcı Tahsilat Kodu", required: true },
            { name: "bankAccountId", label: "Banka Hesabı Kodu" },
            {
              name: "transactionIds",
              label: "POS İşlem Kodları",
              type: "json",
              required: true,
              placeholder: '["POS_ISLEM_KODU_1","POS_ISLEM_KODU_2"]',
            },
            { name: "settledAt", label: "Hesaba Geçiş Tarihi", type: "datetime-local", required: true },
          ],
        },
        {
          title: "Tahsilat Verisini Sağlayıcıdan İçe Aktar",
          path: "/financial-integrations/{integrationId}/pos/settlements/import",
          fields: [
            { name: "integrationId", label: "Finansal Entegrasyon Kodu", required: true },
            { name: "date", label: "Hesaba Geçiş Tarihi", type: "date", required: true },
          ],
        },
        {
          title: "POS İşlemini Satış Ödemesine Bağla",
          path: "/financial-integrations/pos/transactions/{posTransactionId}/link-payment",
          fields: [
            { name: "posTransactionId", label: "POS İşlem Kodu", required: true },
            { name: "salePaymentId", label: "Satış Ödemesi Kodu", required: true },
          ],
        },
        {
          title: "POS İşlemi İadesi Oluştur",
          path: "/financial-integrations/pos/transactions/{posTransactionId}/refund",
          fields: [
            { name: "posTransactionId", label: "POS İşlem Kodu", required: true },
            { name: "amount", label: "İade Tutarı", type: "number", required: true },
            { name: "externalEventId", label: "Harici İşlem Kodu", required: true },
          ],
        },
        {
          title: "POS Finans Olayı Kaydet",
          path: "/financial-integrations/pos/transactions/{posTransactionId}/financial-events",
          fields: [
            { name: "posTransactionId", label: "POS İşlem Kodu", required: true },
            {
              name: "eventType",
              label: "Olay Türü",
              type: "select",
              required: true,
              options: [
                { value: "REFUND", label: "İade" },
                { value: "CHARGEBACK", label: "Ters İbraz" },
              ],
            },
            { name: "externalEventId", label: "Harici İşlem Kodu", required: true },
            { name: "amount", label: "Tutar", type: "number", required: true },
            { name: "feeAmount", label: "Kesinti / Masraf", type: "number" },
            { name: "occurredAt", label: "Olay Tarihi", type: "datetime-local", required: true },
          ],
        },
      ]}
    />
  );
}
