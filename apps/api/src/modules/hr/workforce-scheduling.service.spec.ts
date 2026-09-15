import { BadRequestException,ConflictException,NotFoundException } from '@nestjs/common';
import { WorkforceSchedulingService } from './workforce-scheduling.service';

describe('WorkforceSchedulingService',()=>{
 const ctx={getTenantId:jest.fn(()=> 'tenant-1'),getCompanyId:jest.fn(()=> 'company-1')};
 const org={getBranchScopedWhere:jest.fn()};
 const tx:any={$queryRawUnsafe:jest.fn(),staff:{findFirst:jest.fn()}};
 const prisma:any={$queryRawUnsafe:jest.fn(),$transaction:jest.fn(async(fn:any)=>fn(tx))};
 let service:WorkforceSchedulingService;
 beforeEach(()=>{jest.clearAllMocks();org.getBranchScopedWhere.mockResolvedValue({branchId:{in:['branch-1']}});service=new WorkforceSchedulingService(prisma,ctx as any,org as any)});

 it('rejects invalid calendar ranges',async()=>{await expect(service.calendar('2026-09-20','2026-09-10')).rejects.toBeInstanceOf(BadRequestException)});
 it('prevents creating templates outside branch scope',async()=>{await expect(service.createTemplate({branchId:'branch-2',code:'DAY',name:'Day',startTime:'09:00',endTime:'18:00'},'u1')).rejects.toBeInstanceOf(NotFoundException)});
 it('allows central scope to read all company branches',async()=>{org.getBranchScopedWhere.mockResolvedValue({});prisma.$queryRawUnsafe.mockResolvedValue([]);await service.templates();expect(prisma.$queryRawUnsafe.mock.calls[0][3]).toBeNull()});
 it('publishes only draft shifts',async()=>{tx.$queryRawUnsafe.mockResolvedValueOnce([{id:'s1',status:'CANCELLED'}]);await expect(service.publish('s1','u1')).rejects.toBeInstanceOf(ConflictException)});
 it('makes publishing an already published shift idempotent',async()=>{tx.$queryRawUnsafe.mockResolvedValueOnce([{id:'s1',status:'PUBLISHED'}]);await expect(service.publish('s1','u1')).resolves.toEqual({id:'s1',status:'PUBLISHED'})});
 it('rejects staff from another branch',async()=>{tx.$queryRawUnsafe.mockResolvedValueOnce([{id:'s1',branchId:'branch-1',startsAt:new Date('2026-09-20T09:00:00Z'),endsAt:new Date('2026-09-20T18:00:00Z'),status:'PUBLISHED'}]);tx.staff.findFirst.mockResolvedValue(null);await expect(service.assign('s1','staff-2','u1')).rejects.toBeInstanceOf(NotFoundException)});
 it('rejects overlapping active shifts',async()=>{tx.$queryRawUnsafe.mockResolvedValueOnce([{id:'s1',branchId:'branch-1',startsAt:new Date('2026-09-20T09:00:00Z'),endsAt:new Date('2026-09-20T18:00:00Z'),status:'PUBLISHED'}]).mockResolvedValueOnce([{id:'existing'}]);tx.staff.findFirst.mockResolvedValue({id:'staff-1'});await expect(service.assign('s1','staff-1','u1')).rejects.toBeInstanceOf(ConflictException)});
 it('rejects approved leave conflicts',async()=>{tx.$queryRawUnsafe.mockResolvedValueOnce([{id:'s1',branchId:'branch-1',startsAt:new Date('2026-09-20T09:00:00Z'),endsAt:new Date('2026-09-20T18:00:00Z'),status:'PUBLISHED'}]).mockResolvedValueOnce([]).mockResolvedValueOnce([{id:'leave-1'}]);tx.staff.findFirst.mockResolvedValue({id:'staff-1'});await expect(service.assign('s1','staff-1','u1')).rejects.toBeInstanceOf(ConflictException)});
 it('creates assignment after branch, overlap and leave checks pass',async()=>{tx.$queryRawUnsafe.mockResolvedValueOnce([{id:'s1',branchId:'branch-1',startsAt:new Date('2026-09-20T09:00:00Z'),endsAt:new Date('2026-09-20T18:00:00Z'),status:'PUBLISHED'}]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{id:'a1',scheduledShiftId:'s1',staffId:'staff-1',status:'ASSIGNED'}]);tx.staff.findFirst.mockResolvedValue({id:'staff-1'});await expect(service.assign('s1','staff-1','u1')).resolves.toMatchObject({id:'a1',staffId:'staff-1'})});
});
