import type { Metadata } from "next";

import { EditorialLanding } from "@/components/editorial-landing";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Ürünler",
  description: "CRM, operasyon, finans, People, Inventory ve Insights ürün ailelerini keşfedin.",
};

const chapters = [
  {
    kicker: "CRM + Operasyon",
    title: "Müşteriyi kazanın. Sonra kaybetmeyin.",
    body: "İlk temas, satış fırsatı ve günlük operasyon aynı hikâyenin devamıdır. VALOO bu geçişleri görünür tutar.",
    points: ["Lead ve fırsat yönetimi", "Takip ve görüşmeler", "Operasyon ve hizmet akışı"],
  },
  {
    kicker: "Finance + Inventory",
    title: "Para ve ürün iz bırakır.",
    body: "Satışın tahsilata, ürünün harekete ve hareketin finansal sonuca nasıl dönüştüğünü tek bağlamda izleyin.",
    points: ["Tahsilat ve alacak görünürlüğü", "Stok ve transfer hareketleri", "Finansal kontrol ve raporlama"],
  },
  {
    kicker: "People + Insights",
    title: "İnsan çalışır. Veri anlatır.",
    body: "Ekip, performans, kapasite ve sonuçlar yönetimin aynı karar alanında buluşur.",
    points: ["İK ve çalışma akışları", "Yetkinlik ve gelişim", "Yönetim içgörüleri"],
  },
] as const;

export default function ProductsPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <EditorialLanding
          eyebrow="VALOO Ürünleri"
          title="Tek ürün değil."
          accent="Birlikte çalışan ürünler."
          intro="Her modül kendi işini yapar. Asıl fark, birbirlerini anlamaya başladıklarında ortaya çıkar."
          chapters={chapters}
          localLinks={[
            { label: "CRM + Operasyon", href: "#bolum-1" },
            { label: "Finance + Inventory", href: "#bolum-2" },
            { label: "People + Insights", href: "#bolum-3" },
          ]}
        />
      </main>
      <SiteFooter />
    </>
  );
}
