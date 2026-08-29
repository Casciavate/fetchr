import React from 'react';

// Skeleton, docs/BRAND.md §7.22 — must mirror the real anatomy, not three
// grey rectangles. TicketSkeleton mirrors the ticket header/route/strip/
// button shape; RowSkeleton mirrors a compact list row (avatar + 2 lines).
export const TicketSkeleton = () => (
  <div className="ticket overflow-hidden" aria-hidden="true">
    <div className="h-10 bg-ink-200 animate-skeleton" />
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-8 w-16 bg-surface-sunken rounded-md animate-skeleton" />
        <div className="flex-1 h-3 bg-surface-sunken rounded-full animate-skeleton" />
        <div className="h-8 w-16 bg-surface-sunken rounded-md animate-skeleton" />
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map(i => <div key={i} className="h-8 bg-surface-sunken rounded-md animate-skeleton" />)}
      </div>
      <div className="h-10 bg-surface-sunken rounded-md animate-skeleton" />
    </div>
  </div>
);

export const RowSkeleton = () => (
  <div className="flex items-center gap-3 p-3 rounded-md border border-line" aria-hidden="true">
    <div className="w-9 h-9 rounded-avatar bg-surface-sunken animate-skeleton flex-shrink-0" />
    <div className="flex-1 space-y-1.5">
      <div className="h-3 w-1/3 bg-surface-sunken rounded-full animate-skeleton" />
      <div className="h-2.5 w-1/2 bg-surface-sunken rounded-full animate-skeleton" />
    </div>
    <div className="h-3 w-12 bg-surface-sunken rounded-full animate-skeleton flex-shrink-0" />
  </div>
);

const SkeletonList = ({ variant = 'row', count = 3 }) => (
  <div className={variant === 'ticket' ? 'space-y-4' : 'space-y-2'} aria-busy="true">
    {Array.from({ length: count }).map((_, i) => (
      variant === 'ticket' ? <TicketSkeleton key={i} /> : <RowSkeleton key={i} />
    ))}
  </div>
);

export default SkeletonList;
