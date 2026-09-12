import { API_BASE_URL, ApiError } from "./api";
import {
  clearSupplierPortalSession,
  getSupplierPortalSession,
} from "./supplier-portal-auth";

type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type SupplierPortalApiOptions = {
  method?: ApiMethod;
  body?: unknown;
  auth?: boolean;
};

function redirectToSupplierLogin() {
  if (typeof window === "undefined") return;
  if (window.location.pathname.startsWith("/supplier-portal/login")) return;
  window.location.assign("/supplier-portal/login");
}

function readMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return "İstek başarısız oldu.";
  const message = (payload as { message?: unknown }).message;
  if (typeof message === "string" && message.trim()) return message;
  if (Array.isArray(message) && message.length) return message.map(String).join(", ");
  return "İstek başarısız oldu.";
}

export async function supplierPortalApi<T>(
  path: string,
  options: SupplierPortalApiOptions = {},
): Promise<T> {
  const { method = "GET", body, auth = true } = options;
  const headers: Record<string, string> = {};

  if (body !== undefined) headers["Content-Type"] = "application/json";

  if (auth) {
    const session = getSupplierPortalSession();
    if (!session) {
      redirectToSupplierLogin();
      throw new ApiError("Tedarikçi portalı oturumunuz sona erdi.", 401);
    }
    headers.Authorization = `Bearer ${session.accessToken}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "include",
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
      clearSupplierPortalSession();
      redirectToSupplierLogin();
    }
    throw new ApiError(readMessage(payload), response.status);
  }

  return payload as T;
}
