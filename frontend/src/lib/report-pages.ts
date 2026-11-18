import type { QueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { Pagination } from './types';

export const REPORT_TOTALS_TTL = 45_000;
type Totals<S> = { summary: S; total: number };
export type ReportPage<T, S> = { data: T[]; summary: S; pagination: Pagination; totalsUpdatedAt: number };

/** One HTTP request per page; reuse only fresh, non-invalidated totals for the same actor and filters. */
export async function loadReportPage<T, S>(client: QueryClient, url: string, params: Record<string, unknown>, totalsKey: readonly unknown[], signal?: AbortSignal): Promise<ReportPage<T, S>> {
  if (signal?.aborted) throw new DOMException('Request canceled', 'AbortError');
  const state = client.getQueryState<Totals<S>>(totalsKey);
  const cached = state?.data && !state.isInvalidated && Date.now() - state.dataUpdatedAt < REPORT_TOTALS_TTL ? state : undefined;
  const response = await api.get<{ data: T[]; summary?: S; pagination?: Pagination }>(url, {
    params: { ...params, totals: cached ? 'omit' : undefined }, signal,
  });
  if (signal?.aborted) throw new DOMException('Request canceled', 'AbortError');
  const payload = response.data;
  let totals: Totals<S>, updatedAt: number;
  if (payload.summary && payload.pagination) {
    totals = { summary: payload.summary, total: payload.pagination.total };
    client.setQueryData(totalsKey, totals);
    updatedAt = client.getQueryState(totalsKey)!.dataUpdatedAt;
  } else if (cached?.data) {
    totals = cached.data;
    updatedAt = cached.dataUpdatedAt;
  } else {
    throw new Error('Report totals were not returned. Please retry.');
  }
  const page = Number(params.page ?? 1), limit = Number(params.limit ?? 10), total = totals.total;
  return { data: payload.data ?? [], summary: totals.summary, totalsUpdatedAt: updatedAt,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)), hasNext: page * limit < total, hasPrev: page > 1 } };
}

/** A page cannot remain fresh longer than the totals it reused. No polling is added. */
export function reportPageStaleTime(query: { state: { data: unknown; dataUpdatedAt: number } }): number {
  const at = (query.state.data as { totalsUpdatedAt?: number } | undefined)?.totalsUpdatedAt;
  return at == null ? REPORT_TOTALS_TTL : Math.max(0, REPORT_TOTALS_TTL - (query.state.dataUpdatedAt - at));
}
