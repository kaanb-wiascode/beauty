import { TrainingReminderService } from './training-reminder.service';

describe('TrainingReminderService',()=>{
  const tenant={getTenantId:()=> 't1',getCompanyId:()=> 'c1',getBranchId:()=> 'b1'};

  it('creates deadline reminders idempotently through the database conflict key',async()=>{
    let inserts=0;
    const query=jest.fn(async(sql:string)=>{
      if(sql.includes('FROM training_assignments a'))return[{id:'a1',branchId:'b1',staffId:'s1',dueAt:new Date(Date.now()+86400000)}];
      if(sql.includes('INSERT INTO training_assignment_reminders')){inserts+=1;return inserts===1?[{id:'r1'}]:[];}
      return[];
    });
    const tx={$queryRawUnsafe:query};
    const prisma={$transaction:jest.fn(async(fn:any)=>fn(tx))};
    const service=new TrainingReminderService(prisma as any,tenant as any);
    const first=await service.process('u1');
    const second=await service.process('u1');
    expect(first.created).toBe(1);
    expect(second.created).toBe(0);
    expect(query.mock.calls.some(call=>String(call[0]).includes('ON CONFLICT(tenant_id,company_id,assignment_id,reminder_type,reminder_date) DO NOTHING'))).toBe(true);
  });

  it('lists only open reminders owned by the authenticated learner staff identity',async()=>{
    const query=jest.fn(async(sql:string,...args:unknown[])=>{
      if(sql.includes('FROM training_learner_identities'))return[{staffId:'s1'}];
      if(sql.includes('FROM training_assignment_reminders')){expect(args[2]).toBe('s1');expect(args[3]).toBe('b1');return[{id:'r1',assignmentId:'a1',reminderType:'OVERDUE'}];}
      return[];
    });
    const prisma={$queryRawUnsafe:query};
    const service=new TrainingReminderService(prisma as any,tenant as any);
    expect(await service.mine('u1')).toEqual([{id:'r1',assignmentId:'a1',reminderType:'OVERDUE'}]);
  });
});
