/**
 * Business-day date helpers for the shop's Philippine operating calendar.
 *
 * The shop's business day runs midnight-to-midnight Philippine time
 * (12:00 AM to 12:00 AM, UTC+8, no daylight saving). So each business day
 * matches the ordinary PH calendar date: a sale made at, e.g., Tuesday
 * 1:30 AM PH belongs to TUESDAY.
 *
 * All functions work regardless of the server's own timezone by doing the
 * math in a "PH-shifted" clock and converting back to real UTC instants.
 */

// Philippine Standard Time is a fixed UTC+8 (no DST).
export const PH_OFFSET_MS = 8 * 60 * 60 * 1000;

// The business day starts at 12:00 AM (midnight) PH time.
export const BUSINESS_DAY_START_HOUR = 0;
const BUSINESS_DAY_START_MS = BUSINESS_DAY_START_HOUR * 60 * 60 * 1000;

/**
 * Returns the current moment expressed on a "PH business clock": real PH time
 * shifted back by BUSINESS_DAY_START_HOUR hours (now 0, so it equals real PH
 * time). On this clock, the calendar date is exactly the business day the
 * moment belongs to, and midnight on this clock is 12 AM PH.
 * Returned as a Date whose UTC getters read the shifted PH wall-clock.
 */
function phBusinessClock(at: Date = new Date()): Date {
  return new Date(at.getTime() + PH_OFFSET_MS - BUSINESS_DAY_START_MS);
}

/**
 * Converts a PH business-clock wall-clock time (given as UTC ms) back into the
 * real UTC instant it represents.
 */
function fromPhBusinessClock(ms: number): Date {
  return new Date(ms - PH_OFFSET_MS + BUSINESS_DAY_START_MS);
}

/**
 * Start of the current business DAY as a real UTC instant.
 * i.e. the most recent 2:00 AM PH boundary at or before `at`.
 */
export function startOfBusinessDay(at: Date = new Date()): Date {
  const clock = phBusinessClock(at);
  const midnight = Date.UTC(
    clock.getUTCFullYear(),
    clock.getUTCMonth(),
    clock.getUTCDate(),
  );
  return fromPhBusinessClock(midnight);
}

/**
 * The business-day calendar DATE (a @db.Date-friendly midnight-UTC Date) that
 * `at` belongs to. Used for the per-branch daily sale-number counter so the
 * counter resets at 12 AM (midnight) PH. Example: a sale at Tue 1:30 AM PH
 * returns Tuesday's date.
 */
export function businessDateOnly(at: Date = new Date()): Date {
  const clock = phBusinessClock(at);
  // A pure calendar date at UTC midnight (matches Prisma @db.Date semantics).
  return new Date(
    Date.UTC(clock.getUTCFullYear(), clock.getUTCMonth(), clock.getUTCDate()),
  );
}

/**
 * Start of the current business WEEK as a real UTC instant. Weeks start on
 * MONDAY at 12:00 AM (midnight) PH.
 */
export function startOfBusinessWeek(at: Date = new Date()): Date {
  const clock = phBusinessClock(at);
  // getUTCDay: 0=Sun..6=Sat. Days to subtract to reach Monday.
  const day = clock.getUTCDay();
  const daysSinceMonday = (day + 6) % 7; // Mon->0, Tue->1, ... Sun->6
  const mondayMidnight = Date.UTC(
    clock.getUTCFullYear(),
    clock.getUTCMonth(),
    clock.getUTCDate() - daysSinceMonday,
  );
  return fromPhBusinessClock(mondayMidnight);
}

/**
 * Start of the current business MONTH as a real UTC instant. Months start on
 * the 1st at 12:00 AM (midnight) PH.
 */
export function startOfBusinessMonth(at: Date = new Date()): Date {
  const clock = phBusinessClock(at);
  const firstMidnight = Date.UTC(clock.getUTCFullYear(), clock.getUTCMonth(), 1);
  return fromPhBusinessClock(firstMidnight);
}

/**
 * The Postgres expression that maps a stored UTC timestamp column to its PH
 * business-day clock, so date_trunc() buckets align to the 12 AM PH boundary
 * with Monday-based weeks. Shift by +8h (to PH) then -BUSINESS_DAY_START_HOUR
 * (business start, now 0).
 *
 * `col` must be a trusted, hard-coded column name (never user input).
 */
export function phBusinessClockSql(col: string): string {
  return `(${col} + interval '${PH_OFFSET_MS / 3600000} hours' - interval '${BUSINESS_DAY_START_HOUR} hours')`;
}

/**
 * The real UTC instant at which the business day for a given PH calendar date
 * STARTS — i.e. 2:00 AM PH on that date. `dateStr` is a plain "YYYY-MM-DD"
 * (as sent by the client from its local PH calendar). Parsed numerically so
 * the result is identical no matter what timezone the server runs in.
 *
 * Example: "2026-09-14" -> 2026-09-13T16:00:00.000Z (= 12 AM PH on Sep 14).
 * Returns null if the string isn't a valid YYYY-MM-DD.
 */
export function businessDayStartFromDateStr(dateStr: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]); // 1-12
  const day = Number(m[3]); // 1-31
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // 2:00 AM PH on (year, month, day) as a real UTC instant:
  // Date.UTC(...,2,...) is 2 AM UTC; shift back 8h to make it 2 AM PH.
  return new Date(Date.UTC(year, month - 1, day, BUSINESS_DAY_START_HOUR, 0, 0) - PH_OFFSET_MS);
}

/**
 * Build a Prisma `createdAt` filter for an inclusive range of PH BUSINESS days
 * given plain "YYYY-MM-DD" start/end strings (either may be omitted). The
 * window runs from 2 AM PH of `startStr` up to (but NOT including) 2 AM PH of
 * the day AFTER `endStr`, so a record made at, e.g., 1:30 AM PH still falls in
 * the previous business day — matching the sale-number counter.
 *
 * Returns `{}` when neither bound is usable, so callers can spread it safely.
 */
export function businessDayRange(
  startStr?: string,
  endStr?: string,
): { gte?: Date; lt?: Date } {
  const range: { gte?: Date; lt?: Date } = {};
  if (startStr) {
    const start = businessDayStartFromDateStr(startStr);
    if (start) range.gte = start;
  }
  if (endStr) {
    const endStart = businessDayStartFromDateStr(endStr);
    if (endStart) {
      // Exclusive upper bound = start of the NEXT business day (+24h).
      range.lt = new Date(endStart.getTime() + 24 * 60 * 60 * 1000);
    }
  }
  return range;
}
