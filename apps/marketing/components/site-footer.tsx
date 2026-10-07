import { ValooLogo } from "@/components/valoo-logo";

const groups = [
  { title: "Platform", links: ["VALOO’yu Keşfet", "Nasıl Çalışır", "Güvenlik", "Entegrasyonlar"] },
  { title: "Ürünler", links: ["CRM", "Operasyon", "Finans", "People", "Inventory", "Insights"] },
  { title: "Çözümler", links: ["Çok Şubeli İşletmeler", "Büyüyen İşletmeler", "Kurumsal Yapılar", "Sektör Çözümleri"] },
  { title: "Kaynaklar", links: ["Yardım Merkezi", "Dokümantasyon", "Blog", "SSS"] },
  { title: "VALOO", links: ["Hakkımızda", "İletişim", "Kariyer", "Partnerler"] },
] as const;

export function SiteFooter() {
  return (
    <footer className="site-footer" id="resources">
      <div className="footer-inner">
        <div className="footer-brand-row">
          <div>
            <a className="footer-brand" href="/" aria-label="VALOO ana sayfa"><ValooLogo className="footer-logo" /></a>
            <p>İşin tamamını görmenin daha iyi bir yolu.</p>
          </div>
          <span>Türkiye · Türkçe</span>
        </div>

        <div className="footer-groups">
          {groups.map((group) => (
            <section className="footer-group" key={group.title}>
              <h2>{group.title}</h2>
              <div>
                {group.links.map((link) => <a href="#" key={link}>{link}</a>)}
              </div>
            </section>
          ))}
        </div>

        <div className="footer-demo">
          <p>Gerisini göstermemiz daha kolay.</p>
          <a href="/demo">Demo planlayın <span aria-hidden="true">→</span></a>
        </div>

        <div className="footer-legal">
          <p>Copyright © 2026 VALOO. Tüm hakları saklıdır.</p>
          <nav aria-label="Yasal bağlantılar">
            <a href="#">Gizlilik</a><a href="#">KVKK</a><a href="#">Kullanım Koşulları</a><a href="#">Çerezler</a>
          </nav>
          <span>Türkiye</span>
        </div>
      </div>
    </footer>
  );
}
