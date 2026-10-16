import type { Metadata } from "next";

import { EditorialLanding } from "@/components/editorial-landing";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Platform",
  description: "VALOO’nun işletme süreçlerini tek veri ve çalışma modeli içinde nasıl bağladığını keşfedin.",
};

const chapters = [
  {
    kicker: "Tek gerçeklik",
    title: "Aynı işletme. Ayrı ayrı doğrular değil.",
    body: "Müşteri, satış, operasyon, finans ve ekip verisi birbirinden kopuk kaldığında yönetim de parçalanır. VALOO süreçleri ortak bir bağlamda tutar.",
    points: ["Ortak müşteri ve işlem bağlamı", "Şirket, şube ve rol kapsamı", "Birbirini besleyen süreç zinciri"],
  },
  {
    kicker: "Kontrol",
    title: "Kim, neyi, nerede görüyor?",
    body: "Büyüme daha fazla erişim değil, daha doğru erişim gerektirir. Yetki ve kapsam organizasyonun yapısına göre şekillenir.",
    points: ["Rol ve yetki", "Şirket ve şube kapsamı", "İzlenebilir işlem geçmişi"],
  },
  {
    kicker: "Ölçek",
    title: "Yeni şube. Yeni kaos olmak zorunda değil.",
    body: "VALOO tek bir lokasyonu yönetmekten çok, aynı çalışma modelini büyüyen organizasyona taşıyacak şekilde kurgulanır.",
    points: ["Çok şubeli yapı", "Merkezi standartlar", "Yerel operasyon esnekliği"],
  },
] as const;

export default function PlatformPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <EditorialLanding
          eyebrow="VALOO Platform"
          title="Parçaları değil."
          accent="Bütünü yönetin."
          intro="VALOO; müşteri, operasyon, finans, ekip ve yönetim süreçlerini birbirini anlayan tek bir çalışma modelinde buluşturur."
          chapters={chapters}
          localLinks={[
            { label: "Genel Bakış", href: "#bolum-1" },
            { label: "Kontrol", href: "#bolum-2" },
            { label: "Ölçek", href: "#bolum-3" },
          ]}
        />
      </main>
      <SiteFooter />
    </>
  );
}
