'use client';

import { useEffect, useMemo, useState } from 'react';

/**
 * Client-side pagination helper + control, so long lists (shops, sales
 * records, disposals, archives) page instead of dumping everything at once.
 *
 * Usage:
 *   const { pageItems, controlProps } = usePagination(items, 10);
 *   ...render pageItems...
 *   <Pagination {...controlProps} />
 */
export function usePagination<T>(items: T[], perPage = 10) {
  const [page, setPage] = useState(1);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  // If the list shrinks (e.g. after a filter/delete), clamp the page.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const startIdx = (page - 1) * perPage;
  const pageItems = useMemo(
    () => items.slice(startIdx, startIdx + perPage),
    [items, startIdx, perPage],
  );

  return {
    page,
    setPage,
    pageItems,
    // Reset to the first page — call this when a filter/search changes.
    resetPage: () => setPage(1),
    controlProps: {
      page,
      totalPages,
      total,
      startIdx,
      shown: pageItems.length,
      onPrev: () => setPage((p) => Math.max(1, p - 1)),
      onNext: () => setPage((p) => Math.min(totalPages, p + 1)),
    },
  };
}

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  startIdx: number;
  shown: number;
  onPrev: () => void;
  onNext: () => void;
  /** Word for the items, e.g. "shops", "records". Defaults to "items". */
  noun?: string;
}

export function Pagination({
  page,
  totalPages,
  total,
  startIdx,
  shown,
  onPrev,
  onNext,
  noun = 'items',
}: PaginationProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-text-secondary">
      <span>
        {total === 0
          ? `No ${noun}`
          : `Showing ${startIdx + 1}\u2013${startIdx + shown} of ${total} ${noun}`}
      </span>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            onClick={onPrev}
            disabled={page <= 1}
            className="rounded-lg border border-input-border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-white/5 transition"
          >
            Previous
          </button>
          <span className="px-2 text-text-primary">Page {page} of {totalPages}</span>
          <button
            onClick={onNext}
            disabled={page >= totalPages}
            className="rounded-lg border border-input-border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-white/5 transition"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
