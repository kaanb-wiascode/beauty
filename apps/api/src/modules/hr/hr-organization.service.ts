import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { randomUUID } from 'node:crypto';

@Injectable()
export class HrOrganizationService {
  constructor(private readonly prisma: PrismaService, private readonly tenantContext: TenantContext) {}

  private scope() {
    const tenantId=this.tenantContext.getTenantId();
    const companyId=this.tenantContext.getCompanyId();
    const branchId=this.tenantContext.getBranchId();
    if(!tenantId) throw new BadRequestException('Tenant context is required.');
    return {tenantId,companyId,branchId};
  }
  private text(v:unknown,name:string){const s=String(v??'').trim();if(!s)throw new BadRequestException(`${name} is required.`);return s;}

  async structure(){
    const {tenantId,companyId}=this.scope();
    const companyFilter=companyId?' AND d.company_id=$2':'';
    const args=companyId?[tenantId,companyId]:[tenantId];
    const departments=await this.prisma.$queryRawUnsafe<any[]>(`SELECT d.* FROM hr_departments d WHERE d.tenant_id=$1${companyFilter} ORDER BY d.name`,...args);
    const teams=await this.prisma.$queryRawUnsafe<any[]>(`SELECT t.* FROM hr_teams t JOIN hr_departments d ON d.id=t.department_id WHERE t.tenant_id=$1${companyId?' AND d.company_id=$2':''} ORDER BY t.name`,...args);
    const positions=await this.prisma.$queryRawUnsafe<any[]>(`SELECT p.* FROM hr_positions p WHERE p.tenant_id=$1${companyId?' AND p.company_id=$2':''} ORDER BY p.name`,...args);
    return {departments,teams,positions};
  }

  async createDepartment(b:any){
    const {tenantId,companyId}=this.scope(); const target=b.companyId??companyId;
    if(!target)throw new BadRequestException('companyId is required.');
    const company=await this.prisma.company.findFirst({where:{id:target,tenantId},select:{id:true}});if(!company)throw new BadRequestException('Company is not available in this tenant.');
    const id=randomUUID();
    return (await this.prisma.$queryRawUnsafe<any[]>(`INSERT INTO hr_departments(id,tenant_id,company_id,code,name,status) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,id,tenantId,target,this.text(b.code,'code'),this.text(b.name,'name'),b.status??'ACTIVE'))[0];
  }

  async createTeam(b:any){
    const {tenantId}=this.scope(); const departmentId=this.text(b.departmentId,'departmentId');
    const dep=(await this.prisma.$queryRawUnsafe<any[]>(`SELECT id FROM hr_departments WHERE id=$1 AND tenant_id=$2 LIMIT 1`,departmentId,tenantId))[0];if(!dep)throw new BadRequestException('Department is not available in this tenant.');
    return (await this.prisma.$queryRawUnsafe<any[]>(`INSERT INTO hr_teams(id,tenant_id,department_id,code,name,status) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,randomUUID(),tenantId,departmentId,this.text(b.code,'code'),this.text(b.name,'name'),b.status??'ACTIVE'))[0];
  }

  async createPosition(b:any){
    const {tenantId,companyId}=this.scope();const target=b.companyId??companyId;if(!target)throw new BadRequestException('companyId is required.');
    const company=await this.prisma.company.findFirst({where:{id:target,tenantId},select:{id:true}});if(!company)throw new BadRequestException('Company is not available in this tenant.');
    if(b.departmentId){const dep=(await this.prisma.$queryRawUnsafe<any[]>(`SELECT id FROM hr_departments WHERE id=$1 AND tenant_id=$2 AND company_id=$3 LIMIT 1`,b.departmentId,tenantId,target))[0];if(!dep)throw new BadRequestException('Department is not available in this company.');}
    if(b.parentPositionId){const parent=(await this.prisma.$queryRawUnsafe<any[]>(`SELECT id FROM hr_positions WHERE id=$1 AND tenant_id=$2 AND company_id=$3 LIMIT 1`,b.parentPositionId,tenantId,target))[0];if(!parent)throw new BadRequestException('Parent position is not available in this company.');}
    return (await this.prisma.$queryRawUnsafe<any[]>(`INSERT INTO hr_positions(id,tenant_id,company_id,department_id,parent_position_id,code,name,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,randomUUID(),tenantId,target,b.departmentId??null,b.parentPositionId??null,this.text(b.code,'code'),this.text(b.name,'name'),b.status??'ACTIVE'))[0];
  }

  async employeeHistory(staffId:string){
    const {tenantId,branchId}=this.scope();
    return this.prisma.$queryRawUnsafe<any[]>(`SELECT a.*,d.name AS "departmentName",t.name AS "teamName",p.name AS "positionName",m."firstName" AS "managerFirstName",m."lastName" AS "managerLastName" FROM hr_employee_assignments a LEFT JOIN hr_departments d ON d.id=a.department_id LEFT JOIN hr_teams t ON t.id=a.team_id LEFT JOIN hr_positions p ON p.id=a.position_id LEFT JOIN staff m ON m.id=a.manager_staff_id WHERE a.tenant_id=$1 AND a.staff_id=$2${branchId?' AND a.branch_id=$3':''} ORDER BY a.effective_from DESC,a.created_at DESC`,...(branchId?[tenantId,staffId,branchId]:[tenantId,staffId]));
  }

  async assign(staffId:string,b:any){
    const {tenantId,branchId}=this.scope();
    const staff=await this.prisma.staff.findFirst({where:{id:staffId,tenantId,...(branchId?{branchId}:{})},select:{id:true,branchId:true,branch:{select:{companyId:true}}}});if(!staff)throw new NotFoundException('Staff not found');
    const targetBranchId=b.branchId??staff.branchId;
    const branch=await this.prisma.branch.findFirst({where:{id:targetBranchId,company:{tenantId}},select:{id:true,companyId:true}});if(!branch)throw new BadRequestException('Branch is not available in this tenant.');
    if(b.departmentId){const d=(await this.prisma.$queryRawUnsafe<any[]>(`SELECT id FROM hr_departments WHERE id=$1 AND tenant_id=$2 AND company_id=$3 LIMIT 1`,b.departmentId,tenantId,branch.companyId))[0];if(!d)throw new BadRequestException('Department is not available in the target company.');}
    if(b.teamId){const t=(await this.prisma.$queryRawUnsafe<any[]>(`SELECT t.id FROM hr_teams t JOIN hr_departments d ON d.id=t.department_id WHERE t.id=$1 AND t.tenant_id=$2 AND d.company_id=$3 LIMIT 1`,b.teamId,tenantId,branch.companyId))[0];if(!t)throw new BadRequestException('Team is not available in the target company.');}
    if(b.positionId){const p=(await this.prisma.$queryRawUnsafe<any[]>(`SELECT id FROM hr_positions WHERE id=$1 AND tenant_id=$2 AND company_id=$3 LIMIT 1`,b.positionId,tenantId,branch.companyId))[0];if(!p)throw new BadRequestException('Position is not available in the target company.');}
    if(b.managerStaffId===staffId)throw new BadRequestException('An employee cannot be their own manager.');
    if(b.managerStaffId){const m=await this.prisma.staff.findFirst({where:{id:b.managerStaffId,tenantId,status:'ACTIVE'},select:{id:true}});if(!m)throw new BadRequestException('Manager is not an active employee in this tenant.');}
    const effectiveFrom=b.effectiveFrom?new Date(b.effectiveFrom):new Date();if(Number.isNaN(effectiveFrom.getTime()))throw new BadRequestException('effectiveFrom must be a valid date.');const date=effectiveFrom.toISOString().slice(0,10);
    return this.prisma.$transaction(async tx=>{
      await tx.$executeRawUnsafe(`UPDATE hr_employee_assignments SET effective_to=($1::date - INTERVAL '1 day')::date,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$2 AND staff_id=$3 AND effective_to IS NULL AND effective_from < $1::date`,date,tenantId,staffId);
      await tx.$executeRawUnsafe(`DELETE FROM hr_employee_assignments WHERE tenant_id=$1 AND staff_id=$2 AND effective_to IS NULL AND effective_from >= $3::date`,tenantId,staffId,date);
      const rows=await tx.$queryRawUnsafe<any[]>(`INSERT INTO hr_employee_assignments(id,tenant_id,company_id,branch_id,staff_id,department_id,team_id,position_id,manager_staff_id,effective_from,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11) RETURNING *`,randomUUID(),tenantId,branch.companyId,targetBranchId,staffId,b.departmentId??null,b.teamId??null,b.positionId??null,b.managerStaffId??null,date,b.reason??'ORGANIZATION_CHANGE');
      if(targetBranchId!==staff.branchId){await tx.staff.update({where:{id:staffId},data:{branchId:targetBranchId}});await tx.$executeRawUnsafe(`UPDATE employee_master_records SET branch_id=$1,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$2 AND staff_id=$3`,targetBranchId,tenantId,staffId);}
      return rows[0];
    });
  }
}
