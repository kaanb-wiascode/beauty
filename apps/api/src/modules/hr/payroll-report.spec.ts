import { NotFoundException } from '@nestjs/common';
import { PayrollReportService } from './payroll-report.service';

describe('PayrollReportService',()=>{
  const tenant:any={getTenantId:()=> 'tenant-1',getCompanyId:()=> 'company-1',getBranchId:()=> 'branch-1'};

  it('keeps payroll period lookup tenant company and branch scoped',async()=>{
    const prisma:any={$queryRawUnsafe:jest.fn().mockResolvedValueOnce([])};
    const service=new PayrollReportService(prisma,tenant);
    await expect(service.period('period-1')).rejects.toBeInstanceOf(NotFoundException);
    const call=prisma.$queryRawUnsafe.mock.calls[0];
    expect(call[1]).toBe('period-1');
    expect(call[2]).toBe('tenant-1');
    expect(call[3]).toBe('company-1');
    expect(call[4]).toBe('branch-1');
  });
});
