import { BadRequestException } from '@nestjs/common';
import { TrainingPracticalRubricService } from './training-practical-rubric.service';

describe('TrainingPracticalRubricService',()=>{
  const tenant={getTenantId:()=> 't1',getCompanyId:()=> 'c1',getBranchId:()=> 'b1'};

  it('rejects rubric weights that do not total 100 percent',async()=>{
    const service=new TrainingPracticalRubricService({} as any,tenant as any,{} as any);
    await expect(service.save('v1',{title:'Rubric',criteria:[{code:'A',label:'A',weightPercent:60},{code:'B',label:'B',weightPercent:30}]},'u1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('calculates deterministic weighted score and delegates persistence to LMS practical assessment',async()=>{
    const query=jest.fn(async(sql:string)=>{
      if(sql.includes('FROM training_assignments a'))return[{courseVersionId:'v1'}];
      if(sql.includes('FROM training_practical_rubrics r'))return[{id:'r1',title:'Rubric',courseVersionId:'v1',status:'PUBLISHED',practicalPassScore:70}];
      if(sql.includes('FROM training_practical_rubric_criteria'))return[
        {id:'c1',sequence:1,code:'SAFE',label:'Safety',weightPercent:60,minimumScore:70,isRequired:true},
        {id:'c2',sequence:2,code:'TECH',label:'Technique',weightPercent:40,minimumScore:null,isRequired:true},
      ];
      return[];
    });
    const lms={assessPractical:jest.fn(async(_a:any,input:any)=>({score:input.score,passed:true}))};
    const service=new TrainingPracticalRubricService({$queryRawUnsafe:query} as any,tenant as any,lms as any);
    const result=await service.assess('a1',{scores:{c1:80,c2:90},note:'ok'},'u1');
    expect(lms.assessPractical).toHaveBeenCalledWith('a1',expect.objectContaining({score:84,note:'ok',criteria:expect.objectContaining({weightedScore:84,requiredMinimumFailed:false})}),'u1');
    expect(result.score).toBe(84);
  });

  it('forces a failing effective score when a required criterion minimum is missed',async()=>{
    const query=jest.fn(async(sql:string)=>{
      if(sql.includes('FROM training_assignments a'))return[{courseVersionId:'v1'}];
      if(sql.includes('FROM training_practical_rubrics r'))return[{id:'r1',title:'Rubric',courseVersionId:'v1',status:'PUBLISHED',practicalPassScore:70}];
      if(sql.includes('FROM training_practical_rubric_criteria'))return[
        {id:'c1',sequence:1,code:'SAFE',label:'Safety',weightPercent:20,minimumScore:80,isRequired:true},
        {id:'c2',sequence:2,code:'TECH',label:'Technique',weightPercent:80,minimumScore:null,isRequired:true},
      ];
      return[];
    });
    const lms={assessPractical:jest.fn(async(_a:any,input:any)=>({score:input.score,passed:false}))};
    const service=new TrainingPracticalRubricService({$queryRawUnsafe:query} as any,tenant as any,lms as any);
    await service.assess('a1',{scores:{c1:70,c2:100}},'u1');
    expect(lms.assessPractical).toHaveBeenCalledWith('a1',expect.objectContaining({score:69.99,criteria:expect.objectContaining({weightedScore:94,requiredMinimumFailed:true})}),'u1');
  });
});
