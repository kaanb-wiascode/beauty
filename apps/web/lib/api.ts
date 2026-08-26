import { clearSession, getAccessToken } from "./auth";

/**
 * Browser requests use the same-origin `/backend` rewrite in next.config.ts,
 * which proxies to http://localhost:3000. Override with NEXT_PUBLIC_API_URL
 * if the API is reachable cross-origin.
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "/backend";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type ApiMethod = "GET" | "POST" | "PATCH" | "DELETE";

type ApiOptions = {
  method?: ApiMethod;
  body?: unknown;
  auth?: boolean;
};

const ERROR_MESSAGES: Record<string, string> = {
  "Invalid email or password": "E-posta veya şifre hatalı.",
  "No active tenant membership": "Aktif salon üyeliği bulunamadı.",
  "Staff already has an overlapping appointment":
    "Bu personelin seçilen saatte çakışan bir randevusu var.",
  "Appointment startAt must be before endAt":
    "Randevu başlangıcı bitişten önce olmalıdır.",
  "Invalid appointment date": "Geçersiz randevu tarihi.",
  "Staff is not active": "Seçilen personel aktif değil.",
  "Service is not active": "Seçilen hizmet aktif değil.",
  "Customer not found": "Müşteri bulunamadı.",
  "Staff not found": "Personel bulunamadı.",
  "Service not found": "Hizmet bulunamadı.",
  "Appointment not found": "Randevu bulunamadı.",
  "Cancelled appointment cannot be reactivated":
    "İptal edilen randevu yeniden aktifleştirilemez.",
  "Appointment is already cancelled": "Randevu zaten iptal edilmiş.",
  "Failed to create appointment": "Randevu oluşturulamadı.",
  "Failed to update appointment": "Randevu güncellenemedi.",
  "Failed to cancel appointment": "Randevu iptal edilemedi.",
};

function mapErrorMessage(message: string) {
  return ERROR_MESSAGES[message] ?? message;
}

function readErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const record = payload as { message?: unknown };

  if (typeof record.message === "string" && record.message.trim()) {
    return mapErrorMessage(record.message);
  }

  if (Array.isArray(record.message) && record.message.length > 0) {
    return record.message.map(String).join(", ");
  }

  return fallback;
}

function redirectToLogin() {
  if (typeof window === "undefined") return;
  if (window.location.pathname.startsWith("/login")) return;
  window.location.assign("/login");
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true } = options;
  const headers: Record<string, string> = {};

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (auth) {
    const accessToken = getAccessToken();

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Sunucuya bağlanılamadı. Backend çalışıyor mu?", 0);
  }

  const text = await response.text();
  let payload: unknown = null;

  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    if (response.status === 401 && auth) {
      clearSession();
      redirectToLogin();
    }

    throw new ApiError(
      readErrorMessage(payload, "İstek başarısız oldu."),
      response.status,
    );
  }

  return payload as T;
}

export function withQuery(
  path: string,
  params: Record<string, string | number | boolean | undefined>,
) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `${path}?${query}` : path;
}
