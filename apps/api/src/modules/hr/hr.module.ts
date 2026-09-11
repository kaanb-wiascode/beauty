import { Module } from '@nestjs/common';
import { HrController } from './hr.controller';
import { HrService } from './hr.service';
import { PayrollAccountingService } from './payroll-accounting.service';
import { PayrollPeriodService } from './payroll-period.service';

@Module({
  controllers: [HrController],
  providers: [HrService, PayrollAccountingService, PayrollPeriodService],
  exports: [HrService, PayrollAccountingService, PayrollPeriodService],
})
export class HrModule {}
