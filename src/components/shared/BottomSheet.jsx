import React from 'react';
import { X } from 'lucide-react';

// Bottom sheet, docs/BRAND.md §7.20 — a true edge-to-edge sheet below
// `md` (grab handle, rounded top corners, slides up via the sheet-in
// keyframe already shipped in tailwind.config.js), a centered modal at
// `md`+ matching the look Messages.jsx's DealDetailsModal already uses.
const BottomSheet = ({ title, onClose, footer, children }) => (
  <div
    className="fixed inset-0 z-modal flex items-end md:items-center justify-center md:p-4"
    style={{ backgroundColor: 'var(--scrim)' }}
    onClick={onClose}>
    <div
      onClick={e => e.stopPropagation()}
      className="bg-surface-raised w-full md:max-w-md rounded-t-xl md:rounded-xl shadow-elev-3
        max-h-[88dvh] md:max-h-[85vh] flex flex-col overflow-hidden animate-sheet-in md:animate-slide-up">
      <div className="md:hidden flex justify-center pt-2.5 pb-1 flex-shrink-0">
        <div className="w-8 h-1 rounded-full bg-line-strong" />
      </div>
      <div className="flex items-center justify-between px-5 py-3 md:py-4 border-b border-line flex-shrink-0">
        <h3 className="font-display font-bold text-title-s text-ink-900">{title}</h3>
        <button onClick={onClose} aria-label="Close"
          className="w-11 h-11 -mr-2.5 flex items-center justify-center rounded-md hover:bg-surface-sunken transition">
          <X size={18} className="text-ink-500" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
      {footer && (
        <div className="px-5 py-3 border-t border-line flex-shrink-0"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
          {footer}
        </div>
      )}
    </div>
  </div>
);

export default BottomSheet;
