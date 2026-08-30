import React from 'react';
import { AlertTriangle, AlertOctagon, Info } from 'lucide-react';

// Advisory banner, docs/BRAND.md §7.9 — 3px left rule + tint background,
// never dismissible, never animated. Sized and toned to the design
// system's own AdvisoryBanner exactly (8px/10px padding, not a full card
// padding — this is meant to read as a compact inline notice, not a card)
// so every screen's little warning/error/info messages actually look the
// same instead of each having hand-rolled its own slightly-different
// version. All three tones are semantic (bg-*-tint/text-*), so they invert
// together correctly under system dark mode — never mix a semantic tint
// with a literal text color or vice versa here.
const TONE = {
  warning: { bg: 'bg-warning-tint', border: 'border-warning', text: 'text-warning', Icon: AlertTriangle },
  error: { bg: 'bg-danger-tint', border: 'border-danger', text: 'text-danger', Icon: AlertOctagon },
  // 'info' is already the literal 50-900 color scale name in
  // tailwind.config.js (bg-info-50 etc, used elsewhere), so the semantic,
  // dark-mode-aware --info/--info-tint vars are referenced directly as
  // arbitrary values here rather than colliding with that scale's name.
  info: { bg: 'bg-[var(--info-tint)]', border: 'border-[var(--info)]', text: 'text-[var(--info)]', Icon: Info },
};

const AdvisoryBanner = ({ tone = 'warning', title, children, className = '' }) => {
  const t = TONE[tone] || TONE.warning;
  const { Icon } = t;
  return (
    <div className={`flex items-start gap-2 ${t.bg} border-l-[3px] ${t.border} rounded-r px-2.5 py-2 ${className}`}>
      <Icon size={14} className={`${t.text} flex-shrink-0 mt-0.5`} />
      <div className={`text-body-s leading-relaxed ${t.text}`}>
        {title && <p className="font-semibold mb-0.5">{title}</p>}
        {children}
      </div>
    </div>
  );
};

export default AdvisoryBanner;
