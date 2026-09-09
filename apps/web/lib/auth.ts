import type { AuthTenant, AuthUser, LoginResponse } from "./types";

const ACCESS_TOKEN_KEY = "beauty_erp_access_token";
const REFRESH_TOKEN_KEY = "beauty_erp_refresh_token";
const USER_KEY = "beauty_erp_user";
const TENANT_KEY = "beauty_erp_tenant";
const MEMBERSHIP_KEY = "beauty_erp_membership";

type StoredMembership = LoginResponse["membership"];

function canUseStorage() {
  return typeof window !== "undefined";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAuthUser(value: unknown): value is AuthUser {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.email === "string" &&
    typeof value.firstName === "string" &&
    typeof value.lastName === "string"
  );
}

function isAuthTenant(value: unknown): value is AuthTenant {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.slug === "string"
  );
}

function isMembership(value: unknown): value is StoredMembership {
  if (!isRecord(value) || !Array.isArray(value.permissions)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.role === "string" &&
    typeof value.status === "string" &&
    value.permissions.every((permission) => typeof permission === "string")
  );
}

function readStored<T>(
  key: string,
  guard: (value: unknown) => value is T,
): T | null {
  if (!canUseStorage()) return null;

  const raw = window.localStorage.getItem(key);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    return guard(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  if (!canUseStorage()) return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (!canUseStorage()) return null;
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  return readStored(USER_KEY, isAuthUser);
}

export function getStoredMembership(): StoredMembership | null {
  return readStored(MEMBERSHIP_KEY, isMembership);
}

export function getStoredTenant(): AuthTenant | null {
  return readStored(TENANT_KEY, isAuthTenant);
}

export function persistSession(input: {
  accessToken: string;
  refreshToken?: string;
  user?: AuthUser;
  tenant?: AuthTenant;
  membership?: StoredMembership;
}) {
  if (!canUseStorage()) return;

  window.localStorage.setItem(ACCESS_TOKEN_KEY, input.accessToken);

  if (input.refreshToken) {
    window.localStorage.setItem(REFRESH_TOKEN_KEY, input.refreshToken);
  }

  if (input.user) {
    window.localStorage.setItem(USER_KEY, JSON.stringify(input.user));
  }

  if (input.tenant) {
    window.localStorage.setItem(TENANT_KEY, JSON.stringify(input.tenant));
  }

  if (input.membership) {
    window.localStorage.setItem(
      MEMBERSHIP_KEY,
      JSON.stringify(input.membership),
    );
  }
}

export function clearSession() {
  if (!canUseStorage()) return;

  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.localStorage.removeItem(TENANT_KEY);
  window.localStorage.removeItem(MEMBERSHIP_KEY);
}

export function hasPermission(
  resource: string,
  action: string,
): boolean {
  const membership = getStoredMembership();
  if (!membership) return false;

  return membership.permissions.includes(
    `${resource}.${action}`,
  );
}
