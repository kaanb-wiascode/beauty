import { Module } from "@nestjs/common";

import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";
import { CustomerReportingService } from "./customer-reporting.service";
import { CareEventsController } from "./care-events.controller";
import { CareEventsService } from "./care-events.service";

@Module({
  controllers: [
    CustomersController,
    CareEventsController,
  ],
  providers: [
    CustomersService,
    CustomerReportingService,
    CareEventsService,
  ],
  exports: [CustomerReportingService],
})
export class CustomersModule {}
