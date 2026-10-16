import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class FinancialIntegrationTelemetryService {
  private readonly logger = new Logger('FinancialIntegrations');

  info(event: string, fields: Record<string, unknown> = {}) {
    this.logger.log(JSON.stringify({
      domain: 'financial_integrations',
      event,
      level: 'info',
      at: new Date().toISOString(),
      ...fields,
    }));
  }

  error(event: string, error: unknown, fields: Record<string, unknown> = {}) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    this.logger.error(JSON.stringify({
      domain: 'financial_integrations',
      event,
      level: 'error',
      at: new Date().toISOString(),
      error: message.slice(0, 1000),
      ...fields,
    }));
  }
}
