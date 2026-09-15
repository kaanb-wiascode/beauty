import { api, withQuery } from "./api";

export type PlatformCommandCenter = {
  counts: {
    tenantCount: number;
    companyCount: number;
    activeCompanyCount: number;
    branchCount: number;
    activeBranchCount: number;
    activeMembershipCount: number;
  };
  recentTenants: Array<{
    id: string;
    name: string;
    slug: string;
    createdAt: string;
    activeMembershipCount: number;
    activeBranchCount: number;
  }>;
};

export type PlatformCustomerSummary = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  companyCount: number;
  activeCompanyCount: number;
  branchCount: number;
  activeBranchCount: number;
  activeMembershipCount: number;
  ownerCount: number;
};

export type PlatformCustomerList = {
  items: PlatformCustomerSummary[];
  pagination: { total: number; limit: number; offset: number };
};

export type PlatformCustomer360 = {
  tenant: PlatformCustomerSummary;
  companies: Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    branchCount: number;
    activeBranchCount: number;
  }>;
  membershipBreakdown: Array<{ role: string; status: string; count: number }>;
};

export type PlatformIamOverview = {
  summary: { adminCount: number; activeAdminCount: number; roleCount: number; permissionCount: number };
  admins: Array<{
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    roles: Array<{ slug: string; name: string }>;
  }>;
  roles: Array<{
    slug: string;
    name: string;
    description: string | null;
    system: boolean;
    userCount: number;
    permissions: Array<{ resource: string; action: string; description: string | null }>;
  }>;
  permissions: Array<{
    resource: string;
    action: string;
    description: string | null;
    roleCount: number;
  }>;
};

export type PlatformAdminMutationResult = { userId: string; status: string; roles: string[] };
export type PlatformApprovalRequestResult = {
  id: string;
  createdAt: string;
  expiresAt: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
};

export type PlatformAuditList = {
  items: Array<{
    id: string;
    actorUserId: string;
    actorEmail: string | null;
    actorFirstName: string | null;
    actorLastName: string | null;
    resource: string;
    action: string;
    targetTenantId: string | null;
    targetEntityType: string | null;
    targetEntityId: string | null;
    reason: string | null;
    beforeState: unknown;
    afterState: unknown;
    metadata: unknown;
    correlationId: string | null;
    requestId: string | null;
    sourceIp: string | null;
    userAgent: string | null;
    riskLevel: string | null;
    approvalRequestId: string | null;
    createdAt: string;
  }>;
  pagination: { total: number; limit: number; offset: number };
};

export type PlatformPrivilegedOperationList = {
  items: Array<{
    id: string;
    requesterUserId: string;
    requesterEmail: string;
    approverUserId: string | null;
    approverEmail: string | null;
    resource: string;
    action: string;
    riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    status: string;
    targetEntityType: string | null;
    targetEntityId: string | null;
    targetTenantId: string | null;
    reason: string;
    decisionReason: string | null;
    createdAt: string;
    decidedAt: string | null;
    executedAt: string | null;
    expiresAt: string;
  }>;
  pagination: { total: number; limit: number; offset: number };
};

export function getPlatformCommandCenter() {
  return api<PlatformCommandCenter>("/platform/command-center");
}
export function listPlatformCustomers(params: { search?: string; limit?: number; offset?: number } = {}) {
  return api<PlatformCustomerList>(withQuery("/platform/customers", params));
}
export function getPlatformCustomer360(tenantId: string) {
  return api<PlatformCustomer360>(`/platform/customers/${tenantId}`);
}
export function getPlatformIamOverview() {
  return api<PlatformIamOverview>("/platform/iam");
}

export function provisionPlatformAdmin(input: { userId: string; roleSlug?: string; reason: string }) {
  return api<PlatformApprovalRequestResult>("/platform/iam/admins", { method: "POST", body: input });
}
export function setPlatformAdminStatus(userId: string, input: { status: "ACTIVE"; reason: string }): Promise<PlatformAdminMutationResult>;
export function setPlatformAdminStatus(userId: string, input: { status: "SUSPENDED"; reason: string }): Promise<PlatformApprovalRequestResult>;
export function setPlatformAdminStatus(userId: string, input: { status: "ACTIVE" | "SUSPENDED"; reason: string }) {
  return api<PlatformAdminMutationResult | PlatformApprovalRequestResult>(`/platform/iam/admins/${userId}/status`, {
    method: "POST",
    body: input,
  });
}
export function assignPlatformRole(userId: string, input: { roleSlug: string; reason: string }) {
  return api<PlatformApprovalRequestResult>(`/platform/iam/admins/${userId}/roles`, { method: "POST", body: input });
}
export function removePlatformRole(userId: string, roleSlug: string, reason: string) {
  return api<PlatformApprovalRequestResult>(`/platform/iam/admins/${userId}/roles/${roleSlug}/remove`, {
    method: "POST",
    body: { reason },
  });
}
export function grantPlatformRolePermission(roleSlug: string, input: { resource: string; action: string; reason: string }) {
  return api<PlatformApprovalRequestResult>(`/platform/iam/roles/${roleSlug}/permissions`, {
    method: "POST",
    body: input,
  });
}
export function revokePlatformRolePermission(roleSlug: string, input: { resource: string; action: string; reason: string }) {
  return api<PlatformApprovalRequestResult>(`/platform/iam/roles/${roleSlug}/permissions/revoke`, {
    method: "POST",
    body: input,
  });
}

export function listPlatformPrivilegedOperations(params: { status?: string; limit?: number; offset?: number } = {}) {
  return api<PlatformPrivilegedOperationList>(withQuery("/platform/privileged-operations", params));
}
export function createPlatformPrivilegedOperation(input: {
  resource: string;
  action: string;
  targetEntityType?: string | null;
  targetEntityId?: string | null;
  targetTenantId?: string | null;
  reason: string;
  payload?: unknown;
}) {
  return api<PlatformApprovalRequestResult>("/platform/privileged-operations", { method: "POST", body: input });
}
export function decidePlatformPrivilegedOperation(
  requestId: string,
  input: { decision: "APPROVED" | "REJECTED"; reason: string },
) {
  return api<{ id: string; status: string }>(`/platform/privileged-operations/${requestId}/decision`, {
    method: "POST",
    body: input,
  });
}
export function executePlatformPrivilegedOperation(requestId: string) {
  return api<{ id: string; status: "EXECUTED" | "EXPIRED"; result?: unknown }>(
    `/platform/privileged-operations/${requestId}/execute`,
    { method: "POST" },
  );
}

export function listPlatformAuditEvents(params: {
  actorUserId?: string;
  resource?: string;
  action?: string;
  targetTenantId?: string;
  correlationId?: string;
  requestId?: string;
  riskLevel?: string;
  approvalRequestId?: string;
  limit?: number;
  offset?: number;
} = {}) {
  return api<PlatformAuditList>(withQuery("/platform/audit", params));
}
