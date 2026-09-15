import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { randomUUID } from 'node:crypto';

@Injectable()
export class CrmLostReasonService {
  constructor(private readonly prisma:PrismaService,private readonly tenantContext:TenantContext){}
  private context(){return this.tenantContext.getContext();}

  async list(includeInactive=false){const c=this.context();return this.prisma.$queryRawUnsafe<Array<{id:string;code:string;label:string;description:string|null;isActive:boolean;isSystem:boolean;sortOrder:number}>>(`SELECT id,code,label,description,is_active AS "isActive",is_system AS "isSystem",sort_order AS "sortOrder" FROM crm_lost_reasons WHERE tenant_id=$1::text AND company_id=$2::text AND ($3::boolean OR is_active=TRUE) ORDER BY sort_order,label,id`,c.tenantId,c.companyId,includeInactive);}

  async create(input:{code:string;label:string;description?:string|null;sortOrder?:number}){const c=this.context();const id=randomUUID();const rows=await this.prisma.$queryRawUnsafe<any[]>(`INSERT INTO crm_lost_reasons(id,tenant_id,company_id,code,label,description,is_system,sort_order) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,FALSE,$7::int) RETURNING id,code,label,description,is_active AS "isActive",is_system AS "isSystem",sort_order AS "sortOrder"`,id,c.tenantId,c.companyId,input.code,input.label,input.description??null,input.sortOrder??0);return rows[0];}

  async setActive(id:string,isActive:boolean){const c=this.context();const rows=await this.prisma.$queryRawUnsafe<any[]>(`UPDATE crm_lost_reasons SET is_active=$4::boolean,updated_at=NOW() WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text RETURNING id,code,label,description,is_active AS "isActive",is_system AS "isSystem",sort_order AS "sortOrder"`,id,c.tenantId,c.companyId,isActive);if(!rows[0])throw new NotFoundException('CRM lost reason not found.');return rows[0];}

  async assertUsable(id:string){const c=this.context();const rows=await this.prisma.$queryRawUnsafe<Array<{id:string}>>(`SELECT id FROM crm_lost_reasons WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND is_active=TRUE LIMIT 1`,id,c.tenantId,c.companyId);if(!rows[0])throw new BadRequestException('Lost reason is invalid, inactive, or outside the active company.');return rows[0];}
}
