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
  "Toplam Çalışan": {
    description: "Erişim yetkiniz kapsamındaki tüm çalışan kayıtlarının toplamını gösterir.",
    calculation: "Aktif ve arşivlenmiş çalışan kayıtları birlikte sayılır.",
    interpretation: "İnsan kaynağının toplam büyüklüğünü görmek için kullanılır.",
    source: "Çalışan kayıtları",
  },
  "Aktif Çalışan": {
    description: "Halen işletmede aktif olarak çalışan personel sayısını gösterir.",
    calculation: "Durumu aktif olan çalışan kayıtları sayılır.",
    interpretation: "Güncel çalışan kapasitesini izlemek için kullanılır.",
    source: "Çalışan kayıtları",
  },
  "Bugünkü Randevular": {
    description: "Bugün çalışanlara atanmış toplam randevu sayısını gösterir.",
    calculation: "Bugünün başlangıç ve bitiş saatleri arasındaki randevular sayılır.",
    interpretation: "Günlük iş yükünü ve ekip yoğunluğunu görmek için kullanılır.",
    source: "Randevu kayıtları",
  },
  "Bugünkü Tahsilat": {
    description: "Bugün çalışanlarla ilişkilendirilen tamamlanmış tahsilatların toplamını gösterir.",
    calculation: "Bugün tamamlanan ödeme kayıtlarının tutarları toplanır.",
    interpretation: "Ekip tarafından oluşturulan günlük tahsilat hacmini izlemek için kullanılır.",
    source: "Ödeme ve çalışan performans kayıtları",
  },
  "İK Modülleri": {
    description: "Çalışan, özlük, çalışma süresi, izin ve ücret süreçlerine tek noktadan erişmenizi sağlar.",
    interpretation: "Yapmak istediğiniz işleme göre ilgili karta girerek süreci doğrudan başlatabilirsiniz.",
    source: "İnsan Kaynakları modülü",
  },
  "Personel Performansı": {
    description: "Çalışanların bugünkü randevu ve tahsilat sonuçlarını birlikte gösterir.",
    calculation: "Randevu sayıları ve tamamlanan tahsilatlar çalışan bazında bir araya getirilir.",
    interpretation: "Günlük iş yükünü ve sonuçları birlikte değerlendirmek için kullanılır; tek başına çalışan değerlendirmesi için kullanılmamalıdır.",
    source: "Randevu ve ödeme kayıtları",
  },
  "Çalışan Kayıtları": {
    description: "Çalışanların temel görev, iletişim ve çalışma bilgilerini yönetmenizi sağlar.",
    interpretation: "Yeni çalışan eklemek veya mevcut çalışan bilgilerini güncellemek için kullanılır.",
    source: "İnsan Kaynakları çalışan kayıtları",
  },
  "Özlük Dosyaları": {
    description: "Çalışanın kimlik, işe giriş, görev ve banka gibi korunması gereken özlük bilgilerini gösterir.",
    interpretation: "Bu bölüm yalnızca yetkili kullanıcılar tarafından görüntülenmelidir.",
    source: "Çalışan özlük kayıtları",
  },
  "Puantaj": {
    description: "Çalışanların işe giriş, çıkış, mola, toplam çalışma ve fazla mesai kayıtlarını gösterir.",
    interpretation: "Çalışma sürelerini kontrol etmek ve bordroya gidecek zaman kayıtlarını hazırlamak için kullanılır.",
    source: "Çalışma ve devam kayıtları",
  },
  "İzinler": {
    description: "Çalışanların izin taleplerini, izin türlerini, tarihlerini ve onay durumlarını gösterir.",
    interpretation: "İzin planını takip etmek ve bekleyen talepleri yönetmek için kullanılır.",
    source: "İzin kayıtları",
  },
  "Bordro": {
    description: "Seçilen dönem için çalışan ücret hesaplama sürecini ve bordro kayıtlarını yönetmenizi sağlar.",
    interpretation: "Puantaj, izin ve ücret bilgileri kontrol edildikten sonra bordro dönemini hazırlamak için kullanılır.",
    source: "Bordro ve çalışma kayıtları",
  },
  "Maaş Ödemeleri": {
    description: "Çalışanlara yapılan maaş ödemelerini dönem ve ödeme tarihiyle birlikte gösterir.",
    interpretation: "Hangi ödemenin yapıldığını ve dönemsel ödeme durumunu takip etmek için kullanılır.",
    source: "Maaş ödeme kayıtları",
  },
  "SGK İşlemleri": {
    description: "Çalışanların dönemsel sosyal güvenlik kayıtlarını ve belge durumlarını takip etmenizi sağlar.",
    interpretation: "Dönem kayıtlarının hazırlanma ve tamamlanma durumunu kontrol etmek için kullanılır.",
    source: "Sosyal güvenlik kayıtları",
  },
  "İzin Yönetimi": {
    description: "İzin türlerini, yıllık hak kurallarını ve çalışan izin taleplerini tek merkezden yönetmenizi sağlar.",
    interpretation: "İzin haklarının doğru uygulanması ve taleplerin zamanında sonuçlandırılması için kullanılır.",
    source: "İzin türleri, izin kuralları ve izin talepleri",
  },
  "Puantaj Kontrolü": {
    description: "Vardiya planı ile gerçekleşen giriş-çıkış kayıtlarını karşılaştırarak kontrol gerektiren durumları gösterir.",
    calculation: "Planlanan vardiya ile giriş, çıkış ve devamsızlık kayıtları karşılaştırılır.",
    interpretation: "Geç kalma, erken çıkış, eksik giriş-çıkış veya devamsızlık görülen kayıtlar öncelikli kontrol edilmelidir.",
    source: "Vardiya ve puantaj kayıtları",
  },
  "Haftalık Vardiya Planı": {
    description: "Haftalık vardiyaları ve çalışan atamalarını gün bazında planlamanızı sağlar.",
    interpretation: "İzinli veya çakışan vardiyası olan çalışanlar uygun listede gösterilmez; böylece hatalı atamaların önüne geçilir.",
    source: "Vardiya, izin ve çalışan kayıtları",
  },
  "Yeni Vardiya": {
    description: "Seçili şube için yeni bir çalışma vardiyası oluşturmanızı sağlar.",
    interpretation: "Başlangıç, bitiş ve görev ihtiyacını belirleyerek vardiyayı oluşturabilir, ardından uygun çalışanları atayabilirsiniz.",
    source: "Vardiya planlama kayıtları",
  },
  "Bordro Kontrol Merkezi": {
    description: "Çalışan ücretleri, yapılan ödemeler ve kalan yükümlülükleri dönem bazında birlikte gösterir.",
    interpretation: "Bordro döneminin ödeme ve tamamlanma durumunu tek ekrandan kontrol etmek için kullanılır.",
    source: "Bordro ve ödeme kayıtları",
  },
  "Son Bordro Dönemleri": {
    description: "Son bordro dönemlerinin hazırlanma, onaylanma, tamamlanma veya geri alınma durumunu gösterir.",
    interpretation: "Hangi dönemin hangi aşamada olduğunu hızlıca görmek için kullanılır.",
    source: "Bordro dönem kayıtları",
  },
  "İşe Alım Merkezi": {
    description: "Açık pozisyonlardan iş teklifine kadar işe alım sürecinin tamamını tek merkezden yönetmenizi sağlar.",
    interpretation: "Her adayın hangi pozisyon için hangi aşamada olduğunu izlemek ve süreci düzenli yürütmek için kullanılır.",
    source: "İlan, aday, başvuru, görüşme ve teklif kayıtları",
  },
  "Açık Pozisyonlar": {
    description: "Hazırlanan, başvuruya açık veya kapatılmış iş ilanlarını gösterir.",
    interpretation: "Hangi pozisyonlarda aktif işe alım yapıldığını hızlıca görmek için kullanılır.",
    source: "İşe alım ilan kayıtları",
  },
  "Adaylar": {
    description: "İşe alım sürecine eklenen adayların temel iletişim ve kariyer bilgilerini gösterir.",
    interpretation: "Aday havuzunu takip etmek ve doğru pozisyonlarla eşleştirmek için kullanılır.",
    source: "Aday kayıtları",
  },
  "Başvurular": {
    description: "Adayların hangi pozisyona başvurduğunu ve sürecin hangi aşamasında olduğunu gösterir.",
    interpretation: "Bekleyen, görüşmeye geçen, teklif alan veya sonuçlanan başvuruları takip etmek için kullanılır.",
    source: "İşe alım başvuru kayıtları",
  },
  "Görüşmeler": {
    description: "Adaylarla planlanan görüşmelerin tarihini, türünü ve durumunu gösterir.",
    interpretation: "Görüşme takvimini ve değerlendirme akışını düzenli yürütmek için kullanılır.",
    source: "Görüşme kayıtları",
  },
  "İş Teklifleri": {
    description: "Adaylara hazırlanan ücret ve işe başlangıç tekliflerini gösterir.",
    interpretation: "Tekliflerin hazırlanma ve gönderilme durumunu takip etmek için kullanılır.",
    source: "İş teklifi kayıtları",
  },
  "İK Analizi": {
    description: "Çalışan sayısı, çalışma süreleri, izinler ve bordro sonuçlarını aynı dönem için birlikte gösterir.",
    interpretation: "Ekip büyüklüğü, çalışma yoğunluğu, izin kullanımı ve çalışan maliyetini birlikte değerlendirmek için kullanılır.",
    source: "Çalışan, puantaj, izin ve bordro kayıtları",
  },
  "Performans Değerlendirmeleri": {
    description: "Çalışanların değerlendirme dönemlerini, puanlarını, başarılarını ve gelişim alanlarını gösterir.",
    interpretation: "Değerlendirme sonucunu tek bir puana göre değil, hedefler ve gelişim planıyla birlikte değerlendirmek için kullanılır.",
    source: "Performans değerlendirme kayıtları",
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
