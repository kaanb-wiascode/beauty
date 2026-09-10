import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppLoggerService } from './common/logging/app-logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(AppLoggerService));

  app.enableCors({
    origin: [
      'http://localhost:3001',
      'http://127.0.0.1:3001',
    ],
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
