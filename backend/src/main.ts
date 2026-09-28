import { Logger } from '@nestjs/common';
import { createApp } from './create-app';
import { runMigrationsOnBoot } from './run-migrations';

/**
 * Traditional always-on server entry point (local dev, Docker, Render).
 *
 * The Vercel serverless deployment does NOT use this file — it uses
 * api/index.ts, which shares the same createApp() configuration but does not
 * listen on a port or run migrations at boot (migrations run in the Vercel
 * build step instead). See DEPLOYMENT-VERCEL.md.
 */
async function bootstrap() {
  // Apply pending DB migrations FIRST, resiliently (retries a cold/suspended
  // database, advisory lock disabled). Doing this in-app means it works
  // regardless of the host's start command. Throws (aborts boot) only if
  // migrations genuinely can't apply, so we never serve with a stale schema.
  await runMigrationsOnBoot();

  const app = await createApp();
  const logger = new Logger('Bootstrap');

  const port = process.env.PORT || 4000;
  await app.listen(port);

  logger.log(`🚀 Application is running on: http://localhost:${port}`);
  logger.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
}

bootstrap();
