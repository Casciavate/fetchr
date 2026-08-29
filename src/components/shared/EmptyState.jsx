import React from 'react';

// Empty state, docs/BRAND.md §7.23 — fact, cause, action. `compact` is the
// smaller in-widget shape (Dashboard's summary cards); the default is the
// full-page ticket-shaped version (Matches/MyFlights/MyRequests).
const EmptyState = ({ icon: Icon, title, body, action, compact = false }) => {
  if (compact) {
    return (
      <div className="text-center py-8 bg-surface-sunken rounded-md border border-line">
        <Icon size={22} className="text-ink-300 mx-auto mb-2" />
        <p className="text-body-s text-ink-muted font-medium mb-1">{title}</p>
        {body && <p className="text-label text-ink-subtle mb-3">{body}</p>}
        {action}
      </div>
    );
  }
  return (
    <div className="text-center py-24 ticket">
      <div className="w-20 h-20 bg-ink-100 rounded-lg flex items-center justify-center mx-auto mb-4">
        <Icon size={32} className="text-ink-300" />
      </div>
      <h2 className="font-display font-bold text-title-m text-ink-900 mb-2">{title}</h2>
      {body && <p className="text-body-m text-ink-muted max-w-xs mx-auto mb-4">{body}</p>}
      {action}
    </div>
  );
};

export default EmptyState;
