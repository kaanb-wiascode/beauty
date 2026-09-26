import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import type { CreateCreatorCollaborationInput, CreateCreatorInput } from './creators.schemas';

type Row={id:string;branchId:string|null;[key:string]:unknown};

@Injectable()
export class CreatorsService {
  constructor(private readonly prisma:PrismaService,private readonly tenantContext:TenantContext){}
  private context(){return this.tenantContext.getContext();}
  private normalizeCreator(row:Row){
    return {
      ...row,
      followerCount:typeof row.followerCount==='bigint'?Number(row.followerCount):row.followerCount,
    };
  }
  private async assertBranch(branchId:string){const {companyId}=this.context();const branch=await this.prisma.branch.findFirst({where:{id:branchId,companyId,status:'ACTIVE'},select:{id:true}});if(!branch)throw new BadRequestException('Creator branch is outside the active company.');}

  private async syncCollaborationFinanceHandoff(collaborationId:string){
    const {tenantId,companyId}=this.context();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO corporate_marketing_expenses(
         tenant_id,company_id,branch_id,source_type,source_id,period_key,campaign_id,
         category,description,amount,currency,incurred_on,status,expense_account_code,expense_account_name,metadata
       )
       SELECT cc.tenant_id,cc.company_id,cc.branch_id,'CREATOR',cc.id,'ONE_TIME',cc.campaign_id,
              'INFLUENCER_FEE',c.display_name || ' creator işbirliği',cc.fee_amount,cc.currency,
              COALESCE(cc.starts_at::date,CURRENT_DATE),'PENDING_FINANCE','760.05','Influencer ve Creator Giderleri',
              jsonb_build_object('creatorId',cc.creator_id,'couponCode',cc.coupon_code,'autoSynced',true)
       FROM corporate_creator_collaborations cc
       JOIN corporate_creators c ON c.id=cc.creator_id
       WHERE cc.id=$1::text AND cc.tenant_id=$2::text AND cc.company_id=$3::text
         AND cc.fee_amount>0 AND cc.status<>'CANCELLED'
       ON CONFLICT (tenant_id,company_id,source_type,source_id,period_key)
       DO UPDATE SET amount=EXCLUDED.amount,currency=EXCLUDED.currency,branch_id=EXCLUDED.branch_id,
                     campaign_id=EXCLUDED.campaign_id,description=EXCLUDED.description,metadata=EXCLUDED.metadata,updated_at=NOW()
       WHERE corporate_marketing_expenses.status='PENDING_FINANCE'`,
      collaborationId,tenantId,companyId,
    );
  }

  async list(filters:{status?:string;platform?:string;search?:string;limit:number}){
    const {tenantId,companyId,branchId}=this.context();
    const rows=await this.prisma.$queryRawUnsafe<Row[]>(`SELECT c.id,c.branch_id AS "branchId",c.display_name AS "displayName",c.legal_name AS "legalName",c.category,c.status,c.primary_platform AS "primaryPlatform",c.handle,c.profile_url AS "profileUrl",c.follower_count AS "followerCount",c.engagement_rate AS "engagementRate",c.audience_profile AS "audienceProfile",c.rate_card AS "rateCard",c.contact_email AS "contactEmail",c.contact_phone AS "contactPhone",c.notes,c.attributed_revenue AS "attributedRevenue",c.metadata,c.created_at AS "createdAt",c.updated_at AS "updatedAt",(SELECT count(*)::int FROM corporate_creator_collaborations cc WHERE cc.creator_id=c.id) AS "collaborationCount" FROM corporate_creators c WHERE c.tenant_id=$1::text AND c.company_id=$2::text AND ($3::text IS NULL OR c.branch_id IS NULL OR c.branch_id=$3::text) AND ($4::text IS NULL OR c.status=$4::text) AND ($5::text IS NULL OR c.primary_platform=$5::text) AND ($6::text IS NULL OR c.display_name ILIKE '%'||$6||'%' OR c.handle ILIKE '%'||$6||'%') ORDER BY CASE WHEN c.status='ACTIVE' THEN 0 ELSE 1 END,c.updated_at DESC,c.id LIMIT $7`,tenantId,companyId,branchId,filters.status??null,filters.platform??null,filters.search?.trim()||null,filters.limit);
    return rows.map((row)=>this.normalizeCreator(row));
  }

  async create(input:CreateCreatorInput,actorUserId:string){
    const context=this.context();const branchId=input.branchId===undefined?context.branchId:input.branchId;if(branchId)await this.assertBranch(branchId);if(context.branchId&&branchId&&branchId!==context.branchId)throw new BadRequestException('Creator cannot be created outside the active branch.');
    const rows=await this.prisma.$queryRawUnsafe<Row[]>(`INSERT INTO corporate_creators(tenant_id,company_id,branch_id,display_name,legal_name,category,status,primary_platform,handle,profile_url,follower_count,engagement_rate,audience_profile,rate_card,contact_email,contact_phone,notes,metadata,created_by_user_id) VALUES($1::text,$2::text,$3::text,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15,$16,$17,$18::jsonb,$19::text) RETURNING id,branch_id AS "branchId",display_name AS "displayName",category,status,primary_platform AS "primaryPlatform",handle,follower_count AS "followerCount",engagement_rate AS "engagementRate",rate_card AS "rateCard",attributed_revenue AS "attributedRevenue"`,context.tenantId,context.companyId,branchId??null,input.displayName,input.legalName??null,input.category??null,input.status,input.primaryPlatform,input.handle,input.profileUrl??null,input.followerCount,input.engagementRate??null,JSON.stringify(input.audienceProfile),JSON.stringify(input.rateCard),input.contactEmail??null,input.contactPhone??null,input.notes??null,JSON.stringify(input.metadata),actorUserId);return this.normalizeCreator(rows[0]);
  }

  async listCollaborations(creatorId:string){const creator=await this.findScoped(creatorId);const {tenantId,companyId}=this.context();return this.prisma.$queryRawUnsafe<Row[]>(`SELECT cc.id,cc.creator_id AS "creatorId",cc.campaign_id AS "campaignId",cam.name AS "campaignName",cc.status,cc.fee_amount AS "feeAmount",cc.currency,cc.coupon_code AS "couponCode",cc.starts_at AS "startsAt",cc.ends_at AS "endsAt",cc.deliverables,cc.performance,cc.attributed_revenue AS "attributedRevenue",cc.notes,cc.created_at AS "createdAt" FROM corporate_creator_collaborations cc LEFT JOIN corporate_communication_campaigns cam ON cam.id=cc.campaign_id WHERE cc.creator_id=$1::text AND cc.tenant_id=$2::text AND cc.company_id=$3::text AND cc.branch_id IS NOT DISTINCT FROM $4::text ORDER BY cc.updated_at DESC,cc.id`,creatorId,tenantId,companyId,creator.branchId);}

  async createCollaboration(creatorId:string,input:CreateCreatorCollaborationInput,actorUserId:string){const creator=await this.findScoped(creatorId);const context=this.context();if(input.campaignId){const campaigns=await this.prisma.$queryRawUnsafe<Array<{id:string}>>(`SELECT id FROM corporate_communication_campaigns WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND ($4::text IS NULL OR branch_id IS NULL OR branch_id=$4::text) LIMIT 1`,input.campaignId,context.tenantId,context.companyId,creator.branchId);if(!campaigns.length)throw new BadRequestException('Creator collaboration campaign is outside the allowed scope.');}const rows=await this.prisma.$queryRawUnsafe<Row[]>(`INSERT INTO corporate_creator_collaborations(tenant_id,company_id,branch_id,creator_id,campaign_id,status,fee_amount,currency,coupon_code,starts_at,ends_at,deliverables,performance,notes,created_by_user_id) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6,$7,$8,$9,$10::timestamptz,$11::timestamptz,$12::jsonb,$13::jsonb,$14,$15::text) RETURNING id,creator_id AS "creatorId",campaign_id AS "campaignId",status,fee_amount AS "feeAmount",currency,coupon_code AS "couponCode",starts_at AS "startsAt",ends_at AS "endsAt",deliverables,performance,attributed_revenue AS "attributedRevenue",notes`,context.tenantId,context.companyId,creator.branchId,creatorId,input.campaignId??null,input.status,input.feeAmount,input.currency,input.couponCode??null,input.startsAt??null,input.endsAt??null,JSON.stringify(input.deliverables),JSON.stringify(input.performance),input.notes??null,actorUserId);await this.syncCollaborationFinanceHandoff(rows[0].id);return rows[0];}

  private async findScoped(id:string):Promise<Row>{const {tenantId,companyId,branchId}=this.context();const rows=await this.prisma.$queryRawUnsafe<Row[]>(`SELECT id,branch_id AS "branchId" FROM corporate_creators WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND ($4::text IS NULL OR branch_id IS NULL OR branch_id=$4::text) LIMIT 1`,id,tenantId,companyId,branchId);if(!rows.length)throw new NotFoundException('Creator not found.');return rows[0];}
}
