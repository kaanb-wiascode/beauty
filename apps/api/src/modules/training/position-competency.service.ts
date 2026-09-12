import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class PositionCompetencyService {
  constructor(private readonly prisma:PrismaService,private readonly tenant:TenantContext){}
  private c(){return{tenantId:this.tenant.getTenantId(),companyId:this.tenant.getCompanyId(),branchId:this.tenant.getBranchId()};}
  private key(value:string){return value?.trim().toLocaleUpperCase('tr-TR').replace(/\s+/g,' ');}

  async createMapping(input:{position:string;profileId:string;effectiveFrom?:string;effectiveTo?:string|null},actor:string){
    const c=this.c(),label=input.position?.trim(),positionKey=this.key(input.position),from=input.effectiveFrom??new Date().toISOString().slice(0,10),to=input.effectiveTo??null;
    if(!label||!positionKey)throw new BadRequestException('Position is required.');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(from)|| (to&&!/^\d{4}-\d{2}-\d{2}$/.test(to)))throw new BadRequestException('Effective dates must use YYYY-MM-DD.');
    if(to&&to<from)throw new BadRequestException('effectiveTo cannot be before effectiveFrom.');
    return this.prisma.$transaction(async tx=>{
      const profiles=await tx.$queryRawUnsafe<any[]>(`SELECT id FROM competency_profiles WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND is_active=true AND effective_from<=$4::date AND (effective_to IS NULL OR effective_to>=$4::date) LIMIT 1`,input.profileId,c.tenantId,c.companyId,from);
      if(!profiles.length)throw new NotFoundException('Active competency profile not found for mapping effective date.');
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`,`position-competency:${c.tenantId}:${c.companyId}:${positionKey}`);
      await tx.$executeRawUnsafe(`UPDATE position_competency_profile_mappings SET is_active=false,effective_to=CASE WHEN effective_from<$4::date THEN ($4::date-interval '1 day')::date ELSE effective_from END,updated_at=now() WHERE tenant_id=$1::text AND company_id=$2::text AND position_key=$3 AND is_active=true`,c.tenantId,c.companyId,positionKey,from);
      const rows=await tx.$queryRawUnsafe<any[]>(`INSERT INTO position_competency_profile_mappings(tenant_id,company_id,position_key,position_label,profile_id,effective_from,effective_to,created_by_user_id) VALUES($1::text,$2::text,$3,$4,$5::text,$6::date,$7::date,$8::text) RETURNING id,position_key AS "positionKey",position_label AS "positionLabel",profile_id AS "profileId",effective_from AS "effectiveFrom",effective_to AS "effectiveTo",is_active AS "isActive"`,c.tenantId,c.companyId,positionKey,label,input.profileId,from,to,actor);
      await tx.$executeRawUnsafe(`INSERT INTO position_competency_mapping_events(tenant_id,company_id,mapping_id,event_type,actor_user_id) VALUES($1::text,$2::text,$3::text,'CREATED',$4::text)`,c.tenantId,c.companyId,rows[0].id,actor);
      return rows[0];
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }

  async listMappings(){const c=this.c();return this.prisma.$queryRawUnsafe<any[]>(`SELECT m.id,m.position_key AS "positionKey",m.position_label AS "positionLabel",m.profile_id AS "profileId",m.effective_from AS "effectiveFrom",m.effective_to AS "effectiveTo",m.is_active AS "isActive",p.code AS "profileCode",p.name AS "profileName",p.version AS "profileVersion" FROM position_competency_profile_mappings m JOIN competency_profiles p ON p.id=m.profile_id WHERE m.tenant_id=$1::text AND m.company_id=$2::text ORDER BY m.position_label,m.effective_from DESC`,c.tenantId,c.companyId);}

  async process(actor:string,limit=200){const c=this.c(),safe=Math.min(Math.max(Math.trunc(Number(limit)||200),1),500);return this.prisma.$transaction(async tx=>{
    const rows=await tx.$queryRawUnsafe<any[]>(`SELECT ep.staff_id AS "staffId",ep.branch_id AS "branchId",ep.position,m.id AS "mappingId",m.profile_id AS "profileId" FROM employee_profiles ep JOIN branches b ON b.id=ep.branch_id JOIN staff s ON s.id=ep.staff_id AND s."tenantId"=ep.tenant_id AND s."branchId"=ep.branch_id AND s.status='ACTIVE' JOIN position_competency_profile_mappings m ON m.tenant_id=ep.tenant_id AND m.company_id=b."companyId" AND m.position_key=UPPER(REGEXP_REPLACE(TRIM(ep.position),'\\s+',' ','g')) AND m.is_active=true AND m.effective_from<=CURRENT_DATE AND (m.effective_to IS NULL OR m.effective_to>=CURRENT_DATE) WHERE ep.tenant_id=$1::text AND b."companyId"=$2::text AND ep.position IS NOT NULL AND ($3::text IS NULL OR ep.branch_id=$3::text) ORDER BY ep.staff_id LIMIT $4`,c.tenantId,c.companyId,c.branchId,safe);
    let assigned=0,skipped=0;
    for(const row of rows){
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`,`staff-competency-profile:${c.tenantId}:${c.companyId}:${row.staffId}`);
      const existing=await tx.$queryRawUnsafe<any[]>(`SELECT id,profile_id AS "profileId" FROM staff_competency_profiles WHERE tenant_id=$1::text AND company_id=$2::text AND staff_id=$3::text AND effective_from<=CURRENT_DATE AND (effective_to IS NULL OR effective_to>=CURRENT_DATE) ORDER BY effective_from DESC,created_at DESC LIMIT 1`,c.tenantId,c.companyId,row.staffId);
      if(existing.length){skipped++;await tx.$executeRawUnsafe(`INSERT INTO position_competency_mapping_events(tenant_id,company_id,mapping_id,event_type,actor_user_id,metadata) VALUES($1::text,$2::text,$3::text,'SKIPPED_EXISTING_PROFILE',$4::text,$5::jsonb)`,c.tenantId,c.companyId,row.mappingId,actor,JSON.stringify({staffId:row.staffId,existingProfileId:existing[0].profileId}));continue;}
      await tx.$executeRawUnsafe(`INSERT INTO staff_competency_profiles(tenant_id,company_id,branch_id,staff_id,profile_id,effective_from,assigned_by_user_id) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,CURRENT_DATE,$6::text)`,c.tenantId,c.companyId,row.branchId,row.staffId,row.profileId,actor);
      await tx.$executeRawUnsafe(`INSERT INTO position_competency_mapping_events(tenant_id,company_id,mapping_id,event_type,actor_user_id,metadata) VALUES($1::text,$2::text,$3::text,'STAFF_PROFILE_ASSIGNED',$4::text,$5::jsonb)`,c.tenantId,c.companyId,row.mappingId,actor,JSON.stringify({staffId:row.staffId,profileId:row.profileId}));assigned++;
    }
    return{matched:rows.length,assigned,skipped};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});}
}
