import type { Metadata } from "next";

import { EditorialLanding } from "@/components/editorial-landing";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Çözümler",
  description: "VALOO’nun büyüyen, çok şubeli ve kurumsal işletme yapılarına nasıl uyum sağladığını keşfedin.",
};

const chapters = [
  {
    kicker: "Büyüyen işletmeler",
    title: "Büyüme güzel. Dağınıklık değil.",
    body: "Excel, mesajlaşma ve ayrı araçlarla başlayan süreçleri, organizasyon büyümeden önce daha kontrollü bir modele taşıyın.",
    points: ["Süreç standardizasyonu", "Merkezi müşteri görünümü", "Yönetim raporlaması"],
  },
  {
    kicker: "Çok şubeli yapılar",
    title: "Bir şube kolay. Peki ya elli?",
    body: "Merkez standartlarını korurken şubelerin günlük operasyonlarını kendi bağlamında yönetmesine izin verin.",
    points: ["Şube bazlı erişim", "Merkezi karşılaştırma", "Ortak operasyon standardı"],
  },
  {
    kicker: "Kurumsal organizasyonlar",
    title: "Kontrol büyüsün. Bürokrasi değil.",
    body: "Yetki, onay, finansal iz ve organizasyon kapsamı büyüdükçe daha görünür ve yönetilebilir kalır.",
    points: ["Yetki ve veri kapsamı", "Onay ve denetim izi", "Çok şirketli yapı temeli"],
  },
] as const;

export default function SolutionsPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <EditorialLanding
          eyebrow="VALOO Çözümleri"
          title="İşletmenize uyar."
          accent="Kimliğinizi bozmaz."
          intro="VALOO herkese aynı kalıbı dayatmak yerine organizasyonun büyüklüğüne, yapısına ve çalışma modeline göre şekillenir."
          chapters={chapters}
          localLinks={[
            { label: "Büyüyen", href: "#bolum-1" },
            { label: "Çok Şubeli", href: "#bolum-2" },
            { label: "Kurumsal", href: "#bolum-3" },
          ]}
        />
      </main>
      <SiteFooter />
    </>
  );
}
