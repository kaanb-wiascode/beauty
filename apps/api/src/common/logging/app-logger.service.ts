import { Injectable, LoggerService } from '@nestjs/common';

@Injectable()
export class AppLoggerService implements LoggerService {
  private readonly logger = new (require('@nestjs/common').Logger)('BeautyERP');

  log(message: unknown, context?: string) {
    this.logger.log(this.stringify(message), context);
  }

  error(message: unknown, trace?: string, context?: string) {
    this.logger.error(this.stringify(message), trace, context);
  }

  warn(message: unknown, context?: string) {
    this.logger.warn(this.stringify(message), context);
  }

  debug(message: unknown, context?: string) {
    this.logger.debug(this.stringify(message), context);
  }

  verbose(message: unknown, context?: string) {
    this.logger.verbose(this.stringify(message), context);
  }

  private stringify(value: unknown): string {
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
}
