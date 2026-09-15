import { Module } from '@nestjs/common';

import { VisitCheckoutReadinessService } from './visit-checkout-readiness.service';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';

@Module({
  controllers: [VisitsController],
  providers: [VisitsService, VisitCheckoutReadinessService],
})
export class VisitsModule {}
