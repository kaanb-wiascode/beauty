import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission, RequirePermissions } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TotalRewardsService } from './total-rewards.service';
@Controller('hr/rewards')
@UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
@RequirePermission('hr','read')
export class TotalRewardsController {
 constructor(private readonly rewards:TotalRewardsService){}
 @Get('employees/:id/total') total(@Param('id')id:string){return this.rewards.totalReward(id);}
 @Get('employees/:id/compensation') compensation(@Param('id')id:string){return this.rewards.compensation(id);}
 @Post('employees/:id/compensation') @RequirePermissions({resource:'hr',action:'manage'}) addCompensation(@Param('id')id:string,@Body()b:any){return this.rewards.addCompensation(id,b);}
 @Get('employees/:id/benefits') benefits(@Param('id')id:string){return this.rewards.benefits(id);}
 @Post('employees/:id/benefits') @RequirePermissions({resource:'hr',action:'manage'}) addBenefit(@Param('id')id:string,@Body()b:any){return this.rewards.addBenefit(id,b);}
 @Get('employees/:id/variable-earnings') earnings(@Param('id')id:string){return this.rewards.variableEarnings(id);}
 @Post('employees/:id/variable-earnings') @RequirePermissions({resource:'hr',action:'manage'}) addEarning(@Param('id')id:string,@Body()b:any){return this.rewards.addVariableEarning(id,b);}
 @Get('employees/:id/advances') advances(@Param('id')id:string){return this.rewards.advances(id);}
 @Post('employees/:id/advances') @RequirePermissions({resource:'hr',action:'manage'}) advance(@Param('id')id:string,@Body()b:any){return this.rewards.requestAdvance(id,b,b.requesterId);}
 @Get('employees/:id/expenses') expenses(@Param('id')id:string){return this.rewards.expenses(id);}
 @Post('employees/:id/expenses') @RequirePermissions({resource:'hr',action:'manage'}) expense(@Param('id')id:string,@Body()b:any){return this.rewards.submitExpense(id,b,b.requesterId);}
}
