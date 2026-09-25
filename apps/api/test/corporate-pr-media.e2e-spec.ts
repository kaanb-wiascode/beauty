import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@beauty-erp/database';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from './../src/app.module';
import { PrismaExceptionFilter } from './../src/common/database/prisma-exception.filter';
import { ZodExceptionFilter } from './../src/common/validation/zod-exception.filter';

jest.setTimeout(60_000);

describe('Corporate PR media (e2e)',()=>{
 let app:INestApplication;let prisma:PrismaService;let jwt:JwtService;
 beforeAll(async()=>{const m:TestingModule=await Test.createTestingModule({imports:[AppModule]}).compile();app=m.createNestApplication();app.useGlobalFilters(new PrismaExceptionFilter(),new ZodExceptionFilter());await app.init();prisma=m.get(PrismaService);jwt=m.get(JwtService);});
 afterAll(async()=>{await app.close();});
 it('governs PR activities and synchronizes sponsorship cost into finance',async()=>{
  const suffix=randomUUID().replace(/-/g,'').slice(0,12);const tenant=await prisma.tenant.create({data:{name:`PR ${suffix}`,slug:`pr-${suffix}`}});const company=await prisma.company.create({data:{tenantId:tenant.id,name:`PR Co ${suffix}`,slug:`pr-co-${suffix}`}});const branchA=await prisma.branch.create({data:{companyId:company.id,name:'A',code:`PA-${suffix.slice(0,6)}`}});const branchB=await prisma.branch.create({data:{companyId:company.id,name:'B',code:`PB-${suffix.slice(0,6)}`}});
  const manager=await actor('manager',['read','manage'],branchA.id);const reader=await actor('reader',['read'],branchA.id);const managerB=await actor('manager-b',['read','manage'],branchB.id);
  const created=await request(app.getHttpServer()).post('/corporate-communications/pr-media').set('Authorization',manager).send({activityType:'SPONSORSHIP',title:`Beauty Summit ${suffix}`,branchId:branchA.id,outletName:'Beauty Media',costAmount:80000,currency:'TRY',estimatedReach:1500000,actualReach:0,estimatedMediaValue:240000,objective:'Brand awareness',keyMessage:'Premium beauty experience',attributedRevenue:999999}).expect(201);
  expect(created.body.estimatedReach).toBe(1500000);expect(Number(created.body.attributedRevenue)).toBe(0);
  const financeRows=await prisma.$queryRawUnsafe<Array<{amount:unknown;accountCode:string;status:string;category:string}>>(`SELECT amount,expense_account_code AS "accountCode",status,category FROM corporate_marketing_expenses WHERE tenant_id=$1::text AND company_id=$2::text AND source_type='PR_MEDIA' AND source_id=$3::text`,tenant.id,company.id,created.body.id);expect(financeRows).toHaveLength(1);expect(Number(financeRows[0].amount)).toBe(80000);expect(financeRows[0].accountCode).toBe('760.06');expect(financeRows[0].category).toBe('SPONSORSHIP');expect(financeRows[0].status).toBe('PENDING_FINANCE');
  const list=await request(app.getHttpServer()).get('/corporate-communications/pr-media?limit=20').set('Authorization',reader).expect(200);expect(list.body.some((x:{id:string})=>x.id===created.body.id)).toBe(true);expect(list.body.find((x:{id:string})=>x.id===created.body.id).estimatedReach).toBe(1500000);
  await request(app.getHttpServer()).post('/corporate-communications/pr-media').set('Authorization',reader).send({activityType:'INTERVIEW',title:'Denied'}).expect(403);
  const updated=await request(app.getHttpServer()).patch(`/corporate-communications/pr-media/${created.body.id}`).set('Authorization',manager).send({status:'COMPLETED',actualReach:1750000,estimatedMediaValue:300000,attributedRevenue:123456}).expect(200);expect(updated.body.status).toBe('COMPLETED');expect(updated.body.actualReach).toBe(1750000);expect(Number(updated.body.attributedRevenue)).toBe(0);
  const branchBList=await request(app.getHttpServer()).get('/corporate-communications/pr-media?limit=20').set('Authorization',managerB).expect(200);expect(branchBList.body.some((x:{id:string})=>x.id===created.body.id)).toBe(false);
  await request(app.getHttpServer()).patch(`/corporate-communications/pr-media/${created.body.id}`).set('Authorization',managerB).send({status:'CANCELLED'}).expect(404);
  await request(app.getHttpServer()).patch(`/corporate-communications/pr-media/${created.body.id}`).set('Authorization',manager).send({status:'CANCELLED'}).expect(200);
  const cancelled=await prisma.$queryRawUnsafe<Array<{status:string}>>(`SELECT status FROM corporate_marketing_expenses WHERE source_type='PR_MEDIA' AND source_id=$1::text LIMIT 1`,created.body.id);expect(cancelled[0].status).toBe('CANCELLED');
  async function actor(label:string,actions:readonly string[],branchId:string){const role=await prisma.role.create({data:{tenantId:tenant.id,companyId:company.id,name:`PR ${label}`,slug:`pr-${label}-${suffix}`,scope:'BRANCH'}});for(const action of actions){const p=await prisma.permission.upsert({where:{resource_action:{resource:'communications',action}},update:{},create:{resource:'communications',action,description:`communications ${action}`}});await prisma.rolePermission.create({data:{roleId:role.id,permissionId:p.id}});}const user=await prisma.user.create({data:{email:`pr-${label}-${suffix}@example.test`,passwordHash:'not-used',firstName:'PR',lastName:label}});const membership=await prisma.membership.create({data:{userId:user.id,tenantId:tenant.id,companyId:company.id,roleId:role.id}});await prisma.membershipBranchAccess.create({data:{membershipId:membership.id,branchId}});return `Bearer ${jwt.sign({sub:user.id,tenantId:tenant.id,membershipId:membership.id,roleId:role.id,companyId:company.id,branchId,roleScope:'BRANCH'})}`;}
 });
});
