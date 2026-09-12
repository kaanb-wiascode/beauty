const USER_LABELS: Record<string, string> = {
  ACTIVE: "Aktif",
  INACTIVE: "Pasif",
  ARCHIVED: "Arşivlendi",
  PENDING: "Bekliyor",
  APPROVED: "Onaylandı",
  REJECTED: "Reddedildi",
  PAID: "Ödendi",
  PRESENT: "Geldi",
  ABSENT: "Gelmedi",
  DRAFT: "Taslak",
  PUBLISHED: "Yayında",
  RETIRED: "Kullanımdan Kaldırıldı",
  CLOSED: "Kapandı",
  AWARDED: "Kazanan Seçildi",
  CANCELLED: "İptal Edildi",
  SUBMITTED: "Gönderildi",
  ACCEPTED: "Kabul Edildi",
  WITHDRAWN: "Geri Çekildi",
  CONNECTED: "Bağlı",
  CONNECTING: "Bağlanıyor",
  DISCONNECTED: "Bağlantı Kesildi",
  HEALTHY: "Sorunsuz",
  ATTENTION: "Kontrol Gerekli",
  WARNING: "Uyarı",
  CRITICAL: "Kritik",
  SUCCESS: "Başarılı",
  FAILED: "Başarısız",
  PROCESSING: "İşleniyor",
  PROCESSED: "İşlendi",
  RUNNING: "Devam Ediyor",
  COMPLETED: "Tamamlandı",
  RETRY_PENDING: "Yeniden Denenecek",
  ENRICHMENT_PENDING: "Bilgi Tamamlanıyor",
  DEAD_LETTER: "İşlem Başarısız",
  MATCHED: "Eşleştirildi",
  UNMATCHED: "Eşleştirilmedi",
  CONFIGURED: "Ayarlanmış",
  MISSING: "Eksik",
  READY: "Hazır",
  PARTIAL: "Kısmen Hazır",
  STALE: "Güncel Değil",
  OPEN: "Açık",
  ACKNOWLEDGED: "İnceleniyor",
  INVESTIGATING: "İnceleniyor",
  ACTION_REQUIRED: "İşlem Gerekli",
  RESOLVED: "Çözüldü",
  IMPROVED: "İyileşti",
  STABLE: "Değişmedi",
  WORSE: "Kötüleşti",
  INSUFFICIENT_BASELINE: "Başlangıç Verisi Yetersiz",
  NORMAL: "Normal",
  HIGH: "Yüksek",
  MEDIUM: "Orta",
  LOW: "Düşük",
  ASSIGNED: "Atandı",
  IN_PROGRESS: "Devam Ediyor",
  EXPIRED: "Süresi Doldu",
  SCHEDULED: "Planlandı",
  RECEIVED: "Teslim Alındı",
  ORDERED: "Sipariş Verildi",
  CLAIMED: "İşleme Alındı",
  SENT: "Gönderildi",
  DEAD: "Gönderilemedi",
  UNVERIFIED: "Doğrulanmadı",
  SUSPENDED: "Askıda",
  BANK: "Banka",
  CASH: "Nakit",
  CARD: "Kart",
  TRANSFER: "Havale / EFT",
  ANNUAL: "Yıllık İzin",
  SICK: "Hastalık İzni",
  EXCUSE: "Mazeret İzni",
  UNPAID: "Ücretsiz İzin",
  OTHER: "Diğer",
  OWNER: "Yetkili",
  ADMIN: "Yönetici",
  MANAGER: "Müdür",
  STAFF: "Personel",
  VERIFIED: "Doğrulandı",
  MANUFACTURER: "Üretici",
  DISTRIBUTOR: "Distribütör",
  IMPORTER: "İthalatçı",
  WHOLESALER: "Toptancı",
  RETAILER: "Perakendeci",
  SERVICE_PROVIDER: "Hizmet Sağlayıcı",
};

const USER_ERROR_MESSAGES: Record<string, string> = {
  "Invalid email or password": "E-Posta Veya Şifre Hatalı.",
  "No active tenant membership": "Aktif İşletme Üyeliği Bulunamadı.",
  "No active organization membership": "Aktif İşletme Üyeliği Bulunamadı.",
  "Active organization membership is missing": "Aktif İşletme Üyeliği Bulunamadı.",
  "Membership organization context is missing": "İşletme Bilgileri Yüklenemedi. Lütfen Tekrar Giriş Yapın.",
  "A branch must be selected for this operation.": "Bu İşlem İçin Önce Bir Şube Seçin.",
  "A branch is required for this role": "Bu Kullanıcı Rolü İçin Bir Şube Seçilmelidir.",
  "A branch is required for a branch-scoped role": "Bu Kullanıcı Rolü İçin Bir Şube Seçilmelidir.",
  "Branch context is required": "Bu İşlem İçin Önce Bir Şube Seçin.",
  "CRM mutation requires an active branch.": "Müşteri İlişkileri İşlemleri İçin Önce Bir Şube Seçin.",
  "No active branch access is assigned": "Kullanabileceğiniz Aktif Bir Şube Bulunamadı.",
  "Branch not found": "Seçilen Şube Bulunamadı.",
  "Branch does not belong to this company": "Seçilen Şube Bu İşletmeye Ait Değil.",
  "You do not have access to this branch": "Bu Şubeye Erişim Yetkiniz Bulunmuyor.",
  "You do not have permission to perform this action": "Bu İşlemi Yapmaya Yetkiniz Bulunmuyor.",
  "Staff already has an overlapping appointment": "Bu Personelin Seçilen Saatte Çakışan Bir Randevusu Var.",
  "Appointment startAt must be before endAt": "Randevu Başlangıcı Bitişten Önce Olmalıdır.",
  "Invalid appointment date": "Geçersiz Randevu Tarihi.",
  "Staff is not active": "Seçilen Personel Aktif Değil.",
  "Service is not active": "Seçilen Hizmet Aktif Değil.",
  "Customer not found": "Müşteri Bulunamadı.",
  "Staff not found": "Personel Bulunamadı.",
  "Service not found": "Hizmet Bulunamadı.",
  "Appointment not found": "Randevu Bulunamadı.",
  "Cancelled appointment cannot be reactivated": "İptal Edilen Randevu Yeniden Aktifleştirilemez.",
  "Appointment is already cancelled": "Randevu Zaten İptal Edilmiş.",
  "Failed to create appointment": "Randevu Oluşturulamadı.",
  "Failed to update appointment": "Randevu Güncellenemedi.",
  "Failed to cancel appointment": "Randevu İptal Edilemedi.",
  "Appointment already has a payment": "Bu Randevunun Zaten Bir Ödeme Kaydı Var.",
  "Cancelled or no-show appointment cannot be paid": "İptal Edilmiş Veya Gerçekleşmemiş Randevu İçin Ödeme Alınamaz.",
  "Payment not found": "Ödeme Bulunamadı.",
  "Follow-up is not open or is outside the active scope.": "Takip Açık Değil Veya Aktif Çalışma Kapsamının Dışında.",
  "Follow-up changed, is closed, or is outside the active scope.": "Takip Başka Bir Kullanıcı Tarafından Değiştirildi, Kapatıldı Veya Aktif Kapsamın Dışında.",
  "CRM assignee is not an active company member.": "Seçilen Sorumlu Aktif İşletme Veya Şube Kapsamında Değil.",
  "Warehouse is outside the active branch scope.": "Seçilen Depo Aktif Şube Kapsamında Değil.",
  "Warehouse not found": "Seçilen Depo Bulunamadı.",
  "Inventory warehouse not found": "Uygun Envanter Deposu Bulunamadı.",
  "Insufficient stock": "Yeterli Stok Bulunmuyor.",
  "Quantity must be greater than zero": "Miktar Sıfırdan Büyük Olmalıdır.",
  "Warehouse and at least one item are required": "Depo Ve En Az Bir Ürün Seçilmelidir.",
  "Valid source and destination warehouses are required": "Geçerli Bir Çıkış Ve Varış Deposu Seçilmelidir.",
  "Transfer must contain at least one item": "Transfer İçin En Az Bir Ürün Seçilmelidir.",
  "Invalid transfer quantity": "Transfer Miktarı Geçerli Değil.",
  "Asset is required": "Envanter Varlığı Seçilmelidir.",
  "Asset not found": "Envanter Varlığı Bulunamadı Veya Aktif Şube Kapsamında Değil.",
  "Asset name is required": "Envanter Varlığı Adı Gereklidir.",
  "Asset code is required": "Envanter Varlığı Kodu Gereklidir.",
  "Asset branch must match the active branch context.": "Envanter Varlığının Şubesi Aktif Şube İle Aynı Olmalıdır.",
  "Asset warehouse must belong to the selected branch.": "Seçilen Depo Envanter Varlığının Şubesine Ait Olmalıdır.",
  "Assigned staff must belong to the asset branch.": "Zimmetlenecek Personel Envanter Varlığının Şubesine Ait Olmalıdır.",
  "Cycle count reason is required.": "Stok Sayımı Nedeni Gereklidir.",
  "Cycle count must contain at least one item.": "Stok Sayımı İçin En Az Bir Ürün Girilmelidir.",
  "A product can only appear once in a cycle count.": "Bir Ürün Aynı Stok Sayımında Yalnızca Bir Kez Yer Alabilir.",
  "Counted quantity cannot be negative.": "Sayılan Miktar Sıfırdan Küçük Olamaz.",
  "Cycle count not found.": "Stok Sayımı Bulunamadı Veya Aktif Şube Kapsamında Değil.",
  "Only draft cycle counts can be submitted.": "Yalnızca Taslak Stok Sayımları Onaya Gönderilebilir.",
  "Only submitted cycle counts can be approved.": "Yalnızca Onay Bekleyen Stok Sayımları Onaylanabilir.",
  "Only submitted cycle counts can be rejected.": "Yalnızca Onay Bekleyen Stok Sayımları Reddedilebilir.",
  "Only approved cycle counts can be posted.": "Yalnızca Onaylanmış Stok Sayımları Stoğa İşlenebilir.",
  "Cycle count changed concurrently.": "Stok Sayımı Başka Bir İşlem Tarafından Değiştirildi. Lütfen Verileri Yenileyip Tekrar Deneyin.",
  "Rejection reason is required.": "Ret Nedeni Gereklidir.",
  "Inventory approval requires manager or higher authority.": "Stok Sayımı Onayı İçin Müdür Veya Daha Üst Yetki Gereklidir.",
  "Operation is outside active branch scope.": "Bu İşlem Aktif Şube Kapsamının Dışında.",
  "Approver has no access to operation branch.": "Bu Şubedeki Stok Sayımını Onaylama Yetkiniz Bulunmuyor.",
  Forbidden: "Bu İşlemi Yapmaya Yetkiniz Bulunmuyor.",
  Unauthorized: "Oturumunuz Geçerli Değil. Lütfen Tekrar Giriş Yapın.",
  "Not Found": "Aradığınız Kayıt Bulunamadı.",
  "Network Error": "Sunucuya Bağlanılamadı. Lütfen Tekrar Deneyin.",
};

const TECHNICAL_ERROR_PATTERN = /\b(?:backend|frontend|api|endpoint|prisma|postgres|postgresql|sql|constraint|stack|trace|exception|uuid|jwt|token|payload|runtime|undefined|null|database|db|foreign key|unique key|validation failed|internal server error|syntax error|query failed)\b/i;

function titleCaseVisibleText(value: string): string {
  return value
    .trim()
    .split(/(\s+)/)
    .map((part) => {
      if (!part.trim()) return part;
      if (/^(https?:\/\/|www\.)/i.test(part)) return part;
      const [first, ...rest] = Array.from(part);
      return `${first?.toLocaleUpperCase("tr-TR") ?? ""}${rest.join("")}`;
    })
    .join("");
}

function looksTechnical(message: string): boolean {
  if (TECHNICAL_ERROR_PATTERN.test(message)) return true;
  if (/\b[A-Z_]{3,}\b/.test(message)) return true;
  if (/\b[a-zA-Z]+(?:Id|At|Url|Uri|Dto|Dto\b)/.test(message)) return true;
  if (/\/[a-z0-9_-]+(?:\/[a-z0-9_:{-]+)+/i.test(message)) return true;
  return false;
}

export function userLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return USER_LABELS[value] ?? value;
}

export function userLabelOr(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  return USER_LABELS[value] ?? value;
}

export function userNoticeMessage(message: string): string {
  const normalized = message.trim();
  if (!normalized) return "İşlem Tamamlandı.";
  return titleCaseVisibleText(USER_ERROR_MESSAGES[normalized] ?? normalized);
}

export function userErrorMessage(
  message: string | null | undefined,
  fallback = "İşlem Tamamlanamadı. Lütfen Bilgileri Kontrol Edip Tekrar Deneyin.",
): string {
  const normalized = message?.trim() ?? "";
  if (!normalized) return fallback;

  const mapped = USER_ERROR_MESSAGES[normalized];
  if (mapped) return mapped;

  if (looksTechnical(normalized)) return fallback;

  const hasTurkishCharacters = /[çğıöşüÇĞİÖŞÜ]/.test(normalized);
  const commonTurkishWords = /\b(?:bir|bu|için|ile|ve|veya|değil|bulunamadı|geçersiz|gerekli|zorunlu|olmalıdır|kaydedilemedi|yüklenemedi|güncellenemedi|oluşturulamadı|silinemedi|işlem|kullanıcı|müşteri|randevu|ödeme|teklif|personel|hizmet|şube)\b/i.test(normalized);

  if (!hasTurkishCharacters && !commonTurkishWords) return fallback;

  return titleCaseVisibleText(normalized);
}
