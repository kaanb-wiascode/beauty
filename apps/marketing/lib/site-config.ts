export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "http://localhost:3002";

export const siteName = "VALOO";

export const siteDescription =
  "Müşteri, operasyon, finans, ekip ve yönetim süreçlerini aynı çalışma ortamında buluşturan modüler işletme yönetim platformu.";
