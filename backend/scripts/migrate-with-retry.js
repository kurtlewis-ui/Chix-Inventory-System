#!/usr/bin/env node
/**
 * Resilient wrapper around `prisma migrate deploy`.
 *
 * WHY THIS EXISTS
 * ---------------
 * On the free hosting tiers the Postgres database (Neon) auto-suspends when
 * idle. When a Render deploy boots, it runs migrations *immediately* — but if
 * the database is still cold/waking, Prisma fails fast with:
 *
 *   Error: P1002  "...was reached but timed out"
 *   Context: Timed out trying to acquire a postgres advisory lock
 *            (SELECT pg_advisory_lock(72707369)). Elapsed: 10000ms.
 *
 * That aborts the whole deploy even though nothing is actually wrong — the DB
 * just needed a few seconds to wake up. This script retries `migrate deploy`
 * a few times with a growing backoff so a cold database no longer breaks the
 * deploy. If migrations genuinely can't apply, it still exits non-zero after
 * the final attempt so real failures are not hidden.
 */

const { spawnSync } = require('child_process');

const MAX_ATTEMPTS = Number(process.env.MIGRATE_MAX_ATTEMPTS || 5);
// Backoff (ms) before each retry — enough for a suspended Neon DB to wake.
const BACKOFF_MS = [0, 8000, 15000, 25000, 40000];

function sleep(ms) {
  if (ms <= 0) return;
  // Busy-wait-free blocking sleep for a CLI script.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function runMigrate() {
  // The advisory lock only exists to stop TWO migration runs from racing each
  // other. On Render this service runs a SINGLE instance and migrations run
  // sequentially at boot, so there is no concurrent migrator to guard against.
  // The lock's non-configurable 10s acquire timeout is exactly what fails on a
  // cold Neon database, so we disable it here. Prisma's official env var for
  // this is PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK. Combined with the retry below,
  // a waking database simply succeeds instead of aborting the deploy.
  const env = {
    ...process.env,
    PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: '1',
  };
  const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env,
    shell: false,
  });
  return result.status === 0;
}

(function main() {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      const wait = BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)];
      console.log(
        `\n[migrate-with-retry] attempt ${attempt}/${MAX_ATTEMPTS} — waiting ${Math.round(
          wait / 1000,
        )}s for the database to be ready...`,
      );
      sleep(wait);
    } else {
      console.log(`[migrate-with-retry] attempt ${attempt}/${MAX_ATTEMPTS}...`);
    }

    if (runMigrate()) {
      console.log('[migrate-with-retry] migrations applied successfully.');
      process.exit(0);
    }

    console.warn(
      `[migrate-with-retry] attempt ${attempt} failed (likely a cold/suspended database).`,
    );
  }

  console.error(
    `[migrate-with-retry] all ${MAX_ATTEMPTS} attempts failed. Aborting deploy so the failure is visible.`,
  );
  process.exit(1);
})();
