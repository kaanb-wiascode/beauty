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
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
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
  membershipBreakdown: Array<{
    role: string;
    status: string;
    count: number;
  }>;
};

export type PlatformIamOverview = {
  summary: {
    adminCount: number;
    activeAdminCount: number;
    roleCount: number;
    permissionCount: number;
  };
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
    permissions: Array<{
      resource: string;
      action: string;
      description: string | null;
    }>;
  }>;
  permissions: Array<{
    resource: string;
    action: string;
    description: string | null;
    roleCount: number;
  }>;
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
    createdAt: string;
  }>;
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
};

export function getPlatformCommandCenter() {
  return api<PlatformCommandCenter>("/platform/command-center");
}

export function listPlatformCustomers(params: {
  search?: string;
  limit?: number;
  offset?: number;
} = {}) {
  return api<PlatformCustomerList>(
    withQuery("/platform/customers", params),
  );
}

export function getPlatformCustomer360(tenantId: string) {
  return api<PlatformCustomer360>(`/platform/customers/${tenantId}`);
}

export function getPlatformIamOverview() {
  return api<PlatformIamOverview>("/platform/iam");
}

export function listPlatformAuditEvents(params: {
  actorUserId?: string;
  resource?: string;
  action?: string;
  targetTenantId?: string;
  correlationId?: string;
  limit?: number;
  offset?: number;
} = {}) {
  return api<PlatformAuditList>(withQuery("/platform/audit", params));
}
