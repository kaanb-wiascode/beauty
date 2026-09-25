import { Injectable } from '@nestjs/common';
import { PayrollAccountingService } from './payroll-accounting.service';
import { PayrollCostCenterAccountingService } from './payroll-cost-center-accounting.service';

@Injectable()
export class PayrollPostingOrchestratorService {
  constructor(
    private readonly accounting: PayrollAccountingService,
    private readonly costCenters: PayrollCostCenterAccountingService,
  ) {}

  async post(periodId:string){
    const result=await this.accounting.post(periodId);
    const allocation=await this.costCenters.ensureSplit(periodId);
    return {...result,costCenterAllocation:allocation};
  }
}
