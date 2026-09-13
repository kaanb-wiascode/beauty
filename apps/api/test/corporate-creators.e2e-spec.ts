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

describe('Corporate creators (e2e)',()=>{
 let app:INestApplication;let prisma:PrismaService;let jwt:JwtService;
 beforeAll(async()=>{const m:TestingModule=await Test.createTestingModule({imports:[AppModule]}).compile();app=m.createNestApplication();app.useGlobalFilters(new PrismaExceptionFilter(),new ZodExceptionFilter());await app.init();prisma=m.get(PrismaService);jwt=m.get(JwtService);});
 afterAll(async()=>{await app.close();});
 it('governs creator profiles and collaborations by branch and permissions',async()=>{
  const suffix=randomUUID().replace(/-/g,'').slice(0,12);const tenant=await prisma.tenant.create({data:{name:`Creator ${suffix}`,slug:`creator-${suffix}`}});const company=await prisma.company.create({data:{tenantId:tenant.id,name:`Creator Co ${suffix}`,slug:`creator-co-${suffix}`}});const branchA=await prisma.branch.create({data:{companyId:company.id,name:'A',code:`CA-${suffix.slice(0,6)}`}});const branchB=await prisma.branch.create({data:{companyId:company.id,name:'B',code:`CB-${suffix.slice(0,6)}`}});
  const manager=await actor('manager',['read','manage'],branchA.id);const reader=await actor('reader',['read'],branchA.id);const managerB=await actor('manager-b',['read','manage'],branchB.id);
  const creator=await request(app.getHttpServer()).post('/corporate-communications/creators').set('Authorization',manager).send({displayName:`Creator ${suffix}`,category:'Beauty',branchId:branchA.id,primaryPlatform:'INSTAGRAM',handle:`creator_${suffix}`,followerCount:125000,engagementRate:4.8,audienceProfile:{city:'Istanbul',femalePercent:82},rateCard:{reel:35000,story:12000},attributedRevenue:999999}).expect(201);
  expect(Number(creator.body.attributedRevenue)).toBe(0);
  const list=await request(app.getHttpServer()).get('/corporate-communications/creators?limit=20').set('Authorization',reader).expect(200);expect(list.body.some((x:{id:string})=>x.id===creator.body.id)).toBe(true);
  await request(app.getHttpServer()).post('/corporate-communications/creators').set('Authorization',reader).send({displayName:'Denied Creator',primaryPlatform:'TIKTOK',handle:`denied_${suffix}`}).expect(403);
  const collaboration=await request(app.getHttpServer()).post(`/corporate-communications/creators/${creator.body.id}/collaborations`).set('Authorization',manager).send({status:'CONTRACTED',feeAmount:50000,currency:'TRY',couponCode:`BEAUTY${suffix.slice(0,4)}`,deliverables:[{platform:'INSTAGRAM',format:'REEL',quantity:2},{platform:'INSTAGRAM',format:'STORY',quantity:4}],performance:{},attributedRevenue:888888}).expect(201);
  expect(Number(collaboration.body.attributedRevenue)).toBe(0);expect(collaboration.body.deliverables).toHaveLength(2);
  const collabs=await request(app.getHttpServer()).get(`/corporate-communications/creators/${creator.body.id}/collaborations`).set('Authorization',reader).expect(200);expect(collabs.body).toHaveLength(1);
  const branchBList=await request(app.getHttpServer()).get('/corporate-communications/creators?limit=20').set('Authorization',managerB).expect(200);expect(branchBList.body.some((x:{id:string})=>x.id===creator.body.id)).toBe(false);
  await request(app.getHttpServer()).get(`/corporate-communications/creators/${creator.body.id}/collaborations`).set('Authorization',managerB).expect(404);

  async function actor(label:string,actions:readonly string[],branchId:string){const role=await prisma.role.create({data:{tenantId:tenant.id,companyId:company.id,name:`Creator ${label}`,slug:`creator-${label}-${suffix}`,scope:'BRANCH'}});for(const action of actions){const p=await prisma.permission.upsert({where:{resource_action:{resource:'communications',action}},update:{},create:{resource:'communications',action,description:`communications ${action}`}});await prisma.rolePermission.create({data:{roleId:role.id,permissionId:p.id}});}const user=await prisma.user.create({data:{email:`creator-${label}-${suffix}@example.test`,passwordHash:'not-used',firstName:'Creator',lastName:label}});const membership=await prisma.membership.create({data:{userId:user.id,tenantId:tenant.id,companyId:company.id,roleId:role.id}});await prisma.membershipBranchAccess.create({data:{membershipId:membership.id,branchId}});return `Bearer ${jwt.sign({sub:user.id,tenantId:tenant.id,membershipId:membership.id,roleId:role.id,companyId:company.id,branchId,roleScope:'BRANCH'})}`;}
 });
});
