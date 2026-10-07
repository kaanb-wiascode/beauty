export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "http://localhost:3002";

export const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || null;

export const siteName = "VALOO";

export const siteDescription =
  "Müşteri, operasyon, finans, ekip ve yönetim süreçlerini aynı çalışma ortamında buluşturan modüler işletme yönetim platformu.";
