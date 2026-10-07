"use client";

import { useState } from "react";

const capabilities = [
  {
    key: "crm",
    label: "Müşteri",
    eyebrow: "CRM",
    title: "Unutmak insani.",
    accent: "VALOO’nun bahanesi yok.",
    body: "İlk temas, görüşme, fırsat ve takip aynı müşteri hikâyesinin içinde kalır.",
    bullets: ["Lead ve fırsatlar", "Görüşme geçmişi", "Takip ve hatırlatmalar", "Customer 360"],
    metric: "12",
    metricLabel: "yeni fırsat",
    side: "3 takip bugün",
  },
  {
    key: "operations",
    label: "Operasyon",
    eyebrow: "Operasyon",
    title: "Bugün ne oluyor?",
    accent: "Hepsi burada.",
    body: "Günün akışı, kapasite, hizmet ve bekleyen işler aynı operasyon görünümünde buluşur.",
    bullets: ["Canlı operasyon", "Kapasite ve kaynak", "Hizmet akışı", "Yeniden randevu"],
    metric: "27",
    metricLabel: "aktif işlem",
    side: "4 şube yoğun",
  },
  {
    key: "finance",
    label: "Finans",
    eyebrow: "Finance",
    title: "Satış yaptınız.",
    accent: "Peki para nerede?",
    body: "Tahsilat, alacak, gider ve kârlılık aynı finansal hikâyenin parçalarıdır.",
    bullets: ["Tahsilat ve alacak", "Kasa ve banka", "Gider ve tedarikçi", "Kârlılık"],
    metric: "₺4,84M",
    metricLabel: "bu ay",
    side: "₺620K açık alacak",
  },
  {
    key: "people",
    label: "Ekip",
    eyebrow: "People",
    title: "İnsan işi.",
    accent: "Ama ezber işi değil.",
    body: "İzin, vardiya, performans ve gelişim çalışan yaşam döngüsünde anlam kazanır.",
    bullets: ["Puantaj ve izin", "Vardiya", "Yetkinlik", "Performans"],
    metric: "144",
    metricLabel: "çalışan",
    side: "8 onay bekliyor",
  },
  {
    key: "inventory",
    label: "Stok",
    eyebrow: "Inventory",
    title: "“Burada vardı.”",
    accent: "Artık geçerli değil.",
    body: "Stok hareketi, transfer, tüketim ve tedarik nereden nereye gittiğini bilir.",
    bullets: ["Transfer", "Sayım", "Tedarik", "Tüketim ve değerleme"],
    metric: "18",
    metricLabel: "lokasyon",
    side: "6 kritik stok",
  },
  {
    key: "insights",
    label: "Yönetim",
    eyebrow: "Insights",
    title: "Hissetmek güzel.",
    accent: "Bilmek daha güzel.",
    body: "Operasyonun ürettiği veriyi yönetimin karar verebileceği netliğe dönüştürün.",
    bullets: ["Yönetim özeti", "Şube karşılaştırma", "KPI takibi", "Raporlama"],
    metric: "360°",
    metricLabel: "görünürlük",
    side: "Tek yönetim özeti",
  },
] as const;

export function CapabilityExplorer() {
  const [activeKey, setActiveKey] = useState<(typeof capabilities)[number]["key"]>("crm");
  const active = capabilities.find((item) => item.key === activeKey) ?? capabilities[0];

  return (
    <section className="capability-section" id="products">
      <div className="section-heading">
        <p className="eyebrow">VALOO ile neler yapabilirsiniz?</p>
        <h2>Bir sürü özellik.<br /><span>Tek bir iş akışı.</span></h2>
        <p>İhtiyacınız olan alanı seçin. VALOO’nun parçaları tek başına değil, birlikte çalışmak için tasarlanır.</p>
      </div>

      <div className="capability-tabs" role="tablist" aria-label="VALOO yetenekleri">
        {capabilities.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={activeKey === item.key}
            className={activeKey === item.key ? "active" : ""}
            onClick={() => setActiveKey(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="capability-stage">
        <div className="capability-copy" key={active.key}>
          <p className="eyebrow">{active.eyebrow}</p>
          <h3>{active.title}<span>{active.accent}</span></h3>
          <p>{active.body}</p>
          <div className="capability-bullets">
            {active.bullets.map((bullet) => <span key={bullet}>{bullet}</span>)}
          </div>
          <a href="/urunler">Ürünleri keşfedin <span aria-hidden="true">→</span></a>
        </div>

        <div className="capability-visual" aria-hidden="true" key={active.key + "-visual"}>
          <div className="capability-glow" />
          <div className="capability-main-card">
            <small>{active.eyebrow}</small>
            <strong>{active.metric}</strong>
            <span>{active.metricLabel}</span>
            <div className="mini-chart">
              {[28,44,36,61,53,76,68,88].map((height, index) => (
                <i key={index} style={{ height: height + "%" }} />
              ))}
            </div>
          </div>
          <div className="capability-side-card">{active.side}</div>
          <div className="capability-status-card"><i /> Canlı veri</div>
        </div>
      </div>
    </section>
  );
}
