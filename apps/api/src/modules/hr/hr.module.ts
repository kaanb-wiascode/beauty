import { Module } from '@nestjs/common';
import { HrController } from './hr.controller';
import { HrService } from './hr.service';
import { PayrollAccountingService } from './payroll-accounting.service';
import { PayrollPeriodService } from './payroll-period.service';
import { PayrollSettlementService } from './payroll-settlement.service';
import { PayrollReportService } from './payroll-report.service';
import { PayrollCostCenterAccountingService } from './payroll-cost-center-accounting.service';
import { PayrollPostingOrchestratorService } from './payroll-posting-orchestrator.service';
import { PayrollReversalService } from './payroll-reversal.service';
import { PayrollDashboardService } from './payroll-dashboard.service';
import { PayrollPaymentReversalService } from './payroll-payment-reversal.service';
import { PayrollWorkInputService } from './payroll-work-input.service';
import { HrAnalyticsService } from './hr-analytics.service';

@Module({
  controllers: [HrController],
  providers: [
    HrService,
    PayrollAccountingService,
    PayrollPeriodService,
    PayrollSettlementService,
    PayrollReportService,
    PayrollCostCenterAccountingService,
    PayrollPostingOrchestratorService,
    PayrollReversalService,
    PayrollDashboardService,
    PayrollPaymentReversalService,
    PayrollWorkInputService,
    HrAnalyticsService,
  ],
  exports: [
    HrService,
    PayrollAccountingService,
    PayrollPeriodService,
    PayrollSettlementService,
    PayrollReportService,
    PayrollCostCenterAccountingService,
    PayrollPostingOrchestratorService,
    PayrollReversalService,
    PayrollDashboardService,
    PayrollPaymentReversalService,
    PayrollWorkInputService,
    HrAnalyticsService,
  ],
})
export class HrModule {}
