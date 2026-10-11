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
7. **Önemli:** Mevcut erişim JWT'si stateless olduğundan, sunucuda oturumu iptal etmek daha önce üretilmiş JWT'leri süresi dolana kadar anında geçersiz kılmaz. Gerçek cihaz testlerinden ve sunucu taraflı JWT iptal kontrolünden önce bu adımı tam oturum geçersizleştirmesi saymayın.

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
