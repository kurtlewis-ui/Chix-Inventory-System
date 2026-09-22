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

/**
 * Handles the case where Prisma cannot reach/initialise the database at all
 * (server down, wrong DATABASE_URL, bad credentials, missing database). These
 * surface as a connection failure rather than a query error, so we return a
 * clear 503 instead of a generic "unexpected error".
 */
@Catch(Prisma.PrismaClientInitializationError)
export class PrismaInitExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('PrismaInitExceptionFilter');

  catch(exception: Prisma.PrismaClientInitializationError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    this.logger.error(`Database connection failed: ${exception.message}`);

    response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
      success: false,
      error: {
        code: 'DB_UNAVAILABLE',
        message:
          'Cannot connect to the database. Make sure PostgreSQL is running and ' +
          'DATABASE_URL in backend/.env is correct, then restart the server.',
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4(),
        path: request.url,
      },
    });
  }
}
