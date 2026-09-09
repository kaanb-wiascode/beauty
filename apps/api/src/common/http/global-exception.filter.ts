import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';

interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string | string[];
  timestamp: string;
  path: string;
  requestId: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const requestId = String(res.locals.requestId ?? req.header('x-request-id') ?? 'unknown');

    const response = this.toResponse(exception, req, requestId);
    const status = response.statusCode;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${req.method} ${req.originalUrl} ${status} requestId=${requestId}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(status).json(response);
  }

  private toResponse(
    exception: unknown,
    req: Request,
    requestId: string,
  ): ErrorResponse {
    const timestamp = new Date().toISOString();

    if (exception instanceof ZodError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: exception.issues.map((issue) =>
          issue.path.length > 0
            ? `${issue.path.join('.')}: ${issue.message}`
            : issue.message,
        ),
        timestamp,
        path: req.originalUrl,
        requestId,
      };
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : typeof exceptionResponse === 'object' && exceptionResponse !== null && 'message' in exceptionResponse
            ? (exceptionResponse as { message?: string | string[] }).message ?? exception.message
            : exception.message;

      return {
        statusCode,
        error: this.httpErrorName(statusCode),
        message,
        timestamp,
        path: req.originalUrl,
        requestId,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Internal server error',
      timestamp,
      path: req.originalUrl,
      requestId,
    };
  }

  private httpErrorName(status: number): string {
    return (
      HttpStatus[status] ??
      (status >= 500 ? 'Internal Server Error' : 'Http Error')
    );
  }
}
