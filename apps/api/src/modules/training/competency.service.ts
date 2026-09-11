import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class CompetencyService {
  constructor(private readonly prisma: PrismaService, private readonly tenant: TenantContext) {}

  private context(){return{tenantId:this.tenant.getTenantId(),companyId:this.tenant.getCompanyId(),branchId:this.tenant.getBranchId()};}

  private async staff(staffId:string){
    const c=this.context();
    const rows=await this.prisma.$queryRawUnsafe<any[]>(`SELECT s.id,s."branchId" AS "branchId" FROM staff s JOIN branches b ON b.id=s."branchId" JOIN companies co ON co.id=b."companyId" WHERE s.id=$1::text AND s."tenantId"=$2::text AND co.id=$3::text AND ($4::text IS NULL OR s."branchId"=$4::text) LIMIT 1`,staffId,c.tenantId,c.companyId,c.branchId);
    if(!rows.length)throw new NotFoundException('Staff not found in active scope.');
    return rows[0];
  }

  private date(value:string,field:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value??''))throw new BadRequestException(`${field} must use YYYY-MM-DD.`);return value;}

  async createDefinition(input:{code:string;name:string;description?:string|null;category?:string},actorUserId:string){
    const c=this.context(),code=input.code?.trim().toUpperCase(),name=input.name?.trim(),category=input.category?.trim().toUpperCase()||'GENERAL';
    if(!code||!name)throw new BadRequestException('Competency code and name are required.');
    const rows=await this.prisma.$queryRawUnsafe<any[]>(`INSERT INTO competency_definitions(tenant_id,company_id,code,name,description,category,created_by_user_id) VALUES($1::text,$2::text,$3,$4,$5,$6,$7::text) ON CONFLICT(tenant_id,company_id,code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,category=EXCLUDED.category,is_active=true,updated_at=now() RETURNING id,code,name,category,is_active AS "isActive"`,c.tenantId,c.companyId,code,name,input.description?.trim()||null,category,actorUserId);
    return rows[0];
  }

  async listDefinitions(){const c=this.context();return this.prisma.$queryRawUnsafe<any[]>(`SELECT id,code,name,description,category,is_active AS "isActive" FROM competency_definitions WHERE tenant_id=$1::text AND company_id=$2::text ORDER BY is_active DESC,category,name`,c.tenantId,c.companyId);}

  async createProfile(input:{code:string;name:string;description?:string|null;effectiveFrom?:string;effectiveTo?:string|null;requirements:Array<{competencyId:string;requiredLevel:number;weight?:number}>},actorUserId:string){
    const c=this.context(),code=input.code?.trim().toUpperCase(),name=input.name?.trim();
    if(!code||!name)throw new BadRequestException('Profile code and name are required.');
    if(!input.requirements?.length)throw new BadRequestException('At least one competency requirement is required.');
    const effectiveFrom=this.date(input.effectiveFrom??new Date().toISOString().slice(0,10),'effectiveFrom');
    const effectiveTo=input.effectiveTo?this.date(input.effectiveTo,'effectiveTo'):null;
    if(effectiveTo&&effectiveTo<effectiveFrom)throw new BadRequestException('effectiveTo cannot be before effectiveFrom.');
    const ids=new Set<string>();
    for(const r of input.requirements){if(ids.has(r.competencyId))throw new BadRequestException('Duplicate competency requirement.');ids.add(r.competencyId);if(!Number.isFinite(r.requiredLevel)||r.requiredLevel<0||r.requiredLevel>100)throw new BadRequestException('requiredLevel must be between 0 and 100.');if(!Number.isFinite(r.weight??1)||(r.weight??1)<=0)throw new BadRequestException('weight must be greater than zero.');}
    return this.prisma.$transaction(async tx=>{
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`,`competency-profile:${c.tenantId}:${c.companyId}:${code}`);
      const found=await tx.$queryRawUnsafe<any[]>(`SELECT id FROM competency_definitions WHERE tenant_id=$1::text AND company_id=$2::text AND is_active=true AND id=ANY($3::text[])`,c.tenantId,c.companyId,[...ids]);
      if(found.length!==ids.size)throw new BadRequestException('One or more competency definitions are outside scope or inactive.');
      const versions=await tx.$queryRawUnsafe<any[]>(`SELECT COALESCE(MAX(version),0)+1 AS version FROM competency_profiles WHERE tenant_id=$1::text AND company_id=$2::text AND code=$3`,c.tenantId,c.companyId,code);
      const version=Number(versions[0]?.version??1);
      await tx.$executeRawUnsafe(`UPDATE competency_profiles SET is_active=false,effective_to=CASE WHEN effective_from<$4::date THEN ($4::date-interval '1 day')::date ELSE effective_from END,updated_at=now() WHERE tenant_id=$1::text AND company_id=$2::text AND code=$3 AND is_active=true`,c.tenantId,c.companyId,code,effectiveFrom);
      const profiles=await tx.$queryRawUnsafe<any[]>(`INSERT INTO competency_profiles(tenant_id,company_id,code,name,description,version,effective_from,effective_to,is_active,created_by_user_id) VALUES($1::text,$2::text,$3,$4,$5,$6,$7::date,$8::date,true,$9::text) RETURNING id,code,name,version,effective_from AS "effectiveFrom",effective_to AS "effectiveTo",is_active AS "isActive"`,c.tenantId,c.companyId,code,name,input.description?.trim()||null,version,effectiveFrom,effectiveTo,actorUserId);
      const p=profiles[0];
      for(const r of input.requirements)await tx.$executeRawUnsafe(`INSERT INTO competency_profile_requirements(profile_id,competency_id,tenant_id,company_id,required_level,weight) VALUES($1::text,$2::text,$3::text,$4::text,$5,$6)`,p.id,r.competencyId,c.tenantId,c.companyId,r.requiredLevel,r.weight??1);
      return{...p,requirements:input.requirements};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }

  async listProfiles(){const c=this.context();return this.prisma.$queryRawUnsafe<any[]>(`SELECT p.id,p.code,p.name,p.description,p.version,p.effective_from AS "effectiveFrom",p.effective_to AS "effectiveTo",p.is_active AS "isActive",COALESCE(jsonb_agg(jsonb_build_object('competencyId',d.id,'competencyCode',d.code,'competencyName',d.name,'requiredLevel',r.required_level,'weight',r.weight) ORDER BY d.name) FILTER(WHERE d.id IS NOT NULL),'[]'::jsonb) AS requirements FROM competency_profiles p LEFT JOIN competency_profile_requirements r ON r.profile_id=p.id LEFT JOIN competency_definitions d ON d.id=r.competency_id WHERE p.tenant_id=$1::text AND p.company_id=$2::text GROUP BY p.id ORDER BY p.code,p.version DESC`,c.tenantId,c.companyId);}

  async assignProfile(staffId:string,input:{profileId:string;effectiveFrom?:string;effectiveTo?:string|null},actorUserId:string){
    const c=this.context(),staff=await this.staff(staffId),effectiveFrom=this.date(input.effectiveFrom??new Date().toISOString().slice(0,10),'effectiveFrom');
    const effectiveTo=input.effectiveTo?this.date(input.effectiveTo,'effectiveTo'):null;
    if(effectiveTo&&effectiveTo<effectiveFrom)throw new BadRequestException('effectiveTo cannot be before effectiveFrom.');
    const profiles=await this.prisma.$queryRawUnsafe<any[]>(`SELECT id,version FROM competency_profiles WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND is_active=true AND effective_from<=$4::date AND (effective_to IS NULL OR effective_to>=$4::date) LIMIT 1`,input.profileId,c.tenantId,c.companyId,effectiveFrom);
    if(!profiles.length)throw new NotFoundException('Active competency profile version not found for effective date.');
    return this.prisma.$transaction(async tx=>{
      await tx.$executeRawUnsafe(`UPDATE staff_competency_profiles SET effective_to=($4::date-interval '1 day')::date WHERE tenant_id=$1::text AND company_id=$2::text AND staff_id=$3::text AND effective_to IS NULL AND effective_from<$4::date`,c.tenantId,c.companyId,staffId,effectiveFrom);
      const rows=await tx.$queryRawUnsafe<any[]>(`INSERT INTO staff_competency_profiles(tenant_id,company_id,branch_id,staff_id,profile_id,effective_from,effective_to,assigned_by_user_id) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::date,$7::date,$8::text) ON CONFLICT(tenant_id,company_id,staff_id,effective_from) DO UPDATE SET profile_id=EXCLUDED.profile_id,effective_to=EXCLUDED.effective_to,assigned_by_user_id=EXCLUDED.assigned_by_user_id RETURNING id,staff_id AS "staffId",profile_id AS "profileId",effective_from AS "effectiveFrom",effective_to AS "effectiveTo"`,c.tenantId,c.companyId,staff.branchId,staffId,input.profileId,effectiveFrom,effectiveTo,actorUserId);
      return{...rows[0],profileVersion:Number(profiles[0].version)};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }

  async assess(staffId:string,input:{competencyId:string;sourceType:'MANUAL'|'EXAM'|'PRACTICAL'|'TRAINING'|'QUALITY';score:number;evidence?:unknown;note?:string|null;assessedAt?:string},actorUserId:string){
    const c=this.context(),staff=await this.staff(staffId);
    if(!['MANUAL','EXAM','PRACTICAL','TRAINING','QUALITY'].includes(input.sourceType))throw new BadRequestException('Invalid competency assessment source.');
    if(!Number.isFinite(input.score)||input.score<0||input.score>100)throw new BadRequestException('score must be between 0 and 100.');
    const defs=await this.prisma.$queryRawUnsafe<any[]>(`SELECT id FROM competency_definitions WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND is_active=true LIMIT 1`,input.competencyId,c.tenantId,c.companyId);if(!defs.length)throw new NotFoundException('Competency definition not found.');
    const assessedAt=input.assessedAt?new Date(input.assessedAt):new Date();if(Number.isNaN(assessedAt.getTime()))throw new BadRequestException('assessedAt is invalid.');
    const rows=await this.prisma.$queryRawUnsafe<any[]>(`INSERT INTO staff_competency_assessments(tenant_id,company_id,branch_id,staff_id,competency_id,source_type,score,evidence,note,assessed_at,assessed_by_user_id) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6,$7,$8::jsonb,$9,$10,$11::text) RETURNING id,staff_id AS "staffId",competency_id AS "competencyId",source_type AS "sourceType",score,assessed_at AS "assessedAt"`,c.tenantId,c.companyId,staff.branchId,staffId,input.competencyId,input.sourceType,input.score,input.evidence==null?null:JSON.stringify(input.evidence),input.note?.trim()||null,assessedAt,actorUserId);
    return rows[0];
  }

  async gaps(staffId:string){
    const c=this.context();await this.staff(staffId);
    return this.prisma.$queryRawUnsafe<any[]>(`WITH profile AS (SELECT sp.profile_id FROM staff_competency_profiles sp WHERE sp.tenant_id=$1::text AND sp.company_id=$2::text AND sp.staff_id=$3::text AND sp.effective_from<=CURRENT_DATE AND (sp.effective_to IS NULL OR sp.effective_to>=CURRENT_DATE) ORDER BY sp.effective_from DESC,sp.created_at DESC LIMIT 1), latest AS (SELECT DISTINCT ON(a.competency_id) a.competency_id,a.score,a.source_type,a.assessed_at FROM staff_competency_assessments a WHERE a.tenant_id=$1::text AND a.company_id=$2::text AND a.staff_id=$3::text ORDER BY a.competency_id,a.assessed_at DESC,a.created_at DESC) SELECT d.id AS "competencyId",d.code AS "competencyCode",d.name AS "competencyName",r.required_level AS "requiredLevel",l.score AS "currentLevel",CASE WHEN l.score IS NULL THEN r.required_level ELSE GREATEST(r.required_level-l.score,0) END AS gap,l.source_type AS "latestSource",l.assessed_at AS "lastAssessedAt",r.weight FROM profile p JOIN competency_profile_requirements r ON r.profile_id=p.profile_id JOIN competency_definitions d ON d.id=r.competency_id LEFT JOIN latest l ON l.competency_id=d.id ORDER BY gap DESC,d.name`,c.tenantId,c.companyId,staffId);
  }
}
