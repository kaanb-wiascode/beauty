import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class TrainingReminderService {
  constructor(private readonly prisma: PrismaService, private readonly tenant: TenantContext) {}

  private context(){return{tenantId:this.tenant.getTenantId(),companyId:this.tenant.getCompanyId(),branchId:this.tenant.getBranchId()};}

  async process(_actorUserId:string,limit=200){
    const c=this.context(),safeLimit=Math.min(Math.max(Math.trunc(limit||200),1),500);
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRawUnsafe<any[]>(
        `SELECT a.id,a.branch_id AS "branchId",a.staff_id AS "staffId",a.due_at AS "dueAt"
         FROM training_assignments a
         WHERE a.tenant_id=$1::text AND a.company_id=$2::text AND ($3::text IS NULL OR a.branch_id=$3::text)
           AND a.status IN ('ASSIGNED','IN_PROGRESS') AND a.staff_id IS NOT NULL AND a.due_at IS NOT NULL
           AND a.due_at < now()+interval '7 days'
         ORDER BY a.due_at,a.id FOR UPDATE SKIP LOCKED LIMIT $4`,
        c.tenantId,c.companyId,c.branchId,safeLimit,
      );
      let created=0;
      for(const row of rows){
        const due=new Date(row.dueAt);
        const now=new Date();
        const dueDay=Date.UTC(due.getUTCFullYear(),due.getUTCMonth(),due.getUTCDate());
        const nowDay=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());
        const days=Math.floor((dueDay-nowDay)/86400000);
        const type=days<0?'OVERDUE':days===0?'DUE_TODAY':'UPCOMING';
        const inserted=await tx.$queryRawUnsafe<any[]>(
          `INSERT INTO training_assignment_reminders(tenant_id,company_id,branch_id,assignment_id,staff_id,reminder_type,reminder_date,due_at)
           VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6,CURRENT_DATE,$7)
           ON CONFLICT(tenant_id,company_id,assignment_id,reminder_type,reminder_date) DO NOTHING
           RETURNING id`,
          c.tenantId,c.companyId,row.branchId,row.id,row.staffId,type,row.dueAt,
        );
        if(inserted.length)created+=1;
      }
      return{processed:rows.length,created};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }

  private async learner(userId:string){
    const c=this.context();
    const rows=await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT i.staff_id AS "staffId" FROM training_learner_identities i JOIN staff s ON s.id=i.staff_id
       WHERE i.tenant_id=$1::text AND i.company_id=$2::text AND i.user_id=$3::text
         AND ($4::text IS NULL OR s."branchId"=$4::text) LIMIT 1`,
      c.tenantId,c.companyId,userId,c.branchId,
    );
    if(!rows.length)throw new NotFoundException('Learner profile not found.');
    return rows[0];
  }

  async mine(userId:string){
    const c=this.context(),learner=await this.learner(userId);
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT r.id,r.assignment_id AS "assignmentId",r.reminder_type AS "reminderType",r.due_at AS "dueAt",r.created_at AS "createdAt",
              c.code AS "courseCode",c.title AS "courseTitle"
       FROM training_assignment_reminders r
       JOIN training_assignments a ON a.id=r.assignment_id
       JOIN training_courses c ON c.id=a.course_id
       WHERE r.tenant_id=$1::text AND r.company_id=$2::text AND r.staff_id=$3::text AND r.acknowledged_at IS NULL
         AND ($4::text IS NULL OR r.branch_id=$4::text) AND a.status IN ('ASSIGNED','IN_PROGRESS')
       ORDER BY CASE r.reminder_type WHEN 'OVERDUE' THEN 0 WHEN 'DUE_TODAY' THEN 1 ELSE 2 END,r.due_at,r.created_at DESC`,
      c.tenantId,c.companyId,learner.staffId,c.branchId,
    );
  }

  async acknowledge(userId:string,reminderId:string){
    const c=this.context(),learner=await this.learner(userId);
    const rows=await this.prisma.$queryRawUnsafe<any[]>(
      `UPDATE training_assignment_reminders SET acknowledged_at=COALESCE(acknowledged_at,now()),acknowledged_by_user_id=COALESCE(acknowledged_by_user_id,$5::text)
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND staff_id=$4::text
         AND ($6::text IS NULL OR branch_id=$6::text)
       RETURNING id,acknowledged_at AS "acknowledgedAt"`,
      reminderId,c.tenantId,c.companyId,learner.staffId,userId,c.branchId,
    );
    if(!rows.length)throw new NotFoundException('Training reminder not found.');
    return rows[0];
  }
}
