/**
 * PH business-day date helpers (frontend).
 *
 * The shop's business day runs 2:00 AM -> 2:00 AM Philippine time (UTC+8, no
 * DST) — NOT midnight to midnight. So a sale made at, e.g., Tuesday 1:30 AM PH
 * still belongs to MONDAY's business day until the clock passes 2:00 AM.
 *
 * The backend files and filters sales on this exact calendar
 * (see backend/src/common/utils/business-day.util.ts). Any date string the
 * frontend sends as `startDate`/`endDate` MUST be computed the same way, or a
 * query can ask for the wrong day and come back empty — which is exactly the
 * "Daily Report is empty right after saving" bug (the device's local calendar
 * date can differ from the PH business date, e.g. just after midnight or on a
 * device in another timezone).
 *
 * These functions work regardless of the device's own timezone by doing the
 * math on a "PH business clock" (real time shifted +8h to PH, then -2h so the
 * day boundary lands at 2 AM) and reading the UTC parts of that shifted Date.
 */

// Philippine Standard Time is a fixed UTC+8 (no daylight saving).
const PH_OFFSET_MS = 8 * 60 * 60 * 1000;
// The business day starts at 2:00 AM PH time.
const BUSINESS_START_HOUR = 2;

/**
 * The current moment on the "PH business clock": real PH time shifted back by
 * 2 hours. On this clock, the UTC calendar date is exactly the business day
 * the moment belongs to (midnight on this clock = 2 AM PH).
 */
function phBusinessNow(): Date {
  return new Date(Date.now() + PH_OFFSET_MS - BUSINESS_START_HOUR * 60 * 60 * 1000);
}

/** Format a business-clock Date as YYYY-MM-DD (its UTC parts are the PH business date). */
function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Today's PH business date as "YYYY-MM-DD". Use this (not the device-local
 * date) whenever sending startDate/endDate to the backend so the window lines
 * up with how sales are actually filed.
 */
export function phBusinessToday(): string {
  return ymd(phBusinessNow());
}

type QuickRange = 'today' | 'week' | 'month' | 'all';

/**
 * { start, end } YYYY-MM-DD for a quick range, in PH business time.
 * 'all' returns empty strings (no date filter). Weeks start Monday.
 */
export function phQuickRangeDates(range: QuickRange): { start: string; end: string } {
  if (range === 'all') return { start: '', end: '' };
  const now = phBusinessNow();
  const todayStr = ymd(now);
  if (range === 'today') return { start: todayStr, end: todayStr };
  if (range === 'week') {
    const day = now.getUTCDay(); // 0=Sun..6=Sat
    const daysSinceMonday = (day + 6) % 7;
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday));
    return { start: ymd(monday), end: todayStr };
  }
  // month
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { start: ymd(first), end: todayStr };
}

export type { QuickRange };
