import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { TrainingProgramService } from './training-program.service';

@Injectable()
export class TrainingRoleAcademyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly programs: TrainingProgramService,
  ) {}

  private context(){return{tenantId:this.tenant.getTenantId(),companyId:this.tenant.getCompanyId(),branchId:this.tenant.getBranchId()};}

  async list(){
    const c=this.context();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT ra.id,ra.position_id AS "positionId",p.code AS "positionCode",p.name AS "positionName",
              ra.program_id AS "programId",tp.code AS "programCode",tp.title AS "programTitle",
              ra.auto_assign AS "autoAssign",ra.is_active AS "isActive",
              COUNT(DISTINCT s.id)::int AS "eligibleStaff"
       FROM training_role_academies ra
       JOIN hr_positions p ON p.id=ra.position_id
       JOIN training_programs tp ON tp.id=ra.program_id
       LEFT JOIN hr_employee_assignments ea ON ea.position_id=ra.position_id
         AND ea.tenant_id=ra.tenant_id AND ea.company_id=ra.company_id
         AND ea.effective_from<=CURRENT_DATE AND (ea.effective_to IS NULL OR ea.effective_to>=CURRENT_DATE)
       LEFT JOIN staff s ON s.id=ea.staff_id AND s.status='ACTIVE'
         AND ($3::text IS NULL OR s."branchId"=$3::text)
       WHERE ra.tenant_id=$1::text AND ra.company_id=$2::text
       GROUP BY ra.id,p.code,p.name,tp.code,tp.title
       ORDER BY ra.is_active DESC,p.name,tp.title`,
      c.tenantId,c.companyId,c.branchId,
    );
  }

  async save(input:{positionId:string;programId:string;autoAssign?:boolean},actorUserId:string){
    const c=this.context();
    const scope=await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT p.id AS "positionId",tp.id AS "programId"
       FROM hr_positions p CROSS JOIN training_programs tp
       WHERE p.id=$1::text AND p.tenant_id=$3::text AND p.company_id=$4::text AND p.status='ACTIVE'
         AND tp.id=$2::text AND tp.tenant_id=$3::text AND tp.company_id=$4::text AND tp.is_active=true
       LIMIT 1`,input.positionId,input.programId,c.tenantId,c.companyId,
    );
    if(!scope.length)throw new NotFoundException('Active position or learning path not found in current scope.');
    const published=await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM training_program_versions WHERE tenant_id=$1::text AND company_id=$2::text AND program_id=$3::text AND status='PUBLISHED' LIMIT 1`,
      c.tenantId,c.companyId,input.programId,
    );
    if(!published.length)throw new BadRequestException('Role academy requires a published learning path version.');
    const rows=await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO training_role_academies(tenant_id,company_id,position_id,program_id,auto_assign,created_by_user_id)
       VALUES($1::text,$2::text,$3::text,$4::text,$5,$6::text)
       ON CONFLICT(tenant_id,company_id,position_id,program_id) DO UPDATE
       SET auto_assign=EXCLUDED.auto_assign,is_active=true,updated_at=now()
       RETURNING id,position_id AS "positionId",program_id AS "programId",auto_assign AS "autoAssign",is_active AS "isActive"`,
      c.tenantId,c.companyId,input.positionId,input.programId,input.autoAssign!==false,actorUserId,
    );
    return rows[0];
  }

  async deactivate(id:string){
    const c=this.context();
    const rows=await this.prisma.$queryRawUnsafe<any[]>(
      `UPDATE training_role_academies SET is_active=false,updated_at=now()
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
       RETURNING id,is_active AS "isActive"`,id,c.tenantId,c.companyId,
    );
    if(!rows.length)throw new NotFoundException('Role academy mapping not found.');
    return rows[0];
  }

  async process(actorUserId:string){
    const c=this.context();
    const candidates=await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT DISTINCT ra.id AS "ruleId",ra.program_id AS "programId",s.id AS "staffId",s."branchId" AS "branchId"
       FROM training_role_academies ra
       JOIN hr_employee_assignments ea ON ea.position_id=ra.position_id
         AND ea.tenant_id=ra.tenant_id AND ea.company_id=ra.company_id
         AND ea.effective_from<=CURRENT_DATE AND (ea.effective_to IS NULL OR ea.effective_to>=CURRENT_DATE)
       JOIN staff s ON s.id=ea.staff_id AND s."tenantId"=ra.tenant_id AND s.status='ACTIVE'
       JOIN branches b ON b.id=s."branchId" AND b."companyId"=ra.company_id
       WHERE ra.tenant_id=$1::text AND ra.company_id=$2::text AND ra.is_active=true AND ra.auto_assign=true
         AND ($3::text IS NULL OR s."branchId"=$3::text)
       ORDER BY ra.id,s.id`,c.tenantId,c.companyId,c.branchId,
    );
    let assigned=0,existing=0,failed=0;
    const failures:Array<{ruleId:string;staffId:string;message:string}>=[];
    for(const row of candidates){
      try{
        const result=await this.programs.assign(row.programId,{branchId:row.branchId,staffId:row.staffId,idempotencyKey:`role-academy:${row.ruleId}`},actorUserId);
        if(Number(result.courseAssignmentsCreated)>0)assigned+=1;else existing+=1;
      }catch(error){failed+=1;failures.push({ruleId:row.ruleId,staffId:row.staffId,message:error instanceof Error?error.message:'Assignment failed'});}
    }
    return{matched:candidates.length,assigned,existing,failed,failures:failures.slice(0,25)};
  }
}
