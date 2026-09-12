import type { AuthTenant, AuthUser, LoginResponse } from "./types";

const ACCESS_TOKEN_KEY = "beauty_erp_access_token";
const REFRESH_TOKEN_KEY = "beauty_erp_refresh_token";
const USER_KEY = "beauty_erp_user";
const TENANT_KEY = "beauty_erp_tenant";
const MEMBERSHIP_KEY = "beauty_erp_membership";

function canUseStorage() {
  return typeof window !== "undefined";
}

type AccessTokenPayload = {
  branchId?: string | null;
};

function decodeAccessTokenPayload(token: string): AccessTokenPayload | null {
  if (typeof window === "undefined") return null;

  const [, encodedPayload] = token.split(".");
  if (!encodedPayload) return null;

  try {
    const normalized = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    return JSON.parse(window.atob(padded)) as AccessTokenPayload;
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  if (!canUseStorage()) return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getActiveBranchId(): string | null {
  const token = getAccessToken();
  if (!token) return null;

  const payload = decodeAccessTokenPayload(token);
  return typeof payload?.branchId === "string" && payload.branchId
    ? payload.branchId
    : null;
}

export function hasActiveBranch(): boolean {
  return Boolean(getActiveBranchId());
}

export function getRefreshToken(): string | null {
  if (!canUseStorage()) return null;
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (!canUseStorage()) return null;

  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function getStoredMembership(): LoginResponse["membership"] | null {
  if (!canUseStorage()) return null;

  const raw = window.localStorage.getItem(MEMBERSHIP_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as LoginResponse["membership"];
  } catch {
    return null;
  }
}

export function getStoredTenant(): AuthTenant | null {
  if (!canUseStorage()) return null;

  const raw = window.localStorage.getItem(TENANT_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AuthTenant;
  } catch {
    return null;
  }
}

export function persistSession(input: {
  accessToken: string;
  refreshToken?: string;
  user?: AuthUser;
  tenant?: AuthTenant;
  membership?: LoginResponse["membership"];
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

  return membership.permissions.includes(`${resource}.${action}`);
}
