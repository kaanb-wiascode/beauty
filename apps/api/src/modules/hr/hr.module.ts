import { Module } from '@nestjs/common';
import { HrController } from './hr.controller';
import { HrService } from './hr.service';
import { PayrollAccountingService } from './payroll-accounting.service';
import { PayrollPeriodService } from './payroll-period.service';
import { PayrollSettlementService } from './payroll-settlement.service';
import { PayrollReportService } from './payroll-report.service';

@Module({
  controllers: [HrController],
  providers: [HrService, PayrollAccountingService, PayrollPeriodService, PayrollSettlementService, PayrollReportService],
  exports: [HrService, PayrollAccountingService, PayrollPeriodService, PayrollSettlementService, PayrollReportService],
})
export class HrModule {}
