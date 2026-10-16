import type { Metadata } from "next";

import { EditorialLanding } from "@/components/editorial-landing";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Sektörler",
  description: "VALOO’nun farklı iş modellerine uyarlanabilen sektör yaklaşımını keşfedin.",
};

const chapters = [
  {
    kicker: "Hizmet işletmeleri",
    title: "Müşteri gelir. İş başlar.",
    body: "Müşteri yaşam döngüsü, operasyon, ekip ve tahsilat aynı hizmet deneyiminin parçalarıysa VALOO bu parçaları aynı bağlamda yönetmek için tasarlanır.",
    points: ["Müşteri ve satış yolculuğu", "Randevu veya iş akışı", "Hizmet sonrası devamlılık"],
  },
  {
    kicker: "Çok lokasyonlu yapılar",
    title: "Adres değişir. Standart değişmez.",
    body: "Merkez, bölge ve şubeler farklı sorumluluklarla çalışırken ortak veri ve yönetim standardını korumak gerekir.",
    points: ["Merkez ve şube görünürlüğü", "Yetki ve kapsam", "Karşılaştırılabilir performans"],
  },
  {
    kicker: "Operasyon yoğun ekipler",
    title: "İş akarken sistem geride kalmasın.",
    body: "Gün içinde müşteri, çalışan, kaynak, stok ve finansal hareket üreten işletmelerde asıl ihtiyaç tek tek özelliklerden çok süreçlerin birbirini takip etmesidir.",
    points: ["Canlı operasyon sinyalleri", "Kaynak ve kapasite", "Finansal ve operasyonel bağ"],
  },
] as const;

export default function IndustriesPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <EditorialLanding
          eyebrow="VALOO Sektörler"
          title="Sektör değişir."
          accent="İşin gerçeği değişmez."
          intro="VALOO tek bir sektörün ekranlarını çoğaltmak yerine, farklı işletmelerde tekrar eden müşteri, operasyon, ekip ve finans problemlerini ortak bir platformda çözer."
          chapters={chapters}
          localLinks={[
            { label: "Hizmet", href: "#bolum-1" },
            { label: "Çok Lokasyonlu", href: "#bolum-2" },
            { label: "Operasyon Yoğun", href: "#bolum-3" },
          ]}
        />
      </main>
      <SiteFooter />
    </>
  );
}
