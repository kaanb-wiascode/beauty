import { CompetencyTrainingService } from './competency-training.service';

describe('CompetencyTrainingService', () => {
  const tenant={getTenantId:()=> 't1',getCompanyId:()=> 'c1',getBranchId:()=> null};

  it('versions competency training rules instead of mutating history', async()=>{
    const execute=jest.fn<Promise<number>,any[]>(async()=>1);
    const query=jest.fn<Promise<any[]>,any[]>(async(sql:string)=>{
      if(sql.includes('pg_advisory_xact_lock'))return[{}];
      if(sql.includes('FROM competency_definitions'))return[{id:'comp1'}];
      if(sql.includes('FROM training_courses'))return[{id:'course1'}];
      if(sql.includes('MAX(version)'))return[{version:3}];
      if(sql.includes('INSERT INTO competency_training_rules'))return[{id:'r3',name:'Gap Rule',version:3,competencyId:'comp1',courseId:'course1',minimumGap:10,isActive:true}];
      return[];
    });
    const tx={$queryRawUnsafe:query,$executeRawUnsafe:execute};
    const prisma={$transaction:jest.fn(async(fn:any)=>fn(tx))};
    const service=new CompetencyTrainingService(prisma as any,tenant as any);

    const result=await service.createRule({name:'Gap Rule',competencyId:'comp1',courseId:'course1',minimumGap:10},'u1');

    expect(result.version).toBe(3);
    expect(execute.mock.calls.some(call=>String(call[0]).includes('UPDATE competency_training_rules'))).toBe(true);
  });

  it('creates one explainable assignment for an eligible competency gap', async()=>{
    const directQuery=jest.fn<Promise<any[]>,any[]>(async(sql:string)=>{
      if(sql.includes('FROM staff s'))return[{id:'s1',branchId:'b1'}];
      return[];
    });
    const execute=jest.fn<Promise<number>,any[]>(async()=>1);
    const query=jest.fn<Promise<any[]>,any[]>(async(sql:string)=>{
      if(sql.includes('pg_advisory_xact_lock'))return[{}];
      if(sql.includes('WITH active_profile AS'))return[{
        profileId:'p1',competencyId:'comp1',competencyCode:'CONSULT',competencyName:'Consultation',requiredLevel:80,currentLevel:55,gap:25,assessmentId:'as1',
        ruleId:'r1',ruleName:'Consult Gap',ruleVersion:2,minimumGap:10,priority:10,dueDays:14,cooldownDays:30,
        courseId:'course1',courseCode:'CONSULT-101',courseTitle:'Consultation Refresher',
      }];
      if(sql.includes('FROM training_course_versions'))return[{id:'v1'}];
      if(sql.includes('FROM training_assignments')&&sql.includes('competency_rule_id'))return[];
      if(sql.includes('INSERT INTO training_assignments'))return[{id:'a1',status:'ASSIGNED',courseVersionId:'v1'}];
      return[];
    });
    const tx={$queryRawUnsafe:query,$executeRawUnsafe:execute};
    const prisma={$queryRawUnsafe:directQuery,$transaction:jest.fn(async(fn:any)=>fn(tx))};
    const service=new CompetencyTrainingService(prisma as any,tenant as any);

    const result=await service.process('s1','u1');

    expect(result.created).toBe(1);
    expect(result.assignments[0]).toMatchObject({assignmentId:'a1',competencyId:'comp1',gap:25});
    expect(query.mock.calls.some(call=>String(call[0]).includes("'COMPETENCY_GAP'"))).toBe(true);
    expect(execute.mock.calls.some(call=>String(call[0]).includes("'ASSIGNMENT_CREATED'"))).toBe(true);
  });

  it('does not create unusable assignments when the course has no published version', async()=>{
    const directQuery=jest.fn<Promise<any[]>,any[]>(async(sql:string)=>sql.includes('FROM staff s')?[{id:'s1',branchId:'b1'}]:[]);
    const execute=jest.fn<Promise<number>,any[]>(async()=>1);
    const query=jest.fn<Promise<any[]>,any[]>(async(sql:string)=>{
      if(sql.includes('pg_advisory_xact_lock'))return[{}];
      if(sql.includes('WITH active_profile AS'))return[{
        profileId:'p1',competencyId:'comp1',competencyCode:'CONSULT',competencyName:'Consultation',requiredLevel:80,currentLevel:null,gap:80,assessmentId:null,
        ruleId:'r1',ruleName:'Consult Gap',ruleVersion:1,minimumGap:10,priority:10,dueDays:14,cooldownDays:30,
        courseId:'course1',courseCode:'CONSULT-101',courseTitle:'Consultation Refresher',
      }];
      if(sql.includes('FROM training_course_versions'))return[];
      return[];
    });
    const tx={$queryRawUnsafe:query,$executeRawUnsafe:execute};
    const prisma={$queryRawUnsafe:directQuery,$transaction:jest.fn(async(fn:any)=>fn(tx))};
    const service=new CompetencyTrainingService(prisma as any,tenant as any);

    const result=await service.process('s1','u1');

    expect(result.created).toBe(0);
    expect(result.skippedNoPublishedVersion).toBe(1);
    expect(query.mock.calls.some(call=>String(call[0]).includes('INSERT INTO training_assignments'))).toBe(false);
    expect(execute.mock.calls.some(call=>String(call[0]).includes("'SKIPPED_NO_PUBLISHED_VERSION'"))).toBe(true);
  });
});
