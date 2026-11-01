"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ActivityPaginationProps {
  /** Zero-based page index, as the backend reports it. */
  page: number;
  totalPages: number;
  totalElements: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function ActivityPagination({ page, totalPages, totalElements, pageSize, onPageChange }: ActivityPaginationProps) {
  const first = totalElements === 0 ? 0 : page * pageSize + 1;
  const last = Math.min(totalElements, (page + 1) * pageSize);
  const hasPrevious = page > 0;
  const hasNext = page + 1 < totalPages;

  return (
    <nav aria-label="Activity pages" className="flex flex-col-reverse items-center justify-between gap-3 sm:flex-row">
      <p className="text-sm tabular-nums text-muted-foreground" aria-live="polite">
        {first}–{last} of {totalElements.toLocaleString()} events
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={!hasPrevious}
          aria-label="Previous page"
        >
          <ChevronLeft aria-hidden="true" />
          Previous
        </Button>
        <span className="min-w-24 text-center text-sm tabular-nums">
          Page {page + 1} of {Math.max(totalPages, 1)}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNext}
          aria-label="Next page"
        >
          Next
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
