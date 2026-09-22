import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('PrismaExceptionFilter');

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = uuidv4();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'DATABASE_ERROR';
    let message = 'A database error occurred';

    switch (exception.code) {
      case 'P2002':
        // Unique constraint violation
        status = HttpStatus.CONFLICT;
        code = 'CONFLICT';
        const target = (exception.meta?.target as string[])?.join(', ') || 'field';
        message = `A record with this ${target} already exists`;
        break;
      case 'P2025':
        // Record not found
        status = HttpStatus.NOT_FOUND;
        code = 'NOT_FOUND';
        message = 'The requested record was not found';
        break;
      case 'P2003':
        // Foreign key constraint violation
        status = HttpStatus.BAD_REQUEST;
        code = 'FOREIGN_KEY_ERROR';
        message = 'Related record does not exist or cannot be modified';
        break;
      case 'P2014':
        // Required relation violation
        status = HttpStatus.BAD_REQUEST;
        code = 'RELATION_ERROR';
        message = 'The change would violate a required relation';
        break;
      case 'P2021':
      case 'P2022':
        // Table (P2021) or column (P2022) does not exist => schema is behind code.
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        code = 'SCHEMA_OUT_OF_DATE';
        message =
          'The database schema is out of date. Run pending migrations ' +
          '(`npx prisma migrate deploy` from the backend folder) and restart the server.';
        this.logger.error(
          `Schema out of date (${exception.code}): ${exception.message}`,
        );
        break;
      case 'P2024':
        status = HttpStatus.SERVICE_UNAVAILABLE;
        code = 'DB_TIMEOUT';
        message = 'The database is not responding. Please try again shortly.';
        break;
      default:
        this.logger.error(
          `Unhandled Prisma error ${exception.code}: ${exception.message}`,
        );
    }

    response.status(status).json({
      success: false,
      error: { code, message },
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
        path: request.url,
      },
    });
  }
}
