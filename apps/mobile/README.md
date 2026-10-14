# VALOO Mobil — İlk entegrasyon

Bu Expo uygulaması VALOO API ile gerçek personel girişini, sunucu tarafında kullanıcı/şirket/üyelik doğrulamasını ve izin verilen randevuları **salt okunur** görüntülemeyi destekler.

## Yapılandırma

Node 22.13.1 ve pnpm 11.9.0 kullanın. Repository kökünden:

```bash
pnpm install --frozen-lockfile
EXPO_PUBLIC_API_URL=https://api.ornek-valoo-alanadi.com pnpm --filter mobile start
```

`EXPO_PUBLIC_API_URL`, **API'nin gerçek kök adresi** olmalıdır (örneğin `/auth/login` isteklerini alan sunucu). Yerel geliştirmede yalnızca `localhost` veya `127.0.0.1` için HTTP kullanılabilir. Gerçek telefonlarda `localhost` geliştirme bilgisayarını değil telefonu gösterir: erişilebilir HTTPS adresi kullanın.

- Bu adrese JWT, API anahtarı, parola veya erişim belirteci koymayın. `EXPO_PUBLIC_*` değerleri uygulama paketine gömülür ve herkese açıktır.
- Mobil tarayıcıda kullanım için web-origin CORS izinlerinin API'de ayrıca yapılandırılması gerekir.
- GitHub CI yalnızca TypeScript ve Android/iOS imzasız JavaScript export işlemini gerçekleştirir; uygulamayı mağazalara dağıtmaz.

## Kimlik doğrulama ve veri kapsamı

1. `POST /auth/login`: kayıtlı VALOO kullanıcı adı/şifresi.
2. Güvenlik politikası MFA gerektiriyorsa `POST /auth/mfa/verify`; ilk kurulumda `POST /auth/mfa/challenge/:id/setup` ve `POST /auth/mfa/challenge/:id/enroll`.
3. Giriş başarılı olunca `GET /auth/me` ile kullanıcı, tenant ve üyelik kimlikleri doğrulanır.
4. `appointments.read` izni varsa `GET /appointments` ile 7 günlük randevu listesi gösterilir; şube/şirket kısıtlaması sunucu tarafından uygulanır.
5. Oturum belirteci **yalnızca uygulama belleğinde** tutulur; uygulama kapanınca yeni giriş gerekir. Kalıcı oturum ve güvenli cihaz-bağımlı yenileme yönetimi henüz uygulanmadı.
6. Giriş/MFA/yenileme yanıtlarındaki `sessionId`, sunucu oturum kayıtlarının kullanıcıya açık, SHA-256 tabanlı kimliğidir; gizli yenileme belirteci değildir. Mobil çıkış, JWT ile yetkilendirilmiş `POST /auth/sessions/:id/revoke` isteğiyle **sadece o oturumun yenileme belirtecini** iptal eder. API, kullanıcı ve şirket kapsamını doğrular. Ağ isteği başarısız olursa uygulama yerel belirteci yine siler ve kullanıcıyı uyarır.
7. **JWT oturum iptali:** Erişim JWT'si sunucu oturumuna ait `sessionId` içerir. Her korumalı API isteğinde JWT imzası/süresi yanında Redis oturum kaydı ve kullanıcı, tenant, üyelik, şirket, şube kapsamı denetlenir. Oturum iptali veya yenileme dönüşümü sonrasında eski JWT sonraki istekte **401** alır. Giriş öncesi eski JWT'ler yeni kural nedeniyle artık kabul edilmez; geçişte yeniden giriş veya geçerli yenileme çereziyle oturum yenileme gerekir. Redis erişilemezse korumalı istekler başarılı sayılmaz. Bu adım gerçek cihaz testlerinin yerine geçmez.

## Randevu görünümü

- **Randevular** ekranı müşteri adı, hizmet, personel, şube ve randevu durumunu API'nin `appointments.read` yetki kontrolüyle listeler.
- API'nin `GET /appointments` cevabı yalnızca `customer.firstName/lastName`, `service.name`, `staff.firstName/lastName`, `branch.name` alanlarını ekler; iletişim ve sağlık bilgileri bu görünüm için aktarılmaz.
- Tarih seçenekleri **Bugün / 7 gün / 30 gün** ve **Tümü / Planlandı / Onaylandı / Tamamlandı / İptal edildi / Gelmedi** durumu için sunucu filtreleri kullanılır; şube kapsamı API tarafından uygulanır.
- Randevu kartlarındaki **Randevu detayını gör** kontrolü, yalnızca zaten erişimi onaylanmış listede bulunan hizmet, müşteri, personel, şube, tarih ve kayıt kimliği alanlarını genişletir; ek bir hassas ayrıntı isteği yapmaz.
- **Personel seç** kontrolü, yalnızca `appointments.read` izniyle erişilen `GET /appointments/staff-options?search=...` üzerinden en fazla 30 aktif personel seçeneğini döndürür. API, görevlinin şirket/şube kapsamını uygular ve yalnızca `id`, `firstName`, `lastName` ve `branchId` seçer. Tam personel rehberine ve iletişim bilgilerine erişim verilmez.
- Seçilen personelin UUID'si randevu listesine `staffId` filtresi olarak eklenir; API ayrıca yetki kapsamına göre filtreler. Hesap değiştiğinde personel seçimi silinir.
- Randevular salt okunurdur; ekleme, iptal, tahsilat ve personel puantaj işlemleri bu mobil sürümde bulunmaz.
- Tarihler cihazın yerel gün başlangıcına göre hesaplanır. Gerçek cihazda saat dilimi ve yaz saati sınırları doğrulanmalıdır.

## Aktif Oturumlar

- Giriş yaptıktan sonra **Aktif Oturumlar** bölümünde `GET /auth/sessions` ile sunucunun o kullanıcıya ve şirkete erişim hakkı verdiği oturumlar listelenir.
- İlgili girişe ait SHA-256 `sessionId` eşleşiyorsa **Bu oturum**, diğerleri **Diğer oturum** olarak gösterilir. Bu etiketler fiziksel cihaz kimliğini doğrulamaz.
- Diğer oturumu kapatma işlemi iki aşamalı kullanıcı onayı ardından `POST /auth/sessions/:id/revoke` ile yapılır. İptal edilen oturumun JWT'si sonraki istekte reddedilir, mevcut oturum aktif kalır.
- Yetki veya oturum süresi bitmişse API'den dönen 401 üzerine yerel oturum temizlenir; zaten reddedilen JWT ile gereksiz çıkış isteği tekrarlanmaz.
- **Sınır:** Erişim JWT'si 15 dakika içinde sona erer ve mobil uygulamada güvenli kalıcı yenileme henüz uygulanmadı. JWT süresi dolmuşsa sunucuda bir oturum kaydı mevcut olsa bile mobil iptal isteği gönderilemeyebilir. Bu durumda kullanıcı yeniden oturum açıp oturum listesinden eski oturumu iptal edebilir. Çıkışın sunucuda doğrulandığından emin olunamıyorsa uygulama kullanıcıyı uyarır.

## Bilinen kapsam sınırları

- Randevu ekleme, güncelleme, iptal, tahsilat ve personel puantajı **aktif değildir**.
- Bu aşamada kimlik doğrulama ve veri listesi için uçtan uca gerçek cihaz testleri yapılmadı.
- MFA, kimlik ve yetki kontrolü sunucunun yerine mobil UI'da uygulanmaz; sunucu kesin otoritedir.
- `braces` ve `node-forge` Expo araç zinciri bağımlılıkları için yüksek önem dereceli güvenlik bildirimleri açık: GitHub Issue #11 ve #12. Genel bağımlılık denetimi devre dışı bırakılmadı.

## Doğrulama

```bash
pnpm --filter mobile exec tsc --noEmit
pnpm --filter mobile exec expo export --platform android --output-dir /tmp/valoo-mobile-android
pnpm --filter mobile exec expo export --platform ios --output-dir /tmp/valoo-mobile-ios
```

Güncel CI: `.github/workflows/mobile-quality.yml`.
