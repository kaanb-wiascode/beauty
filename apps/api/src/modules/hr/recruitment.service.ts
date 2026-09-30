import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { HrService } from './hr.service';

@Injectable()
export class RecruitmentService {
  constructor(private readonly prisma: PrismaService, private readonly ctx: TenantContext, private readonly hr: HrService) {}

  private scope() {
    const tenantId = this.ctx.getTenantId();
    const companyId = this.ctx.getCompanyId();
    if (!tenantId || !companyId) throw new BadRequestException('Tenant and company context are required.');
    return { tenantId, companyId };
  }

  async jobs() {
    const { tenantId, companyId } = this.scope();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,title,department_name AS "departmentName",position_name AS "positionName",employment_type AS "employmentType",location,status,published_at AS "publishedAt",closes_at AS "closesAt",created_at AS "createdAt" FROM hr_job_postings WHERE tenant_id=$1 AND company_id=$2 ORDER BY created_at DESC`,
      tenantId,
      companyId,
    );
  }

  async createJob(body: any, actorId?: string) {
    const { tenantId, companyId } = this.scope();
    const title = String(body.title ?? '').trim();
    if (!title) throw new BadRequestException('title is required.');
    const id = randomUUID();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO hr_job_postings(id,tenant_id,company_id,branch_id,title,department_name,position_name,employment_type,location,description,requirements,status,published_at,closes_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::timestamptz,$14::timestamptz,$15)`,
      id, tenantId, companyId, body.branchId ?? null, title, body.departmentName ?? null, body.positionName ?? null, body.employmentType ?? null, body.location ?? null, body.description ?? null, body.requirements ?? null, body.status ?? 'DRAFT', body.publishedAt ?? null, body.closesAt ?? null, actorId ?? null,
    );
    return { id };
  }

  async candidates() {
    const { tenantId, companyId } = this.scope();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,first_name AS "firstName",last_name AS "lastName",email,phone,city,source,current_title AS "currentTitle",cv_url AS "cvUrl",status,created_at AS "createdAt" FROM hr_candidates WHERE tenant_id=$1 AND company_id=$2 ORDER BY created_at DESC`,
      tenantId,
      companyId,
    );
  }

  async createCandidate(body: any) {
    const { tenantId, companyId } = this.scope();
    const firstName = String(body.firstName ?? '').trim();
    const lastName = String(body.lastName ?? '').trim();
    if (!firstName || !lastName) throw new BadRequestException('Candidate name is required.');
    const id = randomUUID();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO hr_candidates(id,tenant_id,company_id,first_name,last_name,email,phone,city,source,current_title,cv_url,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      id, tenantId, companyId, firstName, lastName, body.email ?? null, body.phone ?? null, body.city ?? null, body.source ?? null, body.currentTitle ?? null, body.cvUrl ?? null, body.notes ?? null,
    );
    return { id };
  }

  async applications() {
    const { tenantId, companyId } = this.scope();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT a.id,a.stage,a.rating,a.applied_at AS "appliedAt",j.title AS "jobTitle",c.first_name AS "firstName",c.last_name AS "lastName",c.email,c.phone FROM hr_job_applications a JOIN hr_job_postings j ON j.id=a.job_posting_id JOIN hr_candidates c ON c.id=a.candidate_id WHERE a.tenant_id=$1 AND a.company_id=$2 ORDER BY a.applied_at DESC`,
      tenantId,
      companyId,
    );
  }

  async createApplication(body: any) {
    const { tenantId, companyId } = this.scope();
    if (!body.jobPostingId || !body.candidateId) throw new BadRequestException('Job posting and candidate are required.');
    const id = randomUUID();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO hr_job_applications(id,tenant_id,company_id,branch_id,job_posting_id,candidate_id,stage,rating,owner_staff_id) SELECT $1,$2,$3,j.branch_id,j.id,c.id,$6,$7,$8 FROM hr_job_postings j,hr_candidates c WHERE j.id=$4 AND c.id=$5 AND j.tenant_id=$2 AND j.company_id=$3 AND c.tenant_id=$2 AND c.company_id=$3`,
      id, tenantId, companyId, body.jobPostingId, body.candidateId, body.stage ?? 'APPLIED', body.rating ?? null, body.ownerStaffId ?? null,
    );
    return { id };
  }

  async updateStage(id: string, body: any) {
    const { tenantId, companyId } = this.scope();
    const stage = String(body.stage ?? '').toUpperCase();
    if (!['APPLIED','SCREENING','INTERVIEW','OFFER','HIRED','REJECTED'].includes(stage)) throw new BadRequestException('Invalid application stage.');
    const changed = await this.prisma.$executeRawUnsafe(
      `UPDATE hr_job_applications SET stage=$1,rating=COALESCE($2,rating),rejected_at=CASE WHEN $1='REJECTED' THEN CURRENT_TIMESTAMP ELSE rejected_at END,rejection_reason=CASE WHEN $1='REJECTED' THEN $3 ELSE rejection_reason END,hired_at=CASE WHEN $1='HIRED' THEN CURRENT_TIMESTAMP ELSE hired_at END,updated_at=CURRENT_TIMESTAMP WHERE id=$4 AND tenant_id=$5 AND company_id=$6`,
      stage, body.rating ?? null, body.rejectionReason ?? null, id, tenantId, companyId,
    );
    if (!changed) throw new NotFoundException('Application not found.');
    return { id, stage };
  }

  async interviews() {
    const { tenantId, companyId } = this.scope();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT i.id,i.application_id AS "applicationId",i.interview_type AS "interviewType",i.scheduled_at AS "scheduledAt",i.location,i.score,i.status,c.first_name AS "firstName",c.last_name AS "lastName",j.title AS "jobTitle" FROM hr_interviews i JOIN hr_job_applications a ON a.id=i.application_id JOIN hr_candidates c ON c.id=a.candidate_id JOIN hr_job_postings j ON j.id=a.job_posting_id WHERE i.tenant_id=$1 AND i.company_id=$2 ORDER BY i.scheduled_at DESC`,
      tenantId,
      companyId,
    );
  }

  async createInterview(body: any) {
    const { tenantId, companyId } = this.scope();
    if (!body.applicationId || !body.scheduledAt) throw new BadRequestException('Application and interview time are required.');
    const id = randomUUID();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO hr_interviews(id,tenant_id,company_id,application_id,interview_type,scheduled_at,interviewer_staff_id,location,notes,status) VALUES($1,$2,$3,$4,$5,$6::timestamptz,$7,$8,$9,$10)`,
      id, tenantId, companyId, body.applicationId, body.interviewType ?? 'INTERVIEW', body.scheduledAt, body.interviewerStaffId ?? null, body.location ?? null, body.notes ?? null, 'SCHEDULED',
    );
    await this.prisma.$executeRawUnsafe(
      `UPDATE hr_job_applications SET stage='INTERVIEW',updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND stage IN('APPLIED','SCREENING')`,
      body.applicationId, tenantId, companyId,
    );
    return { id };
  }

  async offers() {
    const { tenantId, companyId } = this.scope();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT o.id,o.application_id AS "applicationId",o.offered_title AS "offeredTitle",o.gross_salary::text AS "grossSalary",o.currency,o.start_date::text AS "startDate",o.expires_at AS "expiresAt",o.status,c.first_name AS "firstName",c.last_name AS "lastName",j.title AS "jobTitle" FROM hr_job_offers o JOIN hr_job_applications a ON a.id=o.application_id JOIN hr_candidates c ON c.id=a.candidate_id JOIN hr_job_postings j ON j.id=a.job_posting_id WHERE o.tenant_id=$1 AND o.company_id=$2 ORDER BY o.created_at DESC`,
      tenantId,
      companyId,
    );
  }

  async createOffer(body: any) {
    const { tenantId, companyId } = this.scope();
    if (!body.applicationId) throw new BadRequestException('Application is required.');
    const id = randomUUID();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO hr_job_offers(id,tenant_id,company_id,application_id,offered_title,gross_salary,currency,start_date,expires_at,status,notes,sent_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8::date,$9::timestamptz,$10,$11,CASE WHEN $10='SENT' THEN CURRENT_TIMESTAMP ELSE NULL END)`,
      id, tenantId, companyId, body.applicationId, body.offeredTitle ?? null, body.grossSalary ?? null, body.currency ?? 'TRY', body.startDate ?? null, body.expiresAt ?? null, body.status ?? 'DRAFT', body.notes ?? null,
    );
    await this.prisma.$executeRawUnsafe(
      `UPDATE hr_job_applications SET stage='OFFER',updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND tenant_id=$2 AND company_id=$3`,
      body.applicationId, tenantId, companyId,
    );
    return { id };
  }

  async respondOffer(id: string, body: any) {
    const { tenantId, companyId } = this.scope();
    const status = String(body.status ?? '').toUpperCase();
    if (!['ACCEPTED','REJECTED'].includes(status)) throw new BadRequestException('Offer response is invalid.');
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `UPDATE hr_job_offers SET status=$1,responded_at=CURRENT_TIMESTAMP,notes=COALESCE($2,notes),updated_at=CURRENT_TIMESTAMP WHERE id=$3 AND tenant_id=$4 AND company_id=$5 RETURNING application_id AS "applicationId"`,
      status, body.note ?? null, id, tenantId, companyId,
    );
    const offer = rows[0];
    if (!offer) throw new NotFoundException('Offer not found.');
    await this.prisma.$executeRawUnsafe(
      `UPDATE hr_job_applications SET stage=$1,rejected_at=CASE WHEN $1='REJECTED' THEN CURRENT_TIMESTAMP ELSE rejected_at END,rejection_reason=CASE WHEN $1='REJECTED' THEN $2 ELSE rejection_reason END,updated_at=CURRENT_TIMESTAMP WHERE id=$3 AND tenant_id=$4 AND company_id=$5`,
      status === 'ACCEPTED' ? 'OFFER' : 'REJECTED', body.note ?? null, offer.applicationId, tenantId, companyId,
    );
    return { id, status, applicationId: offer.applicationId };
  }

  async hire(id: string, body: any) {
    const { tenantId, companyId } = this.scope();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT a.id,a.stage,c.first_name AS "firstName",c.last_name AS "lastName",c.email,c.phone,j.branch_id AS "branchId",j.department_name AS "department",COALESCE(j.position_name,j.title) AS "position",j.employment_type AS "employmentType",(SELECT o.start_date::text FROM hr_job_offers o WHERE o.application_id=a.id ORDER BY o.created_at DESC LIMIT 1) AS "offerStartDate",(SELECT o.gross_salary::text FROM hr_job_offers o WHERE o.application_id=a.id ORDER BY o.created_at DESC LIMIT 1) AS "offerGrossSalary" FROM hr_job_applications a JOIN hr_candidates c ON c.id=a.candidate_id JOIN hr_job_postings j ON j.id=a.job_posting_id WHERE a.id=$1 AND a.tenant_id=$2 AND a.company_id=$3 LIMIT 1`,
      id, tenantId, companyId,
    );
    const application = rows[0];
    if (!application) throw new NotFoundException('Application not found.');
    const employee = await this.hr.createEmployee({
      branchId: application.branchId ?? body.branchId,
      firstName: application.firstName,
      lastName: application.lastName,
      email: application.email ?? undefined,
      phone: application.phone ?? undefined,
      department: application.department ?? undefined,
      position: application.position ?? undefined,
      employmentType: application.employmentType ?? body.employmentType ?? undefined,
      hireDate: body.hireDate ?? application.offerStartDate ?? new Date().toISOString().slice(0, 10),
      grossSalary: body.grossSalary ?? application.offerGrossSalary ?? undefined,
      status: 'ACTIVE',
    });
    await this.prisma.$executeRawUnsafe(
      `UPDATE hr_job_applications SET stage='HIRED',hired_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND tenant_id=$2 AND company_id=$3`,
      id, tenantId, companyId,
    );
    return { applicationId: id, employeeId: employee.id, stage: 'HIRED' };
  }
}
