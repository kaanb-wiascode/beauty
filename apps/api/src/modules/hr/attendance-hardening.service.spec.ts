import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AttendanceHardeningService } from './attendance-hardening.service';

describe('AttendanceHardeningService', () => {
  const ctx = { getTenantId: jest.fn(() => 'tenant-1'), getCompanyId: jest.fn(() => 'company-1') };
  const organizationScope = { getBranchScopedWhere: jest.fn(async () => ({ branchId: 'branch-1' })) };
  const prisma: any = { $queryRawUnsafe: jest.fn(), $executeRawUnsafe: jest.fn(), $transaction: jest.fn() };
  let service: AttendanceHardeningService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AttendanceHardeningService(prisma, ctx as any, organizationScope as any);
  });

  it('rejects invalid reconciliation ranges', async () => {
    await expect(service.reconcile('2026-09-20', '2026-09-10')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('opens an exception for a scheduled shift with a missing checkout', async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ id:'att-1', checkIn:'2026-09-15T09:15:00.000Z', checkOut:null, shiftId:'shift-1', startsAt:'2026-09-15T09:00:00.000Z', endsAt:'2026-09-15T18:00:00.000Z' }]);
    prisma.$executeRawUnsafe.mockResolvedValueOnce(1);
    const result = await service.reconcile('2026-09-15','2026-09-15');
    expect(result).toEqual({ processed:1, updated:1 });
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('missing_punch=$4'),'shift-1',15,0,true,false,'OPEN','att-1','tenant-1');
  });

  it('marks complete absence when a scheduled employee has no punches', async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ id:'att-2', checkIn:null, checkOut:null, shiftId:'shift-2', startsAt:'2026-09-15T09:00:00.000Z', endsAt:'2026-09-15T18:00:00.000Z' }]);
    prisma.$executeRawUnsafe.mockResolvedValueOnce(1);
    await service.reconcile('2026-09-15','2026-09-15');
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(expect.any(String),'shift-2',0,0,true,true,'OPEN','att-2','tenant-1');
  });

  it('requires a correction reason', async () => {
    await expect(service.correct('att-1',{},'user-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('audits corrections in the same transaction', async () => {
    const tx:any = { $queryRawUnsafe: jest.fn().mockResolvedValue([{ id:'att-1', branch_id:'branch-1', staff_id:'staff-1', check_in:'09:00', check_out:null, status:'PRESENT', note:null }]), $executeRawUnsafe: jest.fn().mockResolvedValue(1) };
    prisma.$transaction.mockImplementation(async (fn:any)=>fn(tx));
    const result=await service.correct('att-1',{reason:'Forgot checkout',checkOut:'18:00'},'user-1');
    expect(result).toEqual({id:'att-1',exceptionStatus:'CORRECTED'});
    expect(tx.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    expect(tx.$executeRawUnsafe.mock.calls[1][0]).toContain('hr_attendance_corrections');
    expect(tx.$executeRawUnsafe.mock.calls[1][10]).toBe('user-1');
  });

  it('does not correct attendance outside scope', async () => {
    const tx:any={ $queryRawUnsafe:jest.fn().mockResolvedValue([]), $executeRawUnsafe:jest.fn() };
    prisma.$transaction.mockImplementation(async (fn:any)=>fn(tx));
    await expect(service.correct('missing',{reason:'test'},'user-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
