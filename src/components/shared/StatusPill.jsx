import React from 'react';

// Status pill, docs/BRAND.md §7.13 — fixed 22px height via the shared
// `.badge` primitive (src/index.css), one state pill per card. `dot`
// renders the pulsing "Live" indicator used on real-time widgets instead
// of an icon — pass one or the other, never both.
const TONE_CLASSES = {
  signal: 'badge-indigo',
  success: 'badge-green',
  danger: 'badge-red',
  warning: 'badge-yellow',
  info: 'badge-blue',
  neutral: 'badge-gray',
};

const DOT_CLASSES = {
  signal: 'bg-signal-500',
  success: 'bg-success',
  danger: 'bg-danger',
  warning: 'bg-warning',
  info: 'bg-info',
  neutral: 'bg-ink-400',
};

const StatusPill = ({ tone = 'neutral', icon: Icon, dot = false, children, className = '' }) => (
  <span className={`badge ${TONE_CLASSES[tone] || TONE_CLASSES.neutral} ${className}`}>
    {dot && <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${DOT_CLASSES[tone] || DOT_CLASSES.neutral}`} />}
    {Icon && <Icon size={11} />}
    {children}
  </span>
);

export default StatusPill;
