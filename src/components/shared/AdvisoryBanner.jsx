import React from 'react';
import { AlertTriangle, AlertOctagon, Info } from 'lucide-react';

// Advisory banner, docs/BRAND.md §7.9 — 3px left rule + tint background,
// never dismissible, never animated. Error tone was the gap: most call
// sites in the app only ever built the warning/info variants by hand.
const TONE = {
  warning: { bg: 'bg-warning-tint', border: 'border-warn-400', text: 'text-warning', Icon: AlertTriangle },
  error: { bg: 'bg-danger-tint', border: 'border-danger', text: 'text-danger', Icon: AlertOctagon },
  info: { bg: 'bg-info-50', border: 'border-info-400', text: 'text-info-500', Icon: Info },
};

const AdvisoryBanner = ({ tone = 'warning', title, children, className = '' }) => {
  const t = TONE[tone] || TONE.warning;
  const { Icon } = t;
  return (
    <div className={`flex items-start gap-2 ${t.bg} border-l-[3px] ${t.border} rounded-r px-4 py-3 ${className}`}>
      <Icon size={14} className={`${t.text} flex-shrink-0 mt-0.5`} />
      <div className={`text-body-s leading-relaxed ${t.text}`}>
        {title && <p className="font-semibold mb-0.5">{title}</p>}
        {children}
      </div>
    </div>
  );
};

export default AdvisoryBanner;
