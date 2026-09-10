import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { FinancialIntegrationConnectionService } from './financial-integration-connection.service';

const callbackSchema = z.object({
  state: z.string().min(10),
  code: z.string().min(1),
});

@Controller('financial-integrations')
export class FinancialIntegrationCallbackController {
  constructor(private readonly connection: FinancialIntegrationConnectionService) {}

  @Get('callback')
  callback(@Query() query: unknown) {
    const parsed = callbackSchema.parse(query);
    return this.connection.callback(parsed.state, parsed.code);
  }
}
