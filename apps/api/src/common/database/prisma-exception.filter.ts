import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@beauty-erp/database';

type DatabaseRequestError =
  | Prisma.PrismaClientKnownRequestError
  | Prisma.PrismaClientUnknownRequestError;

@Catch(
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientUnknownRequestError,
)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: DatabaseRequestError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<{
      status: (code: number) => {
        json: (body: unknown) => unknown;
      };
    }>();

    const meta =
      exception instanceof Prisma.PrismaClientKnownRequestError
        ? exception.meta
        : undefined;
    const databaseContext = `${exception.message} ${JSON.stringify(meta ?? {})}`;

    if (databaseContext.includes('TENANT_QUOTA_EXCEEDED')) {
      const key = databaseContext.match(
        /entitlementKey(?:\\?"|')?\s*:\s*(?:\\?"|')([^"'\\]+)/,
      )?.[1];
      const limit = databaseContext.match(
        /(?:\\?"|')?limit(?:\\?"|')?\s*:\s*(\d+)/,
      )?.[1];
      const current = databaseContext.match(
        /(?:\\?"|')?current(?:\\?"|')?\s*:\s*(\d+)/,
      )?.[1];

      return response.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code: 'TENANT_QUOTA_EXCEEDED',
        message: key
          ? `Tenant quota exceeded for ${key}`
          : 'Tenant quota exceeded.',
        ...(key ? { entitlementKey: key } : {}),
        ...(limit ? { limit: Number(limit) } : {}),
        ...(current ? { current: Number(current) } : {}),
      });
    }

    if (
      exception instanceof Prisma.PrismaClientKnownRequestError &&
      exception.code === 'P2002'
    ) {
      return response.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        message: 'A record with the same unique value already exists.',
      });
    }

    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'A database operation failed.',
    });
  }
}
