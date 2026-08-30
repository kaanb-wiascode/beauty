import { Module } from "@nestjs/common";

import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";
import { CareEventsController } from "./care-events.controller";
import { CareEventsService } from "./care-events.service";

@Module({
  controllers: [
    CustomersController,
    CareEventsController,
  ],
  providers: [
    CustomersService,
    CareEventsService,
  ],
})
export class CustomersModule {}
