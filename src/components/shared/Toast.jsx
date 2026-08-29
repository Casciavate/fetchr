import React from 'react';
import { Check, AlertTriangle } from 'lucide-react';

// Toast, docs/BRAND.md §7.21 — bottom-center on mobile, bottom-right on
// desktop, dark `--surface-inverse` fill, never shifts page layout.
// Callers keep their own success/error string state and setTimeout
// clear — this only changes how that message is rendered.
const Toast = ({ message, tone = 'success' }) => {
  if (!message) return null;
  const isError = tone === 'error';
  return (
    <div
      className="fixed z-toast bottom-4 left-1/2 -translate-x-1/2 md:left-auto md:right-6 md:translate-x-0
        max-w-sm w-[calc(100%-2rem)] md:w-auto animate-toast-in"
      role={isError ? 'alert' : 'status'}
      aria-live="polite">
      <div className="flex items-center gap-2 bg-surface-inverse text-ink-inverse rounded-md px-4 py-3 shadow-elev-2 text-body-s font-medium">
        {isError ? <AlertTriangle size={16} className="flex-shrink-0" /> : <Check size={16} className="flex-shrink-0" />}
        <span>{message}</span>
      </div>
    </div>
  );
};

export default Toast;
