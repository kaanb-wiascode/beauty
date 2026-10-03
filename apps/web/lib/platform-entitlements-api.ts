import { api } from "./api";

export type PlatformTenantEntitlement = {
  key: string;
  name: string;
  description: string | null;
  valueType: "BOOLEAN" | "INTEGER" | "STRING" | "JSON";
  defaultValue: unknown;
  planValue: unknown;
  overrideId: string | null;
  overrideValue: unknown;
  overrideStartsAt: string | null;
  overrideEndsAt: string | null;
  effectiveValue: unknown;
  source: "OVERRIDE" | "PLAN" | "DEFAULT";
  status: string;
};

export type PlatformTenantEntitlements = {
  tenantId: string;
  items: PlatformTenantEntitlement[];
};

export function getPlatformTenantEntitlements(tenantId: string) {
  return api<PlatformTenantEntitlements>(`/platform/customers/${tenantId}/entitlements`);
}

export function createPlatformEntitlementOverride(
  tenantId: string,
  input: {
    entitlementKey: string;
    value: unknown;
    reason: string;
    startsAt?: string | null;
    endsAt?: string | null;
  },
) {
  return api<{ id: string; entitlementKey: string; value: unknown }>(
    `/platform/customers/${tenantId}/entitlement-overrides`,
    { method: "POST", body: input },
  );
}

export function revokePlatformEntitlementOverride(tenantId: string, overrideId: string, reason: string) {
  return api<{ id: string; status: "REVOKED" }>(
    `/platform/customers/${tenantId}/entitlement-overrides/${overrideId}/revoke`,
    { method: "POST", body: { reason } },
  );
}
