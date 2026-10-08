import { CapabilityExplorer } from "@/components/capability-explorer";
import { ExperienceMotion } from "@/components/experience-motion";
import { PlatformSubnav } from "@/components/platform-subnav";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

const heroImage = "https://images.unsplash.com/photo-1758518729711-1cbacd55efdb?auto=format&fit=crop&fm=jpg&q=82&w=1800";
const teamImage = "https://images.unsplash.com/photo-1774600134168-b9ebd714e4e1?auto=format&fit=crop&fm=jpg&q=82&w=1800";

const highlightCards = [
  { kicker: "Finance", title: "Satış var.", accent: "Tahsilat nerede?", note: "Gelir, alacak ve ödeme hareketlerini aynı bağlamda izleyin.", tone: "blue" },
  { kicker: "CRM", title: "Müşteri geldi.", accent: "Sonra ne oldu?", note: "İlk temastan fırsata ve takibe kadar hikâyeyi kaybetmeyin.", tone: "violet" },
  { kicker: "Multi-location", title: "Şube büyüdü.", accent: "Kontrol küçülmesin.", note: "Merkezden görün, yerinde yönetin. Standartlar aynı kalsın.", tone: "dark" },
  { kicker: "Inventory", title: "İş yapıldı.", accent: "Stok da biliyor.", note: "Transfer, tüketim ve tedarik hareketlerini operasyonla bağlayın.", tone: "mint" },
] as const;

const resourceCards = [
  { title: "Çok şubeli işletme nasıl yönetilir?", tag: "Yönetim", read: "6 dk", href: "/cozumler#bolum-2" },
  { title: "CRM neden bir müşteri listesinden fazlasıdır?", tag: "CRM", read: "5 dk", href: "/urunler#bolum-1" },
  { title: "Ciro güzel. Peki nakit akışı?", tag: "Finans", read: "7 dk", href: "/urunler#bolum-2" },
] as const;

export default function Home() {
  return (
    <>
      <SiteHeader />
      <PlatformSubnav />
      <ExperienceMotion />

      <main className="home-rich">
        <section className="rich-hero" id="platform">
          <div className="rich-hero-copy" data-reveal>
            <p className="eyebrow">VALOO</p>
            <h1>İşler karışabilir.<span>VALOO karıştırmaz.</span></h1>
            <p>
              Müşteri, operasyon, finans, ekip, stok ve yönetim birbirinden ayrı görünür.
              Aslında aynı işletmenin farklı hareketleridir.
            </p>
            <div className="hero-actions rich-actions">
              <a className="primary-link" href="/demo">Demo planlayın</a>
              <a className="text-link" href="/platform">VALOO’yu keşfedin <span>→</span></a>
            </div>
            <div className="hero-proof-row">
              <span><strong>CRM</strong>Müşteri</span>
              <span><strong>OPS</strong>Operasyon</span>
              <span><strong>FIN</strong>Finans</span>
              <span><strong>HR</strong>Ekip</span>
            </div>
          </div>

          <div className="rich-hero-visual" data-reveal>
            <div className="photo-frame hero-photo">
              <img src={heroImage} alt="Modern bir ofiste birlikte çalışan iş ekibi" fetchPriority="high" decoding="async" />
              <div className="photo-scrim" />
            </div>
            <div className="floating-card float-sales">
              <small>Bugün</small>
              <strong>₺184.200</strong>
              <span>Tahsilat</span>
            </div>
            <div className="floating-card float-leads">
              <small>CRM</small>
              <strong>12</strong>
              <span>yeni fırsat</span>
            </div>
            <div className="floating-card float-branch">
              <i />
              <span>Merkez + şubeler</span>
              <strong>Canlı</strong>
            </div>
            <div className="visual-ribbon">Müşteri → Operasyon → Satış → Finans → Karar</div>
          </div>
        </section>

        <section className="highlights-section" id="story">
          <div className="section-heading compact" data-reveal>
            <p className="eyebrow">VALOO’da işler böyle ilerler.</p>
            <h2>Tek tek değil.<br /><span>Birbirinin devamı.</span></h2>
          </div>

          <div className="highlight-grid">
            {highlightCards.map((card) => (
              <a className={"highlight-card tone-" + card.tone} href="/urunler" key={card.title} data-reveal>
                <div>
                  <p className="eyebrow">{card.kicker}</p>
                  <h3>{card.title}<span>{card.accent}</span></h3>
                  <p>{card.note}</p>
                </div>
                <div className="highlight-visual" aria-hidden="true">
                  <span className="hv-pill">Canlı</span>
                  <i className="hv-line line-a" />
                  <i className="hv-line line-b" />
                  <i className="hv-line line-c" />
                  <strong>→</strong>
                </div>
              </a>
            ))}
          </div>
        </section>

        <section className="breadth-strip" data-reveal>
          <div>
            <p className="eyebrow">Bir işletme. Birçok hareket.</p>
            <h2>Hepsi aynı bağlamda.</h2>
          </div>
          <div className="breadth-marquee" aria-hidden="true">
            <span>CRM</span><span>OPERASYON</span><span>FINANCE</span><span>PEOPLE</span>
            <span>INVENTORY</span><span>QUALITY</span><span>TRAINING</span><span>INSIGHTS</span>
          </div>
        </section>

        <CapabilityExplorer />

        <section className="connected-section">
          <div className="connected-copy" data-reveal>
            <p className="eyebrow eyebrow-light">Bağlantılı sistem</p>
            <h2>Asıl mesele özellikler değil.<span>Birbirlerini tanımaları.</span></h2>
            <p>
              Bir müşterinin ilk teması satışa, satış tahsilata, hizmet stok hareketine,
              operasyon finansal sonuca dönüşür. VALOO bu zinciri koparmadan taşır.
            </p>
            <a href="/platform">Platformu inceleyin <span>→</span></a>
          </div>

          <div className="flow-visual" data-reveal aria-label="VALOO bağlantılı süreç görselleştirmesi">
            <div className="flow-track" />
            {[
              ["01","Müşteri","CRM"],
              ["02","Fırsat","Satış"],
              ["03","Operasyon","İcra"],
              ["04","Tahsilat","Finance"],
              ["05","Karar","Insights"],
            ].map(([index,title,note]) => (
              <div className="flow-node" key={index}>
                <span>{index}</span>
                <strong>{title}</strong>
                <small>{note}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="full-photo-story" data-reveal>
          <img src={teamImage} alt="Modern ofiste dizüstü bilgisayarlarla birlikte çalışan ekip" loading="lazy" decoding="async" />
          <div className="full-photo-overlay">
            <p className="eyebrow eyebrow-light">Hareket halindeyken</p>
            <h2>İşletme hareket eder.<span>VALOO da.</span></h2>
            <p>Merkezde, şubede, masada veya telefonda. Aynı işletme gerçeği sizinle gelir.</p>
          </div>
          <div className="photo-metrics" aria-hidden="true">
            <span><strong>09:42</strong>Yeni lead</span>
            <span><strong>10:18</strong>Tahsilat tamamlandı</span>
            <span><strong>10:24</strong>Onay bekliyor</span>
          </div>
        </section>

        <section className="migration-section">
          <div className="migration-copy" data-reveal>
            <p className="eyebrow">Geçiş</p>
            <h2>Yeni sistem.<span>Sıfırdan hayat değil.</span></h2>
            <p>
              Mevcut verilerinizi ve iş alışkanlıklarınızı görmezden gelmeden VALOO’ya geçiş planlayın.
              Müşteri, personel, ürün ve temel operasyon verileri için yapılandırılmış aktarım yaklaşımı.
            </p>
            <a href="/demo">Geçişi konuşalım <span>→</span></a>
          </div>
          <div className="migration-visual" data-reveal aria-hidden="true">
            <div className="source-stack">
              <span>Excel</span><span>CSV</span><span>Müşteri</span><span>Stok</span><span>Personel</span>
            </div>
            <div className="migration-beam"><i /><i /><i /></div>
            <div className="migration-destination">
              <span>VALOO</span>
              <strong>Hazır.</strong>
              <small>Tek çalışma modeli</small>
            </div>
          </div>
        </section>

        <section className="mobile-story">
          <div className="phone-scene" data-reveal aria-hidden="true">
            <div className="phone-frame">
              <div className="phone-island" />
              <div className="phone-content">
                <small>VALOO</small>
                <strong>Günaydın.</strong>
                <p>İşletmeniz şöyle.</p>
                <div className="phone-metric"><span>Tahsilat</span><b>₺84.200</b></div>
                <div className="phone-metric"><span>Yeni fırsat</span><b>12</b></div>
                <div className="phone-metric"><span>Onay bekleyen</span><b>4</b></div>
              </div>
            </div>
            <div className="phone-alert alert-one">Yeni lead · İstanbul</div>
            <div className="phone-alert alert-two">Şube 04 · Stok uyarısı</div>
          </div>
          <div className="mobile-copy" data-reveal>
            <p className="eyebrow">Mobil</p>
            <h2>Ofisten çıktınız.<span>Kontrolden değil.</span></h2>
            <p>
              Yönetim sinyallerini ve kritik hareketleri bulunduğunuz yerden takip edin.
              Telefon ekranını küçültülmüş masaüstüne çevirmek yerine, ihtiyaç duyduğunuz bilgiyi öne çıkarın.
            </p>
            <div className="inline-features">
              <span>Yönetim özeti</span><span>Onaylar</span><span>Bildirimler</span><span>Operasyon sinyalleri</span>
            </div>
          </div>
        </section>

        <section className="sector-section" id="industries">
          <div className="section-heading" data-reveal>
            <p className="eyebrow">Sektörler</p>
            <h2>Her işletme aynı çalışmaz.<br /><span>VALOO da öyle.</span></h2>
            <p>Platform ortak kalır. İş akışı, terminoloji ve öncelikler işletmenin gerçekliğine göre şekillenir.</p>
          </div>

          <div className="sector-grid">
            <a className="sector-card sector-photo" href="/sektorler" data-reveal>
              <img src={teamImage} alt="" loading="lazy" decoding="async" />
              <div>
                <small>Çözüm</small>
                <h3>Hizmet işletmeleri</h3>
                <span>Keşfedin →</span>
              </div>
            </a>
            <a className="sector-card sector-dark" href="/cozumler#bolum-2" data-reveal>
              <div className="sector-network" aria-hidden="true"><i/><i/><i/><i/><i/></div>
              <div>
                <small>Ölçek</small>
                <h3>Çok lokasyonlu yapılar</h3>
                <span>Keşfedin →</span>
              </div>
            </a>
            <a className="sector-card sector-soft" href="/sektorler#bolum-3" data-reveal>
              <div className="sector-bars" aria-hidden="true"><i/><i/><i/><i/><i/><i/></div>
              <div>
                <small>Operasyon</small>
                <h3>Yoğun ekipler</h3>
                <span>Keşfedin →</span>
              </div>
            </a>
            <a className="sector-card sector-violet" href="/sektorler" data-reveal>
              <div className="sector-orbit" aria-hidden="true"><i/><i/><i/></div>
              <div>
                <small>Dikey çözüm</small>
                <h3>Beauty & Wellness</h3>
                <span>Keşfedin →</span>
              </div>
            </a>
          </div>
        </section>

        <section className="integration-rich" id="integrations">
          <div className="integration-copy" data-reveal>
            <p className="eyebrow">Entegrasyonlar</p>
            <h2>VALOO yalnız çalışmayı sevmez.</h2>
            <p>
              İşletmenizin kullandığı kanalları, sağlayıcıları ve iletişim araçlarını tek bir operasyon modeline bağlamaya hazır bir altyapı.
            </p>
            <small>Canlı bağlantılar, sağlayıcıya hazır adaptörler ve planlanan entegrasyonlar ayrı statülerle gösterilir.</small>
          </div>
          <div className="integration-map" data-reveal aria-hidden="true">
            <div className="integration-core">VALOO</div>
            {["Google","Meta","WhatsApp","E-posta","Ödeme","Takvim"].map((item,index)=>(
              <span className={"integration-node node-"+(index+1)} key={item}>{item}</span>
            ))}
            <i className="ring ring-one"/><i className="ring ring-two"/>
          </div>
        </section>

        <section className="resources-rich" id="resources">
          <div className="section-heading compact" data-reveal>
            <p className="eyebrow">Kaynaklar</p>
            <h2>İşi biraz fazla düşünüyoruz.</h2>
            <p>VALOO’nun çözmeye çalıştığı problemlerin arkasındaki operasyon ve yönetim yaklaşımını da anlatıyoruz.</p>
          </div>
          <div className="resource-grid">
            {resourceCards.map((card,index)=>(
              <article className={"resource-card resource-"+(index+1)} key={card.title} data-reveal>
                <div className="resource-art" aria-hidden="true"><i/><i/><i/></div>
                <div>
                  <span>{card.tag} · {card.read}</span>
                  <h3>{card.title}</h3>
                  <a href={card.href}>İnceleyin →</a>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="support-band" data-reveal>
          <div>
            <p className="eyebrow">Bir şey mi merak ettiniz?</p>
            <h2>İnsanlar hâlâ güzel bir özellik.</h2>
          </div>
          <div className="support-actions">
            <a href="/demo">Satış ekibiyle konuşun <span>→</span></a>
            <a href="/platform">Platformu keşfedin <span>→</span></a>
          </div>
        </section>

        <section className="final-cta rich-final" id="demo" data-reveal>
          <p className="eyebrow">VALOO</p>
          <h2>İşletmeniz büyüsün.<br /><span>Karmaşası değil.</span></h2>
          <p>Gerisini göstermemiz daha kolay.</p>
          <a className="primary-link" href="/demo">Demo planlayın</a>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
