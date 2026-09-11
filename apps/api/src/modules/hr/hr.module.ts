import { Module } from '@nestjs/common';
import { HrController } from './hr.controller';
import { HrService } from './hr.service';
import { PayrollAccountingService } from './payroll-accounting.service';

@Module({
  controllers: [HrController],
  providers: [HrService, PayrollAccountingService],
  exports: [HrService, PayrollAccountingService],
})
export class HrModule {}
