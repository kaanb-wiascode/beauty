export type CardHelpContent = {
  title: string;
  description: string;
  calculation?: string;
  interpretation?: string;
  source?: string;
  updateFrequency?: string;
};

const HELP_BY_TITLE: Record<string, Omit<CardHelpContent, "title">> = {
  "Toplam Tahsilat": {
    description: "Seçilen dönem içinde tamamlanmış tahsilatların toplam tutarını gösterir.",
    calculation: "Tamamlanmış ödeme kayıtlarının tahsil edilen tutarları toplanır.",
    interpretation: "Dönem içindeki nakit giriş performansını izlemek için kullanılır.",
    source: "Ödeme ve tahsilat kayıtları",
  },
  "Net Tahsilat": {
    description: "Brüt tahsilattan iade edilen tutarlar düşüldükten sonra kalan gerçek tahsilatı gösterir.",
    calculation: "Brüt tahsilat − iadeler",
    interpretation: "İşletmenin dönem içinde fiilen elde tuttuğu tahsilat tutarını gösterir.",
    source: "Ödeme ve iade kayıtları",
  },
  "Brüt Tahsilat": {
    description: "İadeler düşülmeden önce dönem içinde alınan toplam ödeme tutarını gösterir.",
    calculation: "Tamamlanan tüm ödeme kayıtlarının toplamı",
    interpretation: "İade etkisinden önceki toplam ödeme hacmini izlemek için kullanılır.",
    source: "Ödeme kayıtları",
  },
  "İadeler": {
    description: "Seçilen dönem içinde müşterilere geri ödenen toplam tutarı gösterir.",
    calculation: "İade edilmiş ödeme kayıtlarının toplamı",
    interpretation: "Yüksek veya artan değerler, iade nedenlerinin ayrıca incelenmesini gerektirebilir.",
    source: "İade kayıtları",
  },
  "Ortalama İşlem": {
    description: "Tamamlanan işlemler başına düşen ortalama tahsilat tutarını gösterir.",
    calculation: "Toplam tahsilat ÷ tamamlanan işlem sayısı",
    interpretation: "İşlem başına elde edilen ortalama geliri karşılaştırmak için kullanılır.",
    source: "İşlem ve ödeme kayıtları",
  },
  "İşlem Sayısı": {
    description: "Seçilen dönemde tamamlanmış tahsilat işlemlerinin adedini gösterir.",
    calculation: "Tamamlanmış ödeme kayıtları sayılır.",
    interpretation: "Tahsilat hacmini tutardan bağımsız olarak izlemek için kullanılır.",
    source: "Ödeme kayıtları",
  },
  "Tamamlanan": {
    description: "Seçilen dönemde tamamlanmış randevu veya işlemlerin sayısını gösterir.",
    calculation: "Durumu tamamlandı olan kayıtlar sayılır.",
    interpretation: "Planlanan işlerin gerçekleşme düzeyini izlemek için kullanılır.",
    source: "Randevu ve işlem kayıtları",
  },
  "Toplam Randevu": {
    description: "Seçilen dönem için oluşturulmuş toplam randevu sayısını gösterir.",
    calculation: "Döneme ait randevu kayıtlarının tamamı sayılır.",
    interpretation: "Talep ve operasyon yoğunluğunu izlemek için kullanılır.",
    source: "Randevu kayıtları",
  },
  "Toplam Müşteri": {
    description: "Sistemde kayıtlı toplam müşteri sayısını gösterir.",
    calculation: "Erişim kapsamındaki müşteri kayıtları sayılır.",
    interpretation: "Müşteri tabanının büyüklüğünü izlemek için kullanılır.",
    source: "Müşteri kayıtları",
  },
  "Net Harcama": {
    description: "Müşterinin toplam ödemelerinden iade edilen tutarlar düşüldükten sonra kalan harcamayı gösterir.",
    calculation: "Toplam tahsilat − toplam iade",
    interpretation: "Müşterinin işletmeye bıraktığı net geliri gösterir.",
    source: "Müşteri ödeme ve iade kayıtları",
  },
  "Kritik Stok": {
    description: "Mevcut miktarı tanımlı minimum stok seviyesine yaklaşan veya bu seviyenin altına inen ürünleri gösterir.",
    calculation: "Mevcut stok miktarı, ürünün minimum stok seviyesiyle karşılaştırılır.",
    interpretation: "Bu kartta görünen ürünler satın alma veya transfer açısından öncelikli olarak değerlendirilmelidir.",
    source: "Stok ve ürün kayıtları",
  },
  "Lokasyonlar": {
    description: "Stok veya varlıkların takip edildiği ana depo ve şube depolarını gösterir.",
    interpretation: "Hangi fiziksel noktaların envanter takibine dahil olduğunu anlamak için kullanılır.",
    source: "Depo ve şube kayıtları",
  },
  "Kategori Yönetimi": {
    description: "Ürün ve varlıkların sınıflandırıldığı kategori yapısına hızlı erişim sağlar.",
    interpretation: "Standart ve tutarlı envanter sınıflandırması için kullanılır.",
    source: "Kategori kayıtları",
  },
  "Tedarikçi Zinciri": {
    description: "Kayıtlı tedarikçilere ve satın alma ilişkilerine hızlı erişim sağlar.",
    interpretation: "Tedarik kaynaklarını ve satın alma operasyonlarını yönetmek için kullanılır.",
    source: "Tedarikçi kayıtları",
  },
  "Satın Alma": {
    description: "Stok ihtiyacı ve satın alma süreçleriyle ilgili kayıtlara hızlı erişim sağlar.",
    interpretation: "İhtiyaçların siparişe dönüşme sürecini takip etmek için kullanılır.",
    source: "Satın alma ve stok kayıtları",
  },
  "Varlık Yönetimi": {
    description: "İşletmenin taşınır, ekipman ve diğer fiziksel varlık kayıtlarına hızlı erişim sağlar.",
    interpretation: "Varlıkların konum, zimmet, garanti ve bakım durumlarını takip etmek için kullanılır.",
    source: "Envanter varlık kayıtları",
  },
};

function sentenceCase(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "Bu kart";
  return trimmed.charAt(0).toLocaleLowerCase("tr-TR") + trimmed.slice(1);
}

export function getCardHelp(title: string, detail?: string): CardHelpContent {
  const exact = HELP_BY_TITLE[title];

  if (exact) {
    return { title, ...exact };
  }

  return {
    title,
    description: detail
      ? `Bu kart, ${sentenceCase(title)} bilgisini ${sentenceCase(detail)} bağlamında gösterir.`
      : `Bu kart, ${sentenceCase(title)} bilgisinin güncel görünümünü gösterir.`,
    interpretation: "Değeri dönem, şube ve ilgili filtrelerle birlikte değerlendirerek değişimi ve mevcut durumu izleyebilirsiniz.",
    source: "VALOO içindeki ilgili modül kayıtları",
  };
}
