import { BadRequestException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { OperationsResourcesService } from './operations-resources.service';

describe('OperationsResourcesService scope isolation', () => {
  const queryRawUnsafe = jest.fn();
  const serviceFindFirst = jest.fn();

  const prisma = {
    $queryRawUnsafe: queryRawUnsafe,
    service: { findFirst: serviceFindFirst },
  } as unknown as PrismaService;

  const tenantContext = {
    getTenantId: jest.fn().mockReturnValue('tenant-1'),
    getCompanyId: jest.fn().mockReturnValue('company-1'),
    getBranchId: jest.fn().mockReturnValue('branch-1'),
  } as unknown as TenantContext;

  const service = new OperationsResourcesService(prisma, tenantContext);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('scopes room reads to tenant, company and active branch', async () => {
    queryRawUnsafe.mockResolvedValueOnce([]);

    await service.listRooms();

    expect(queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining(
        'WHERE tenant_id = $1 AND company_id = $2 AND branch_id = $3',
      ),
      'tenant-1',
      'company-1',
      'branch-1',
    );
  });

  it('rejects service requirements for a service outside active branch', async () => {
    serviceFindFirst.mockResolvedValueOnce(null);

    await expect(
      service.upsertServiceRequirement('service-1', {
        roomType: 'LASER_ROOM',
        prepDurationMinutes: 10,
        cleanupDurationMinutes: 15,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(serviceFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'service-1',
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
  });

  it('rejects an inventory asset outside the active branch scope', async () => {
    serviceFindFirst.mockResolvedValueOnce({ id: 'service-1' });
    queryRawUnsafe.mockResolvedValueOnce([]);

    await expect(
      service.upsertServiceRequirement('service-1', {
        requiredAssetId: '11111111-1111-4111-8111-111111111111',
        prepDurationMinutes: 0,
        cleanupDurationMinutes: 0,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
