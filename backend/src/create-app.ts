import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { json, urlencoded } from 'express';

// cookie-parser and helmet are CommonJS modules. Depending on the bundler's
// module-interop settings, `import * as x` / `import x from` can yield the
// module NAMESPACE object instead of the callable export — which breaks under
// Vercel's @vercel/node bundler with "TypeError: cookieParser is not a
// function". Loading them via require() and unwrapping a possible `.default`
// gives the actual callable in every environment (Nest build AND Vercel).
/* eslint-disable @typescript-eslint/no-var-requires */
const cookieParserImport = require('cookie-parser');
const cookieParser: (...args: any[]) => any =
  cookieParserImport.default ?? cookieParserImport;
const helmetImport = require('helmet');
const helmet: (...args: any[]) => any = helmetImport.default ?? helmetImport;
/* eslint-enable @typescript-eslint/no-var-requires */
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { PrismaInitExceptionFilter } from './common/filters/prisma-init-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

// Global safety net: JSON.stringify throws on BigInt values. We now have a
// BigInt column (StockMovement.seq); response paths deliberately don't emit it,
// but this guard guarantees that if any raw row carrying a BigInt is ever
// returned, it serializes as a string instead of crashing the request.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

/**
 * Build and fully configure the Nest application (middleware, pipes, filters,
 * interceptors, CORS, Swagger). This is shared by BOTH entry points so the
 * two run with identical configuration:
 *   - src/main.ts        — the traditional always-on server (local dev / Render)
 *   - api/index.ts       — the Vercel serverless handler
 *
 * NOTE: this deliberately does NOT call app.listen(). The caller decides:
 *   - main.ts calls app.listen(port)
 *   - the serverless handler calls app.init() and hands Express the requests
 *
 * It also does NOT run migrations. On an always-on server migrations run at
 * boot (see main.ts). On serverless there is no persistent boot, so migrations
 * run in the Vercel BUILD step instead (see the build command / DEPLOYMENT docs).
 */
export async function createApp(): Promise<INestApplication> {
  // Disable Nest's built-in body parser so we can register our own with a
  // larger limit (uploaded images are stored inline as base64 data URLs).
  const app = await NestFactory.create(AppModule, { bodyParser: false });

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

  // CORS — the exact frontend origin, with credentials so the refresh-token
  // cookie can be sent cross-site.
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

  return app;
}
