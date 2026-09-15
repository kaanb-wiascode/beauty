import { Module } from '@nestjs/common';

import { BusinessPolicyModule } from '../business-policies/business-policy.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [BusinessPolicyModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
