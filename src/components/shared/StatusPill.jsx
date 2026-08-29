import React from 'react';

// Status pill, docs/BRAND.md §7.13 / fetchr_design/components/trust/StatusPill.jsx
// — the tone table below is the exact source, not an approximation
// (background/foreground/border per tone, including the 30%/28% borders
// on success/danger that the plain .badge-* CSS classes don't carry).
// Fixed 22px height, one state pill per card except `score`, which may
// coexist since it's a match percentage, not a state. `dot` renders the
// pulsing "Live" indicator instead of an icon — pass one or the other.
const TONES = {
  signal: { bg: 'var(--signal-fill)', fg: 'var(--signal-on)', border: 'none' },
  success: { bg: 'var(--success-tint)', fg: 'var(--success)', border: '1px solid color-mix(in srgb, var(--success) 30%, transparent)' },
  danger: { bg: 'var(--danger-tint)', fg: 'var(--danger)', border: '1px solid color-mix(in srgb, var(--danger) 28%, transparent)' },
  neutral: { bg: 'var(--ink-100)', fg: 'var(--ink-muted)', border: 'none' },
  score: { bg: 'var(--ink-100)', fg: 'var(--ink)', border: 'none' },
};

const StatusPill = ({ tone = 'neutral', icon: Icon, dot = false, children, className = '' }) => {
  const t = TONES[tone] || TONES.neutral;
  return (
    <span
      className={`inline-flex items-center gap-0.5 h-[22px] px-2 rounded-sm font-mono text-overline uppercase whitespace-nowrap ${className}`}
      style={{ background: t.bg, color: t.fg, border: t.border }}>
      {dot && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: t.fg }} />}
      {Icon && <Icon size={11} />}
      {children}
    </span>
  );
};

export default StatusPill;
