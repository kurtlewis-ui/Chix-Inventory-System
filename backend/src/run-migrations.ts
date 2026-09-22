import { Logger } from '@nestjs/common';
import { spawnSync } from 'child_process';

/**
 * Run `prisma migrate deploy` from INSIDE the app at boot, resiliently.
 *
 * WHY THIS EXISTS
 * ---------------
 * On the free hosting tiers the Postgres database (Neon) auto-suspends when
 * idle. A deploy that runs `prisma migrate deploy` the instant the container
 * starts often hits, while the DB is still waking:
 *
 *   Error: P1002  "...was reached but timed out"
 *   Context: Timed out trying to acquire a postgres advisory lock
 *            (SELECT pg_advisory_lock(72707369)). Elapsed: 10000ms.
 *
 * Running migrations here — as the first thing the app does — means it works no
 * matter what start command the host uses (even the old
 * `npx prisma migrate deploy && ... && node dist/main.js`, because that final
 * `node dist/main.js` is what boots this app). We:
 *   - disable the migration advisory lock (single instance → no concurrent
 *     migrator to guard against; the lock's fixed 10s timeout is what fails on
 *     a cold DB), and
 *   - retry with backoff so a waking database simply succeeds.
 *
 * CONNECTION POOLING (Supabase)
 * ------------------------------
 * On Supabase the runtime app should connect via the TRANSACTION pooler
 * (port 6543), which scales to many concurrent clients — ideal for a
 * multi-branch deployment with lots of browser tabs polling. But the
 * transaction pooler does NOT support the session-level operations Prisma
 * migrations need (advisory locks, prepared statements, DDL in long
 * sessions), so `prisma migrate deploy` must run against a SESSION pooler /
 * direct connection (port 5432).
 *
 * To let the app do both, migrations honour an optional MIGRATE_DATABASE_URL:
 * if set, migrations run against THAT url while the rest of the app keeps
 * using DATABASE_URL (which can safely point at the 6543 transaction pooler).
 * If MIGRATE_DATABASE_URL is unset, migrations fall back to DATABASE_URL, so
 * existing single-URL setups keep working unchanged.
 *
 * Controlled by env:
 *   RUN_MIGRATIONS_ON_BOOT = "false" to skip entirely (default: run).
 *   MIGRATE_DATABASE_URL   = optional 5432 (session/direct) url used ONLY for
 *                            migrations + seed; defaults to DATABASE_URL.
 *   MIGRATE_MAX_ATTEMPTS   = number of tries (default 5).
 */
const BACKOFF_MS = [0, 8000, 15000, 25000, 40000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The connection string used for migrations + seed. Prefers MIGRATE_DATABASE_URL
 * (a 5432 session/direct connection that supports migration operations) and
 * falls back to DATABASE_URL so single-URL setups keep working. This is what
 * lets the runtime DATABASE_URL point at the 6543 transaction pooler.
 */
function migrationEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (process.env.MIGRATE_DATABASE_URL) {
    env.DATABASE_URL = process.env.MIGRATE_DATABASE_URL;
  }
  return env;
}

function attemptMigrate(): boolean {
  const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    shell: false,
    env: {
      ...migrationEnv(),
      // The advisory lock only prevents two concurrent migrators from racing.
      // A single Render instance has none, and the lock's non-configurable 10s
      // acquire timeout is exactly what fails on a cold Neon DB — so disable it.
      PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: '1',
    },
  });
  return result.status === 0;
}

/**
 * Ensure the bootstrap data (roles + the initial Admin account) exists. The
 * seed is idempotent (all upserts), so running it on every boot is safe. We
 * never let a seed failure block startup — the schema is already migrated and
 * the app can run; seeding only bootstraps the very first login.
 */
function runSeed() {
  const logger = new Logger('Migrations');
  const result = spawnSync('npx', ['prisma', 'db', 'seed'], {
    stdio: 'inherit',
    shell: false,
    env: migrationEnv(),
  });
  if (result.status === 0) {
    logger.log('Seed complete (bootstrap roles/admin ensured).');
  } else {
    logger.warn('Seed skipped or failed (non-fatal) — continuing startup.');
  }
}

/**
 * Applies pending migrations before the API starts accepting traffic.
 * Throws if migrations genuinely cannot be applied after all retries, so a
 * real (non-transient) migration failure is not silently ignored.
 */
export async function runMigrationsOnBoot(): Promise<void> {
  const logger = new Logger('Migrations');

  if (process.env.RUN_MIGRATIONS_ON_BOOT === 'false') {
    logger.log('RUN_MIGRATIONS_ON_BOOT=false — skipping in-app migrations.');
    return;
  }

  const maxAttempts = Number(process.env.MIGRATE_MAX_ATTEMPTS || 5);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      const wait = BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)];
      logger.warn(
        `Migration attempt ${attempt}/${maxAttempts} — waiting ${Math.round(
          wait / 1000,
        )}s for the database to wake…`,
      );
      await sleep(wait);
    } else {
      logger.log(`Applying database migrations (attempt ${attempt}/${maxAttempts})…`);
    }

    if (attemptMigrate()) {
      logger.log('Database migrations applied successfully.');
      runSeed();
      return;
    }

    logger.warn(
      `Migration attempt ${attempt} failed (likely a cold/suspended database).`,
    );
  }

  throw new Error(
    `Database migrations failed after ${maxAttempts} attempts. Refusing to start with an out-of-date schema.`,
  );
}
