import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

const signalRows = [
  ["12", "yeni fırsat"],
  ["3", "takip bekliyor"],
  ["₺1,28M", "açık fırsat"],
] as const;

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="hero" id="platform">
          <div className="hero-glow hero-glow-one" />
          <div className="hero-glow hero-glow-two" />
          <div className="hero-content">
            <p className="eyebrow">VALOO</p>
            <h1>İşler karışabilir.<span>VALOO karıştırmaz.</span></h1>
            <p className="hero-copy">
              İşletmenin birbirinden kopuk görünen parçalarını aynı akışta buluşturan yeni nesil yönetim platformu.
            </p>
            <div className="hero-actions">
              <a className="primary-link" href="#demo">VALOO’yu keşfedin</a>
              <a className="text-link" href="#story">Nasıl düşündüğünü görün <span>→</span></a>
            </div>
          </div>

          <div className="signal-stage" aria-label="VALOO veri sinyalleri">
            <div className="signal-orbit" />
            {signalRows.map(([value, label], index) => (
              <div className={"signal-card signal-" + (index + 1)} key={label}>
                <strong>{value}</strong><span>{label}</span>
              </div>
            ))}
            <div className="signal-core"><span>Canlı görünüm</span><strong>Şimdi</strong></div>
          </div>
        </section>

        <section className="statement statement-dark" id="story">
          <div className="statement-inner">
            <p className="eyebrow eyebrow-light">Kontrol</p>
            <h2>Tam bir kontrol delisi.</h2>
            <p>Müşteri, para, ekip, stok, şube ve operasyon. Her biri kendi işini yapar. VALOO aralarındaki bağı kaybetmez.</p>
          </div>
          <div className="word-stream" aria-hidden="true">
            <span>Müşteri</span><span>Operasyon</span><span>Finans</span><span>Ekip</span><span>Stok</span><span>Kararlar</span>
          </div>
        </section>

        <section className="story-grid" id="products">
          <article className="story-panel story-panel-crm">
            <p className="eyebrow">CRM</p>
            <h2>Unutmak insani.<br />VALOO’nun bahanesi yok.</h2>
            <p>Görüşme, fırsat, takip ve geçmiş gerektiğinde aynı hikâyenin içinde.</p>
            <div className="micro-timeline" aria-hidden="true">
              <span><i /> Form geldi <small>09:14</small></span>
              <span><i /> Görüşme yapıldı <small>11:32</small></span>
              <span><i /> Takip planlandı <small>Yarın</small></span>
            </div>
          </article>
          <article className="story-panel story-panel-finance">
            <p className="eyebrow">Finans</p>
            <h2>Satış yaptınız.<br />Peki para nerede?</h2>
            <p>Tahsilat, alacak, gider ve nakit akışı aynı gerçeğin farklı parçaları.</p>
            <div className="finance-number" aria-hidden="true">
              <span>Bu ay</span><strong>₺4,84M</strong><small>Tek rakam. Daha büyük bir hikâye.</small>
            </div>
          </article>
        </section>

        <section className="operations-scene">
          <div className="operations-copy">
            <p className="eyebrow eyebrow-light">Operasyon</p>
            <h2>Bugün neler oluyor?<br /><span>Hepsi burada.</span></h2>
            <p>Randevular, bekleyen işler, kapasite ve hareket eden süreçler. İşletmenin nabzını tek akışta hissedin.</p>
          </div>
          <div className="operations-pulse" aria-hidden="true">
            <div><span>09:30</span><strong>Yeni randevu</strong><small>Merkez</small></div>
            <div><span>10:05</span><strong>Hizmet başladı</strong><small>Şube 04</small></div>
            <div><span>10:18</span><strong>Tahsilat tamamlandı</strong><small>₺18.400</small></div>
            <div><span>10:24</span><strong>Takip oluşturuldu</strong><small>Yarın 11:00</small></div>
          </div>
        </section>

        <section className="inventory-scene">
          <div className="inventory-copy">
            <p className="eyebrow">Inventory</p>
            <h2>“Burada vardı.”<br /><span>Artık geçerli bir cevap değil.</span></h2>
            <p>Ürünün nereden geldiğini, nereye gittiğini ve ne zaman kullanıldığını izleyin.</p>
          </div>
          <div className="inventory-flow" aria-label="Stok hareketi örneği">
            <span>Merkez Depo</span><i /><span>Şube 04</span><i /><span>Hizmet</span>
          </div>
        </section>

        <section className="people-scene">
          <div className="people-copy">
            <p className="eyebrow">People</p>
            <h2>İnsan işi.<br /><span>Ama ezber işi değil.</span></h2>
            <p>Vardiya, izin, performans, yetkinlik ve gelişim aynı kişinin etrafında anlam kazanır.</p>
          </div>
          <div className="people-signals" aria-hidden="true">
            <span>Vardiya hazır</span><span>İzin onaylandı</span><span>Yetkinlik güncel</span><span>Gelişim planı açık</span>
          </div>
        </section>

        <section className="scale-scene" id="solutions">
          <p className="eyebrow">Ölçek</p>
          <h2>Bir şube kolay.<br /><span>Peki ya elli?</span></h2>
          <div className="branch-cloud" aria-hidden="true">
            {["Merkez", "İstanbul", "Ankara", "İzmir", "Bursa", "Antalya", "Adana", "Berlin"].map((item) => <span key={item}>{item}</span>)}
          </div>
          <p className="scale-copy">Aynı standart. Aynı veri. Gerektiği kadar yerel, gerektiği kadar merkezi.</p>
        </section>

        <section className="insight-scene" id="industries">
          <div>
            <p className="eyebrow eyebrow-light">Insights</p>
            <h2>Hissetmek güzel.<br /><span>Bilmek daha güzel.</span></h2>
          </div>
          <p>İşletmenin ne yaptığını tahmin etmeyin. Soruyu sorun, veriye bakın, kararı verin.</p>
        </section>

        <section className="integration-scene">
          <p className="eyebrow">Entegrasyonlar</p>
          <h2>VALOO yalnız çalışmayı sevmez.</h2>
          <p>Kullandığınız araçları aynı iş akışının parçası haline getirin. Bağlantılar arttıkça karmaşa artmak zorunda değil.</p>
          <div className="integration-orbit" aria-hidden="true">
            <span>Google</span><span>WhatsApp</span><span>Meta</span><span>Ödeme</span><span>E-posta</span><span>Takvim</span>
          </div>
        </section>

        <section className="final-cta" id="demo">
          <p className="eyebrow">VALOO</p>
          <h2>İşletmeniz büyüsün.<br /><span>Karmaşası değil.</span></h2>
          <a className="primary-link" href="mailto:hello@valoo.app">Demo planlayın</a>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
