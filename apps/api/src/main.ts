import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/http/global-exception.filter';
import { requestIdMiddleware } from './common/http/request-id.middleware';
import { RequestLoggingMiddleware } from './common/http/request-logging.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const nodeEnv = config.get<string>('NODE_ENV', 'development');

  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.use(requestIdMiddleware);
  const requestLoggingMiddleware = new RequestLoggingMiddleware();
  app.use(requestLoggingMiddleware.use.bind(requestLoggingMiddleware));
  app.useGlobalFilters(new GlobalExceptionFilter());

  app.use((_request: unknown, response: { setHeader: (name: string, value: string) => void }, next: () => void) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (nodeEnv === 'production') {
      response.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains',
      );
    }
    next();
  });

  const corsOrigins = config
    .get<string>('CORS_ORIGINS', '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  await app.listen(config.get<number>('PORT', 3000));
}
void bootstrap();
