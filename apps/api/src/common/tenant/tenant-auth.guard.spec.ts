import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';
import { TenantAuthGuard } from './tenant-auth.guard';
import { TenantContext } from './tenant-context';

describe('TenantAuthGuard', () => {
  const setContext = jest.fn();
  const queryRaw = jest.fn();
  const tenantContext = { setContext } as unknown as TenantContext;
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
  const guard = new TenantAuthGuard(tenantContext, prisma);

  beforeEach(() => {
    setContext.mockReset();
    queryRaw.mockReset();
  });

  function executionContext(user?: Record<string, unknown>) {
    return {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
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

  it('blocks a suspended tenant before establishing tenant context', async () => {
    queryRaw.mockResolvedValueOnce([{ state: 'SUSPENDED' }]);

    await expect(guard.canActivate(executionContext(user)))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(setContext).not.toHaveBeenCalled();
  });

  it.each(['ACTIVE', 'RESTRICTED'])('allows %s tenant access and establishes context', async (state) => {
    queryRaw.mockResolvedValueOnce([{ state }]);

    await expect(guard.canActivate(executionContext(user))).resolves.toBe(true);
    expect(setContext).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      membershipId: 'membership-1',
      companyId: 'company-1',
      branchId: null,
      roleScope: 'CENTRAL',
    });
  });
});