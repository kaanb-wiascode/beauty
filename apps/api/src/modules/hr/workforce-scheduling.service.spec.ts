import { BadRequestException,ConflictException,NotFoundException } from '@nestjs/common';
import { WorkforceSchedulingService } from './workforce-scheduling.service';

describe('WorkforceSchedulingService',()=>{
 const ctx={getTenantId:jest.fn(()=> 'tenant-1'),getCompanyId:jest.fn(()=> 'company-1')};
 const org={getBranchScopedWhere:jest.fn()};
 const tx:any={$queryRawUnsafe:jest.fn()};
 const prisma:any={$queryRawUnsafe:jest.fn(),$executeRawUnsafe:jest.fn(),$transaction:jest.fn(async(fn:any)=>fn(tx))};
 let service:WorkforceSchedulingService;
 beforeEach(()=>{jest.clearAllMocks();org.getBranchScopedWhere.mockResolvedValue({branchId:{in:['branch-1']}});service=new WorkforceSchedulingService(prisma,ctx as any,org as any)});

 it('rejects invalid calendar ranges',async()=>{await expect(service.calendar('2026-09-20','2026-09-10')).rejects.toBeInstanceOf(BadRequestException)});
 it('prevents creating templates outside branch scope',async()=>{await expect(service.createTemplate({branchId:'branch-2',code:'DAY',name:'Day',startTime:'09:00',endTime:'18:00'},'u1')).rejects.toBeInstanceOf(NotFoundException)});
 it('allows central scope to read all company branches',async()=>{org.getBranchScopedWhere.mockResolvedValue({});prisma.$queryRawUnsafe.mockResolvedValue([]);await service.templates();expect(prisma.$queryRawUnsafe.mock.calls[0][3]).toBeNull()});
 it('rejects recurrence outside branch scope',async()=>{await expect(service.createRecurrenceRule({branchId:'branch-2',templateId:'t1',weekday:1,effectiveFrom:'2026-09-01'},'u1')).rejects.toBeInstanceOf(NotFoundException)});
 it('rejects recurrence ranges longer than 94 days',async()=>{await expect(service.generateRecurring('2026-01-01','2026-05-01','u1')).rejects.toBeInstanceOf(BadRequestException)});
 it('generates only matching weekdays and reports idempotent conflicts',async()=>{prisma.$queryRawUnsafe.mockResolvedValue([{id:'r1',branchId:'branch-1',templateId:'t1',weekday:1,requiredStaff:2,startTime:'09:00:00',endTime:'18:00:00',breakMinutes:60,crossesMidnight:false,roleRequirement:null}]);prisma.$executeRawUnsafe.mockResolvedValueOnce(1).mockResolvedValueOnce(0);await expect(service.generateRecurring('2026-09-14','2026-09-21','u1')).resolves.toMatchObject({created:1,existing:1,ruleCount:1});expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(2)});
 it('publishes only draft shifts',async()=>{tx.$queryRawUnsafe.mockResolvedValueOnce([{id:'s1',status:'CANCELLED'}]);await expect(service.publish('s1','u1')).rejects.toBeInstanceOf(ConflictException)});
 it('makes publishing an already published shift idempotent',async()=>{tx.$queryRawUnsafe.mockResolvedValueOnce([{id:'s1',status:'PUBLISHED'}]);await expect(service.publish('s1','u1')).resolves.toEqual({id:'s1',status:'PUBLISHED'})});
 it('rejects staff from another branch after staff row lock',async()=>{tx.$queryRawUnsafe.mockResolvedValueOnce([{id:'s1',branchId:'branch-1',startsAt:new Date('2026-09-20T09:00:00Z'),endsAt:new Date('2026-09-20T18:00:00Z'),status:'PUBLISHED'}]).mockResolvedValueOnce([]);await expect(service.assign('s1','staff-2','u1')).rejects.toBeInstanceOf(NotFoundException);expect(String(tx.$queryRawUnsafe.mock.calls[1][0])).toContain('FOR UPDATE OF s')});
 it('rejects overlapping active shifts',async()=>{tx.$queryRawUnsafe.mockResolvedValueOnce([{id:'s1',branchId:'branch-1',startsAt:new Date('2026-09-20T09:00:00Z'),endsAt:new Date('2026-09-20T18:00:00Z'),status:'PUBLISHED'}]).mockResolvedValueOnce([{id:'staff-1'}]).mockResolvedValueOnce([{id:'existing'}]);await expect(service.assign('s1','staff-1','u1')).rejects.toBeInstanceOf(ConflictException)});
 it('rejects approved leave conflicts',async()=>{tx.$queryRawUnsafe.mockResolvedValueOnce([{id:'s1',branchId:'branch-1',startsAt:new Date('2026-09-20T09:00:00Z'),endsAt:new Date('2026-09-20T18:00:00Z'),status:'PUBLISHED'}]).mockResolvedValueOnce([{id:'staff-1'}]).mockResolvedValueOnce([]).mockResolvedValueOnce([{id:'leave-1'}]);await expect(service.assign('s1','staff-1','u1')).rejects.toBeInstanceOf(ConflictException)});
 it('creates assignment after lock, overlap and leave checks pass',async()=>{tx.$queryRawUnsafe.mockResolvedValueOnce([{id:'s1',branchId:'branch-1',startsAt:new Date('2026-09-20T09:00:00Z'),endsAt:new Date('2026-09-20T18:00:00Z'),status:'PUBLISHED'}]).mockResolvedValueOnce([{id:'staff-1'}]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{id:'a1',scheduledShiftId:'s1',staffId:'staff-1',status:'ASSIGNED'}]);await expect(service.assign('s1','staff-1','u1')).resolves.toMatchObject({id:'a1',staffId:'staff-1'})});
});
