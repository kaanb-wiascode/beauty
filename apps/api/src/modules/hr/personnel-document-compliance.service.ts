import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { TenantContext } from '../../common/tenant/tenant-context';

type ComplianceStatus = 'MISSING'|'PENDING'|'VERIFIED'|'EXPIRING'|'EXPIRED'|'REJECTED';
type ComplianceRow = {requirementId:string;documentType:string;title:string;description:string|null;required:boolean;restricted:boolean;requiresExpiry:boolean;warningDays:number;documentId:string|null;documentTitle:string|null;documentStatus:string|null;documentVersion:number|null;expiresAt:string|null;verificationNote:string|null};

@Injectable()
export class PersonnelDocumentComplianceService {
  constructor(private readonly prisma:PrismaService,private readonly ctx:TenantContext,private readonly organizationScope:OrganizationScopeService){}
  private scope(){const tenantId=this.ctx.getTenantId(),companyId=this.ctx.getCompanyId();if(!tenantId)throw new BadRequestException('Tenant context is required.');if(!companyId)throw new BadRequestException('Company context is required.');return{tenantId,companyId}}
  private async branchIds(){const s=await this.organizationScope.getBranchScopedWhere();if('branchId'in s)return typeof s.branchId==='string'?[s.branchId]:s.branchId.in;return null}
  private async staff(staffId:string){const{tenantId,companyId}=this.scope(),branchIds=await this.branchIds();const s=await this.prisma.staff.findFirst({where:{id:staffId,tenantId,branch:{companyId},...(branchIds===null?{}:{branchId:{in:branchIds}})},select:{id:true,branchId:true,profile:true}});if(!s)throw new NotFoundException('Staff not found');const master=await this.prisma.$queryRawUnsafe<Array<{employmentType:string|null}>>('SELECT employment_type AS "employmentType" FROM employee_master_records WHERE tenant_id=$1 AND staff_id=$2 LIMIT 1',tenantId,staffId);const profile=(s.profile??{}) as Record<string,unknown>;return{id:s.id,branchId:s.branchId,employmentType:master[0]?.employmentType??(String(profile.employmentType??'').trim()||null)}}
  private status(row:ComplianceRow):ComplianceStatus{if(!row.documentId)return'MISSING';const raw=String(row.documentStatus??'PENDING').toUpperCase();if(raw==='REJECTED')return'REJECTED';if(raw==='PENDING')return'PENDING';if(row.requiresExpiry&&!row.expiresAt)return'PENDING';if(row.expiresAt){const today=new Date();today.setHours(0,0,0,0);const expiry=new Date(`${row.expiresAt}T00:00:00`);if(expiry<today)return'EXPIRED';const warning=new Date(today);warning.setDate(warning.getDate()+Number(row.warningDays||0));if(expiry<=warning)return'EXPIRING'}return raw==='VERIFIED'?'VERIFIED':'PENDING'}
  async employee(staffId:string,includeRestricted=false){const{tenantId,companyId}=this.scope(),s=await this.staff(staffId);const rows=await this.prisma.$queryRawUnsafe<ComplianceRow[]>(`WITH applicable AS (SELECT DISTINCT ON (r.document_type) r.* FROM hr_document_requirements r WHERE r.tenant_id=$1 AND r.company_id=$2 AND r.active=TRUE AND r.required=TRUE AND (r.branch_id IS NULL OR r.branch_id=$4) AND (r.employment_type IS NULL OR r.employment_type=$5) AND ($6::boolean OR r.restricted=FALSE) ORDER BY r.document_type,(r.branch_id IS NOT NULL) DESC,(r.employment_type IS NOT NULL) DESC,r.updated_at DESC) SELECT r.id AS "requirementId",r.document_type AS "documentType",r.title,r.description,r.required,r.restricted,r.requires_expiry AS "requiresExpiry",r.warning_days AS "warningDays",d.id AS "documentId",d.title AS "documentTitle",d.status AS "documentStatus",d.version AS "documentVersion",d.expires_at::text AS "expiresAt",d.verification_note AS "verificationNote" FROM applicable r LEFT JOIN LATERAL (SELECT x.* FROM hr_personnel_documents x WHERE x.tenant_id=r.tenant_id AND x.company_id=r.company_id AND x.staff_id=$3 AND x.document_type=r.document_type AND x.status<>'ARCHIVED' ORDER BY x.version DESC,x.created_at DESC LIMIT 1) d ON TRUE ORDER BY r.title`,tenantId,companyId,staffId,s.branchId,s.employmentType,includeRestricted);const items=rows.map(row=>{const status=this.status(row);return{...row,status,compliant:status==='VERIFIED'}});const counts={total:items.length,verified:0,missing:0,pending:0,expiring:0,expired:0,rejected:0};for(const item of items){if(item.status==='VERIFIED')counts.verified++;else if(item.status==='MISSING')counts.missing++;else if(item.status==='PENDING')counts.pending++;else if(item.status==='EXPIRING')counts.expiring++;else if(item.status==='EXPIRED')counts.expired++;else if(item.status==='REJECTED')counts.rejected++}return{staffId,compliant:counts.total===counts.verified,score:counts.total?Math.round(counts.verified/counts.total*100):100,counts,items}}
  async overview(includeRestricted=false){
    const{tenantId,companyId}=this.scope(),branchIds=await this.branchIds();
    const staff=await this.prisma.staff.findMany({
      where:{tenantId,status:'ACTIVE',branch:{companyId},...(branchIds===null?{}:{branchId:{in:branchIds}})},
      select:{id:true,firstName:true,lastName:true,branchId:true,profile:true,branch:{select:{name:true}}},
      orderBy:[{firstName:'asc'},{lastName:'asc'}],
    });
    if(!staff.length)return{summary:{employees:0,compliant:0,nonCompliant:0,complianceRate:100},employees:[]};

    const staffIds=staff.map(person=>person.id);
    const masters=await this.prisma.$queryRawUnsafe<Array<{staffId:string;employmentType:string|null}>>(
      'SELECT staff_id AS "staffId",employment_type AS "employmentType" FROM employee_master_records WHERE tenant_id=$1 AND staff_id=ANY($2::text[])',
      tenantId,staffIds,
    );
    const masterByStaff=new Map(masters.map(row=>[row.staffId,row.employmentType]));

    const requirements=await this.prisma.$queryRawUnsafe<Array<{
      id:string;branchId:string|null;documentType:string;title:string;description:string|null;
      employmentType:string|null;required:boolean;restricted:boolean;requiresExpiry:boolean;
      warningDays:number;updatedAt:Date;
    }>>(
      `SELECT id,branch_id AS "branchId",document_type AS "documentType",title,description,
              employment_type AS "employmentType",required,restricted,
              requires_expiry AS "requiresExpiry",warning_days AS "warningDays",updated_at AS "updatedAt"
       FROM hr_document_requirements
       WHERE tenant_id=$1 AND company_id=$2 AND active=TRUE AND required=TRUE
         AND ($3::boolean OR restricted=FALSE)`,
      tenantId,companyId,includeRestricted,
    );

    const documents=await this.prisma.$queryRawUnsafe<Array<{
      id:string;staffId:string;documentType:string;title:string;status:string;version:number;
      expiresAt:string|null;verificationNote:string|null;createdAt:Date;
    }>>(
      `SELECT id,staff_id AS "staffId",document_type AS "documentType",title,status,version,
              expires_at::text AS "expiresAt",verification_note AS "verificationNote",created_at AS "createdAt"
       FROM hr_personnel_documents
       WHERE tenant_id=$1 AND company_id=$2 AND staff_id=ANY($3::text[]) AND status<>'ARCHIVED'
       ORDER BY staff_id,document_type,version DESC,created_at DESC`,
      tenantId,companyId,staffIds,
    );

    const latestDocument=new Map<string,(typeof documents)[number]>();
    for(const document of documents){
      const key=`${document.staffId}:${document.documentType}`;
      if(!latestDocument.has(key))latestDocument.set(key,document);
    }

    const employees=staff.map(person=>{
      const profile=(person.profile??{}) as Record<string,unknown>;
      const employmentType=masterByStaff.get(person.id)??(String(profile.employmentType??'').trim()||null);
      const applicable=requirements
        .filter(requirement=>
          (requirement.branchId===null||requirement.branchId===person.branchId)&&
          (requirement.employmentType===null||requirement.employmentType===employmentType)
        )
        .sort((a,b)=>{
          const branchScore=Number(b.branchId!==null)-Number(a.branchId!==null);
          if(branchScore!==0)return branchScore;
          const employmentScore=Number(b.employmentType!==null)-Number(a.employmentType!==null);
          if(employmentScore!==0)return employmentScore;
          return new Date(b.updatedAt).getTime()-new Date(a.updatedAt).getTime();
        });

      const byType=new Map<string,(typeof applicable)[number]>();
      for(const requirement of applicable)if(!byType.has(requirement.documentType))byType.set(requirement.documentType,requirement);

      const counts={total:0,verified:0,missing:0,pending:0,expiring:0,expired:0,rejected:0};
      for(const requirement of byType.values()){
        const document=latestDocument.get(`${person.id}:${requirement.documentType}`);
        const row:ComplianceRow={
          requirementId:requirement.id,
          documentType:requirement.documentType,
          title:requirement.title,
          description:requirement.description,
          required:requirement.required,
          restricted:requirement.restricted,
          requiresExpiry:requirement.requiresExpiry,
          warningDays:requirement.warningDays,
          documentId:document?.id??null,
          documentTitle:document?.title??null,
          documentStatus:document?.status??null,
          documentVersion:document?.version??null,
          expiresAt:document?.expiresAt??null,
          verificationNote:document?.verificationNote??null,
        };
        const currentStatus=this.status(row);
        counts.total++;
        if(currentStatus==='VERIFIED')counts.verified++;
        else if(currentStatus==='MISSING')counts.missing++;
        else if(currentStatus==='PENDING')counts.pending++;
        else if(currentStatus==='EXPIRING')counts.expiring++;
        else if(currentStatus==='EXPIRED')counts.expired++;
        else if(currentStatus==='REJECTED')counts.rejected++;
      }
      const compliant=counts.total===counts.verified;
      return{
        staffId:person.id,firstName:person.firstName,lastName:person.lastName,
        branchId:person.branchId,branchName:person.branch.name,
        score:counts.total?Math.round(counts.verified/counts.total*100):100,
        compliant,counts,
      };
    });

    const nonCompliant=employees.filter(employee=>!employee.compliant).length;
    return{
      summary:{
        employees:employees.length,
        compliant:employees.length-nonCompliant,
        nonCompliant,
        complianceRate:employees.length?Math.round((employees.length-nonCompliant)/employees.length*100):100,
      },
      employees,
    };
  }
}
