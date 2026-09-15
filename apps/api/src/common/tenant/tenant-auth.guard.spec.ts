import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PrismaService } from '@beauty-erp/database';
import { TENANT_ENTITLEMENT_KEY } from './tenant-entitlement.decorator';
import { TenantAuthGuard } from './tenant-auth.guard';
import { RESTRICT_TENANT_MUTATIONS_KEY } from './tenant-lifecycle-policy.decorator';
import { TenantContext } from './tenant-context';

describe('TenantAuthGuard', () => {
  const setContext = jest.fn();
  const queryRaw = jest.fn();
  const getAllAndOverride = jest.fn();
  const tenantContext = { setContext } as unknown as TenantContext;
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
  const reflector = { getAllAndOverride } as unknown as Reflector;
  const guard = new TenantAuthGuard(tenantContext, prisma, reflector);

  let entitlementKey: string | undefined;
  let restrictMutations = false;

  beforeEach(() => {
    setContext.mockReset();
    queryRaw.mockReset();
    getAllAndOverride.mockReset();
    entitlementKey = undefined;
    restrictMutations = false;
    getAllAndOverride.mockImplementation((key: string) => {
      if (key === TENANT_ENTITLEMENT_KEY) return entitlementKey;
      if (key === RESTRICT_TENANT_MUTATIONS_KEY) return restrictMutations;
      return undefined;
    });
  });

  function executionContext(
    user?: Record<string, unknown>,
    method = 'GET',
  ) {
    return {
      switchToHttp: () => ({ getRequest: () => ({ user, method }) }),
      getHandler: () => executionContext,
      getClass: () => TenantAuthGuard,
    } as unknown as ExecutionContext;
  }

  const user = {
    sub: 'user-1',
    tenantId: 'tenant-1',
    membershipId: 'membership-1',
    companyId: 'company-1',
    branchId: null,
    roleScope: 'CENTRAL',
  };

  it('rejects requests without complete organization context before querying lifecycle state', async () => {
    await expect(guard.canActivate(executionContext({ sub: 'user-1' })))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(queryRaw).not.toHaveBeenCalled();
    expect(setContext).not.toHaveBeenCalled();
  });

  it('blocks a suspended tenant before entitlement resolution', async () => {
    queryRaw.mockResolvedValueOnce([{ state: 'SUSPENDED' }]);
    entitlementKey = 'finance.enabled';

    await expect(guard.canActivate(executionContext(user)))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(setContext).not.toHaveBeenCalled();
  });

  it('blocks an explicitly disabled configured entitlement', async () => {
    queryRaw
      .mockResolvedValueOnce([{ state: 'ACTIVE' }])
      .mockResolvedValueOnce([{ configured: true, effectiveValue: false }]);
    entitlementKey = 'finance.enabled';

    await expect(guard.canActivate(executionContext(user)))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(setContext).not.toHaveBeenCalled();
  });

  it('allows an explicitly enabled configured entitlement', async () => {
    queryRaw
      .mockResolvedValueOnce([{ state: 'ACTIVE' }])
      .mockResolvedValueOnce([{ configured: true, effectiveValue: true }]);
    entitlementKey = 'finance.enabled';

    await expect(guard.canActivate(executionContext(user))).resolves.toBe(true);
    expect(setContext).toHaveBeenCalledTimes(1);
  });

  it('keeps compatibility access when entitlement is not explicitly configured', async () => {
    queryRaw
      .mockResolvedValueOnce([{ state: 'ACTIVE' }])
      .mockResolvedValueOnce([{ configured: false, effectiveValue: null }]);
    entitlementKey = 'finance.enabled';

    await expect(guard.canActivate(executionContext(user))).resolves.toBe(true);
    expect(setContext).toHaveBeenCalledTimes(1);
  });

  it('lets an active override take effect through the resolved configured value', async () => {
    queryRaw
      .mockResolvedValueOnce([{ state: 'ACTIVE' }])
      .mockResolvedValueOnce([{ configured: true, effectiveValue: false }]);
    entitlementKey = 'hr.enabled';

    await expect(guard.canActivate(executionContext(user)))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks restricted tenant mutations on protected surfaces', async () => {
    queryRaw.mockResolvedValueOnce([{ state: 'RESTRICTED' }]);
    restrictMutations = true;

    await expect(guard.canActivate(executionContext(user, 'POST')))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(setContext).not.toHaveBeenCalled();
  });

  it('allows restricted tenant reads on protected surfaces', async () => {
    queryRaw.mockResolvedValueOnce([{ state: 'RESTRICTED' }]);
    restrictMutations = true;

    await expect(guard.canActivate(executionContext(user, 'GET'))).resolves.toBe(true);
    expect(setContext).toHaveBeenCalledTimes(1);
  });

  it('allows restricted tenant mutations on surfaces without the restricted policy marker', async () => {
    queryRaw.mockResolvedValueOnce([{ state: 'RESTRICTED' }]);

    await expect(guard.canActivate(executionContext(user, 'POST'))).resolves.toBe(true);
    expect(setContext).toHaveBeenCalledTimes(1);
  });

  it('allows active tenant mutations on protected surfaces', async () => {
    queryRaw.mockResolvedValueOnce([{ state: 'ACTIVE' }]);
    restrictMutations = true;

    await expect(guard.canActivate(executionContext(user, 'PATCH'))).resolves.toBe(true);
    expect(setContext).toHaveBeenCalledTimes(1);
  });
});