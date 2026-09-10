import { BadRequestException } from '@nestjs/common';
import { HrService } from './hr.service';

describe('HrService company scope', () => {
  const findMany = jest.fn();
  const findFirst = jest.fn();
  const create = jest.fn();
  const prisma = {
    staff: { findMany, findFirst, create },
    branch: { findFirst },
  } as any;
  const tenantContext = {
    getTenantId: () => 'tenant-1',
    getCompanyId: () => 'company-1',
    getBranchId: () => null,
    getRoleScope: () => 'CENTRAL',
  } as any;

  beforeEach(() => jest.clearAllMocks());

  it('limits central employee listing to the active company', async () => {
    findMany.mockResolvedValue([]);
    const service = new HrService(prisma, tenantContext);

    await service.employees();

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        tenantId: 'tenant-1',
        branch: { companyId: 'company-1' },
      },
    }));
  });

  it('rejects central employee creation into another company branch', async () => {
    findFirst.mockResolvedValue(null);
    const service = new HrService(prisma, tenantContext);

    await expect(service.createEmployee({
      branchId: 'branch-other-company',
      firstName: 'Test',
      lastName: 'Employee',
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'branch-other-company',
        company: {
          tenantId: 'tenant-1',
          id: 'company-1',
        },
      },
      select: { id: true },
    });
    expect(create).not.toHaveBeenCalled();
  });
});
