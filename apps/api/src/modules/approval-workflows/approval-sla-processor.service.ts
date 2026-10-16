import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { randomUUID } from 'node:crypto';

type DueRow={requestId:string;stepId:string;stepOrder:number;timeoutAction:'ESCALATE'|'AUTO_APPROVE'|'AUTO_REJECT'|'NOTIFY'};

@Injectable()
export class ApprovalSlaProcessorService implements OnModuleInit,OnModuleDestroy{
  private timer:ReturnType<typeof setInterval>|null=null;
  private running=false;
  constructor(private readonly prisma:PrismaService){}
  onModuleInit(){void this.processDue();this.timer=setInterval(()=>void this.processDue(),30_000);this.timer.unref?.();}
  onModuleDestroy(){if(this.timer)clearInterval(this.timer);this.timer=null;}

  async processDue(){
    if(this.running)return{processed:0,skipped:true};
    this.running=true;
    try{
      const due=await this.prisma.$queryRaw<DueRow[]>`SELECT r.id AS "requestId",s.id AS "stepId",s."stepOrder",s."timeoutAction" FROM approval_requests r JOIN approval_request_steps s ON s."requestId"=r.id AND s."stepOrder"=r."currentStepOrder" WHERE r.status='PENDING' AND s.status='PENDING' AND s."slaMinutes" IS NOT NULL AND s."startedAt" IS NOT NULL AND CURRENT_TIMESTAMP>=s."startedAt"+(s."slaMinutes"*INTERVAL '1 minute') AND NOT EXISTS(SELECT 1 FROM approval_request_actions a WHERE a."requestId"=r.id AND a."stepOrder"=s."stepOrder" AND a.action IN('ESCALATE','AUTO_APPROVE','AUTO_REJECT','NOTIFY')) ORDER BY s."startedAt" LIMIT 100`;
      let processed=0;
      for(const row of due){if(await this.processOne(row.requestId))processed+=1;}
      return{processed,scanned:due.length};
    }finally{this.running=false;}
  }

  private async processOne(requestId:string){
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<Array<{requestId:string;tenantId:string;companyId:string;stepId:string;stepOrder:number;timeoutAction:string}>>`SELECT r.id AS "requestId",r."tenantId",r."companyId",s.id AS "stepId",s."stepOrder",s."timeoutAction" FROM approval_requests r JOIN approval_request_steps s ON s."requestId"=r.id AND s."stepOrder"=r."currentStepOrder" WHERE r.id=${requestId} AND r.status='PENDING' AND s.status='PENDING' AND s."slaMinutes" IS NOT NULL AND s."startedAt" IS NOT NULL AND CURRENT_TIMESTAMP>=s."startedAt"+(s."slaMinutes"*INTERVAL '1 minute') AND NOT EXISTS(SELECT 1 FROM approval_request_actions a WHERE a."requestId"=r.id AND a."stepOrder"=s."stepOrder" AND a.action IN('ESCALATE','AUTO_APPROVE','AUTO_REJECT','NOTIFY')) FOR UPDATE OF r,s SKIP LOCKED`;
      const current=rows[0];if(!current)return false;
      const action=current.timeoutAction;
      if(action==='AUTO_REJECT'){
        await tx.$executeRaw`UPDATE approval_request_steps SET status='REJECTED',comment='SLA süresi dolduğu için sistem tarafından otomatik reddedildi.',"actedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE id=${current.stepId}`;
        await tx.$executeRaw`UPDATE approval_requests SET status='REJECTED',"completedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE id=${current.requestId}`;
        await this.insertAction(tx,current,'AUTO_REJECT','SLA süresi dolduğu için sistem tarafından otomatik reddedildi.');return true;
      }
      if(action==='AUTO_APPROVE'){
        await tx.$executeRaw`UPDATE approval_request_steps SET status='APPROVED',comment='SLA süresi dolduğu için sistem tarafından otomatik onaylandı.',"actedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE id=${current.stepId}`;
        const next=await tx.$queryRaw<Array<{id:string;stepOrder:number}>>`SELECT id,"stepOrder" FROM approval_request_steps WHERE "requestId"=${current.requestId} AND "stepOrder">${current.stepOrder} ORDER BY "stepOrder" LIMIT 1 FOR UPDATE`;
        if(next[0]){
          await tx.$executeRaw`UPDATE approval_request_steps SET status='PENDING',"startedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE id=${next[0].id}`;
          await tx.$executeRaw`UPDATE approval_requests SET "currentStepOrder"=${next[0].stepOrder},"stepStartedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE id=${current.requestId}`;
        }else{
          await tx.$executeRaw`UPDATE approval_requests SET status='APPROVED',"completedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE id=${current.requestId}`;
        }
        await this.insertAction(tx,current,'AUTO_APPROVE','SLA süresi dolduğu için sistem tarafından otomatik onaylandı.');return true;
      }
      if(action==='NOTIFY'){await this.insertAction(tx,current,'NOTIFY','Onay SLA süresi doldu. Karar beklenmeye devam ediyor.');return true;}
      await this.insertAction(tx,current,'ESCALATE','Onay SLA süresi doldu ve işlem tanımlı üst onaylayana aktarıldı.');return true;
    });
  }

  private async insertAction(tx:Prisma.TransactionClient,current:{requestId:string;tenantId:string;companyId:string;stepOrder:number},action:string,comment:string){
    await tx.$executeRaw`INSERT INTO approval_request_actions(id,"tenantId","companyId","requestId","stepOrder",action,"actorUserId","delegateToUserId",comment,"createdAt") VALUES(${randomUUID()},${current.tenantId},${current.companyId},${current.requestId},${current.stepOrder},${action},NULL,NULL,${comment},CURRENT_TIMESTAMP)`;
  }
}
