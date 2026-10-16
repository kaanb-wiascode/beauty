import { api } from "./api";

export type PlatformPlan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  versionId: string | null;
  version: number | null;
  currency: string | null;
  monthlyPrice: string | null;
  annualPrice: string | null;
  branchLimit: number | null;
  userLimit: number | null;
  effectiveFrom: string | null;
};

export type PlatformTenantSubscription = {
  id: string;
  tenantId: string;
  status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED";
  planId: string;
  planCode: string;
  planName: string;
  planVersionId: string;
  planVersion: number;
  currency: string;
  contractedMonthlyPrice: string | null;
  contractedAnnualPrice: string | null;
  discountPercent: string;
  startsAt: string;
  renewsAt: string | null;
  endsAt: string | null;
  version: number;
  updatedAt: string;
};

export function listPlatformPlans() {
  return api<PlatformPlan[]>("/platform/plans");
}

export function getPlatformTenantSubscription(tenantId: string) {
  return api<PlatformTenantSubscription | null>(`/platform/customers/${tenantId}/subscription`);
}

export function assignPlatformTenantSubscription(
  tenantId: string,
  input: {
    planVersionId: string;
    status?: "TRIAL" | "ACTIVE" | "PAST_DUE";
    contractedMonthlyPrice?: number | null;
    contractedAnnualPrice?: number | null;
    discountPercent?: number;
    startsAt?: string | null;
    renewsAt?: string | null;
  },
) {
  return api<PlatformTenantSubscription>(`/platform/customers/${tenantId}/subscription`, {
    method: "POST",
    body: input,
  });
}
