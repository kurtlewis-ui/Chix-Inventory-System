type Failure = { code?: string; name?: string; response?: { status?: number }; __readRetriesExhausted?: boolean };

export function shouldRetryRead(method: string | undefined, status: number | undefined, hasResponse: boolean): boolean {
  return ['get', 'head'].includes((method ?? 'get').toLowerCase()) && (!hasResponse || status === 502 || status === 503 || status === 504);
}

/** Axios already handles cold-start retries; never multiply them in React Query. */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  const failure = error as Failure | undefined;
  if (failure?.__readRetriesExhausted || ['ERR_CANCELED', 'ABORT_ERR'].includes(failure?.code ?? '') || ['AbortError', 'CanceledError'].includes(failure?.name ?? '')) return false;
  return failureCount < 1 && (!failure?.response || (failure.response.status ?? 0) >= 500);
}

export function waitForRetry(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Request canceled', 'AbortError')); return; }
    const finish = () => { signal?.removeEventListener('abort', cancel); resolve(); };
    const timer = setTimeout(finish, ms);
    const cancel = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); reject(new DOMException('Request canceled', 'AbortError')); };
    signal?.addEventListener('abort', cancel, { once: true });
  });
}
