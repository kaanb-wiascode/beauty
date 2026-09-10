import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponseBody {
  statusCode?: number;
  message?: string | string[];
  error?: string;
  [key: string]: unknown;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = exception instanceof HttpException
      ? exception.getResponse()
      : undefined;

    const body = this.normalizeResponse(exceptionResponse);
    const requestId = request.requestId;

    response.status(status).json({
      success: false,
      statusCode: status,
      error: body.error ?? this.defaultError(status),
      message: body.message ?? 'Internal server error',
      ...(requestId ? { requestId } : {}),
    });
  }

  private normalizeResponse(value: string | object | undefined): ErrorResponseBody {
    if (typeof value === 'string') return { message: value };
    if (value && typeof value === 'object') return value as ErrorResponseBody;
    return {};
  }

  private defaultError(status: number): string {
    return status >= 500 ? 'Internal Server Error' : 'Request Error';
  }
}
