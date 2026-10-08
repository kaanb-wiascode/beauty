import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { LmsService } from './lms.service';

type CriterionInput={code:string;label:string;description?:string|null;weightPercent:number;minimumScore?:number|null;isRequired?:boolean};
type TrainingPracticalRubricDb = Pick<PrismaService, '$queryRawUnsafe'> | Prisma.TransactionClient;

@Injectable()
export class TrainingPracticalRubricService {
  constructor(private readonly prisma:PrismaService,private readonly tenant:TenantContext,private readonly lms:LmsService){}

  private context(){return{tenantId:this.tenant.getTenantId(),companyId:this.tenant.getCompanyId(),branchId:this.tenant.getBranchId()};}

  private validateCriteria(criteria:CriterionInput[]){
    if(!Array.isArray(criteria)||criteria.length<1||criteria.length>50)throw new BadRequestException('Practical rubric requires between 1 and 50 criteria.');
    const codes=new Set<string>();let weight=0;
    return criteria.map((item,index)=>{
      const code=item.code?.trim().toUpperCase(),label=item.label?.trim(),w=Number(item.weightPercent),minimum=item.minimumScore==null?null:Number(item.minimumScore);
      if(!code||!label)throw new BadRequestException('Each practical rubric criterion requires code and label.');
      if(codes.has(code))throw new BadRequestException(`Duplicate practical rubric criterion code: ${code}.`);codes.add(code);
      if(!Number.isFinite(w)||w<=0||w>100)throw new BadRequestException('Criterion weightPercent must be between 0 and 100.');
      if(minimum!=null&&(!Number.isFinite(minimum)||minimum<0||minimum>100))throw new BadRequestException('Criterion minimumScore must be between 0 and 100.');
      weight+=w;
      return{sequence:index+1,code,label,description:item.description?.trim()||null,weightPercent:w,minimumScore:minimum,isRequired:item.isRequired!==false};
    }).map(item=>({...item,totalWeight:weight}));
  }

  async save(versionId:string,input:{title:string;instructions?:string|null;criteria:CriterionInput[]},actorUserId:string){
    const c=this.context(),title=input.title?.trim();if(!title)throw new BadRequestException('Rubric title is required.');
    const validated=this.validateCriteria(input.criteria),total=validated[0]?.totalWeight??0;
    if(Math.abs(total-100)>0.001)throw new BadRequestException('Practical rubric criterion weights must total 100%.');
    return this.prisma.$transaction(async tx=>{
      const versions=await tx.$queryRawUnsafe<any[]>(`SELECT id,requires_practical AS "requiresPractical" FROM training_course_versions WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND status='DRAFT' FOR UPDATE`,versionId,c.tenantId,c.companyId);
      if(!versions.length)throw new NotFoundException('Draft course version not found.');
      if(!versions[0].requiresPractical)throw new BadRequestException('Course version does not require practical assessment.');
      const rows=await tx.$queryRawUnsafe<any[]>(`INSERT INTO training_practical_rubrics(tenant_id,company_id,course_version_id,title,instructions,created_by_user_id) VALUES($1::text,$2::text,$3::text,$4,$5,$6::text) ON CONFLICT(tenant_id,company_id,course_version_id) DO UPDATE SET title=EXCLUDED.title,instructions=EXCLUDED.instructions,updated_at=now() RETURNING id,title,instructions,course_version_id AS "courseVersionId"`,c.tenantId,c.companyId,versionId,title,input.instructions?.trim()||null,actorUserId);
      const rubric=rows[0];
      await tx.$executeRawUnsafe(`DELETE FROM training_practical_rubric_criteria WHERE tenant_id=$1::text AND company_id=$2::text AND rubric_id=$3::text`,c.tenantId,c.companyId,rubric.id);
      for(const criterion of validated){await tx.$executeRawUnsafe(`INSERT INTO training_practical_rubric_criteria(tenant_id,company_id,rubric_id,sequence,code,label,description,weight_percent,minimum_score,is_required) VALUES($1::text,$2::text,$3::text,$4,$5,$6,$7,$8,$9,$10)`,c.tenantId,c.companyId,rubric.id,criterion.sequence,criterion.code,criterion.label,criterion.description,criterion.weightPercent,criterion.minimumScore,criterion.isRequired);}
      return this.get(versionId,tx);
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }

  async get(versionId:string,db:TrainingPracticalRubricDb=this.prisma){
    const c=this.context();
    const rows=await db.$queryRawUnsafe<any[]>(`SELECT r.id,r.title,r.instructions,r.course_version_id AS "courseVersionId",v.status,v.practical_pass_score AS "practicalPassScore" FROM training_practical_rubrics r JOIN training_course_versions v ON v.id=r.course_version_id WHERE r.tenant_id=$1::text AND r.company_id=$2::text AND r.course_version_id=$3::text LIMIT 1`,c.tenantId,c.companyId,versionId);
    if(!rows.length)throw new NotFoundException('Practical rubric not found.');
    const criteria=await db.$queryRawUnsafe<any[]>(`SELECT id,sequence,code,label,description,weight_percent::float AS "weightPercent",minimum_score::float AS "minimumScore",is_required AS "isRequired" FROM training_practical_rubric_criteria WHERE tenant_id=$1::text AND company_id=$2::text AND rubric_id=$3::text ORDER BY sequence,id`,c.tenantId,c.companyId,rows[0].id);
    return{...rows[0],criteria};
  }

  async queue(){
    const c=this.context();
    return this.prisma.$queryRawUnsafe<any[]>(`SELECT a.id AS "assignmentId",a.status,a.due_at AS "dueAt",a.course_version_id AS "courseVersionId",c.code AS "courseCode",c.title AS "courseTitle",v.version,v.practical_pass_score AS "practicalPassScore",s.id AS "staffId",concat(s."firstName",' ',s."lastName") AS "staffName",b.name AS "branchName",r.id AS "rubricId",r.title AS "rubricTitle",pa.score AS "latestScore",pa.passed AS "latestPassed",pa.assessed_at AS "latestAssessedAt"
      FROM training_assignments a JOIN training_course_versions v ON v.id=a.course_version_id JOIN training_courses c ON c.id=a.course_id JOIN staff s ON s.id=a.staff_id JOIN branches b ON b.id=a.branch_id LEFT JOIN training_practical_rubrics r ON r.course_version_id=v.id AND r.tenant_id=a.tenant_id AND r.company_id=a.company_id LEFT JOIN LATERAL (SELECT p.score,p.passed,p.assessed_at FROM training_practical_assessments p WHERE p.assignment_id=a.id AND p.tenant_id=a.tenant_id AND p.company_id=a.company_id ORDER BY p.assessed_at DESC,p.id DESC LIMIT 1) pa ON true
      WHERE a.tenant_id=$1::text AND a.company_id=$2::text AND ($3::text IS NULL OR a.branch_id=$3::text) AND a.status IN ('ASSIGNED','IN_PROGRESS') AND v.requires_practical=true AND NOT EXISTS (SELECT 1 FROM training_lessons l LEFT JOIN training_lesson_progress lp ON lp.assignment_id=a.id AND lp.lesson_id=l.id WHERE l.course_version_id=v.id AND l.tenant_id=a.tenant_id AND l.company_id=a.company_id AND l.is_required=true AND COALESCE(lp.status,'NOT_STARTED')<>'COMPLETED') ORDER BY a.due_at NULLS LAST,c.title,s."firstName",s."lastName"`,c.tenantId,c.companyId,c.branchId);
  }

  async assess(assignmentId:string,input:{scores:Record<string,number>;note?:string|null;evidence?:unknown},actorUserId:string){
    const c=this.context();
    const assignments=await this.prisma.$queryRawUnsafe<any[]>(`SELECT a.course_version_id AS "courseVersionId" FROM training_assignments a WHERE a.id=$1::text AND a.tenant_id=$2::text AND a.company_id=$3::text AND ($4::text IS NULL OR a.branch_id=$4::text) LIMIT 1`,assignmentId,c.tenantId,c.companyId,c.branchId);
    if(!assignments.length)throw new NotFoundException('Training assignment not found.');
    const rubric=await this.get(assignments[0].courseVersionId);
    let weighted=0,totalWeight=0;const snapshot=[] as any[];
    for(const criterion of rubric.criteria){const raw=input.scores?.[criterion.id];if(criterion.isRequired&&raw==null)throw new BadRequestException(`Score is required for ${criterion.label}.`);if(raw==null)continue;const score=Number(raw);if(!Number.isFinite(score)||score<0||score>100)throw new BadRequestException(`Score for ${criterion.label} must be between 0 and 100.`);weighted+=score*Number(criterion.weightPercent);totalWeight+=Number(criterion.weightPercent);snapshot.push({id:criterion.id,code:criterion.code,label:criterion.label,weightPercent:Number(criterion.weightPercent),minimumScore:criterion.minimumScore,isRequired:criterion.isRequired,score,minimumPassed:criterion.minimumScore==null?null:score>=Number(criterion.minimumScore)});}
    if(totalWeight<=0)throw new BadRequestException('Practical rubric has no scored criteria.');
    const score=Math.round((weighted/totalWeight)*100)/100;
    const requiredMinimumFailed=snapshot.some(item=>item.isRequired&&item.minimumPassed===false);
    const effectiveScore=requiredMinimumFailed?Math.min(score,Math.max(Number(rubric.practicalPassScore??70)-0.01,0)):score;
    return this.lms.assessPractical(assignmentId,{score:effectiveScore,criteria:{rubricId:rubric.id,rubricTitle:rubric.title,weightedScore:score,requiredMinimumFailed,criteria:snapshot},evidence:input.evidence,note:input.note},actorUserId);
  }
}
