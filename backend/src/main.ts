import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { PrismaInitExceptionFilter } from './common/filters/prisma-init-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { runMigrationsOnBoot } from './run-migrations';

// Global safety net: JSON.stringify throws on BigInt values. We now have a
// BigInt column (StockMovement.seq); response paths deliberately don't emit it,
// but this guard guarantees that if any raw row carrying a BigInt is ever
// returned, it serializes as a string instead of crashing the request.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  // Apply pending DB migrations FIRST, resiliently (retries a cold/suspended
  // Neon database, advisory lock disabled). Doing this in-app means it works
  // regardless of the host's start command. Throws (aborts boot) only if
  // migrations genuinely can't apply, so we never serve with a stale schema.
  await runMigrationsOnBoot();

  // Disable Nest's built-in body parser so we can register our own with a
  // larger limit (uploaded images are stored inline as base64 data URLs).
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const logger = new Logger('Bootstrap');

  // Body parsers with a generous limit so base64 image data URLs fit.
  // (Express defaults to 100kb, which is too small for inline images and
  // surfaces as a confusing "An unexpected error occurred".)
  const bodyLimit = process.env.BODY_LIMIT || '15mb';
  app.use(json({ limit: bodyLimit }));
  app.use(urlencoded({ extended: true, limit: bodyLimit }));

  // Security headers
  app.use(helmet());

  // Cookie parser (required for HTTP-only refresh token cookies)
  app.use(cookieParser());

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });

  // Global prefix (health/version stay at the root for easy probing)
  app.setGlobalPrefix(process.env.API_PREFIX || 'api/v1', {
    exclude: ['health', 'version'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global exception filters (order matters: specific first, then catch-all)
  app.useGlobalFilters(
    new AllExceptionsFilter(),
    new PrismaExceptionFilter(),
    new PrismaInitExceptionFilter(),
  );

  // Global interceptors
  app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor());

  // Swagger API documentation (disabled in production)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Vape Shop Management API')
      .setDescription('Complete API for vape shop inventory and sales management')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('auth', 'Authentication endpoints')
      .addTag('users', 'User management')
      .addTag('products', 'Product management')
      .addTag('inventory', 'Inventory management')
      .addTag('sales', 'Sales management')
      .addTag('reports', 'Reporting and analytics')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT || 4000;
  await app.listen(port);

  logger.log(`🚀 Application is running on: http://localhost:${port}`);
  logger.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
}

bootstrap();
